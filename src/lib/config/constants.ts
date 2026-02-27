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
  "openai_api_key",
  "openai_model",
  "openai_system_prompt",
  "openai_user_prompt_template",
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
] as const;

export const SENSITIVE_KEYS = [
  "openai_api_key",
  "s3_access_key_id",
  "s3_secret_access_key",
  "google_client_secret",
] as const;

export const MASKED_VALUE = "••••••";

/** Default values when not set in DB or env (for display and runtime). */
export const CONFIG_DEFAULTS: Partial<Record<(typeof CONFIG_KEYS)[number], string>> = {
  max_parallel_execution: "5",
  max_ai_tokens_per_run: "8000",
  retry_limit: "3",
  execution_timeout: "300000",
  global_rate_limit: "60",
  openai_model: OPENAI_DEFAULT_MODEL,
  ai_testcase_max_retry: "3",
  ai_queue_enabled: "true",
  scheduler_interval_ms: "60000",
};
