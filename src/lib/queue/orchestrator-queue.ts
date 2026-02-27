/**
 * BullMQ queue for Run Orchestrator (Schedule B) — ORCHESTRATOR.
 * Jobs are added by the tick worker (scheduler-tick-queue); no own repeatable job.
 */

import { Queue } from "bullmq";
import { createRedisConnection } from "./config";
import { QUEUE_NAMES } from "./config";

const connection = createRedisConnection();

export const orchestratorQueue = new Queue<Record<string, never>>(
  QUEUE_NAMES.ORCHESTRATOR,
  {
    connection: connection as any,
    defaultJobOptions: {
      removeOnComplete: { count: 100 },
      removeOnFail: false,
    },
  }
);

export const ORCHESTRATOR_JOB_NAME = "ORCHESTRATOR" as const;
