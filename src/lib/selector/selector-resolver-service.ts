/**
 * Resolves step description via full pipeline: strict → knowledge → snapshot → AI.
 * Returns stored selector string and resolvedFrom for step metadata.
 */

import type { Page } from "playwright";
import { resolveStep, type ResolvedFrom } from "@/lib/ai/step-resolver";

export interface ResolveWithAIOptions {
  projectId?: string;
  applicationId?: string;
  semanticKey?: string;
  /** When provided, interactive snapshot is built and injected into AI prompt */
  page?: Page;
  /** When true, skip knowledge lookup (caller already checked) to avoid duplicate DB query */
  skipKnowledgeLookup?: boolean;
}

export interface ResolveWithAIResult {
  storedSelector: string;
  resolvedFrom?: ResolvedFrom;
}

export async function resolveWithAI(
  stepDescription: string,
  domSnapshot?: string,
  options?: ResolveWithAIOptions
): Promise<ResolveWithAIResult> {
  const action = inferAction(stepDescription);
  const result = await resolveStep({
    action,
    target: stepDescription,
    pageSummary: domSnapshot,
    projectId: options?.projectId,
    applicationId: options?.applicationId,
    semanticKey: options?.semanticKey,
    page: options?.page,
    skipKnowledgeLookup: options?.skipKnowledgeLookup,
  });
  const storedSelector = formatSelectorForStorage(result);
  return { storedSelector, resolvedFrom: result.resolvedFrom };
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

function formatSelectorForStorage(result: { locatorStrategy: string; selector?: string }): string {
  const sel = (result.selector?.trim() || "body").trim();
  switch (result.locatorStrategy) {
    case "role":
      return `role:${sel}`;
    case "text":
      return `text:${sel}`;
    case "xpath":
      return `xpath:${sel}`;
    default:
      return `css:${sel}`;
  }
}
