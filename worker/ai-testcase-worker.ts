/**
 * AI Test Case Generation Worker: consumes "ai-testcase-generation" queue.
 * Calls generateTestCaseFromTicket; updates ticket ai_status; retries with exponential backoff.
 */
import { Worker } from "bullmq";
import { createRedisConnection } from "../src/lib/queue/config";
import { QUEUE_NAMES } from "../src/lib/queue/config";
import { prisma } from "../src/lib/db/client";
import { processAITestcaseJob } from "./ai-testcase-processor";

const connection = createRedisConnection();

const worker = new Worker(
  QUEUE_NAMES.AI_TESTCASE_GENERATION,
  async (job) => {
    await processAITestcaseJob(job);
  },
  {
    connection: connection as any,
    concurrency: parseInt(process.env.AI_TESTCASE_WORKER_CONCURRENCY ?? "1", 10),
  }
);

worker.on("completed", (job) => {
  console.log("[ai-testcase-worker] Job completed:", job.id);
});

worker.on("failed", (job, err) => {
  console.error("[ai-testcase-worker] Job failed:", job?.id, err?.message);
});

console.log("[ai-testcase-worker] Started");

process.on("SIGTERM", async () => {
  await worker.close();
  await prisma.$disconnect();
  connection.disconnect();
  process.exit(0);
});
process.on("SIGINT", async () => {
  await worker.close();
  await prisma.$disconnect();
  connection.disconnect();
  process.exit(0);
});
