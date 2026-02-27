/**
 * Deterministic semantic key builder for selector knowledge.
 * MUST be used for both selector knowledge insertion and lookup.
 * No duplicated logic elsewhere.
 */

/**
 * Build a deterministic semantic key from action and target.
 * Rules:
 * - Lowercase target
 * - Remove {{variables}}
 * - Remove parentheses (...)
 * - Remove special characters
 * - Trim spaces
 *
 * Intent Mapping Priority:
 * - action="fill" and target includes "search" → "search_input"
 * - action="click" and target exactly equals "login" → "login_button"
 * - action="click" and target includes "register" → "register_button"
 * - action="assert_text" → "assert_container"
 * - Fallback → `${action}_${normalized_target_with_underscores}`
 */
export function buildSemanticKey(action: string, target: string): string {
  const t = (target ?? "").trim();
  const normalized = normalizeTarget(t);
  const actionLower = (action ?? "click").toLowerCase().trim();

  // Intent mapping (exact order matters)
  if (actionLower === "fill" && normalized.includes("search")) {
    return "search_input";
  }
  if (actionLower === "click" && (normalized === "login" || normalized === "click login")) {
    return "login_button";
  }
  if (actionLower === "click" && normalized.includes("register")) {
    return "register_button";
  }
  if (actionLower === "assert_text") {
    return "assert_container";
  }

  // Fallback: action_normalized_target
  const safeAction = actionLower.replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") || "click";
  const safeTarget = normalized.replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") || "target";
  return `${safeAction}_${safeTarget}`;
}

function normalizeTarget(target: string): string {
  return target
    .toLowerCase()
    .replace(/\{\{[^}]*\}\}/g, "") // remove {{variables}}
    .replace(/\([^)]*\)/g, "") // remove parentheses (...)
    .replace(/[^a-z0-9\s]/g, " ") // remove special characters
    .replace(/\s+/g, " ")
    .trim();
}
