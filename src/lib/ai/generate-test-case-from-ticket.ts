/**
 * Generate test case(s) from a ticket using OpenAI.
 * Two-step architecture: (1) Scenario Planner → (2) Per-scenario test case generation → (3) Merge.
 * Prompts are read from Config. No hardcoded prompts.
 * - Planner step: openai_system_prompt + openai_user_prompt_template_scenario_planner (or openai_user_prompt_template if empty).
 * - Per-scenario step: openai_system_prompt + openai_user_prompt_template with scenario context.
 */

import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { prisma } from "@/lib/db/client";
import { getConfig } from "@/lib/config";
import { OPENAI_DEFAULT_MODEL } from "@/lib/config/openai-models";
import { saveOpenAILog } from "@/lib/ai/openai-log";
import {
  aiGeneratedTestCasesResponseSchema,
  scenarioPlannerResponseSchema,
  type AIGeneratedTestCaseItem,
  type ScenarioPlannerResponse,
  type ScenarioPlannerScenario,
} from "@/lib/validations/schemas";

export type GenerateTestCaseFromTicketResult = {
  testCaseIds: string[];
  errors?: string[];
};

const MAX_LENGTH_RETRIES = 2;

/** Suffix for planner call: output only scenario index list (no full test case structure). */
const PLANNER_OUTPUT_SUFFIX = `

========================
OUTPUT FORMAT (STRICT JSON ONLY) — Scenario list only
========================
Return ONLY valid JSON (no markdown fences, no extra text). Do NOT generate full test cases.

{
  "application": "{{application_name}}",
  "allowed_types": {{allowed_types}},
  "scenarios": [
    { "no": 1, "title": "short scenario title", "category": "FUNCTIONAL|SECURITY|VALIDATION|..." }
  ]
}
`;

/** Appended to user prompt when generating a single test case (per-scenario step). */
const SINGLE_TEST_CASE_SUFFIX = `

========================
OUTPUT FORMAT (STRICT JSON ONLY) — One test case only
========================
Generate ONLY ONE test case for the given scenario. Return ONLY valid JSON (no markdown fences, no extra text):

{
  "test_type": "E2E or API (must be in allowed_types)",
  "no": {{scenario_no}},
  "title": "string",
  "scenario": "string",
  "objective": "string",
  "category": "FUNCTIONAL|VALIDATION|SECURITY|ROLE_BASED|DATA_MASKING|EDGE_CASE",
  "data_condition": "RECORD_MUST_EXIST|RECORD_MUST_NOT_EXIST|NO_DATA_DEPENDENCY",
  "setup_hint": "string|null",
  "data_requirement": [],
  "preconditions": ["string"],
  "steps": ["string (use {{alias.field}} if needed; no login/authentication steps)"],
  "expected_results": ["string"]
}
`;

function parseJsonFromRaw(raw: string): unknown {
  const cleaned = raw.replace(/^```json\s*|\s*```$/g, "").trim();
  return JSON.parse(cleaned);
}

function messagesForLog(messages: ChatCompletionMessageParam[]): Array<{ role: string; content: string }> {
  return messages.map((m) => ({
    role: m.role,
    content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
  }));
}

/** Extract raw test case array from parsed AI response (same logic as normalize). */
function extractRawTestCases(parsed: unknown): unknown[] {
  if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
  const obj = parsed as Record<string, unknown>;
  const getArr = (o: Record<string, unknown>, k: string) =>
    Array.isArray(o[k]) ? (o[k] as unknown[]) : undefined;
  const nested = (o: Record<string, unknown>, k: string) => {
    const v = o[k];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const inner = v as Record<string, unknown>;
      return getArr(inner, "testCases") ?? getArr(inner, "test_cases") ?? getArr(inner, "test_case");
    }
    return undefined;
  };
  const candidates = [
    getArr(obj, "testCases") ?? [],
    getArr(obj, "test_cases") ?? [],
    getArr(obj, "test_case") ?? [],
    nested(obj, "data") ?? [],
    nested(obj, "result") ?? [],
    nested(obj, "response") ?? [],
    nested(obj, "content") ?? [],
  ].filter((a) => a.length > 0);
  if (candidates.length > 0) return candidates[0];
  if (typeof obj.title === "string" && obj.title.length > 0) return [obj];
  for (const v of Object.values(obj)) {
    if (Array.isArray(v) && v.length > 0 && v.some((x) => x && typeof x === "object" && "title" in x))
      return v as unknown[];
  }
  return [];
}

/** Normalize AI JSON: accept any key for test case array (testCases, test_cases, nested, etc.) and convert item shape. */
function normalizeAITestCasesResponse(parsed: unknown): { testCases: unknown[] } {
  let items: unknown[] = [];
  if (Array.isArray(parsed) && parsed.length > 0) {
    items = parsed;
  } else if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    const getArr = (o: Record<string, unknown>, key: string): unknown[] | undefined => {
      const v = o[key];
      return Array.isArray(v) ? v : undefined;
    };
    const nested = (o: Record<string, unknown>, key: string): unknown[] | undefined => {
      const v = o[key];
      if (v && typeof v === "object" && !Array.isArray(v)) {
        const inner = v as Record<string, unknown>;
        return getArr(inner, "testCases") ?? getArr(inner, "test_cases") ?? getArr(inner, "test_case");
      }
      return undefined;
    };

    const candidates: unknown[][] = [
      getArr(obj, "testCases") ?? [],
      getArr(obj, "test_cases") ?? [],
      getArr(obj, "test_case") ?? [],
      nested(obj, "data") ?? [],
      nested(obj, "result") ?? [],
      nested(obj, "response") ?? [],
      nested(obj, "content") ?? [],
    ].filter((a) => a.length > 0);

    if (candidates.length > 0) {
      items = candidates[0];
    }
    if (items.length === 0 && typeof obj.title === "string" && obj.title.length > 0) {
      items = [obj];
    }
    if (items.length === 0) {
      for (const v of Object.values(obj)) {
        if (Array.isArray(v) && v.length > 0 && v.some((x) => x && typeof x === "object" && "title" in x)) {
          items = v;
          break;
        }
      }
    }
  }
  const normalizedItems = items.map((item) => normalizeAITestCaseItem(item));
  return { testCases: normalizedItems };
}

function normalizeAITestCaseItem(item: unknown): Record<string, unknown> {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return { title: "Untitled", testSteps: [] };
  }
  const o = item as Record<string, unknown>;
  const title = typeof o.title === "string" && o.title.length > 0 ? o.title : "Untitled";
  const testType = o.testType ?? o.type;
  const steps = o.testSteps ?? o.steps;
  let testSteps: string[] = [];
  if (Array.isArray(steps)) {
    testSteps = steps.map((s) => {
      if (typeof s === "string") return s;
      if (s && typeof s === "object" && "action" in s) {
        const step = s as { action?: string; expected_result?: string };
        const a = typeof step.action === "string" ? step.action : "";
        const e = typeof step.expected_result === "string" ? step.expected_result : "";
        return e ? `${a} → ${e}` : a;
      }
      return String(s);
    });
  }
  let expectedResult: string | undefined;
  if (typeof o.expectedResult === "string") {
    expectedResult = o.expectedResult;
  } else if (Array.isArray(steps) && steps.length > 0) {
    const last = steps[steps.length - 1];
    if (last && typeof last === "object" && "expected_result" in last && typeof (last as { expected_result?: string }).expected_result === "string") {
      expectedResult = (last as { expected_result: string }).expected_result;
    }
  }
  const out: Record<string, unknown> = { title, testSteps };
  if (testType === "API" || testType === "E2E") out.testType = testType;
  if (expectedResult) out.expectedResult = expectedResult;
  const pri = String(o.priority).toUpperCase();
  if (o.priority && ["CRITICAL", "HIGH", "MEDIUM", "LOW"].includes(pri)) out.priority = pri;
  const categoryVal = o.category;
  if (categoryVal && typeof categoryVal === "string" && [
    "FUNCTIONAL", "NEGATIVE", "VALIDATION", "SECURITY", "ROLE_BASED", "DATA_MASKING",
    "ACCESS_CONTROL", "ERROR_HANDLING", "EDGE_CASE", "COMPLIANCE",
  ].includes(categoryVal)) out.category = categoryVal;
  const dataCond = o.data_condition ?? o.dataCondition;
  if (dataCond && typeof dataCond === "string" && [
    "RECORD_MUST_EXIST", "RECORD_MUST_NOT_EXIST", "NO_DATA_DEPENDENCY",
    "STATEFUL_DEPENDENCY", "CROSS_ENTITY_DEPENDENCY",
  ].includes(dataCond)) out.data_condition = dataCond;
  if (o.setup_hint !== undefined) out.setup_hint = typeof o.setup_hint === "string" ? o.setup_hint : null;
  else if (o.setupHint !== undefined) out.setup_hint = typeof o.setupHint === "string" ? o.setupHint : null;
  const dataReq = o.data_requirement ?? o.dataRequirement;
  if (Array.isArray(dataReq) && dataReq.length > 0) {
    out.data_requirement = dataReq;
  }
  return out;
}

type TicketContext = {
  title: string;
  description: string | null;
  acceptanceCriteria: string | null;
  primaryActor: string | null;
  projectId: string;
  id: string;
};

function replaceTicketPlaceholders(
  template: string,
  ctx: { ticket: TicketContext; applicationName: string; allowedTypes: string[] }
): string {
  return template
    .replace(/\{\{title\}\}/g, ctx.ticket.title)
    .replace(/\{\{description\}\}/g, ctx.ticket.description ?? "")
    .replace(/\{\{acceptance_criteria\}\}/g, ctx.ticket.acceptanceCriteria ?? "")
    .replace(/\{\{application\}\}/g, ctx.applicationName)
    .replace(/\{\{application_name\}\}/g, ctx.applicationName)
    .replace(/\{\{allowed_test_types\}\}/g, JSON.stringify(ctx.allowedTypes))
    .replace(/\{\{allowed_types\}\}/g, JSON.stringify(ctx.allowedTypes));
}

function replaceScenarioPlaceholders(
  template: string,
  scenario: ScenarioPlannerScenario
): string {
  return template
    .replace(/\{\{scenario_no\}\}/g, String(scenario.no))
    .replace(/\{\{scenario_title\}\}/g, scenario.title)
    .replace(/\{\{scenario_category\}\}/g, scenario.category);
}

/** Step 1: Call OpenAI for scenario list only. Retries on finish_reason === "length". */
async function callPlanner(
  openai: OpenAI,
  model: string,
  systemPrompt: string,
  plannerUserPrompt: string,
  applicationName: string,
  allowedTypes: string[]
): Promise<ScenarioPlannerResponse> {
  const suffix = PLANNER_OUTPUT_SUFFIX
    .replace(/\{\{application_name\}\}/g, applicationName)
    .replace(/\{\{allowed_types\}\}/g, JSON.stringify(allowedTypes));
  const userContent = plannerUserPrompt.trim() + suffix;
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ];
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= MAX_LENGTH_RETRIES; attempt++) {
    const extraInstruction = attempt > 0 ? "\n\nBe concise. Output only the JSON with minimal scenario titles." : "";
    const finalContent = userContent + extraInstruction;
    const msgs: ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: finalContent },
    ];
    const completion = await openai.chat.completions.create({
      model,
      messages: msgs,
      max_tokens: attempt > 0 ? 1024 : 2048,
      temperature: 0.2,
    });
    const raw = completion.choices[0]?.message?.content?.trim();
    const finishReason = completion.choices[0]?.finish_reason;
    if (finishReason === "length" && attempt < MAX_LENGTH_RETRIES) {
      console.warn("[generate-test-case] Scenario planner response truncated (finish_reason=length), retrying with reduced verbosity");
      lastError = new Error("Planner response truncated");
      continue;
    }
    if (!raw) {
      throw new Error(lastError?.message ?? "Empty planner response");
    }
    let parsed: unknown;
    try {
      parsed = parseJsonFromRaw(raw);
    } catch {
      throw new Error("Planner response is not valid JSON");
    }
    const result = scenarioPlannerResponseSchema.safeParse(parsed);
    if (result.success) {
      await saveOpenAILog({
        source: "generate-test-case-from-ticket",
        request: { model, messages: messagesForLog(msgs), max_tokens: attempt > 0 ? 1024 : 2048, temperature: 0.2 },
        response: JSON.parse(JSON.stringify(completion)),
      });
      return result.data;
    }
    lastError = new Error(`Planner response invalid: ${result.error.message}`);
  }
  throw lastError ?? new Error("Planner step failed");
}

/** Step 2: Generate one test case for a scenario. Retries on finish_reason === "length". */
async function callGenerateOneTestCase(
  openai: OpenAI,
  model: string,
  systemPrompt: string,
  userTemplate: string,
  scenario: ScenarioPlannerScenario,
  ctx: { ticket: TicketContext; applicationName: string; allowedTypes: string[] }
): Promise<{ item: AIGeneratedTestCaseItem; rawItem: Record<string, unknown> } | null> {
  const baseUser = replaceTicketPlaceholders(userTemplate, ctx);
  const withScenario = replaceScenarioPlaceholders(baseUser, scenario);
  const suffix = SINGLE_TEST_CASE_SUFFIX.replace(/\{\{scenario_no\}\}/g, String(scenario.no));
  const userContent = withScenario.trim() + suffix;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= MAX_LENGTH_RETRIES; attempt++) {
    const extraInstruction = attempt > 0 ? "\n\nBe concise. Output only the single test case JSON." : "";
    const finalContent = userContent + extraInstruction;
    const msgs: ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: finalContent },
    ];
    const completion = await openai.chat.completions.create({
      model,
      messages: msgs,
      max_tokens: attempt > 0 ? 2048 : 4096,
      temperature: 0.2,
    });
    const raw = completion.choices[0]?.message?.content?.trim();
    const finishReason = completion.choices[0]?.finish_reason;
    if (finishReason === "length" && attempt < MAX_LENGTH_RETRIES) {
      console.warn("[generate-test-case] Per-scenario response truncated (finish_reason=length), retrying", { scenarioNo: scenario.no });
      lastError = new Error("Per-scenario response truncated");
      continue;
    }
    if (!raw) {
      return null;
    }
    let parsed: unknown;
    try {
      parsed = parseJsonFromRaw(raw);
    } catch {
      return null;
    }
    const rawItems = extractRawTestCases(parsed);
    const singleRaw = (rawItems[0] ?? parsed) as Record<string, unknown>;
    const normalized = normalizeAITestCasesResponse(Array.isArray(parsed) ? { test_cases: parsed } : parsed);
    if (normalized.testCases.length === 0) return null;
    const validated = aiGeneratedTestCasesResponseSchema.safeParse({ testCases: normalized.testCases });
    if (!validated.success) return null;
    await saveOpenAILog({
      source: "generate-test-case-from-ticket",
      request: { model, messages: messagesForLog(msgs), max_tokens: attempt > 0 ? 2048 : 4096, temperature: 0.2 },
      response: JSON.parse(JSON.stringify(completion)),
    });
    return { item: validated.data.testCases[0], rawItem: singleRaw };
  }
  return null;
}

/**
 * Fetch ticket, application, config; run 2-step AI (planner → per-scenario generation); create TestCase records.
 * - If config prompts are missing → throws.
 * - Preserves API contract: returns { testCaseIds }; optional errors[] on partial failure.
 */
export async function generateTestCaseFromTicket(
  ticketId: string,
  options?: { createdById?: string }
): Promise<GenerateTestCaseFromTicketResult> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      projectId: true,
      title: true,
      description: true,
      acceptanceCriteria: true,
      applicationIds: true,
      primaryActor: true,
    },
  });

  if (!ticket) {
    throw new Error("Ticket not found");
  }

  const applicationIds = Array.isArray(ticket.applicationIds)
    ? (ticket.applicationIds as string[])
    : [];
  const applicationId = applicationIds[0] ?? null;

  let application: { id: string; name: string; platform: string | null; testTypes: unknown } | null =
    null;
  if (applicationId) {
    const app = await prisma.application.findUnique({
      where: { id: applicationId },
      select: { id: true, name: true, platform: true, testTypes: true },
    });
    if (app) application = app;
  }

  const applicationName = application?.name ?? "";
  const allowedTypes: string[] =
    application && Array.isArray(application.testTypes)
      ? (application.testTypes as string[])
      : ["API", "E2E"];

  const config = await getConfig();
  const model = config.openai_model || process.env.OPENAI_MODEL || OPENAI_DEFAULT_MODEL;
  const ticketContext: TicketContext = {
    title: ticket.title,
    description: ticket.description ?? null,
    acceptanceCriteria: ticket.acceptanceCriteria ?? null,
    primaryActor: ticket.primaryActor ?? null,
    projectId: ticket.projectId,
    id: ticket.id,
  };
  const ctx = { ticket: ticketContext, applicationName, allowedTypes };
  let requestMessages: ChatCompletionMessageParam[] | null = null;
  let completion: Awaited<ReturnType<OpenAI["chat"]["completions"]["create"]>> | null = null;

  try {
    const apiKey = config.openai_api_key || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OpenAI API key not configured (set in Config or OPENAI_API_KEY)");
    }

    const systemPrompt = (config.openai_system_prompt ?? "").trim();
    const userTemplate = (config.openai_user_prompt_template ?? "").trim();
    const plannerTemplateRaw = (config.openai_user_prompt_template_scenario_planner ?? "").trim();
    const plannerTemplate = plannerTemplateRaw || userTemplate;
    if (!systemPrompt) {
      throw new Error(
        "Go to Config → OpenAI and set \"System prompt for generate test case\" (and \"User prompt template for generate test case\"), then Save."
      );
    }
    if (!userTemplate) {
      throw new Error(
        "Go to Config → OpenAI and set \"User prompt template for generate test case\" (and \"System prompt for generate test case\"), then Save."
      );
    }

    const openai = new OpenAI({ apiKey });

    // Step 1 — Scenario Planner
    const plannerUserPrompt = replaceTicketPlaceholders(plannerTemplate, ctx);
    const plannerResponse = await callPlanner(
      openai,
      model,
      systemPrompt,
      plannerUserPrompt,
      applicationName,
      allowedTypes
    );

    // Step 2 — Per-scenario test case generation
    const items: AIGeneratedTestCaseItem[] = [];
    const rawItems: Record<string, unknown>[] = [];
    const errors: string[] = [];
    for (const scenario of plannerResponse.scenarios) {
      const result = await callGenerateOneTestCase(
        openai,
        model,
        systemPrompt,
        userTemplate,
        scenario,
        ctx
      );
      if (result) {
        items.push(result.item);
        rawItems.push(result.rawItem);
      } else {
        errors.push(`Scenario ${scenario.no}: ${scenario.title} — generation failed after retries`);
      }
    }

    if (items.length === 0) {
      throw new Error(
        errors.length ? errors.join("; ") : "No test cases generated"
      );
    }

    const toValidate = { testCases: items };
    const validated = aiGeneratedTestCasesResponseSchema.safeParse(toValidate);
    if (!validated.success) {
      throw new Error(`AI response shape invalid: ${validated.error.message}`);
    }

    const testCaseIds: string[] = [];
    const priorityMap: Record<string, "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"> = {
      critical: "CRITICAL",
      high: "HIGH",
      medium: "MEDIUM",
      low: "LOW",
      CRITICAL: "CRITICAL",
      HIGH: "HIGH",
      MEDIUM: "MEDIUM",
      LOW: "LOW",
    };
    const testTypeMap = { API: "API" as const, E2E: "E2E" as const };

    for (let i = 0; i < validated.data.testCases.length; i++) {
      const item = validated.data.testCases[i];
      const raw = rawItems[i] ?? {};
      const rawDr = raw.data_requirement ?? raw.dataRequirement;
      const dataReq: object[] =
        Array.isArray(rawDr) && rawDr.length > 0
          ? (rawDr as object[])
          : Array.isArray(item.data_requirement) && item.data_requirement.length > 0
            ? (item.data_requirement as object[])
            : [];

      const priority = item.priority && priorityMap[item.priority] ? priorityMap[item.priority] : "MEDIUM";
      const testType =
        item.testType && (item.testType === "API" || item.testType === "E2E")
          ? testTypeMap[item.testType]
          : (allowedTypes[0] === "API" || allowedTypes[0] === "E2E"
              ? (allowedTypes[0] as "API" | "E2E")
              : "E2E");

      const category =
        item.category && [
          "FUNCTIONAL", "NEGATIVE", "VALIDATION", "SECURITY", "ROLE_BASED", "DATA_MASKING",
          "ACCESS_CONTROL", "ERROR_HANDLING", "EDGE_CASE", "COMPLIANCE",
        ].includes(item.category)
          ? item.category
          : undefined;
      const dataCondition =
        item.data_condition &&
        ["RECORD_MUST_EXIST", "RECORD_MUST_NOT_EXIST", "NO_DATA_DEPENDENCY", "STATEFUL_DEPENDENCY", "CROSS_ENTITY_DEPENDENCY"].includes(item.data_condition)
          ? item.data_condition
          : undefined;

      const tc = await prisma.testCase.create({
        data: {
          projectId: ticket.projectId,
          ticketId: ticket.id,
          applicationId: applicationId ?? undefined,
          title: item.title,
          priority,
          status: "READY",
          testType,
          platform: application?.platform ?? undefined,
          testSteps: Array.isArray(item.testSteps) ? item.testSteps : [],
          expectedResult: item.expectedResult ?? undefined,
          category: category ?? undefined,
          data_condition: dataCondition ?? undefined,
          dataRequirement: dataReq,
          setup_hint: item.setup_hint ?? undefined,
          source: "AI",
          primaryActor: ticket.primaryActor ?? null,
          createdById: options?.createdById ?? undefined,
        },
      });
      testCaseIds.push(tc.id);
    }

    return { testCaseIds, errors: errors.length > 0 ? errors : undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const logRequest = requestMessages
      ? {
          model,
          messages: requestMessages.map((m) => ({
            role: m.role,
            content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
          })),
          max_tokens: 4096,
          temperature: 0.2,
        }
      : {
          model,
          messages: [{ role: "user", content: `[Error before/during request: ${message}]` }],
          max_tokens: 4096,
          temperature: 0.2,
        };
    const responsePayload = completion
      ? { ...JSON.parse(JSON.stringify(completion)), _error: message }
      : { error: message };
    await saveOpenAILog({
      source: "generate-test-case-from-ticket",
      request: logRequest,
      response: responsePayload,
    });
    throw err;
  }
}
