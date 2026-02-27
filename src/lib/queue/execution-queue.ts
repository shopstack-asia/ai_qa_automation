/**
 * BullMQ execution queue: API enqueues, worker consumes.
 * Queue is created lazily so Next.js build (no Redis) does not connect at module load.
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

let _queue: Queue<ExecutionJobPayload> | null = null;
function getQueue(): Queue<ExecutionJobPayload> {
  if (!_queue) {
    const connection = createRedisConnection();
    _queue = new Queue<ExecutionJobPayload>(QUEUE_NAMES.EXECUTION, {
      connection: connection as any,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    });
  }
  return _queue;
}

export const executionQueue = new Proxy({} as Queue<ExecutionJobPayload>, {
  get(_, prop) {
    return (getQueue() as unknown as Record<string, unknown>)[prop as string];
  },
});

/** jobId = executionId enforces idempotency; one execution = one job. */
export async function enqueueExecution(job: ExecutionJobPayload): Promise<string> {
  const bullJob = await executionQueue.add("run", job, {
    jobId: job.executionId,
  });
  return bullJob.id ?? job.executionId;
}
