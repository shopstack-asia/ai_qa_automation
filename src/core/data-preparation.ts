/**
 * Data Preparation: resolves data_requirement to concrete values via data_knowledge lookup or AI generation.
 * Used by Pre-Execution Step 1. Deterministic key, no fuzzy matching.
 */

import { prisma } from "@/lib/db/client";
import OpenAI from "openai";
import { getConfig } from "@/lib/config";
import { OPENAI_DEFAULT_MODEL } from "@/lib/config/openai-models";
import { saveOpenAILog } from "@/lib/ai/openai-log";

export interface DataRequirementItem {
  alias: string;
  type: string;
  scenario: string;
  role?: string | null;
}

/**
 * Build deterministic key from requirement.
 * Format: {scenario}_{role}_{type} or {scenario}_{type} if role is null.
 * All uppercase, no spaces.
 */
export function buildDataKey(requirement: DataRequirementItem): string {
  const type = String(requirement.type ?? "").toUpperCase().replace(/\s+/g, "");
  const scenario = String(requirement.scenario ?? "").toUpperCase().replace(/\s+/g, "");
  const role = requirement.role != null && requirement.role !== ""
    ? String(requirement.role).toUpperCase().replace(/\s+/g, "")
    : null;

  if (role) {
    return `${scenario}_${role}_${type}`;
  }
  return `${scenario}_${type}`;
}

/**
 * Resolve a single data requirement: lookup data_knowledge, or generate via AI and save.
 */
async function resolveRequirement(
  projectId: string,
  requirement: DataRequirementItem,
  context: {
    ticketTitle?: string | null;
    ticketDescription?: string | null;
    acceptanceCriteria?: string | null;
    testCaseTitle: string;
    testCaseScenario?: string | null;
  }
): Promise<unknown> {
  const key = buildDataKey(requirement);

  // Lookup data_knowledge
  const existing = await prisma.dataKnowledge.findUnique({
    where: { projectId_key: { projectId, key } },
    select: { value: true },
  });
  if (existing) {
    return existing.value;
  }

  // AI generation
  const config = await getConfig();
  const apiKey = config.openai_api_key || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OpenAI API key not configured; cannot generate data for data_knowledge");
  }

  const systemPrompt = `You generate structured JSON test data only. No explanation, no markdown, no code block. Return a single JSON object with a "value" key containing the structured data matching the requested type. Types are domain-specific (e.g. LOGIN → {username, password}; USER → {email, name}; FORM_DATA → form fields). No login steps, no placeholder text. Valid JSON only.`;

  const userPrompt = `Generate test data for:
- Type: ${requirement.type}
- Scenario: ${requirement.scenario}
${requirement.role ? `- Role: ${requirement.role}` : "- Role: (none)"}
- Ticket: ${context.ticketTitle ?? "(none)"}
- Ticket description: ${(context.ticketDescription ?? "").slice(0, 500)}
- Acceptance criteria: ${(context.acceptanceCriteria ?? "").slice(0, 500)}
- Test case: ${context.testCaseTitle}
- Test case scenario: ${context.testCaseScenario ?? "(none)"}

Return JSON: { "value": { ... } }`;

  const openai = new OpenAI({ apiKey });
  const model = config.openai_model || process.env.OPENAI_MODEL || OPENAI_DEFAULT_MODEL;

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    max_tokens: 1024,
    temperature: 0.2,
  });

  await saveOpenAILog({
    source: "data-generation",
    request: {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 1024,
      temperature: 0.2,
    },
    response: completion,
  });

  const raw = completion.choices?.[0]?.message?.content?.trim();
  if (!raw) {
    throw new Error("AI returned empty response for data generation");
  }

  let parsed: { value?: unknown };
  try {
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
    parsed = JSON.parse(cleaned) as { value?: unknown };
  } catch {
    throw new Error("AI response is not valid JSON");
  }

  if (parsed.value === undefined) {
    throw new Error("AI response must contain 'value' key");
  }

  // Save to data_knowledge
  await prisma.dataKnowledge.create({
    data: {
      projectId,
      key,
      type: requirement.type,
      scenario: requirement.scenario,
      role: requirement.role ?? null,
      value: parsed.value as object,
    },
  });

  return parsed.value;
}

/**
 * Resolve all data requirements and build resolvedData: { alias: value, ... }
 */
export async function resolveDataRequirements(
  projectId: string,
  requirements: DataRequirementItem[],
  context: {
    ticketTitle?: string | null;
    ticketDescription?: string | null;
    acceptanceCriteria?: string | null;
    testCaseTitle: string;
    testCaseScenario?: string | null;
  }
): Promise<Record<string, unknown>> {
  const resolvedData: Record<string, unknown> = {};

  for (const req of requirements) {
    const value = await resolveRequirement(projectId, req, context);
    resolvedData[req.alias] = value;
  }

  return resolvedData;
}

/**
 * Get nested value from object by path like "alias.field" or "alias.items[0].material_code"
 */
function getNestedValue(obj: unknown, path: string): unknown {
  if (obj == null) return undefined;
  const parts = path.replace(/\]/g, "").split(/\.|\[/).filter(Boolean);
  let current: unknown = obj;
  for (const p of parts) {
    if (current == null || typeof current !== "object") return undefined;
    const key = /^\d+$/.test(p) ? Number.parseInt(p, 10) : p;
    current = (current as Record<string | number, unknown>)[key];
  }
  return current;
}

const PLACEHOLDER_REGEX = /\{\{([^}]+)\}\}/g;

/**
 * Interpolate {{alias.field}} and {{alias.items[0].field}} in a string using resolvedData.
 * Throws if a placeholder cannot be resolved.
 */
export function interpolatePlaceholders(
  str: string,
  resolvedData: Record<string, unknown>
): string {
  return str.replace(PLACEHOLDER_REGEX, (match, path) => {
    const trimmed = path.trim();
    const dotIndex = trimmed.indexOf(".");
    const alias = dotIndex >= 0 ? trimmed.slice(0, dotIndex) : trimmed;
    const rest = dotIndex >= 0 ? trimmed.slice(dotIndex + 1) : "";
    const base = resolvedData[alias];
    const value = rest ? getNestedValue(base, rest) : base;
    if (value === undefined || value === null) {
      throw new Error(`Placeholder {{${path}}} could not be resolved`);
    }
    return String(value);
  });
}

/**
 * Flatten resolvedData to variables for runner compatibility.
 * Keys: "alias.field" -> value as string.
 */
export function flattenResolvedDataToVariables(
  resolvedData: Record<string, unknown>
): Record<string, string> {
  const variables: Record<string, string> = {};
  function walk(obj: unknown, prefix: string): void {
    if (obj == null) return;
    if (typeof obj === "string" || typeof obj === "number" || typeof obj === "boolean") {
      variables[prefix] = String(obj);
      return;
    }
    if (Array.isArray(obj)) {
      obj.forEach((v, i) => walk(v, `${prefix}[${i}]`));
      return;
    }
    if (typeof obj === "object") {
      for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}.${k}` : k;
        walk(v, key);
      }
    }
  }
  for (const [alias, val] of Object.entries(resolvedData)) {
    walk(val, alias);
  }
  return variables;
}
