/**
 * AI-assisted element resolution: given step + page context, resolve selector/locator.
 * Full pipeline: strict selector → knowledge lookup → interactive snapshot → AI → return.
 * Includes action-aware SYSTEM_PROMPT, deterministic validation, and fill fallback.
 */

import type { Locator, Page } from "playwright";
import OpenAI from "openai";
import { getConfig } from "@/lib/config";
import { OPENAI_DEFAULT_MODEL } from "@/lib/config/openai-models";
import { saveOpenAILog } from "@/lib/ai/openai-log";
import { findSelector } from "@/lib/selector/selector-knowledge-repository";
import { isBodySelectorForFill } from "@/lib/selector/selector-validation";

export interface ResolveStepInput {
  action: string;
  target?: string;
  value?: string;
  assertion?: string;
  pageSummary?: string; // optional HTML outline or accessibility tree snippet
  /** For knowledge lookup and auto-save */
  projectId?: string;
  applicationId?: string;
  semanticKey?: string;
  /** When present, build interactive snapshot and inject into AI prompt */
  page?: Page;
  /** When true, skip knowledge lookup (caller already checked) to avoid duplicate DB query */
  skipKnowledgeLookup?: boolean;
}

export type ResolvedFrom = "strict" | "knowledge" | "ai";

export interface ResolveStepOutput {
  selector?: string;   // CSS or role-based selector for Playwright
  locatorStrategy: "css" | "role" | "text" | "xpath";
  resolvedValue?: string;
  /** How this selector was resolved (for worker auto-save when "ai") */
  resolvedFrom?: ResolvedFrom;
}

const SYSTEM_PROMPT = `You resolve test step targets into Playwright-friendly selectors.

You MUST respect the action type when selecting elements.

Rules:

For action = "fill":
- The element MUST be editable.
- Allowed elements:
  - input
  - textarea
  - contenteditable=true
- NEVER return:
  - button
  - link
  - div/span without contenteditable
- If multiple matches exist, prioritize:
  1) input[type="password" | "text" | "email" | "number"]
  2) role="textbox"
  3) input with matching label/name
- If a candidate is not editable, reject it.

For action = "click":
- The element MUST be clickable.
- Allowed roles:
  - button
  - link
  - menuitem
  - checkbox
  - radio
- Prefer role-based selectors with accessible name.
- When using role-based selectors with name, the name MUST exactly match the visible accessible name.
- Do NOT extend, shorten, or infer additional words.
- Do NOT use partial semantic similarity.
- If the target says "Login", do NOT select "Login as Operator".
- Prefer exact accessible name match.
- If multiple elements match, choose the one with exact text equality.

For action = "assert_text":
- Return selector for container element.
- Put expected text into "resolvedValue".

For action = "navigate":
- The element may be a clickable container (div, card, panel).
- Do NOT restrict to role=button only.
- Text-based or CSS-based selector is allowed.

Avoid ambiguous matches.
If multiple elements match, choose the most interactive and specific one.

Respond ONLY in JSON:
{
  "selector": "string",
  "locatorStrategy": "css" | "role" | "text" | "xpath",
  "resolvedValue": "optional"
}

When Interactive Snapshot is provided:
- You MUST select elements ONLY from the snapshot list.
- You MUST NOT hallucinate elements. Do NOT guess elements not listed.
- If no valid match exists in the snapshot: return {"selector": null, "locatorStrategy": "css", "noMatch": true}.
- Prefer exact visible text equality. Do NOT extend or shorten names.
- If target says "Login", do NOT select "Login as Operator".
- If no exact match exists, choose closest exact equality from the snapshot only.`;

/** Max interactive elements in snapshot to limit token usage */
const MAX_SNAPSHOT_ELEMENTS = 80;

export interface InteractiveSnapshotElement {
  tag: string;
  type?: string;
  role?: string;
  name?: string;
  id?: string;
  placeholder?: string;
  "aria-label"?: string;
  visible_text: string;
}

/**
 * Build a structured snapshot of visible interactive elements for AI.
 * Only: input, textarea, button, a, select, role attribute, contenteditable=true.
 * Excludes: hidden, disabled, non-visible.
 */
export async function buildInteractiveSnapshot(page: Page): Promise<InteractiveSnapshotElement[]> {
  const elements = await page.evaluate((maxElements: number) => {
    const INTERACTIVE_SELECTORS = [
      "input:not([type=hidden])",
      "textarea",
      "button",
      "a[href]",
      "select",
      "[role]",
      "[contenteditable='true']",
    ];
    const selector = INTERACTIVE_SELECTORS.join(", ");

    function isVisible(el: Element): boolean {
      const html = el as HTMLElement;
      if (html.hasAttribute("disabled")) return false;
      if (html.getAttribute("aria-hidden") === "true") return false;
      if (html.offsetParent === null && html.tagName !== "BODY") return false;
      const style = window.getComputedStyle(html);
      if (style.visibility === "hidden" || style.display === "none") return false;
      if (style.opacity === "0") return false;
      const rect = html.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      return true;
    }

    function getVisibleText(el: Element): string {
      const html = el as HTMLElement;
      const ariaLabel = html.getAttribute("aria-label")?.trim();
      if (ariaLabel) return ariaLabel;
      const text = (html.innerText ?? html.textContent ?? "").trim().slice(0, 200);
      if (text) return text;
      const placeholder = (html as HTMLInputElement).placeholder?.trim();
      return placeholder ?? "";
    }

    const result: Array<Record<string, string | undefined>> = [];
    const seen = new Set<string>();

    try {
      const nodes = document.querySelectorAll(selector);
      for (const el of Array.from(nodes)) {
        if (result.length >= maxElements) break;
        if (!isVisible(el)) continue;

        const html = el as HTMLElement;
        const tag = html.tagName.toLowerCase();
        const type = (html as HTMLInputElement).type?.toLowerCase();
        const role = html.getAttribute("role")?.trim();
        const name = (html as HTMLInputElement).name?.trim();
        const id = html.id?.trim();
        const placeholder = (html as HTMLInputElement).placeholder?.trim();
        const ariaLabel = html.getAttribute("aria-label")?.trim();
        const visibleText = getVisibleText(el);

        const key = `${tag}:${type || ""}:${role || ""}:${name || ""}:${id || ""}:${visibleText.slice(0, 50)}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const obj: Record<string, string | undefined> = {
          tag,
          visible_text: visibleText || "",
        };
        if (type) obj.type = type;
        if (role) obj.role = role;
        if (name) obj.name = name;
        if (id) obj.id = id;
        if (placeholder) obj.placeholder = placeholder;
        if (ariaLabel) obj["aria-label"] = ariaLabel;

        result.push(obj);
      }
    } catch {
      // ignore
    }
    return result;
  }, MAX_SNAPSHOT_ELEMENTS);

  return elements as InteractiveSnapshotElement[];
}

/** Format snapshot as JSON string for prompt */
function formatSnapshotForPrompt(elements: InteractiveSnapshotElement[]): string {
  return JSON.stringify(elements, null, 2);
}

/**
 * Validate that AI-returned selector matches at least one element in the snapshot.
 * For role:button,Name we need an element with matching role/tag and name/visible_text.
 */
function isSelectorInSnapshot(
  selector: string,
  strategy: string,
  snapshot: InteractiveSnapshotElement[]
): boolean {
  const sel = (selector ?? "").trim();
  if (!sel) return false;

  if (strategy === "role") {
    const comma = sel.indexOf(",");
    const roleOrTag = (comma >= 0 ? sel.slice(0, comma).trim() : sel).toLowerCase();
    const namePart = comma >= 0 ? sel.slice(comma + 1).trim().toLowerCase() : "";
    for (const el of snapshot) {
      const elRole = (el.role ?? el.tag ?? "").toLowerCase();
      const elName = (
        el.visible_text ||
        el["aria-label"] ||
        el.name ||
        el.placeholder ||
        ""
      ).trim().toLowerCase();
      if (elRole === roleOrTag && (!namePart || elName.includes(namePart) || namePart.includes(elName)))
        return true;
    }
  }

  if (strategy === "text") {
    const searchText = sel.toLowerCase();
    for (const el of snapshot) {
      const vt = (el.visible_text || "").toLowerCase();
      if (vt.includes(searchText) || searchText.includes(vt)) return true;
    }
  }

  if (strategy === "css" || strategy === "xpath") {
    for (const el of snapshot) {
      if (el.id && sel.includes(el.id)) return true;
      if (el.name && sel.includes(`name="${el.name}"`)) return true;
      if (el.tag && sel.includes(el.tag)) return true;
    }
  }
  return false;
}

const STRICT_SELECTOR_PREFIXES = ["role:=", "role:", "css:", "xpath:", "text:"] as const;

function parseStrictSelector(target: string): Omit<ResolveStepOutput, "resolvedFrom"> | null {
  const t = target?.trim() ?? "";
  const lower = t.toLowerCase();

  for (const prefix of STRICT_SELECTOR_PREFIXES) {
    if (lower.startsWith(prefix)) {
      // Map legacy "role:=" to role strategy.
      const strategy = (prefix.startsWith("role") ? "role" : prefix.replace(":", "")) as
        | "role"
        | "css"
        | "xpath"
        | "text";

      let selector = t.slice(prefix.length).trim();

      // Legacy form: "role:=button[name=\"X\"]" becomes "button[name=\"X\"]".
      // Normalize to a consistent parseable role selector string.
      if (strategy === "role") {
        // If selector starts with "=", strip it.
        if (selector.startsWith("=")) selector = selector.slice(1).trim();
        // If selector starts with a bare role (e.g. "button[...]"), normalizeRoleSelector can handle it.
        // If selector starts with "role=...", normalizeRoleSelector can also handle it.
      }

      return { locatorStrategy: strategy, selector: selector || t };
    }
  }
  return null;
}

/** Normalize role selector so we never produce "role:role=button[...]". Store as "button,Name". */
function normalizeRoleSelector(selector: string): string {
  let s = (selector ?? "").trim();

  // Strip any legacy leading markers.
  s = s.replace(/^role:=?\s*/i, "");
  if (s.startsWith("=")) s = s.slice(1).trim();

  // Support either "role=button[name='X']" or "button[name='X']".
  const roleNameMatch = s.match(/(?:^role\s*=\s*)?(\w+)\s*\[\s*name\s*=\s*["']([^"']*)["']\s*\]/i);
  if (roleNameMatch) {
    const role = roleNameMatch[1];
    const name = roleNameMatch[2];
    return `${role},${name}`;
  }

  // If already in compact form "button,Name", keep it.
  return s;
}

export async function resolveStep(input: ResolveStepInput): Promise<ResolveStepOutput> {
  const config = await getConfig();
  const apiKey = config.openai_api_key || process.env.OPENAI_API_KEY;

  // 1) Strict selector → return immediately
  const strict = parseStrictSelector(input.target ?? "");
  if (strict) {
    const selector =
      strict.locatorStrategy === "role"
        ? normalizeRoleSelector(strict.selector ?? "")
        : strict.selector;
    return { ...strict, selector: selector || strict.selector, resolvedFrom: "strict" as const };
  }

  // 2) Selector Knowledge lookup → skip AI if found (unless fill + css:body) or caller already checked
  if (!input.skipKnowledgeLookup && input.projectId && input.applicationId && input.semanticKey) {
    const knowledge = await findSelector(
      input.projectId,
      input.applicationId,
      input.semanticKey
    );
    if (knowledge?.selector) {
      if (input.action === "fill" && isBodySelectorForFill(knowledge.selector, "fill")) {
        // Safeguard: do not use css:body for fill actions
        if (process.env.NODE_ENV !== "test") {
          console.warn("[StepResolver] Ignoring selector knowledge: css:body invalid for fill", {
            semanticKey: input.semanticKey,
          });
        }
      } else {
        const parsed = parseStrictSelector(knowledge.selector);
        const out = parsed ?? { locatorStrategy: "css" as const, selector: knowledge.selector };
        if (out.locatorStrategy === "role" && typeof out.selector === "string") {
          out.selector = normalizeRoleSelector(out.selector);
        }
        return { ...out, resolvedFrom: "knowledge" as const };
      }
    }
  }

  if (!apiKey) return { locatorStrategy: "css", selector: input.target };

  // 3) Build interactive snapshot ONLY when page exists (AI fallback with real DOM)
  let snapshot: InteractiveSnapshotElement[] = [];
  let snapshotCaptured = false;

  if (input.page) {
    snapshot = await buildInteractiveSnapshot(input.page);
    snapshotCaptured = snapshot.length > 0;
    if (snapshot.length === 0) {
      if (process.env.NODE_ENV !== "test") {
        console.info("[StepResolver]", {
          snapshot_captured: true,
          snapshot_element_count: 0,
          ai_called: false,
          selector_validated_against_snapshot: false,
        });
      }
      throw new Error("No interactive elements found on page.");
    }
  }

  // 4) Call AI
  let userParts: string[] = [
    `Action: ${input.action}`,
    input.target && `Target: ${input.target}`,
    input.value && `Value: ${input.value}`,
    input.assertion && `Assertion: ${input.assertion}`,
    input.pageSummary && `Page context: ${input.pageSummary}`,
  ].filter(Boolean) as string[];

  if (snapshot.length > 0) {
    userParts.push("Interactive Snapshot:");
    userParts.push(formatSnapshotForPrompt(snapshot));
  }

  const userContent = userParts.join("\n");

  const openai = new OpenAI({ apiKey });
  const model = config.openai_model || process.env.OPENAI_MODEL || OPENAI_DEFAULT_MODEL;

  const requestMessages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    { role: "user" as const, content: userContent },
  ];
  const completion = await openai.chat.completions.create({
    model,
    messages: requestMessages,
    max_tokens: 512,
    temperature: 0,
  });

  await saveOpenAILog({
    source: "step-resolver",
    request: { model, messages: requestMessages, max_tokens: 512, temperature: 0 },
    response: JSON.parse(JSON.stringify(completion)),
  });

  if (process.env.NODE_ENV !== "test") {
    console.info("[StepResolver]", {
      snapshot_captured: snapshotCaptured,
      snapshot_element_count: snapshot.length,
      ai_called: true,
      selector_validated_against_snapshot: snapshot.length > 0,
    });
  }

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) return { locatorStrategy: "css", selector: input.target };

  try {
    const cleaned = raw.replace(/^```json\s*|\s*```$/g, "").trim();
    const parsed = JSON.parse(cleaned);

    if (parsed.noMatch === true) {
      throw new Error("AI found no valid match in interactive snapshot.");
    }

    const strategy = ["css", "role", "text", "xpath"].includes(parsed.locatorStrategy)
      ? parsed.locatorStrategy
      : "css";
    let selector = parsed.selector ?? input.target;
    if (strategy === "role" && typeof selector === "string") {
      selector = normalizeRoleSelector(selector);
    }

    // 5) Validate selector against snapshot when snapshot was provided
    if (snapshot.length > 0 && selector) {
      const validated = isSelectorInSnapshot(selector, strategy, snapshot);
      if (!validated) {
        if (process.env.NODE_ENV !== "test") {
          console.info("[StepResolver]", {
            snapshot_captured: snapshotCaptured,
            snapshot_element_count: snapshot.length,
            ai_called: true,
            selector_validated_against_snapshot: false,
          });
        }
        throw new Error(
          "AI returned selector not present in interactive snapshot. Rejecting result."
        );
      }
    }

    return {
      selector,
      locatorStrategy: strategy,
      resolvedValue: parsed.resolvedValue,
      resolvedFrom: "ai" as const,
    };
  } catch (err) {
    if (err instanceof Error && err.message.includes("AI")) throw err;
    return { locatorStrategy: "css", selector: input.target };
  }
}

/**
 * Extract expected accessible name from a role-based stored selector for exact-match validation.
 * Supports "role:button,Login" and "role:role=button[name=\"Login\"]".
 */
export function extractExpectedNameFromRoleSelector(storedSelector: string | null): string | null {
  const s = (storedSelector ?? "").trim();
  const lower = s.toLowerCase();
  if (!lower.startsWith("role:")) return null;

  // Support both "role:=..." and "role:...".
  let after = s.slice(5).trim();
  if (after.startsWith("=")) after = after.slice(1).trim();

  // Case 1: role=button[name="X"] OR button[name="X"]
  const roleNameMatch = after.match(/(?:^role\s*=\s*)?(\w+)\s*\[\s*name\s*=\s*["']([^"']*)["']\s*\]/i);
  if (roleNameMatch) return roleNameMatch[2].trim();

  // Case 2: compact form "button,Name"
  const comma = after.indexOf(",");
  if (comma !== -1) return after.slice(comma + 1).trim();

  return null;
}

export interface ValidateLocatorOptions {
  /** Stored selector (e.g. "role:button,Login") for click: exact accessible name check */
  storedSelector?: string | null;
}

/**
 * Deterministic validation: ensure the resolved locator is valid for the given action
 * before execution. Call from the worker when a page is available.
 * For click + role selector, enforces exact visible text match (no "Login" → "Login as Operator").
 */
export async function validateLocator(
  locator: Locator,
  action: string,
  options?: ValidateLocatorOptions
): Promise<boolean> {
  const count = await locator.count();
  if (count === 0) return false;

  const element = locator.first();

  if (action === "fill") {
    const isEditable = await element.evaluate((el) => {
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return true;
      if ((el as HTMLElement).isContentEditable === true) return true;
      return false;
    });
    return isEditable;
  }

  // click or navigate: require element exists, visible, enabled (clickable)
  if (action === "click" || action === "navigate") {
    const ok = await element.evaluate((el) => {
      if (el.hasAttribute("disabled")) return false;
      const html = el as HTMLElement;
      const style = window.getComputedStyle(html);
      if (style.visibility === "hidden" || style.display === "none") return false;
      return true;
    });
    if (!ok) return false;

    // Exact accessible name match ONLY for role-based selectors (role:button,Name).
    // For css/text/xpath (e.g. clickable div/card/panel), do NOT enforce name — allow div/panel/h3.
    if (action === "click") {
      const isRoleSelector =
        options?.storedSelector?.trim().toLowerCase().startsWith("role:") ?? false;
      if (isRoleSelector) {
        const expectedName = extractExpectedNameFromRoleSelector(options.storedSelector!);
        if (expectedName != null && expectedName !== "") {
          const actualText = await element.innerText().then((t) => (t ?? "").trim());
          if (actualText.trim().toLowerCase() !== expectedName.trim().toLowerCase()) {
            return false;
          }
        }
      }
    }
    // navigate: no accessible name equality; any clickable visible element is valid
    return true;
  }

  return true;
}

/**
 * Ordered list of stored selector strings to try when AI resolved a fill action
 * to a non-editable element (e.g. "Show password" button). Use in worker:
 * try each candidate with getLocatorFromStoredSelector + validateLocator until one passes.
 */
export function getFallbackFillSelectorCandidates(targetHint: string): string[] {
  const hint = (targetHint ?? "").toLowerCase();
  if (hint.includes("password")) {
    return [
      "css:input[type=password]",
      "css:input[type=text]",
      "role:textbox,",
    ];
  }
  return [
    "css:input[type=text]",
    "css:input[type=email]",
    "role:textbox,",
  ];
}
