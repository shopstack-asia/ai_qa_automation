/**
 * AI test case generation: accept AC text, return structured plan (Zod-validated).
 */

import OpenAI from "openai";
import { structuredPlanSchema, type StructuredPlan } from "@/lib/validations/schemas";
import { getConfig } from "@/lib/config";
import { OPENAI_DEFAULT_MODEL } from "@/lib/config/openai-models";
import { saveOpenAILog } from "@/lib/ai/openai-log";

const SYSTEM_PROMPT = `You are a QA engineer. Given acceptance criteria, produce a structured test plan as JSON.
Output ONLY valid JSON matching this schema (no markdown, no explanation):
{
  "version": 1,
  "steps": [
    { "order": 1, "action": "navigate", "target": "url or description", "value": "optional" },
    { "order": 2, "action": "click", "target": "element description or selector" },
    { "order": 3, "action": "fill", "target": "input description", "value": "text to type" },
    { "order": 4, "action": "assert_text", "target": "element", "assertion": "expected text" }
  ]
}
Allowed actions: navigate, click, fill, select, hover, assert_text, assert_visible, assert_url, wait, api_request.
Each step must have order (1-based) and action. Use target/value/assertion as needed.`;

export async function generateStructuredPlanFromAC(
  acceptanceCriteria: string,
  options?: { maxTokens?: number }
): Promise<StructuredPlan> {
  const config = await getConfig();
  const apiKey = config.openai_api_key || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OpenAI API key not configured (set in Config or OPENAI_API_KEY)");

  const openai = new OpenAI({ apiKey });
  const model = config.openai_model || process.env.OPENAI_MODEL || OPENAI_DEFAULT_MODEL;

  const requestMessages = [
  { role: "system" as const, content: SYSTEM_PROMPT },
  { role: "user" as const, content: acceptanceCriteria },
];
const completion = await openai.chat.completions.create({
  model,
  messages: requestMessages,
  max_tokens: options?.maxTokens ?? 2048,
  temperature: 0.2,
});

await saveOpenAILog({
  source: "generate-plan",
  request: {
    model,
    messages: requestMessages,
    max_tokens: options?.maxTokens ?? 2048,
    temperature: 0.2,
  },
  response: JSON.parse(JSON.stringify(completion)),
});

const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error("Empty AI response");

  let parsed: unknown;
  try {
    const cleaned = raw.replace(/^```json\s*|\s*```$/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("AI response is not valid JSON");
  }

  return structuredPlanSchema.parse(parsed);
}
