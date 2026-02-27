/**
 * BullMQ queue for Run Creator (Schedule A) — CREATE_TEST_RUN.
 * Jobs are added by the tick worker (scheduler-tick-queue); no own repeatable job.
 * Queue is created lazily so Next.js build (no Redis) does not connect at module load.
 */

import { Queue } from "bullmq";
import { createRedisConnection } from "./config";
import { QUEUE_NAMES } from "./config";

let _queue: Queue<Record<string, never>> | null = null;
function getQueue(): Queue<Record<string, never>> {
  if (!_queue) {
    const connection = createRedisConnection();
    _queue = new Queue<Record<string, never>>(QUEUE_NAMES.CREATE_TEST_RUN, {
      connection: connection as any,
      defaultJobOptions: {
        removeOnComplete: { count: 100 },
        removeOnFail: false,
      },
    });
  }
  return _queue;
}

export const createTestRunQueue = new Proxy({} as Queue<Record<string, never>>, {
  get(_, prop) {
    return (getQueue() as unknown as Record<string, unknown>)[prop as string];
  },
});

export const CREATE_TEST_RUN_JOB_NAME = "CREATE_TEST_RUN" as const;
