/**
 * Pre-Execution: data prep, selector prep, assertion mapping, persist agent_execution.
 * Runs BEFORE Playwright. DB lookup only — NO AI. Unknown selectors become PENDING_RUNTIME.
 */

import { prisma } from "@/lib/db/client";
import { DataOrchestrator } from "@/core/data-orchestrator";
import type { ApplicationConfig, EnvConfig, TestCaseInput } from "@/core/data-orchestrator";
import type { AgentExecution, AgentExecutionStep } from "@/lib/agent-execution-types";
import { findSelector, incrementUsageCount } from "@/lib/selector/selector-knowledge-repository";
import { buildSemanticKey } from "@/lib/selector/semantic-key";
import { isBodySelectorForFill } from "@/lib/selector/selector-validation";
import { mapExpectedResultToAssertion } from "@/lib/assertion/assertion-mapper-service";
import { isValidUrl, extractUrlFromStepText } from "@/lib/url-validation";
import {
  resolveDataRequirements,
  interpolatePlaceholders,
  flattenResolvedDataToVariables,
  type DataRequirementItem,
} from "@/core/data-preparation";

export interface PreExecutionInput {
  executionId: string;
  projectId: string;
  applicationId: string | null;
  testCaseId: string;
  agentExecution: AgentExecution | null;
  testCase: {
    title: string;
    testType: string | null;
    testSteps: string[];
    expectedResult: string | null;
    category: string | null;
    data_condition: string | null;
    data_requirement?: DataRequirementItem[];
    setup_hint: string | null;
    ticket?: {
      title: string | null;
      description: string | null;
      acceptanceCriteria: string | null;
    } | null;
  };
  envConfig: EnvConfig;
  appConfig: ApplicationConfig;
}

/** Cache entry for execution-level selector resolution. Stores both success and failure. */
export type SelectorCacheEntry = {
  status: "FOUND_IN_DB" | "FOUND_IN_AI" | "NOT_FOUND";
  selector: string | null;
};

export type ExecutionSelectorCache = Map<string, SelectorCacheEntry>;

export interface PreExecutionResult {
  variables: Record<string, string>;
  /** Execution-scoped selector cache for runner fallback (prevents repeated DB/AI calls) */
  executionSelectorCache: ExecutionSelectorCache;
}


function inferAction(stepText: string): string {
  const t = stepText.toLowerCase();
  if (t.includes("click") || t.includes("press") || t.includes("submit")) return "click";
  if (t.includes("fill") || t.includes("type") || t.includes("enter")) return "fill";
  if (t.includes("select")) return "select";
  if (t.includes("navigate") || t.includes("go to") || t.includes("open")) return "navigate";
  if (t.includes("visible") || t.includes("displayed")) return "assert_visible";
  if (t.includes("redirect") || t.includes("url")) return "assert_url";
  if (t.includes("contain") || t.includes("text")) return "assert_text";
  if (t.includes("hover")) return "hover";
  if (t.includes("wait")) return "wait";
  return "click";
}

/**
 * For navigate steps: ensure we only keep action "navigate" when we have a valid URL.
 * If the resolved target is a selector (e.g. from AI), convert to "click" so the runner
 * never calls page.goto(selector).
 */
function resolveNavigateTarget(
  stepText: string,
  resolved_selector: string | null,
  inferredAction: string
): { action: string; resolved_selector: string | null } {
  if (inferredAction !== "navigate") {
    return { action: inferredAction, resolved_selector };
  }
  const extractedUrl = extractUrlFromStepText(stepText);
  if (extractedUrl && isValidUrl(extractedUrl)) {
    return { action: "navigate", resolved_selector: extractedUrl };
  }
  if (resolved_selector && isValidUrl(resolved_selector)) {
    return { action: "navigate", resolved_selector };
  }
  return { action: "click", resolved_selector };
}

/** Step text injected when E2E environment requires login (e2eAuthMode === ALWAYS_AUTH). */
const LOGIN_STEP_TEXT = "Perform login to the application using environment credentials";

export async function runPreExecution(input: PreExecutionInput): Promise<PreExecutionResult> {
  const { executionId, projectId, applicationId, testCase, envConfig, appConfig } = input;
  let variables: Record<string, string> = {};

  // Step 0: Auth – determine if we must prepend a login step (before Data preparation)
  const testType = (testCase.testType as "API" | "E2E") ?? "E2E";
  const e2eAuthMode = envConfig.e2eAuthMode ?? "NEVER_AUTH";
  const apiAuthMode = envConfig.apiAuthMode ?? "NONE";
  const needsE2ELogin =
    testType === "E2E" &&
    (e2eAuthMode === "ALWAYS_AUTH" || e2eAuthMode === "CONDITIONAL");
  // Single login step only: drop duplicate "Perform login..." from testSteps so login runs once
  const rawSteps = testCase.testSteps ?? [];
  const stepsWithoutDuplicateLogin = needsE2ELogin
    ? rawSteps.filter((t) => t?.trim() !== LOGIN_STEP_TEXT)
    : rawSteps;
  const effectiveTestSteps = needsE2ELogin
    ? [LOGIN_STEP_TEXT, ...stepsWithoutDuplicateLogin]
    : stepsWithoutDuplicateLogin;

  // Step 1: Data preparation
  let resolvedData: Record<string, unknown> = {};
  if (testCase.data_condition) {
    const orchestrator = new DataOrchestrator();
    const context = await orchestrator.prepare(
      {
        title: testCase.title,
        testType: (testCase.testType as "API" | "E2E") ?? "E2E",
        testSteps: testCase.testSteps,
        expectedResult: testCase.expectedResult ?? undefined,
        category: testCase.category ?? undefined,
        data_condition: testCase.data_condition as TestCaseInput["data_condition"],
        setup_hint: testCase.setup_hint ?? undefined,
      },
      appConfig,
      envConfig
    );
    variables = context.variables;
  }
  const dataReqs = Array.isArray(testCase.data_requirement) ? testCase.data_requirement : [];
  if (dataReqs.length > 0) {
    resolvedData = await resolveDataRequirements(projectId, dataReqs, {
      ticketTitle: testCase.ticket?.title ?? null,
      ticketDescription: testCase.ticket?.description ?? null,
      acceptanceCriteria: testCase.ticket?.acceptanceCriteria ?? null,
      testCaseTitle: testCase.title,
      testCaseScenario: testCase.category ?? null,
    });
    const flat = flattenResolvedDataToVariables(resolvedData);
    variables = { ...variables, ...flat };
  }

  // Step 2: Selector preparation — DB lookup only. No AI. Unknown → PENDING_RUNTIME (resolved at runtime with DOM).
  const executionSelectorCache: ExecutionSelectorCache = new Map();
  const existing = input.agentExecution ?? { steps: [] };
  const stepsByIndex = new Map<number, AgentExecutionStep>();
  // When we prepended login, existing steps are shifted: old 0→1, 1→2, ...
  for (const s of existing.steps) {
    const newIndex = needsE2ELogin ? s.stepIndex + 1 : s.stepIndex;
    stepsByIndex.set(newIndex, { ...s, stepIndex: newIndex });
  }

  const appId = applicationId ?? "";
  const now = new Date().toISOString();

  for (let stepIndex = 0; stepIndex < effectiveTestSteps.length; stepIndex++) {
    const stepText = effectiveTestSteps[stepIndex];
    if (!stepText?.trim()) continue;

    // Injected login step: no selector resolution
    if (needsE2ELogin && stepIndex === 0) {
      stepsByIndex.set(0, {
        stepIndex: 0,
        semantic_key: "perform_login",
        action: "login",
        resolved_selector: null,
        resolution_status: "RESOLVED",
        assertion: null,
        last_verified_at: now,
      });
      continue;
    }

    const origIndex = needsE2ELogin ? stepIndex - 1 : stepIndex;
    const inferredAction = inferAction(stepText);
    const key = buildSemanticKey(inferredAction, stepText);
    let entry = stepsByIndex.get(stepIndex);

    // Only step 0 may have action "login". Re-resolve if a previous run left action "login" at another index.
    if (entry?.resolution_status === "RESOLVED") {
      if (needsE2ELogin && stepIndex !== 0 && entry.action === "login") {
        entry = undefined;
      } else {
        continue;
      }
    }

    let resolved_selector: string | null = null;
    let resolution_status: "RESOLVED" | "UNRESOLVED" | "BROKEN" | "PENDING_RUNTIME" = "PENDING_RUNTIME";
    let resolved_from: "strict" | "knowledge" | "ai" | "ai_runtime" | undefined;
    const cacheKey = `${appId}:${key}`;

    // Step A: Check execution cache (same semantic_key in multiple steps)
    const cached = executionSelectorCache.get(cacheKey);
    if (cached) {
      resolved_selector = cached.selector;
      resolution_status = cached.status !== "NOT_FOUND" ? "RESOLVED" : "UNRESOLVED";
      resolved_from = cached.status === "FOUND_IN_DB" ? "knowledge" : cached.status === "FOUND_IN_AI" ? "ai" : undefined;
      if (process.env.NODE_ENV !== "test") {
        console.info("[PreExecution]", {
          semantic_key: key,
          execution_cache_hit: true,
          cache_status: cached.status,
          stepIndex,
        });
      }
    }

    // Step B: Cache miss — DB lookup only. No AI. Unknown → PENDING_RUNTIME (resolved at runtime).
    if (!cached && appId && projectId) {
      const knowledge = await findSelector(projectId, appId, key);
      if (knowledge?.selector) {
        if (inferredAction === "fill" && isBodySelectorForFill(knowledge.selector, "fill")) {
          if (process.env.NODE_ENV !== "test") {
            console.warn("[PreExecution] Ignoring selector knowledge: css:body invalid for fill", {
              stepIndex,
              semantic_key: key,
            });
          }
          // Treat as PENDING_RUNTIME; runtime will resolve with DOM
        } else {
          resolved_selector = knowledge.selector;
          resolution_status = "RESOLVED";
          resolved_from = "knowledge";
          executionSelectorCache.set(cacheKey, { status: "FOUND_IN_DB", selector: knowledge.selector });
          await incrementUsageCount(projectId, appId, key);
        }
      }
      // If not found in DB: leave resolved_selector=null, resolution_status=PENDING_RUNTIME,
      // resolved_from=null. Do NOT write NOT_FOUND to cache — runtime will resolve with AI+DOM.
    }
    const { action, resolved_selector: finalSelector } = resolveNavigateTarget(
      stepText,
      resolved_selector,
      inferredAction
    );
    entry = {
      stepIndex,
      semantic_key: key,
      action,
      resolved_selector: finalSelector,
      resolution_status,
      assertion: entry?.assertion ?? null,
      last_verified_at: resolution_status === "RESOLVED" ? now : null,
      resolved_from,
    };
    stepsByIndex.set(stepIndex, entry);
  }

  let steps = Array.from(stepsByIndex.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, s]) => s);

  // Step 3: Assertion transformation (attach to last step)
  const lastIndex = steps.length - 1;
  if (lastIndex >= 0 && testCase.expectedResult) {
    const lastStep = steps[lastIndex];
    const assertion = mapExpectedResultToAssertion(
      testCase.expectedResult,
      lastStep.resolved_selector
    );
    steps[lastIndex] = { ...lastStep, assertion };
  }

  // Step 3b: Placeholder interpolation ({{alias.field}}) when resolvedData is present
  if (Object.keys(resolvedData).length > 0) {
    steps = steps.map((step, i) => {
      const stepText = effectiveTestSteps[i] ?? "";
      let updated = { ...step };
      try {
        if (step.resolved_selector && step.resolved_selector.includes("{{")) {
          updated = {
            ...updated,
            resolved_selector: interpolatePlaceholders(step.resolved_selector, resolvedData),
          };
        }
        if (step.assertion?.value != null && String(step.assertion.value).includes("{{")) {
          updated = {
            ...updated,
            assertion: step.assertion
              ? {
                  ...step.assertion,
                  value: interpolatePlaceholders(String(step.assertion.value), resolvedData),
                }
              : step.assertion,
          };
        }
        if (step.action === "fill") {
          const match = stepText.match(/\{\{([^}]+)\}\}/);
          if (match) {
            const val = interpolatePlaceholders(match[0], resolvedData);
            updated = {
              ...updated,
              assertion: {
                type: "fill_value",
                selector: step.assertion?.selector ?? null,
                value: val,
              },
            };
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Placeholder resolution failed for step ${i}: ${msg}`);
      }
      return updated;
    });
  }

  const agentExecutionPayload: AgentExecution & { data_snapshot?: Record<string, unknown> } = {
    steps,
    ...(Object.keys(resolvedData).length > 0 && { data_snapshot: resolvedData }),
  };

  // Step 4: Persist
  await prisma.execution.update({
    where: { id: executionId },
    data: { agentExecution: agentExecutionPayload as object },
  });

  return { variables, executionSelectorCache };
}
