/**
 * Persist OpenAI request/response for Monitoring. Never store API key.
 * Extracts token usage and estimates cost (USD) from response.
 */

import { prisma } from "@/lib/db/client";

export type OpenAILogSource =
  | "generate-test-case-from-ticket"
  | "generate-plan"
  | "step-resolver"
  | "data-generation";

export interface OpenAILogRequestPayload {
  model: string;
  messages: Array<{ role: string; content: string }>;
  max_tokens?: number;
  temperature?: number;
}

/** USD per 1M tokens (input, output). Approximate; update from OpenAI pricing page. */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4-turbo": { input: 10, output: 30 },
  "gpt-4": { input: 30, output: 60 },
  "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
};

function normalizeModelForPricing(model: string): string {
  const m = model.toLowerCase();
  if (m.includes("gpt-4o-mini")) return "gpt-4o-mini";
  if (m.includes("gpt-4o")) return "gpt-4o";
  if (m.includes("gpt-4-turbo")) return "gpt-4-turbo";
  if (m.includes("gpt-4")) return "gpt-4";
  if (m.includes("gpt-3.5")) return "gpt-3.5-turbo";
  return "gpt-4o-mini"; // default fallback
}

function estimateCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const key = normalizeModelForPricing(model);
  const pricing = MODEL_PRICING[key] ?? MODEL_PRICING["gpt-4o-mini"];
  const inputCost = (promptTokens / 1_000_000) * pricing.input;
  const outputCost = (completionTokens / 1_000_000) * pricing.output;
  return Math.round((inputCost + outputCost) * 1e8) / 1e8;
}

function extractUsage(response: unknown): {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
} | null {
  if (!response || typeof response !== "object") return null;
  const r = response as { usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } };
  const u = r.usage;
  if (!u) return null;
  const prompt = typeof u.prompt_tokens === "number" ? u.prompt_tokens : 0;
  const completion = typeof u.completion_tokens === "number" ? u.completion_tokens : 0;
  const total = typeof u.total_tokens === "number" ? u.total_tokens : prompt + completion;
  return { promptTokens: prompt, completionTokens: completion, totalTokens: total };
}

/** Store one OpenAI call. Response is the raw completion object (no secrets). */
export async function saveOpenAILog(params: {
  source: OpenAILogSource;
  request: OpenAILogRequestPayload;
  response: unknown;
}): Promise<void> {
  try {
    const responseObj = (params.response ?? {}) as object;
    const usage = extractUsage(params.response);
    const model = params.request.model;

    const promptTokens = usage?.promptTokens ?? null;
    const completionTokens = usage?.completionTokens ?? null;
    const totalTokens = usage?.totalTokens ?? null;
    const estimatedCostUsd =
      usage && model
        ? estimateCostUsd(model, usage.promptTokens, usage.completionTokens)
        : null;

    await prisma.openAILog.create({
      data: {
        source: params.source,
        model: params.request.model,
        requestPayload: params.request as object,
        responsePayload: responseObj,
        promptTokens,
        completionTokens,
        totalTokens,
        estimatedCostUsd,
      },
    });
  } catch (err) {
    // Do not fail the main flow if logging fails
    console.error("[OpenAILog] save failed:", err);
  }
}
