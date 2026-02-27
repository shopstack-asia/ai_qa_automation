/**
 * Generate test case(s) from a ticket using OpenAI.
 * Prompts are read from Config (openai_system_prompt, openai_user_prompt_template).
 * No hardcoded prompts; placeholders in user template are replaced with ticket/application data.
 */

import OpenAI from "openai";
import { prisma } from "@/lib/db/client";
import { getConfig } from "@/lib/config";
import { OPENAI_DEFAULT_MODEL } from "@/lib/config/openai-models";
import { saveOpenAILog } from "@/lib/ai/openai-log";
import {
  aiGeneratedTestCasesResponseSchema,
  type AIGeneratedTestCaseItem,
} from "@/lib/validations/schemas";

export type GenerateTestCaseFromTicketResult = { testCaseIds: string[] };

/** Appended to user prompt so the model returns JSON that we can use to create TestCase records. */
const OUTPUT_SCHEMA_SUFFIX = `

========================
OUTPUT FORMAT (STRICT JSON ONLY)
========================
Return ONLY valid JSON (no markdown fences, no extra text) using this schema:

{
  "application": "{{application_name}}",
  "allowed_types": {{allowed_types}},
  "test_cases": [
    {
      "test_type": "E2E or API (must be in allowed_types)",
      "no": 1,
      "title": "string",
      "scenario": "string",
      "objective": "string",
      "category": "FUNCTIONAL|VALIDATION|SECURITY|ROLE_BASED|DATA_MASKING|EDGE_CASE",
      "data_condition": "RECORD_MUST_EXIST|RECORD_MUST_NOT_EXIST|NO_DATA_DEPENDENCY",
      "setup_hint": "string|null",
      "data_requirement": [
        {
          "alias": "string (local variable name used in steps)",
          "type": "UPPERCASE_STRING",
          "scenario": "VALID|INVALID|EDGE|EMPTY",
          "role": "UPPERCASE_STRING|null"
        }
      ],
      "preconditions": ["string"],
      "steps": [
        "string (must use placeholder like {{alias.field}} if input is required and must NOT contain login/authentication steps)"
      ],
      "expected_results": ["string"]
    }
  ]
}
`;

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

/**
 * Fetch ticket, application, config; build user prompt from template; call OpenAI; create TestCase records.
 * - If config prompts are missing → throws.
 * - Expects strict JSON from OpenAI (single or multiple test cases).
 * - Creates records with status "READY", source "AI".
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
  let requestMessages: Array<{ role: string; content: string }> | null = null;
  let completion: Awaited<ReturnType<OpenAI["chat"]["completions"]["create"]>> | null = null;

  try {
    const apiKey = config.openai_api_key || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OpenAI API key not configured (set in Config or OPENAI_API_KEY)");
    }

    const systemPrompt = (config.openai_system_prompt ?? "").trim();
    const userTemplate = (config.openai_user_prompt_template ?? "").trim();
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

    const userPrompt =
      userTemplate
        .replace(/\{\{title\}\}/g, ticket.title)
        .replace(/\{\{description\}\}/g, ticket.description ?? "")
        .replace(/\{\{acceptance_criteria\}\}/g, ticket.acceptanceCriteria ?? "")
        .replace(/\{\{application\}\}/g, applicationName)
        .replace(/\{\{application_name\}\}/g, applicationName)
        .replace(/\{\{allowed_test_types\}\}/g, JSON.stringify(allowedTypes))
        .replace(/\{\{allowed_types\}\}/g, JSON.stringify(allowedTypes))
        .trim() + OUTPUT_SCHEMA_SUFFIX;

    requestMessages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    const openai = new OpenAI({ apiKey });
    completion = await openai.chat.completions.create({
      model,
      messages: requestMessages,
      max_tokens: 4096,
      temperature: 0.2,
    });
    

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) {
      throw new Error("Empty AI response");
    }

    let parsed: unknown;
    try {
      const cleaned = raw.replace(/^```json\s*|\s*```$/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error("AI response is not valid JSON");
    }

    const normalized = normalizeAITestCasesResponse(parsed);
    console.log("normalized", normalized);
    const toValidate = { testCases: normalized.testCases };
    const validated = aiGeneratedTestCasesResponseSchema.safeParse(toValidate);
    if (!validated.success) {
      if (normalized.testCases.length === 0) {
        throw new Error(
          "AI did not return any test cases. Expected JSON with key testCases, test_cases, or an array of objects with title."
        );
      }
      throw new Error(
        `AI response shape invalid: ${validated.error.message}`
      );
    }

    const logRequest = {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 4096,
      temperature: 0.2,
    };
    await saveOpenAILog({
      source: "generate-test-case-from-ticket",
      request: logRequest,
      response: JSON.parse(JSON.stringify(completion)),
    });

    const items: AIGeneratedTestCaseItem[] = validated.data.testCases;
    const rawItems = extractRawTestCases(parsed);

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

    for (let i = 0; i < items.length; i++) {
      
      const item = items[i];
      console.log(item);
      const raw = (rawItems[i] ?? {}) as Record<string, unknown>;
      const rawDr = raw.data_requirement ?? raw.dataRequirement;
      const dataReq: object[] =
        Array.isArray(rawDr) && rawDr.length > 0
          ? (rawDr as object[])
          : Array.isArray(item.data_requirement) && item.data_requirement.length > 0
            ? (item.data_requirement as object[])
            : [];
      console.log(dataReq);            

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

    return { testCaseIds };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const logRequest = requestMessages
      ? {
          model,
          messages: requestMessages,
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
