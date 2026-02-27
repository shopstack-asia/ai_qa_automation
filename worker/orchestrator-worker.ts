/**
 * Orchestrator worker. Processes QUEUE_NAMES.ORCHESTRATOR only.
 * Jobs are enqueued by the tick worker (config: Scheduler tick interval).
 */

import { Worker } from "bullmq";
import { createRedisConnection } from "../src/lib/queue/config";
import { QUEUE_NAMES } from "../src/lib/queue/config";
import { runRunOrchestrator } from "../src/lib/scheduler/runner";

const connection = createRedisConnection();

async function main() {
  const worker = new Worker<Record<string, never>>(
    QUEUE_NAMES.ORCHESTRATOR,
    async () => {
      await runRunOrchestrator();
    },
    {
      connection,
      concurrency: 1,
    }
  );

  worker.on("completed", (job) => {
    console.log("[orchestrator-worker] Job completed:", job.id);
  });

  worker.on("failed", (job, err) => {
    console.error("[orchestrator-worker] Job failed:", job?.id, err?.message);
  });

  console.log("[orchestrator-worker] Started");

  const shutdown = async () => {
    await worker.close();
    connection.disconnect();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("[orchestrator-worker] Fatal:", err);
  process.exit(1);
});
