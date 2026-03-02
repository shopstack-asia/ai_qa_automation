/**
 * Call N8N webhook by event and log request/response.
 * Uses config: n8n_enabled, n8n_domain, run_test_mode, n8n_webhook_*.
 */

import { getConfig } from "@/lib/config";
import { saveN8nWebhookLog } from "./log-webhook";

export type N8nWebhookEvent = "start_testing" | "test_passed" | "test_failed";

const EVENT_TO_CONFIG_KEY: Record<N8nWebhookEvent, string> = {
  start_testing: "n8n_webhook_start_testing",
  test_passed: "n8n_webhook_test_passed",
  test_failed: "n8n_webhook_test_failed",
};

/**
 * Build full webhook URL from config.
 * When run_test_mode is true uses /webhook-test/ + path, else /webhook/ + path.
 */
export function buildN8nWebhookUrl(
  domain: string,
  runTestMode: boolean,
  pathSegment: string
): string {
  const base = domain.replace(/\/$/, "");
  const segment = runTestMode ? "webhook-test" : "webhook";
  const path = pathSegment.replace(/^\//, "").trim();
  return path ? `${base}/${segment}/${path}` : `${base}/${segment}`;
}

/**
 * Call N8N webhook for the given event with payload, then log request and response.
 * No-op if n8n_enabled is not true, or domain/path not set.
 * Log is always written when a request is attempted (including on fetch failure).
 */
export async function callN8nWebhookAndLog(
  event: N8nWebhookEvent,
  payload: Record<string, unknown>
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const config = await getConfig();
  const enabled = (config.n8n_enabled ?? "").toLowerCase() === "true";
  if (!enabled) {
    return { ok: false, error: "N8N webhooks disabled" };
  }

  const domain = (config.n8n_domain ?? "").trim();
  if (!domain) {
    return { ok: false, error: "N8N domain not set" };
  }

  const configKey = EVENT_TO_CONFIG_KEY[event];
  const pathSegment = (config[configKey as keyof typeof config] ?? "").trim();
  if (!pathSegment) {
    return { ok: false, error: `No webhook path for event: ${event}` };
  }

  const runTestMode = (config.run_test_mode ?? "false").toLowerCase() === "true";
  const url = buildN8nWebhookUrl(domain, runTestMode, pathSegment);

  const requestBody = { ...payload };

  let responseStatus: number | null = null;
  let responseBody: unknown = null;
  let errorMessage: string | null = null;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    responseStatus = res.status;
    const text = await res.text();
    try {
      responseBody = text ? JSON.parse(text) : null;
    } catch {
      responseBody = { _raw: text };
    }

    await saveN8nWebhookLog({
      event,
      url,
      requestBody,
      responseStatus,
      responseBody,
      errorMessage: null,
    });

    return { ok: res.ok, status: res.status };
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    await saveN8nWebhookLog({
      event,
      url,
      requestBody,
      responseStatus: null,
      responseBody: null,
      errorMessage,
    });
    return { ok: false, error: errorMessage };
  }
}
