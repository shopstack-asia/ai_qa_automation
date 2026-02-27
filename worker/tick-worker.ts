/**
 * Tick worker: single schedule from config (Scheduler tick interval (ms)).
 * On each tick, enqueues one job to CREATE_TEST_RUN queue and one to ORCHESTRATOR queue.
 */

import { Worker } from "bullmq";
import { createRedisConnection } from "../src/lib/queue/config";
import { QUEUE_NAMES } from "../src/lib/queue/config";
import { ensureTickRepeatableJob } from "../src/lib/queue/scheduler-tick-queue";
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

  const worker = new Worker<Record<string, never>>(
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

  worker.on("completed", (job) => {
    console.log("[tick-worker] Dispatched to create-test-run + orchestrator:", job.id);
  });

  worker.on("failed", (job, err) => {
    console.error("[tick-worker] Failed:", job?.id, err?.message);
  });

  console.log("[tick-worker] Started (config interval → trigger create-test-run + orchestrator)");

  const shutdown = async () => {
    await worker.close();
    connection.disconnect();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("[tick-worker] Fatal:", err);
  process.exit(1);
});
