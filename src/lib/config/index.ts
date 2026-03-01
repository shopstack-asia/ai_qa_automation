/**
 * Central system config: DB (SystemConfig) overrides env.
 * Used by AI layer and S3 storage. Sensitive keys are never logged.
 */

import { prisma } from "@/lib/db/client";
import { CONFIG_KEYS, SENSITIVE_KEYS, MASKED_VALUE, CONFIG_DEFAULTS } from "./constants";

export { CONFIG_KEYS, SENSITIVE_KEYS, MASKED_VALUE, CONFIG_DEFAULTS };

const ENV_MAP: Record<string, string> = {
  max_parallel_execution: "",
  max_ai_tokens_per_run: "",
  retry_limit: "",
  execution_timeout: "",
  global_rate_limit: "",
  openai_api_key: "OPENAI_API_KEY",
  openai_model: "OPENAI_MODEL",
  s3_bucket: "S3_BUCKET",
  s3_region: "S3_REGION",
  s3_folder: "S3_FOLDER",
  s3_endpoint: "S3_ENDPOINT",
  s3_access_key_id: "S3_ACCESS_KEY_ID",
  s3_secret_access_key: "S3_SECRET_ACCESS_KEY",
  s3_public_base_url: "S3_PUBLIC_BASE_URL",
  s3_acl: "S3_ACL",
  google_client_id: "GOOGLE_CLIENT_ID",
  google_client_secret: "GOOGLE_CLIENT_SECRET",
  google_allowed_domain: "GOOGLE_ALLOWED_DOMAIN",
};

export type ConfigMap = Partial<Record<(typeof CONFIG_KEYS)[number], string>>;

let cache: ConfigMap | null = null;
let cacheTs = 0;
const CACHE_MS = 30_000;

export type GetConfigOptions = { skipCache?: boolean };

export async function getConfig(options?: GetConfigOptions): Promise<ConfigMap> {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return { ...CONFIG_DEFAULTS } as ConfigMap;
  }
  const now = Date.now();
  if (!options?.skipCache && cache && now - cacheTs < CACHE_MS) {
    return cache;
  }

  const rows = await prisma.systemConfig.findMany({
    where: { key: { in: [...CONFIG_KEYS] } },
  });

  const fromDb: Record<string, string> = {};
  for (const r of rows) {
    fromDb[r.key] = r.value;
  }

  const out: ConfigMap = {};
  for (const key of CONFIG_KEYS) {
    const envKey = ENV_MAP[key];
    const envVal = envKey ? (process.env[envKey] ?? "") : "";
    const dbVal = fromDb[key] ?? "";
    const defaultVal = CONFIG_DEFAULTS[key as keyof typeof CONFIG_DEFAULTS] ?? "";
    out[key as keyof ConfigMap] = dbVal || envVal || defaultVal;
  }

  if (!options?.skipCache) {
    cache = out;
    cacheTs = now;
  }
  return out;
}

export function clearConfigCache(): void {
  cache = null;
  cacheTs = 0;
}

/** For API GET: return config with sensitive values masked when set; empty keys use CONFIG_DEFAULTS */
export async function getConfigForDisplay(): Promise<Record<string, string>> {
  const raw = await getConfig();
  const out: Record<string, string> = {};
  for (const key of CONFIG_KEYS) {
    const val = raw[key as keyof ConfigMap] ?? "";
    const v = val || (CONFIG_DEFAULTS[key as keyof typeof CONFIG_DEFAULTS] ?? "");
    out[key] = SENSITIVE_KEYS.includes(key as (typeof SENSITIVE_KEYS)[number]) && v ? MASKED_VALUE : v;
  }
  return out;
}
