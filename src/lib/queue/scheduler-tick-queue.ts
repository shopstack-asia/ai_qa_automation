/**
 * Single scheduler tick (config: Scheduler tick interval (ms)).
 * One repeatable job at this interval; when it runs, it enqueues one job to
 * Run Creator queue and one to Run Orchestrator queue.
 * Queue is created lazily so Next.js build (no Redis) does not connect at module load.
 */

import { Queue } from "bullmq";
import { createRedisConnection } from "./config";
import { QUEUE_NAMES } from "./config";
import { getConfig } from "@/lib/config";

const TICK_LOCK_KEY = "scheduler:tick:repeat:init";
const TICK_LOCK_TTL_SEC = 86400;

let _connection: ReturnType<typeof createRedisConnection> | null = null;
let _queue: Queue<Record<string, never>> | null = null;
function getConnection(): ReturnType<typeof createRedisConnection> {
  if (!_connection) _connection = createRedisConnection();
  return _connection;
}
function getQueue(): Queue<Record<string, never>> {
  if (!_queue) {
    const connection = getConnection();
    _queue = new Queue<Record<string, never>>(QUEUE_NAMES.SCHEDULER_TICK, {
      connection: connection as any,
      defaultJobOptions: {
        removeOnComplete: { count: 100 },
        removeOnFail: false,
      },
    });
  }
  return _queue;
}

export const schedulerTickQueue = new Proxy({} as Queue<Record<string, never>>, {
  get(_, prop) {
    return (getQueue() as unknown as Record<string, unknown>)[prop as string];
  },
});

export const TICK_JOB_NAME = "tick" as const;

/**
 * Register the single repeatable tick job (driven by config scheduler_interval_ms).
 * Only one instance registers (Redis lock).
 */
export async function ensureTickRepeatableJob(): Promise<void> {
  const redis = getConnection();
  const acquired = await redis.set(
    TICK_LOCK_KEY,
    "1",
    "EX",
    TICK_LOCK_TTL_SEC,
    "NX"
  );
  if (!acquired) return;

  const existing = await schedulerTickQueue.getRepeatableJobs();
  if (existing.length > 0) return;

  const config = await getConfig();
  const intervalMs = Math.max(
    60_000,
    parseInt(config.scheduler_interval_ms ?? "60000", 10) || 60_000
  );
  await schedulerTickQueue.add(TICK_JOB_NAME, {}, {
    repeat: { every: intervalMs },
  });
}
