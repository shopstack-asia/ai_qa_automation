/**
 * Selector validation before saving to selector_knowledge.
 * Rejects invalid selectors to avoid polluting knowledge base.
 */

/**
 * Valid fill selectors must target input, textarea, or contenteditable.
 * CSS selectors that match body are never valid for fill.
 */
const FILL_ALLOWED_PATTERNS = [
  /\binput\b/i,
  /\btextarea\b/i,
  /contenteditable/i,
  /\btextbox\b/i,
  /\[type\s*=\s*["']?(?:text|email|password|number|search)["']?\]/i,
];

/**
 * Click selectors should target button, link, or clickable elements.
 * Minimal validation - allow role=button, role=link, button, a, etc.
 */
const CLICK_ALLOWED_PATTERNS = [
  /^role:/i,
  /role\s*=\s*["']?(?:button|link|menuitem|checkbox|radio)["']?/i,
  /^button/i,
  /^a\b/i,
  /\[role\s*=\s*["']?(?:button|link)["']?\]/i,
  /\[type\s*=\s*["']?(?:submit|button)["']?\]/i,
];

/**
 * Safeguard: css:body is never valid for fill actions.
 */
export function isBodySelectorForFill(storedSelector: string | null, action: string): boolean {
  if (!storedSelector?.trim() || (action ?? "").toLowerCase() !== "fill") return false;
  const s = storedSelector.trim().toLowerCase();
  return s === "css:body" || s === "body" || s.endsWith(" body") || s === "css: body";
}

/**
 * Validate selector before saving to selector_knowledge.
 * Throws if invalid. Does not throw for valid selectors.
 *
 * Rules:
 * - fill: must match input, textarea, [contenteditable="true"], or role=textbox
 * - click: must be clickable (role=button, role=link, button, etc.)
 * - css:body for fill: always reject
 */
export function validateSelectorBeforeSave(action: string, storedSelector: string): void {
  const actionLower = (action ?? "click").toLowerCase();
  const sel = (storedSelector ?? "").trim();
  if (!sel) throw new Error("Selector cannot be empty");

  if (actionLower === "fill") {
    if (isBodySelectorForFill(sel, "fill")) {
      throw new Error("Selector 'css:body' is invalid for fill actions");
    }
    // Reject submit/button inputs (not editable)
    if (/\binput\b.*\[type\s*=\s*["']?(?:submit|button|image)["']?\]/i.test(sel)) {
      throw new Error("Fill selector cannot target submit/button inputs");
    }
    const normalized = sel.replace(/^(css|role|text|xpath):/i, "");
    const matchesFill = FILL_ALLOWED_PATTERNS.some((p) => p.test(normalized));
    if (!matchesFill) {
      throw new Error(
        `Fill selector must target input, textarea, or [contenteditable="true"]. Got: ${sel.slice(0, 80)}`
      );
    }
    return;
  }

  if (actionLower === "click") {
    const extractCss = (s: string): string => {
      if (s.toLowerCase().startsWith("role:")) return s;
      if (s.toLowerCase().startsWith("text:")) return "text";
      if (s.toLowerCase().startsWith("css:")) return s.slice(4).trim();
      return s;
    };
    const part = extractCss(sel);
    const matchesClick = CLICK_ALLOWED_PATTERNS.some((p) => p.test(part));
    if (!matchesClick) {
      throw new Error(
        `Click selector must target button, link, or clickable element. Got: ${sel.slice(0, 80)}`
      );
    }
    return;
  }

  // Other actions (select, hover, assert_visible, assert_text, etc.) - allow
}
