/**
 * BullMQ queue for Run Creator (Schedule A) — CREATE_TEST_RUN.
 * Jobs are added by the tick worker (scheduler-tick-queue); no own repeatable job.
 */

import { Queue } from "bullmq";
import { createRedisConnection } from "./config";
import { QUEUE_NAMES } from "./config";

const connection = createRedisConnection();

export const createTestRunQueue = new Queue<Record<string, never>>(
  QUEUE_NAMES.CREATE_TEST_RUN,
  {
    connection: connection as any,
    defaultJobOptions: {
      removeOnComplete: { count: 100 },
      removeOnFail: false,
    },
  }
);

export const CREATE_TEST_RUN_JOB_NAME = "CREATE_TEST_RUN" as const;
