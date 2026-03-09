import { OPENAI_DEFAULT_MODEL } from "./openai-models";

/**
 * Config key names and mask value. Client-safe (no Prisma).
 */
export const CONFIG_KEYS = [
  "max_parallel_execution",
  "max_ai_tokens_per_run",
  "retry_limit",
  "execution_timeout",
  "global_rate_limit",
  "run_test_mode",
  "openai_api_key",
  "openai_model",
  "openai_system_prompt",
  "openai_user_prompt_template",
  "openai_user_prompt_template_scenario_planner",
  "ai_testcase_max_retry",
  "ai_queue_enabled",
  "scheduler_interval_ms",
  "s3_bucket",
  "s3_region",
  "s3_folder",
  "s3_endpoint",
  "s3_access_key_id",
  "s3_secret_access_key",
  "s3_public_base_url",
  "s3_acl",
  "google_client_id",
  "google_client_secret",
  "google_allowed_domain",
  "google_allow_manual_login",
  "n8n_enabled",
  "n8n_domain",
  "n8n_webhook_start_testing",
  "n8n_webhook_test_passed",
  "n8n_webhook_test_failed",
  "slack_enabled",
  "slack_bot_token",
  "slack_event_new_ticket",
  "slack_event_generate_test_cases",
  "slack_event_testing",
  "slack_event_test_passed",
  "slack_event_test_failed",
] as const;

export const SENSITIVE_KEYS = [
  "openai_api_key",
  "s3_access_key_id",
  "s3_secret_access_key",
  "google_client_secret",
  "slack_bot_token",
] as const;

export const MASKED_VALUE = "••••••";

/** Default values when not set in DB or env (for display and runtime). */
export const CONFIG_DEFAULTS: Partial<Record<(typeof CONFIG_KEYS)[number], string>> = {
  max_parallel_execution: "5",
  max_ai_tokens_per_run: "8000",
  retry_limit: "3",
  execution_timeout: "300000",
  global_rate_limit: "60",
  run_test_mode: "true",
  openai_model: OPENAI_DEFAULT_MODEL,
  ai_testcase_max_retry: "3",
  ai_queue_enabled: "true",
  scheduler_interval_ms: "60000",
  google_allow_manual_login: "true",
  n8n_enabled: "false",
  slack_enabled: "false",
  slack_event_new_ticket: "false",
  slack_event_generate_test_cases: "false",
  slack_event_testing: "false",
  slack_event_test_passed: "false",
  slack_event_test_failed: "false",
};

/** Slack notification events: config key → display label. Channel is set per project (Slack Channel ID). */
export const SLACK_EVENT_KEYS = [
  { key: "slack_event_new_ticket", label: "New ticket" },
  { key: "slack_event_generate_test_cases", label: "Generate test cases" },
  { key: "slack_event_testing", label: "Testing" },
  { key: "slack_event_test_passed", label: "Test passed" },
  { key: "slack_event_test_failed", label: "Test failed" },
] as const;

/** N8N webhook events: config key → display label. URL = domain + /webhook/ + path (or /webhook-test/ + path when run_test_mode is true). Test Failed = Business Failed. */
export const N8N_WEBHOOK_EVENT_KEYS = [
  { key: "n8n_webhook_start_testing", label: "Start Testing" },
  { key: "n8n_webhook_test_passed", label: "Test Passed" },
  { key: "n8n_webhook_test_failed", label: "Test Failed (Business Failed)" },
] as const;
