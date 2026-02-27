/**
 * BullMQ execution queue: API enqueues, worker consumes.
 */

import { Queue } from "bullmq";
import { createRedisConnection, QUEUE_NAMES } from "./config";

export interface ExecutionJobPayload {
  executionId: string;
  projectId: string;
  environmentId: string;
  testCaseId: string;
  baseUrl: string;
  envCredentials?: {
    username?: string;
    password?: string;
    apiToken?: string;
  };
}

const connection = createRedisConnection();

export const executionQueue = new Queue<ExecutionJobPayload>(QUEUE_NAMES.EXECUTION, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

/** jobId = executionId enforces idempotency; one execution = one job. */
export async function enqueueExecution(job: ExecutionJobPayload): Promise<string> {
  const bullJob = await executionQueue.add("run", job, {
    jobId: job.executionId,
  });
  return bullJob.id ?? job.executionId;
}
