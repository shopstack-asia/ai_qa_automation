/**
 * Rule-based mapping from TestCase.expectedResult (text) to executable assertion.
 * No AI. Attach to last step.
 */

import type { AgentExecutionAssertion } from "@/lib/agent-execution-types";

export function mapExpectedResultToAssertion(
  expectedResult: string | null | undefined,
  lastStepResolvedSelector: string | null
): AgentExecutionAssertion | null {
  if (!expectedResult || !expectedResult.trim()) return null;
  const text = expectedResult.trim().toLowerCase();

  if (text.includes("visible") && !text.includes("not visible")) {
    return { type: "element_visible", selector: lastStepResolvedSelector, value: null };
  }
  if (text.includes("not visible")) {
    return { type: "element_not_visible", selector: lastStepResolvedSelector, value: null };
  }
  if (text.includes("redirect")) {
    return { type: "url_contains", selector: null, value: null };
  }
  if (text.includes("status 200")) {
    return { type: "status_code", selector: null, value: 200 };
  }
  if (text.includes("masked")) {
    return { type: "text_masked", selector: lastStepResolvedSelector, value: null };
  }
  if (text.includes("not returned") || text.includes("no result")) {
    return { type: "element_not_exists", selector: lastStepResolvedSelector, value: null };
  }
  if (text.includes("contains")) {
    return { type: "text_contains", selector: lastStepResolvedSelector, value: null };
  }

  return { type: "element_visible", selector: lastStepResolvedSelector, value: null };
}
