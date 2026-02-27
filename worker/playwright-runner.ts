/**
 * Playwright execution: run from execution.agent_execution only. No AI.
 * One shared browser per worker process; one context per execution (context closed after each run).
 */

import { chromium, type Browser, type Page, type Locator } from "playwright";
import * as fs from "fs";
import * as path from "path";
import type { AgentExecution, AgentExecutionStep } from "../src/lib/agent-execution-types";
import {
  uploadArtifact,
  executionVideoKey,
  executionScreenshotKey,
} from "../src/lib/storage/s3";
import { isValidUrl } from "../src/lib/url-validation";
import { resolveWithAI } from "../src/lib/selector/selector-resolver-service";
import { upsertSelector } from "../src/lib/selector/selector-knowledge-repository";
import {
  validateSelectorBeforeSave,
  isBodySelectorForFill,
} from "../src/lib/selector/selector-validation";
import {
  validateLocator,
  getFallbackFillSelectorCandidates,
} from "../src/lib/ai/step-resolver";
import type { ExecutionSelectorCache, SelectorCacheEntry } from "../src/core/pre-execution-service";

let browser: Browser | null = null;

/** Launch browser. Default is headless (no window). Set PLAYWRIGHT_HEADLESS=false to show the browser (e.g. local debugging). */
export async function initPlaywrightBrowser(): Promise<void> {
  if (browser !== null) return;
  const headless = process.env.PLAYWRIGHT_HEADLESS !== "false";
  const args = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    // "--disable-gpu",
    // "--disable-software-rasterizer",
    "--disable-extensions",
    "--no-first-run",
    "--disable-background-networking",
    "--disable-default-apps",
    "--disable-sync",
  ];
  browser = await chromium.launch({
    headless,
    args,
    // headless: false,   // 👈 บังคับเปิดจอ
    // slowMo: 200,       // 👈 ทำให้เห็นการทำงานช้า ๆ
    // devtools: true,    // 👈 เปิด DevTools ด้วย
  });
}

/** Close browser. Call on worker shutdown (e.g. SIGTERM). */
export async function closePlaywrightBrowser(): Promise<void> {
  if (browser === null) return;
  await browser.close();
  browser = null;
}

/** Returns a connected browser; re-launches if the current one died (e.g. crash/OOM). */
async function getConnectedBrowser(): Promise<Browser> {
  if (browser !== null && !browser.isConnected()) {
    browser = null;
  }
  if (browser === null) {
    await initPlaywrightBrowser();
  }
  const b = browser;
  if (b === null) throw new Error("Playwright browser not initialized; call initPlaywrightBrowser() before processing jobs.");
  return b;
}

const ROLE_TYPES = [
  "button",
  "link",
  "textbox",
  "checkbox",
  "radio",
  "generic",
  "heading",
  "img",
] as const;

function parseRoleSelector(selector: string): { role: string; name: string | undefined } | null {
  const t = selector.trim();
  // Mangled (e.g. from Playwright stripping "role"): =button[name="Login as Operator"]
  const mangledMatch = t.match(/^=\s*(\w+)\s*\[\s*name\s*=\s*["']([^"']*)["']\s*\]/);
  if (mangledMatch) {
    return { role: mangledMatch[1].toLowerCase(), name: mangledMatch[2].trim() || undefined };
  }
  // Legacy: role=button[name="Login as Operator"]
  const roleNameMatch = t.match(/role\s*=\s*(\w+)\s*\[\s*name\s*=\s*["']([^"']*)["']\s*\]/i);
  if (roleNameMatch) {
    return { role: roleNameMatch[1].toLowerCase(), name: roleNameMatch[2].trim() || undefined };
  }
  // Standard: button,Login as Operator (first comma only)
  const commaIndex = t.indexOf(",");
  const role = (commaIndex === -1 ? t : t.slice(0, commaIndex)).trim();
  const name = commaIndex === -1 ? undefined : t.slice(commaIndex + 1).trim();
  if (!role) return null;
  return { role, name: name || undefined };
}

/**
 * Parse stored selector into a Playwright locator.
 * Role selectors use getByRole() only — never pass "role:..." or "role=..." to page.locator().
 * Empty selector after prefix (e.g. "css:") is guarded to avoid "parsing css selector """ error.
 */
function getLocatorFromStoredSelector(page: Page, stored: string | null): Locator {
  if (!stored?.trim()) return page.locator("body");
  const s = stored.trim();

  if (s.toLowerCase().startsWith("role:")) {
    const selector = s.slice(5).trim();
    const parsed = parseRoleSelector(selector);
    if (parsed && parsed.role) {
      const roleType = parsed.role as (typeof ROLE_TYPES)[number];
      return page.getByRole(roleType, { name: parsed.name });
    }
    if (!selector) return page.locator("body");
  }

  if (/^role\s*=/i.test(s)) {
    const parsed = parseRoleSelector(s);
    if (parsed && parsed.role) {
      const roleType = parsed.role as (typeof ROLE_TYPES)[number];
      return page.getByRole(roleType, { name: parsed.name });
    }
  }

  if (s.toLowerCase().startsWith("text:")) {
    let part = s.slice(5).trim();
    if (!part) return page.locator("body");
    // Stored may be "text:text=Register Customer" — strip redundant "text=" so getByText gets "Register Customer"
    if (part.toLowerCase().startsWith("text=")) part = part.slice(5).trim();
    return page.getByText(part);
  }

  if (s.toLowerCase().startsWith("xpath:")) {
    const part = s.slice(6).trim();
    if (!part) return page.locator("body");
    return page.locator(part);
  }

  if (s.toLowerCase().startsWith("css:")) {
    const part = s.slice(4).trim();
    if (!part) return page.locator("body");
    return page.locator(part);
  }

  if (s.startsWith("=")) {
    const parsed = parseRoleSelector(s);
    if (parsed && parsed.role) {
      const roleType = parsed.role as (typeof ROLE_TYPES)[number];
      return page.getByRole(roleType, { name: parsed.name });
    }
  }

  if (!s) return page.locator("body");
  return page.locator(s);
}

/** Timeout for waiting until the page shows actual content (SPA may render after domcontentloaded). */
const PAGE_CONTENT_TIMEOUT_MS = 25000;

/**
 * Waits until the page has visible content (not just a white body). Required for SPAs
 * where domcontentloaded fires before React/Vue etc. render.
 */
async function waitForPageContent(page: Page, timeoutMs = PAGE_CONTENT_TIMEOUT_MS): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  const body = page.locator("body");
  await body.waitFor({ state: "visible", timeout: 10000 });
  await page.waitForFunction(
    () => {
      const body = document.body;
      if (!body) return false;
      const hasHeight = body.offsetHeight >= 50;
      const hasContent =
        (body.innerText && body.innerText.trim().length > 0) ||
        body.querySelector("input, button, [role='button'], a, [role='link'], [role='textbox'], select, canvas, img");
      return hasHeight && !!hasContent;
    },
    { timeout: timeoutMs }
  );
}

/** Ensures the page has loaded and has visible content before screenshot/video checkpoints. */
async function ensurePageRendered(page: Page): Promise<void> {
  await waitForPageContent(page, PAGE_CONTENT_TIMEOUT_MS);
}

/** Structured error when navigate step receives a selector instead of a URL. */
export class InvalidNavigationTargetError extends Error {
  constructor(public readonly received: string) {
    super(`Invalid navigation target: expected URL but received selector`);
    this.name = "InvalidNavigationTargetError";
  }
}

export interface RunStep {
  order: number;
  action: string;
  target?: string;
  value?: string;
  assertion?: string;
}

export interface StepLogEntry {
  order: number;
  action: string;
  passed: boolean;
  durationMs: number;
  error?: string;
  screenshotUrl?: string;
}

export interface RunOptions {
  baseUrl: string;
  steps: RunStep[];
  credentials?: { username?: string; password?: string; apiToken?: string };
  executionId: string;
  /** Runtime variables from DataOrchestrator for placeholder replacement (e.g. <VALID_CUSTOMER_ID>) */
  variables?: Record<string, string>;
}

/** Options when running from execution.agent_execution only (no AI). */
export interface RunFromAgentExecutionOptions {
  baseUrl: string;
  agentExecution: AgentExecution;
  credentials?: { username?: string; password?: string; apiToken?: string };
  executionId: string;
  variables?: Record<string, string>;
  /** For AI fallback when element not found: projectId + applicationId allow saving new selector to selector_knowledge. */
  projectId?: string;
  applicationId?: string;
  /** Execution-scoped selector cache (success + failure) to avoid repeated DB/AI calls */
  executionSelectorCache?: ExecutionSelectorCache;
}

export interface ExecutionMetadata {
  base_url: string;
  test_data: {
    username?: string;
    password?: string;
    search_keyword?: string;
    [key: string]: string | undefined;
  };
}

export interface RunResult {
  passed: boolean;
  duration: number;
  videoUrl?: string;
  screenshotUrls?: string[];
  stepLog?: StepLogEntry[];
  resultSummary?: string;
  errorMessage?: string;
  executionMetadata?: ExecutionMetadata;
  readableSteps?: string[];
}

/** Replace <PLACEHOLDER> with variables["PLACEHOLDER"]. Unknown placeholders left as-is. */
function replacePlaceholders(
  str: string | undefined,
  variables: Record<string, string>
): string | undefined {
  if (str == null || str === "") return str;
  if (Object.keys(variables).length === 0) return str;
  let out = str;
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `<${key}>`;
    if (out.includes(placeholder)) out = out.split(placeholder).join(value);
  }
  return out;
}

/** Extract label from stored selector for readable step (e.g. "Login as Operator" from role selector). */
function getLabelFromSelector(stored: string | null): string | undefined {
  if (!stored?.trim()) return undefined;
  const s = stored.trim();
  const afterRole = s.startsWith("role:") ? s.slice(5).trim() : s;
  const nameInBrackets = afterRole.match(/\[\s*name\s*=\s*["']([^"']*)["']\s*\]/i);
  if (nameInBrackets) return nameInBrackets[1].trim();
  const comma = afterRole.indexOf(",");
  if (comma > 0) return afterRole.slice(comma + 1).trim().replace(/^name\s*=\s*/i, "") || undefined;
  return undefined;
}

/** Build a short DOM summary for AI (interactive elements + visible text). */
async function getDomSnapshot(page: Page, maxChars = 8000): Promise<string> {
  const summary = await page.evaluate((max) => {
    const parts: string[] = [];
    const interactive = document.querySelectorAll(
      'button, input, select, textarea, a[href], [role="button"], [role="link"], [role="textbox"], [role="combobox"], [role="searchbox"], [onclick]'
    );
    const items = Array.from(interactive).slice(0, 80).map((el) => {
      const tag = (el.getAttribute("role") || (el as HTMLElement).tagName?.toLowerCase() || "?");
      const name =
        (el as HTMLInputElement).name ||
        el.getAttribute("aria-label") ||
        (el as HTMLInputElement).placeholder ||
        (el.textContent || "").trim().slice(0, 60);
      const type = (el as HTMLInputElement).type ? ` type=${(el as HTMLInputElement).type}` : "";
      return `${tag}${name ? ` name="${name}"` : ""}${type}`;
    });
    if (items.length) parts.push("Interactive elements:\n" + items.join("\n"));
    const bodyText = document.body?.innerText?.trim().slice(0, max - (parts.join("").length + 200)) ?? "";
    if (bodyText) parts.push("\nPage text (excerpt):\n" + bodyText);
    return parts.join("\n");
  }, maxChars);
  return summary;
}

/** Convert semantic_key to a short step description for AI (e.g. "click_register_customer" -> "Click Register Customer"). */
function semanticKeyToDescription(semanticKey: string): string {
  return semanticKey
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim() || semanticKey;
}

/** True if the error is likely "element not found" / timeout so AI fallback may help. */
function isSelectorRelatedError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("timeout") ||
    m.includes("not found") ||
    m.includes("strict mode") ||
    m.includes("locator") ||
    m.includes("waiting for selector") ||
    m.includes("no element")
  );
}

/** Actions that use a single element selector and can be retried with an AI-suggested selector. */
const SELECTOR_FALLBACK_ACTIONS = new Set([
  "click",
  "fill",
  "select",
  "hover",
  "assert_visible",
  "assert_text",
]);

/**
 * Run Playwright from execution.agent_execution only. Optional AI fallback when element not found.
 */
export async function runPlaywrightExecutionFromAgentExecution(
  options: RunFromAgentExecutionOptions
): Promise<RunResult> {
  const {
    baseUrl,
    agentExecution,
    credentials,
    executionId,
    variables = {},
    projectId,
    applicationId,
    executionSelectorCache = new Map() as ExecutionSelectorCache,
  } = options;
  const stepLog: StepLogEntry[] = [];
  const screenshotUrls: string[] = [];
  const readableSteps: string[] = [];
  const startTime = Date.now();
  let passed = true;
  let lastError: string | undefined;

  const executionMetadata: ExecutionMetadata = {
    base_url: baseUrl,
    test_data: {
      username: credentials?.username,
      password: credentials?.password ? "****" : undefined,
      ...(Object.keys(variables).length ? variables : {}),
    },
  };

  const videoDir = path.join(process.cwd(), "test-results", "videos", executionId);
  try {
    fs.mkdirSync(videoDir, { recursive: true });
  } catch {
    // ignore
  }

  const b = await getConnectedBrowser();
  const context = await b.newContext({
    baseURL: baseUrl,
    deviceScaleFactor: 1,
    recordVideo: { dir: videoDir, size: { width: 1280, height: 720 } },
    viewport: { width: 1280, height: 720 },
  });

  let skipReadablePush = false; // set true during AI-fallback retry to avoid duplicate step lines
  async function logStep(description: string, action: () => Promise<void>): Promise<void> {
    if (!skipReadablePush) readableSteps.push(description);
    await action();
  }

  try {
    if (credentials?.username && credentials?.password) {
      await context.setHTTPCredentials({
        username: credentials.username,
        password: credentials.password,
      });
    }

    const page = await context.newPage();
    page.on("crash", () => {
      throw new Error("Browser page crashed during execution");
    });
    if (credentials?.apiToken) {
      await page.addInitScript((token: string) => {
        (window as unknown as { __apiToken?: string }).__apiToken = token;
      }, credentials.apiToken);
    }

    const steps = [...agentExecution.steps].sort((a, b) => a.stepIndex - b.stepIndex);

    for (const step of steps) {
      const stepStart = Date.now();
      let stepPassed = true;
      let stepError: string | undefined;
      let selector = step.resolved_selector;
      let loc = getLocatorFromStoredSelector(page, selector);
      let label = getLabelFromSelector(selector);
      // Use TC step text (from semantic_key) when selector has no label, so readable steps match the test case
      const stepDescription = semanticKeyToDescription(step.semantic_key ?? "");

      // Deterministic validation and fill fallback before execution
      let clickValidationFailed = false;
      if (selector && (step.action === "fill" || step.action === "click")) {
        const valid = await validateLocator(loc, step.action, {
          storedSelector: step.action === "click" ? selector : undefined,
        });
        if (!valid && step.action === "fill") {
          const candidates = getFallbackFillSelectorCandidates(
            step.semantic_key ?? selector
          );
          for (const candidate of candidates) {
            const fallbackLoc = getLocatorFromStoredSelector(page, candidate);
            if (await validateLocator(fallbackLoc, "fill")) {
              selector = candidate;
              loc = fallbackLoc;
              label = getLabelFromSelector(selector);
              break;
            }
          }
        }
        if (!valid && step.action === "click") {
          clickValidationFailed = true;
          stepPassed = false;
          stepError =
            "Exact accessible name mismatch; selector did not match visible button text.";
        }
      }

      const target = selector ?? "(none)";
      const validatedAs =
        step.action === "navigate" && selector
          ? isValidUrl(replacePlaceholders(selector, variables) ?? "")
            ? "url"
            : "selector"
          : "selector";
      const stepLogPayload = {
        step_index: step.stepIndex,
        step_type: step.action,
        target: target.length > 80 ? target.slice(0, 80) + "…" : target,
        validated_as: validatedAs,
      };
      if (process.env.NODE_ENV !== "test") {
        console.info("[PlaywrightRunner] step", JSON.stringify(stepLogPayload));
      }

      const doStep = async () => {
        switch (step.action) {
          case "login": {
            if (credentials?.username && credentials?.password) {
              await logStep(`Open browser at URL ${baseUrl}`, async () => {
                await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
                await page.waitForLoadState("domcontentloaded");
                await waitForPageContent(page, PAGE_CONTENT_TIMEOUT_MS);
                await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
              });
              const loginFormSelector = [
                'input[name="username"]', 'input[name="email"]', 'input[type="email"]',
                'input[name="password"]', 'input[type="password"]',
                'button[type="submit"]', 'button:has-text("Log in")', 'button:has-text("Login")', 'button:has-text("Sign in")',
              ].join(", ");
              await page.locator(loginFormSelector).first().waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
              await logStep(`Enter username: ${credentials.username}`, async () => {
                const tryFill = async (loc: ReturnType<typeof page.locator>) => {
                  const el = loc.first();
                  await el.waitFor({ state: "visible", timeout: 8000 });
                  await el.clear();
                  await el.fill(credentials.username, { timeout: 10000 });
                };
                const byLabel = await page.getByLabel(/username|email|e-?mail/i).first().count().then((c) => c > 0);
                if (byLabel) {
                  await tryFill(page.getByLabel(/username|email|e-?mail/i));
                  return;
                }
                const usernameSelectors = ['input[name="username"]', 'input[name="email"]', 'input[type="email"]', '#username', '#email', 'input[autocomplete="username"]', 'input[autocomplete="email"]', 'input[placeholder*="mail" i]', 'input[placeholder*="user" i]'];
                for (const sel of usernameSelectors) {
                  const loc = page.locator(sel);
                  if ((await loc.count()) > 0) {
                    await tryFill(loc);
                    break;
                  }
                }
              });
              await logStep("Enter password: ****", async () => {
                const tryFill = async (loc: ReturnType<typeof page.locator>) => {
                  const el = loc.first();
                  await el.waitFor({ state: "visible", timeout: 8000 });
                  const tagName = await el.evaluate((e) => e.tagName);
                  if (tagName !== "INPUT" && tagName !== "TEXTAREA") {
                    throw new Error(
                      "Password locator did not resolve to INPUT or TEXTAREA element (got <" + tagName + ">)."
                    );
                  }
                  await el.clear();
                  await el.fill(credentials.password, { timeout: 10000 });
                };
                // Prefer input[type="password"] — do NOT use getByLabel(/password/i); it can resolve to "Show password" button
                const passwordLoc = page.locator('input[type="password"]');
                if ((await passwordLoc.count()) > 0) {
                  await tryFill(passwordLoc);
                  return;
                }
                const passwordSelectors = ['input[name="password"]', '#password', 'input[placeholder*="password" i]'];
                for (const sel of passwordSelectors) {
                  const loc = page.locator(sel);
                  if ((await loc.count()) > 0) {
                    await tryFill(loc);
                    break;
                  }
                }
              });
              await logStep(label ? `Click '${label}'` : "Click submit to login", async () => {
                const submitSelectors = ['button[type="submit"]', 'input[type="submit"]', 'button:has-text("Sign In")', 'button:has-text("Log in")', 'button:has-text("Login")', 'button:has-text("Sign in")', '[type="submit"]'];
                for (const sel of submitSelectors) {
                  const btn = page.locator(sel);
                  if ((await btn.count()) > 0) {
                    await btn.first().click({ timeout: 10000 });
                    break;
                  }
                }
              });
              await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
            }
            break;
          }
          case "navigate": {
            const url = replacePlaceholders(selector, variables) ?? baseUrl;
            if (!isValidUrl(url)) {
              throw new InvalidNavigationTargetError(selector ?? url);
            }
            await logStep(`Open browser at URL ${url}`, async () => {
              await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
              await page.waitForLoadState("domcontentloaded");
              await waitForPageContent(page, PAGE_CONTENT_TIMEOUT_MS);
              await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
            });
            break;
          }
          case "click":
            await logStep(
              label ? `Click '${label}'` : stepDescription ? `Click '${stepDescription}'` : `Click element (step ${step.stepIndex + 1})`,
              async () => {
                await loc.click({ timeout: 10000 });
              }
            );
            break;
          case "fill": {
            const val = String(replacePlaceholders(String(step.assertion?.value ?? ""), variables) || "");
            const displayVal = step.semantic_key?.includes("password") ? "****" : val;
            await logStep(
              label ? `Enter ${displayVal} in '${label}'` : stepDescription ? `Enter ${displayVal} in '${stepDescription}'` : `Enter ${displayVal}`,
              async () => {
              await loc.waitFor({ state: "visible", timeout: 10000 });
              await loc.clear();
              await loc.fill(val, { timeout: 10000 });
            });
            break;
          }
          case "select": {
            const val = step.assertion?.value ?? "";
            await logStep(
              label ? `Select '${val}' in '${label}'` : stepDescription ? `Select '${val}' in '${stepDescription}'` : `Select ${val}`,
              async () => {
                await loc.selectOption(String(val), { timeout: 10000 });
              }
            );
            break;
          }
          case "hover":
            await logStep(
              label ? `Hover over '${label}'` : stepDescription ? `Hover over '${stepDescription}'` : "Hover over element",
              async () => {
                await loc.hover({ timeout: 10000 });
              }
            );
            break;
          case "assert_visible":
            await logStep(
              label ? `Wait for '${label}' to be visible` : stepDescription ? `Wait for '${stepDescription}' to be visible` : "Wait for element visible",
              async () => {
                await loc.waitFor({ state: "visible", timeout: 10000 });
              }
            );
            break;
          case "assert_text": {
            await loc.waitFor({ state: "visible", timeout: 10000 });
            const expected = step.assertion?.value != null ? String(step.assertion.value) : "";
            if (expected) {
              const text = await loc.textContent({ timeout: 5000 });
              if (!text?.includes(expected)) {
                stepPassed = false;
                stepError = `Expected text containing "${expected}", got: ${text?.slice(0, 100)}`;
              }
            }
            if (stepPassed) readableSteps.push(`Verify text contains "${expected}"`);
            break;
          }
          case "assert_url": {
            const expected = step.assertion?.value != null ? String(step.assertion.value) : "";
            const url = page.url();
            if (expected && !url.includes(expected)) {
              stepPassed = false;
              stepError = `Expected URL containing "${expected}", got: ${url}`;
            }
            if (stepPassed) readableSteps.push(`Verify URL contains "${expected}"`);
            break;
          }
          case "wait": {
            await logStep("Wait for page to settle", async () => {
              await new Promise((r) => setTimeout(r, 1000));
            });
            break;
          }
          case "upload":
            throw new Error("Upload action not yet implemented in Playwright runner");
          default: {
            const allowed: string[] = [
              "navigate",
              "click",
              "fill",
              "select",
              "assert_visible",
              "assert_text",
              "assert_url",
              "wait",
              "hover",
              "login",
              "upload",
            ];
            throw new Error(
              `Unsupported step action: "${step.action}". Allowed: ${allowed.join(", ")}`
            );
          }
        }

        if (stepPassed && step.assertion) {
          const ass = step.assertion;
          const assLoc = getLocatorFromStoredSelector(page, ass.selector);
          switch (ass.type) {
            case "element_visible":
              await assLoc.waitFor({ state: "visible", timeout: 10000 });
              break;
            case "element_not_visible":
              await assLoc.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
              break;
            case "element_not_exists":
              await assLoc.waitFor({ state: "hidden", timeout: 3000 }).catch(() => {});
              break;
            case "url_contains":
              if (ass.value != null && !page.url().includes(String(ass.value))) {
                stepPassed = false;
                stepError = `Expected URL containing "${ass.value}", got: ${page.url()}`;
              }
              break;
            case "text_contains":
              if (ass.value != null) {
                const text = await assLoc.textContent({ timeout: 5000 });
                if (!text?.includes(String(ass.value))) {
                  stepPassed = false;
                  stepError = `Expected text containing "${ass.value}", got: ${text?.slice(0, 100)}`;
                }
              }
              break;
            case "status_code":
              break;
            case "text_masked":
            default:
              break;
          }
        }

        if (stepPassed) {
          await ensurePageRendered(page);
          await page.waitForLoadState("load", { timeout: 15000 }).catch(() => {});
          await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
          await page
            .waitForFunction(
              () => {
                const body = document.body;
                if (!body) return false;
                const hasHeight = body.offsetHeight >= 100;
                const hasContent =
                  (body.innerText && body.innerText.trim().length > 0) ||
                  body.querySelector("input, button, [role='button'], a, [role='link'], canvas, img");
                return hasHeight && hasContent;
              },
              { timeout: 10000 }
            )
            .catch(() => {});
          await new Promise((r) => setTimeout(r, 1200));
          const buf = await page.screenshot({ type: "png" });
          const key = executionScreenshotKey(executionId, step.stepIndex);
          const { url } = await uploadArtifact(key, buf, "image/png");
          screenshotUrls.push(url);
        }
      };
      try {
        if (!clickValidationFailed) {
          await doStep();
          // PART 6: Auto-save to knowledge when resolved by AI and validation passed
          if (
            step.resolved_from === "ai" &&
            projectId &&
            applicationId &&
            selector?.trim()
          ) {
            if (step.action === "fill" && isBodySelectorForFill(selector, "fill")) {
              if (process.env.NODE_ENV !== "test") {
                console.warn("[PlaywrightRunner] Skipping save: css:body invalid for fill", {
                  stepIndex: step.stepIndex,
                  semanticKey: step.semantic_key,
                });
              }
            } else {
              try {
                validateSelectorBeforeSave(step.action, selector);
                await upsertSelector({
                  projectId,
                  applicationId,
                  semanticKey: step.semantic_key,
                  selector,
                  confidenceScore: 1,
                });
              } catch (err) {
                if (process.env.NODE_ENV !== "test") {
                  console.warn("[PlaywrightRunner] Skipping save: selector validation failed", err);
                }
              }
            }
          }
        }
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        if (
          projectId &&
          applicationId &&
          SELECTOR_FALLBACK_ACTIONS.has(step.action) &&
          isSelectorRelatedError(errMsg)
        ) {
          try {
            const cacheKey = `${applicationId}:${step.semantic_key ?? ""}`;
            const cached = executionSelectorCache.get(cacheKey);
            let newSelector: string | null = null;
            let cache_status: SelectorCacheEntry["status"] = "NOT_FOUND";

            if (cached) {
              if (cached.status === "NOT_FOUND") {
                if (process.env.NODE_ENV !== "test") {
                  console.info("[PlaywrightRunner]", {
                    semantic_key: step.semantic_key,
                    execution_cache_hit: true,
                    selector_knowledge_checked: false,
                    ai_called: false,
                    cache_status: "NOT_FOUND",
                    stepIndex: step.stepIndex,
                  });
                }
                throw new Error("Selector resolution previously failed (cached NOT_FOUND)");
              }
              newSelector = cached.selector;
              cache_status = cached.status;
              if (process.env.NODE_ENV !== "test") {
                console.info("[PlaywrightRunner]", {
                  semantic_key: step.semantic_key,
                  execution_cache_hit: true,
                  selector_knowledge_checked: false,
                  ai_called: false,
                  cache_status,
                  stepIndex: step.stepIndex,
                });
              }
            }

            if (!newSelector) {
              const domSnapshot = await getDomSnapshot(page);
              const stepDesc = semanticKeyToDescription(step.semantic_key ?? "");
              try {
                const result = await resolveWithAI(stepDesc, domSnapshot, {
                page,
                projectId,
                applicationId,
                semanticKey: step.semantic_key,
                skipKnowledgeLookup: true,
              });
                newSelector = result.storedSelector ?? null;
                if (newSelector) {
                  cache_status = "FOUND_IN_AI";
                  executionSelectorCache.set(cacheKey, { status: "FOUND_IN_AI", selector: newSelector });
                } else {
                  cache_status = "NOT_FOUND";
                  executionSelectorCache.set(cacheKey, { status: "NOT_FOUND", selector: null });
                }
              } catch (aiErr) {
                cache_status = "NOT_FOUND";
                executionSelectorCache.set(cacheKey, { status: "NOT_FOUND", selector: null });
                if (process.env.NODE_ENV !== "test") {
                  console.info("[PlaywrightRunner]", {
                    semantic_key: step.semantic_key,
                    execution_cache_hit: false,
                    selector_knowledge_checked: false,
                    ai_called: true,
                    cache_status: "NOT_FOUND",
                    stepIndex: step.stepIndex,
                  });
                }
                throw aiErr;
              }
              if (process.env.NODE_ENV !== "test") {
                console.info("[PlaywrightRunner]", {
                  semantic_key: step.semantic_key,
                  execution_cache_hit: false,
                  selector_knowledge_checked: false,
                  ai_called: true,
                  cache_status,
                  stepIndex: step.stepIndex,
                });
              }
            }

            if (!newSelector?.trim()) throw new Error("AI returned empty selector");
            selector = newSelector;
            loc = getLocatorFromStoredSelector(page, selector);
            label = getLabelFromSelector(selector);
            skipReadablePush = true;
            await doStep();
            skipReadablePush = false;
            if (step.action === "fill" && isBodySelectorForFill(newSelector, "fill")) {
              if (process.env.NODE_ENV !== "test") {
                console.warn("[PlaywrightRunner] Skipping fallback save: css:body invalid for fill");
              }
            } else {
              try {
                validateSelectorBeforeSave(step.action, newSelector);
                await upsertSelector({
                  projectId,
                  applicationId,
                  semanticKey: step.semantic_key,
                  selector: newSelector,
                });
              } catch (err) {
                if (process.env.NODE_ENV !== "test") {
                  console.warn("[PlaywrightRunner] Skipping fallback save: validation failed", err);
                }
              }
            }
            stepPassed = true;
            stepError = undefined;
            if (process.env.NODE_ENV !== "test") {
              console.info("[PlaywrightRunner] fallback selector saved", {
                stepIndex: step.stepIndex,
                semanticKey: step.semantic_key,
                selector: newSelector,
              });
            }
          } catch (_) {
            stepPassed = false;
            stepError = errMsg;
            lastError = stepError;
          }
        } else {
          stepPassed = false;
          stepError = errMsg;
          lastError = stepError;
        }
      }

      passed = passed && stepPassed;
      stepLog.push({
        order: step.stepIndex,
        action: step.action,
        passed: stepPassed,
        durationMs: Date.now() - stepStart,
        error: stepError,
        screenshotUrl: stepLog.length < screenshotUrls.length ? screenshotUrls[screenshotUrls.length - 1] : undefined,
      });
    }

  } finally {
    await context.close();
    await new Promise(r => setTimeout(r, 2000));
  }

  const duration = Date.now() - startTime;
  let videoUrl: string | undefined;
  const videoPath = await findVideoFile(videoDir);
  if (videoPath) {
    const buf = fs.readFileSync(videoPath);
    const key = executionVideoKey(executionId);
    const { url } = await uploadArtifact(key, buf, "video/webm");
    videoUrl = url;
    try {
      fs.rmSync(videoDir, { recursive: true });
    } catch {
      // ignore
    }
  }

  return {
    passed,
    duration,
    videoUrl,
    screenshotUrls: screenshotUrls.length ? screenshotUrls : undefined,
    stepLog,
    resultSummary: `${stepLog.filter((s) => s.passed).length}/${stepLog.length} steps passed`,
    errorMessage: lastError,
    executionMetadata,
    readableSteps: readableSteps.length ? readableSteps : undefined,
  };
}

async function findVideoFile(dir: string): Promise<string | null> {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const file = entries.find((e) => e.isFile() && e.name.endsWith(".webm"));
    return file ? path.join(dir, file.name) : null;
  } catch {
    return null;
  }
}
