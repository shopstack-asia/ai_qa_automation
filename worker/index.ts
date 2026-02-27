/**
 * QA Execution Worker: consumes BullMQ jobs, runs Playwright, uploads artifacts, updates DB.
 * One browser per process; one context per execution.
 */
import { Worker } from "bullmq";
import { createRedisConnection, QUEUE_NAMES } from "../src/lib/queue/config";
import type { ExecutionJobPayload } from "../src/lib/queue/execution-queue";
import { prisma } from "../src/lib/db/client";
import { processExecutionJob } from "./execution-processor";
import { initPlaywrightBrowser, closePlaywrightBrowser } from "./playwright-runner";

const connection = createRedisConnection();

async function main() {
  await initPlaywrightBrowser();

  const worker = new Worker<ExecutionJobPayload>(
    QUEUE_NAMES.EXECUTION,
    async (job) => {
      await processExecutionJob(job.data);
    },
    {
      connection: connection as any,
      concurrency: parseInt(process.env.WORKER_CONCURRENCY ?? "2", 10),
    }
  );

  worker.on("completed", (job) => {
    console.log("[execution-worker] Job completed:", job.id);
  });

  worker.on("failed", (job, err) => {
    console.error("[execution-worker] Job failed:", job?.id, err);
  });

  console.log("[execution-worker] Started");

  const shutdown = async () => {
    await worker.close();
    await closePlaywrightBrowser();
    await prisma.$disconnect();
    connection.disconnect();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("[execution-worker] Fatal:", err);
  process.exit(1);
});
