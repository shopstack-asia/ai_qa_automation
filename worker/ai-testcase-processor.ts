/**
 * AI testcase job processor. Shared by worker/ai-testcase-worker.ts and worker/combined-worker.ts.
 */
import type { Job } from "bullmq";
import type { AITestcaseJobPayload } from "../src/lib/queue/ai-testcase-queue";
import { aiTestcaseQueue } from "../src/lib/queue/ai-testcase-queue";
import { generateTestCaseFromTicket } from "../src/lib/ai/generate-test-case-from-ticket";
import { getConfig } from "../src/lib/config";
import { prisma } from "../src/lib/db/client";

export function isSchemaValidationError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("valid json") ||
    lower.includes("not valid json") ||
    lower.includes("shape invalid") ||
    lower.includes("response shape")
  );
}

export async function getMaxRetry(): Promise<number> {
  const config = await getConfig();
  const raw = config.ai_testcase_max_retry ?? "3";
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 3;
}

export async function processAITestcaseJob(
  job: Job<AITestcaseJobPayload, void, string>
): Promise<void> {
  const { ticketId, retryCount } = job.data;
  const maxRetry = await getMaxRetry();

  await prisma.ticket.update({
    where: { id: ticketId },
    data: { ai_status: retryCount > 0 ? "RETRYING" : "QUEUED" },
  });

  try {
    await generateTestCaseFromTicket(ticketId);
    await prisma.ticket.update({
      where: { id: ticketId },
      data: { ai_status: "GENERATED" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[ai-testcase-worker] Job failed:", job.id, message);

    const schemaError = isSchemaValidationError(message);
    const shouldNotRetrySchema = schemaError && retryCount >= 1;
    const exceededRetries = retryCount >= maxRetry;

    if (shouldNotRetrySchema || exceededRetries) {
      await prisma.ticket.update({
        where: { id: ticketId },
        data: { status: "DRAFT", ai_status: "FAILED" },
      });
      throw err;
    }

    const delayMs = Math.min(60_000, 1000 * Math.pow(2, retryCount));
    await aiTestcaseQueue.add(
      "generate",
      { ticketId, retryCount: retryCount + 1 },
      {
        jobId: `${ticketId}-retry-${retryCount + 1}`,
        delay: delayMs,
      }
    );
    await prisma.ticket.update({
      where: { id: ticketId },
      data: { ai_status: "RETRYING" },
    });
  }
}
