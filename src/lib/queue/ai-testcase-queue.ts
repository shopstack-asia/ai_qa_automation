/**
 * BullMQ queue for AI test case generation. Enqueue from API; worker processes in background.
 */

import { Queue } from "bullmq";
import { createRedisConnection } from "./config";
import { QUEUE_NAMES } from "./config";

export interface AITestcaseJobPayload {
  ticketId: string;
  retryCount: number;
}

const connection = createRedisConnection();

export const aiTestcaseQueue = new Queue<AITestcaseJobPayload>(
  QUEUE_NAMES.AI_TESTCASE_GENERATION,
  {
    connection,
    defaultJobOptions: {
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 100 },
    },
  }
);

/** Enqueue one job. jobId = ticketId when no existing job; prevents duplicate (waiting/active/delayed). Re-queue uses new id after completed/failed. */
export async function enqueueAITestcaseJob(payload: AITestcaseJobPayload): Promise<string | null> {
  let jobId: string = payload.ticketId;
  const existing = await aiTestcaseQueue.getJob(payload.ticketId);
  if (existing) {
    const state = await existing.getState();
    if (state === "waiting" || state === "active" || state === "delayed") {
      return null;
    }
    // Existing job is completed or failed: use new id so BullMQ creates a new job (same jobId would not enqueue again).
    jobId = `${payload.ticketId}-${Date.now()}`;
  }
  const job = await aiTestcaseQueue.add("generate", payload, {
    jobId,
  });
  return job.id ?? jobId;
}

export function getAiTestcaseQueue(): Queue<AITestcaseJobPayload> {
  return aiTestcaseQueue;
}
