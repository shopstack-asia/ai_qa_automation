/**
 * Combined worker: one process runs Scheduler tick + Run Creator + Run Orchestrator + AI testcase + execution workers.
 * Single schedule (config: Scheduler tick interval ms) triggers creator and orchestrator queues.
 */
import { Worker } from "bullmq";
import { createRedisConnection, QUEUE_NAMES } from "../src/lib/queue/config";
import { ensureTickRepeatableJob } from "../src/lib/queue/scheduler-tick-queue";
import { runRunCreator, runRunOrchestrator } from "../src/lib/scheduler/runner";
import type { ExecutionJobPayload } from "../src/lib/queue/execution-queue";
import type { AITestcaseJobPayload } from "../src/lib/queue/ai-testcase-queue";
import { prisma } from "../src/lib/db/client";
import { processExecutionJob } from "./execution-processor";
import { processAITestcaseJob } from "./ai-testcase-processor";
import { initPlaywrightBrowser, closePlaywrightBrowser } from "./playwright-runner";
import {
  createTestRunQueue,
  CREATE_TEST_RUN_JOB_NAME,
} from "../src/lib/queue/create-test-run-queue";
import {
  orchestratorQueue,
  ORCHESTRATOR_JOB_NAME,
} from "../src/lib/queue/orchestrator-queue";

const connection = createRedisConnection();

async function main() {
  await ensureTickRepeatableJob();
  await initPlaywrightBrowser();

  const tickWorker = new Worker<Record<string, never>>(
    QUEUE_NAMES.SCHEDULER_TICK,
    async () => {
      await createTestRunQueue.add(CREATE_TEST_RUN_JOB_NAME, {});
      await orchestratorQueue.add(ORCHESTRATOR_JOB_NAME, {});
    },
    {
      connection,
      concurrency: 1,
    }
  );

  const schedulerWorker = new Worker<Record<string, never>>(
    QUEUE_NAMES.CREATE_TEST_RUN,
    async () => {
      await runRunCreator();
    },
    {
      connection,
      concurrency: 1,
    }
  );

  const orchestratorWorker = new Worker<Record<string, never>>(
    QUEUE_NAMES.ORCHESTRATOR,
    async () => {
      await runRunOrchestrator();
    },
    {
      connection,
      concurrency: 1,
    }
  );

  const aiWorker = new Worker<AITestcaseJobPayload>(
    QUEUE_NAMES.AI_TESTCASE_GENERATION,
    async (job) => {
      await processAITestcaseJob(job);
    },
    {
      connection,
      concurrency: parseInt(process.env.AI_TESTCASE_WORKER_CONCURRENCY ?? "1", 10),
    }
  );

  const executionWorker = new Worker<ExecutionJobPayload>(
    QUEUE_NAMES.EXECUTION,
    async (job) => {
      await processExecutionJob(job.data);
    },
    {
      connection,
      concurrency: parseInt(process.env.WORKER_CONCURRENCY ?? "2", 10),
    }
  );

  tickWorker.on("completed", (job) => {
    console.log("[combined/tick] Dispatched to creator + orchestrator:", job.id);
  });
  tickWorker.on("failed", (job, err) => {
    console.error("[combined/tick] Failed:", job?.id, err?.message);
  });
  schedulerWorker.on("completed", (job) => {
    console.log("[combined/scheduler] Creator completed:", job.id);
  });
  schedulerWorker.on("failed", (job, err) => {
    console.error("[combined/scheduler] Creator failed:", job?.id, err?.message);
  });
  orchestratorWorker.on("completed", (job) => {
    console.log("[combined/orchestrator] Tick completed:", job.id);
  });
  orchestratorWorker.on("failed", (job, err) => {
    console.error("[combined/orchestrator] Tick failed:", job?.id, err?.message);
  });

  aiWorker.on("completed", (job) => {
    console.log("[combined/ai-testcase] Job completed:", job.id);
  });
  aiWorker.on("failed", (job, err) => {
    console.error("[combined/ai-testcase] Job failed:", job?.id, err?.message);
  });

  executionWorker.on("completed", (job) => {
    console.log("[combined/execution] Job completed:", job.id);
  });
  executionWorker.on("failed", (job, err) => {
    console.error("[combined/execution] Job failed:", job?.id, err?.message);
  });

  console.log("[combined-worker] Started (scheduler + AI testcase + execution)");

  const shutdown = async () => {
    await Promise.all([
      tickWorker.close(),
      schedulerWorker.close(),
      orchestratorWorker.close(),
      aiWorker.close(),
      executionWorker.close(),
    ]);
    await closePlaywrightBrowser();
    await prisma.$disconnect();
    connection.disconnect();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("[combined-worker] Fatal:", err);
  process.exit(1);
});
