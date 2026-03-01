"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X, Copy } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetBody,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { CONFIG_KEYS, MASKED_VALUE, SENSITIVE_KEYS } from "@/lib/config/constants";
import { OPENAI_ALL_MODEL_IDS, OPENAI_MODEL_GROUPS } from "@/lib/config/openai-models";
import { PROMPT_TEMPLATE_VARIABLES } from "@/lib/ai/prompt-template-variables";
import { getNextRunFromCron, validateCronExpression } from "@/lib/scheduler/next-run";

/** AWS region codes (common regions; config can store any valid region). */
const AWS_REGIONS = [
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "af-south-1",
  "ap-east-1",
  "ap-south-1",
  "ap-south-2",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-southeast-3",
  "ap-southeast-4",
  "ap-northeast-1",
  "ap-northeast-2",
  "ap-northeast-3",
  "ca-central-1",
  "ca-west-1",
  "eu-central-1",
  "eu-central-2",
  "eu-west-1",
  "eu-west-2",
  "eu-west-3",
  "eu-south-1",
  "eu-south-2",
  "eu-north-1",
  "me-south-1",
  "me-central-1",
  "sa-east-1",
] as const;

/** S3 object ACL for uploads (canned ACL). */
const S3_ACL_OPTIONS = [
  { value: "", label: "— Default (no ACL) —" },
  { value: "private", label: "private" },
  { value: "public-read", label: "public-read" },
  { value: "public-read-write", label: "public-read-write" },
  { value: "authenticated-read", label: "authenticated-read" },
  { value: "bucket-owner-read", label: "bucket-owner-read" },
  { value: "bucket-owner-full-control", label: "bucket-owner-full-control" },
] as const;

const CRON_PRESETS: { id: string; label: string; value: string }[] = [
  { id: "daily-9", label: "Every day at 9:00", value: "0 9 * * *" },
  { id: "daily-0", label: "Every day at midnight", value: "0 0 * * *" },
  { id: "weekdays-9", label: "Weekdays at 9:00 (Mon–Fri)", value: "0 9 * * 1-5" },
  { id: "weekdays-0", label: "Weekdays at midnight", value: "0 0 * * 1-5" },
  { id: "hourly", label: "Every hour", value: "0 * * * *" },
  { id: "every-30min", label: "Every 30 minutes", value: "*/30 * * * *" },
  { id: "every-6h", label: "Every 6 hours", value: "0 */6 * * *" },
  { id: "weekly-sun", label: "Every Sunday at 2:00", value: "0 2 * * 0" },
];

interface ScheduleItem {
  id: string;
  name: string;
  cronExpression: string;
  isActive: boolean;
  nextRunAt: string | null;
  project: { id: string; name: string };
  environments: { id: string; name: string }[];
}

const LABELS: Record<string, string> = {
  max_parallel_execution: "Max parallel execution",
  max_ai_tokens_per_run: "Max AI tokens per run",
  retry_limit: "Retry limit",
  execution_timeout: "Execution timeout (ms)",
  global_rate_limit: "Global rate limit",
  openai_api_key: "OpenAI API key",
  openai_model: "OpenAI model",
  openai_system_prompt: "System prompt for generate test case",
  openai_user_prompt_template: "User prompt template for generate test case",
  ai_testcase_max_retry: "AI test case generation max retry",
  ai_queue_enabled: "AI queue enabled (true/false)",
  scheduler_interval_ms: "Scheduler tick interval (ms)",
  s3_bucket: "S3 bucket",
  s3_region: "S3 region",
  s3_folder: "S3 folder (default prefix for uploads)",
  s3_endpoint: "S3 endpoint (optional)",
  s3_access_key_id: "S3 access key ID",
  s3_secret_access_key: "S3 secret access key",
  s3_public_base_url: "S3 public base URL (optional)",
  s3_acl: "S3 ACL (object access control)",
  google_client_id: "Google OAuth Client ID",
  google_client_secret: "Google OAuth Client Secret",
  google_allowed_domain: "Google Allowed Domain (optional, e.g. company.com)",
  google_allow_manual_login: "Allow manual login (email/password)",
};

const SECTIONS: { title: string; description?: string; keys: readonly string[] }[] = [
  {
    title: "Execution",
    keys: [
      "max_parallel_execution",
      "max_ai_tokens_per_run",
      "retry_limit",
      "execution_timeout",
      "global_rate_limit",
    ],
  },
  {
    title: "OpenAI",
    keys: [
      "openai_api_key",
      "openai_model",
      "openai_system_prompt",
      "openai_user_prompt_template",
    ],
  },
  {
    title: "AI Queue",
    description: "Background AI test case generation. Worker must be running (npm run worker:ai-testcase).",
    keys: ["ai_testcase_max_retry", "ai_queue_enabled"],
  },
  {
    title: "Scheduler",
    description: "BullMQ repeatable tick interval. Run scheduler worker (npm run scheduler). Distributed-safe.",
    keys: ["scheduler_interval_ms"],
  },
  {
    title: "S3 Configuration",
    keys: [
      "s3_bucket",
      "s3_region",
      "s3_folder",
      "s3_acl",
      "s3_endpoint",
      "s3_access_key_id",
      "s3_secret_access_key",
      "s3_public_base_url",
    ],
  },
  {
    title: "Google OAuth",
    description: "Configure Google OAuth for single sign-on. Users logging in via Google will get 'qa' role by default.",
    keys: [
      "google_client_id",
      "google_client_secret",
      "google_allowed_domain",
      "google_allow_manual_login",
    ],
  },
];

interface ProjectOption {
  id: string;
  name: string;
}
interface EnvironmentOption {
  id: string;
  name: string;
}
export default function ConfigPage() {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const [scheduleDrawerOpen, setScheduleDrawerOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [environments, setEnvironments] = useState<EnvironmentOption[]>([]);
  const [scheduleForm, setScheduleForm] = useState({
    name: "",
    projectId: "",
    environmentIds: [] as string[],
    cronExpression: "",
    isActive: true,
    concurrencyLimit: 3,
  });
  const [scheduleSubmitting, setScheduleSubmitting] = useState(false);
  const [scheduleError, setScheduleError] = useState("");
  const [scheduleCronIsCustom, setScheduleCronIsCustom] = useState(false);

  type PlatformItem = { name: string; testTypes: string[] };
  const [platforms, setPlatforms] = useState<PlatformItem[]>([]);
  const [newPlatform, setNewPlatform] = useState("");
  const [platformSaving, setPlatformSaving] = useState(false);
  const TEST_TYPE_OPTIONS = ["API", "E2E"] as const;

  const [apiKeys, setApiKeys] = useState<{ id: string; name: string; key: string; createdAt: string }[]>([]);
  const [apiKeyDrawerOpen, setApiKeyDrawerOpen] = useState(false);
  const [apiKeyForm, setApiKeyForm] = useState({ name: "" });
  const [apiKeySubmitting, setApiKeySubmitting] = useState(false);
  const [apiKeyError, setApiKeyError] = useState("");
  const [createdKeyOnce, setCreatedKeyOnce] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [googleRedirectUriCopied, setGoogleRedirectUriCopied] = useState(false);
  const [googleRedirectUri, setGoogleRedirectUri] = useState("");

  useEffect(() => {
    setGoogleRedirectUri(
      typeof window !== "undefined" ? `${window.location.origin}/api/auth/google/callback` : ""
    );
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/config").then((r) => (r.ok ? r.json() : Promise.reject())),
      fetch("/api/schedules").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/config/platforms").then((r) => (r.ok ? r.json() : { platforms: [] })),
      fetch("/api/config/api-keys").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([cfg, list, plat, keys]) => {
        setConfig(cfg ?? {});
        setSchedules(Array.isArray(list) ? list : []);
        setPlatforms(
          Array.isArray(plat?.platforms)
            ? plat.platforms.map((p: string | { name: string; testTypes?: string[] }) =>
                typeof p === "string"
                  ? { name: p, testTypes: ["API", "E2E"] }
                  : { name: p.name ?? "", testTypes: Array.isArray(p.testTypes) ? p.testTypes : ["API", "E2E"] }
              ).filter((p: PlatformItem) => p.name.trim())
            : []
        );
        setApiKeys(Array.isArray(keys) ? keys : []);
      })
      .catch(() => {
        setConfig({});
        setApiKeys([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (key: string, value: string) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const openScheduleDrawer = () => {
    setScheduleDrawerOpen(true);
    setScheduleError("");
    setScheduleCronIsCustom(false);
    setScheduleForm({
      name: "",
      projectId: "",
      environmentIds: [],
      cronExpression: "",
      isActive: true,
      concurrencyLimit: 3,
    });
    setEnvironments([]);
    fetch("/api/projects")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => setProjects(Array.isArray(list) ? list : []))
      .catch(() => setProjects([]));
  };

  useEffect(() => {
    if (!scheduleForm.projectId) {
      setEnvironments([]);
      setScheduleForm((prev) => ({ ...prev, environmentIds: [] }));
      return;
    }
    fetch(`/api/environments?projectId=${scheduleForm.projectId}`)
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((res) => {
        const list = res?.data ?? res;
        setEnvironments(Array.isArray(list) ? list : []);
        setScheduleForm((prev) => ({ ...prev, environmentIds: [] }));
      });
  }, [scheduleForm.projectId]);

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setScheduleError("");
    if (!scheduleForm.name.trim()) {
      setScheduleError("Name is required");
      return;
    }
    if (!scheduleForm.projectId) {
      setScheduleError("Project is required");
      return;
    }
    if (scheduleForm.environmentIds.length === 0) {
      setScheduleError("Select at least one environment");
      return;
    }
    if (!scheduleForm.cronExpression.trim()) {
      setScheduleError("Cron expression is required");
      return;
    }
    setScheduleSubmitting(true);
    try {
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: scheduleForm.projectId,
          environmentIds: scheduleForm.environmentIds,
          name: scheduleForm.name.trim(),
          cronExpression: scheduleForm.cronExpression.trim(),
          concurrencyLimit: scheduleForm.concurrencyLimit,
          isActive: scheduleForm.isActive,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? (typeof data.error === "object" ? "Failed to create" : data.error) ?? "Failed to create");
      setScheduleDrawerOpen(false);
      const listRes = await fetch("/api/schedules");
      if (listRes.ok) {
        const list = await listRes.json();
        setSchedules(Array.isArray(list) ? list : []);
      }
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : "Failed to create schedule");
    } finally {
      setScheduleSubmitting(false);
    }
  };

  const selectClass =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent";

  const addPlatform = () => {
    const v = newPlatform.trim();
    if (v && !platforms.some((p) => p.name === v)) {
      setPlatforms((prev) => [...prev, { name: v, testTypes: [...TEST_TYPE_OPTIONS] }]);
      setNewPlatform("");
    }
  };

  const removePlatform = (index: number) => {
    setPlatforms((prev) => prev.filter((_, i) => i !== index));
  };

  const setPlatformTestTypes = (index: number, testTypes: string[]) => {
    setPlatforms((prev) =>
      prev.map((p, i) => (i === index ? { ...p, testTypes: testTypes.length ? testTypes : [...TEST_TYPE_OPTIONS] } : p))
    );
  };

  const savePlatforms = async () => {
    setPlatformSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/config/platforms", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platforms }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setMessage({ type: "ok", text: "Platform list saved." });
      toast.success("Save successful");
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to save platform list" });
    } finally {
      setPlatformSaving(false);
    }
  };

  const openApiKeyDrawer = () => {
    setApiKeyDrawerOpen(true);
    setApiKeyError("");
    setCreatedKeyOnce(null);
    setCopySuccess(false);
    setApiKeyForm({ name: "" });
  };

  const createApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiKeyError("");
    if (!apiKeyForm.name.trim()) {
      setApiKeyError("Name is required");
      return;
    }
    setApiKeySubmitting(true);
    try {
      const res = await fetch("/api/config/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: apiKeyForm.name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        const err = data.error?.name?.[0] ?? data.error?.key?.[0] ?? data.error ?? "Failed to create";
        setApiKeyError(typeof err === "string" ? err : "Failed to create");
        return;
      }
      setCreatedKeyOnce(data.createdKey ?? null);
      setApiKeyForm({ name: "" });
      const listRes = await fetch("/api/config/api-keys");
      if (listRes.ok) setApiKeys(await listRes.json());
    } catch {
      setApiKeyError("Network error");
    } finally {
      setApiKeySubmitting(false);
    }
  };

  const deleteApiKey = async (id: string) => {
    try {
      const res = await fetch(`/api/config/api-keys/${id}`, { method: "DELETE" });
      if (!res.ok) return;
      setApiKeys((prev) => prev.filter((k) => k.id !== id));
    } catch {
      // ignore
    }
  };

  const handleSaveSection = async (sectionTitle: string, keys: readonly string[]) => {
    setMessage(null);
    setSavingSection(sectionTitle);
    const payload: Record<string, string> = {};
    for (const key of keys) {
      const value = config[key] ?? "";
      if (value === "" || value === MASKED_VALUE) continue;
      const isSensitive = SENSITIVE_KEYS.includes(key as (typeof SENSITIVE_KEYS)[number]);
      if (isSensitive && value === MASKED_VALUE) continue;
      payload[key] = value;
    }
    try {
      const res = await fetch("/api/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setMessage({
        type: "ok",
        text: data.updated != null ? `${sectionTitle} saved (${data.updated} setting(s)).` : `${sectionTitle} saved.`,
      });
      toast.success("Save successful");
      const getRes = await fetch("/api/config");
      if (getRes.ok) setConfig(await getRes.json());
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to save config",
      });
    } finally {
      setSavingSection(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-muted-foreground">Loading config…</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Config"
        subtitle="System settings and schedule configuration (admin)."
      />

      {message && (
        <p
          className={
            message.type === "ok"
              ? "text-sm font-medium text-success"
              : "text-sm font-medium text-destructive"
          }
        >
          {message.text}
        </p>
      )}

      {SECTIONS.map((section) => (
        <Card key={section.title}>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <CardTitle>{section.title}</CardTitle>
              {section.description && (
                <CardDescription className="mt-1">{section.description}</CardDescription>
              )}
            </div>
            <Button
              type="button"
              size="sm"
              disabled={savingSection !== null}
              onClick={() => handleSaveSection(section.title, section.keys)}
            >
              {savingSection === section.title ? "Saving…" : "Save"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-5">
            {section.keys.map((key) => {
              const isSensitive = SENSITIVE_KEYS.includes(
                key as (typeof SENSITIVE_KEYS)[number]
              );
              const current = config[key] ?? "";
              const isMasked = current === MASKED_VALUE;
              return (
                <div key={key} className="space-y-2">
                  <label
                    htmlFor={key}
                    className="block text-sm font-medium text-muted-foreground"
                  >
                    {LABELS[key] ?? key}
                  </label>
                  {key === "openai_model" ? (
                    <select
                      id={key}
                      value={current || ""}
                      onChange={(e) => handleChange(key, e.target.value)}
                      className="flex h-9 w-full max-w-xl rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="">— Select model —</option>
                      {current && !OPENAI_ALL_MODEL_IDS.includes(current as (typeof OPENAI_ALL_MODEL_IDS)[number]) && (
                        <option value={current}>{current}</option>
                      )}
                      {OPENAI_MODEL_GROUPS.map((grp) => (
                        <optgroup key={grp.label} label={grp.label}>
                          {grp.models.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  ) : key === "s3_region" ? (
                    <select
                      id={key}
                      value={current || ""}
                      onChange={(e) => handleChange(key, e.target.value)}
                      className="flex h-9 w-full max-w-xl rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="">— Select region —</option>
                      {current && !AWS_REGIONS.includes(current as (typeof AWS_REGIONS)[number]) && (
                        <option value={current}>{current}</option>
                      )}
                      {AWS_REGIONS.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  ) : key === "s3_acl" ? (
                    <select
                      id={key}
                      value={current || ""}
                      onChange={(e) => handleChange(key, e.target.value)}
                      className="flex h-9 w-full max-w-xl rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      {S3_ACL_OPTIONS.map((opt) => (
                        <option key={opt.value || "_empty"} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  ) : key === "google_allow_manual_login" ? (
                    <div className="flex items-center gap-2">
                      <Switch
                        id={key}
                        checked={(current || "true").toLowerCase() !== "false"}
                        onCheckedChange={(checked) => handleChange(key, checked ? "true" : "false")}
                      />
                      <span className="text-sm text-muted-foreground">
                        {(current || "true").toLowerCase() !== "false" ? "Enabled" : "Disabled — login page shows Google only"}
                      </span>
                    </div>
                  ) : key === "openai_system_prompt" || key === "openai_user_prompt_template" ? (
                    <div className="space-y-2">
                      <textarea
                        id={key}
                        value={isMasked ? "" : current}
                        onChange={(e) => handleChange(key, e.target.value)}
                        rows={5}
                        placeholder="Enter prompt text…"
                        className="w-full max-w-xl min-h-[6rem] resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                      {key === "openai_user_prompt_template" && (
                        <div className="rounded-md border border-border bg-background px-3 py-2.5 text-sm">
                          <p className="font-medium text-foreground mb-2">Variables (use in template):</p>
                          <ul className="space-y-1.5 text-foreground">
                            {PROMPT_TEMPLATE_VARIABLES.map((v) => (
                              <li key={v.name}>
                                <code className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-foreground">{v.name}</code>
                                <span className="ml-2 text-foreground/90">{v.description}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ) : (
                    <Input
                      id={key}
                      type={isSensitive ? "password" : "text"}
                      value={isMasked ? "" : current}
                      onChange={(e) => handleChange(key, e.target.value)}
                      placeholder={
                        isSensitive && isMasked
                          ? "•••••• (leave blank to keep)"
                          : undefined
                      }
                      className="max-w-xl"
                    />
                  )}
                  {isSensitive && isMasked && (
                    <p className="text-xs text-muted-foreground">
                      Currently set (change to replace)
                    </p>
                  )}
                </div>
              );
            })}
            {section.title === "Google OAuth" && (
              <div className="space-y-2 pt-1">
                <label className="block text-sm font-medium text-muted-foreground">
                  Redirect URI
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    readOnly
                    value={googleRedirectUri}
                    className="max-w-xl font-mono text-sm"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      if (!googleRedirectUri) return;
                      navigator.clipboard.writeText(googleRedirectUri).then(() => {
                        setGoogleRedirectUriCopied(true);
                        setTimeout(() => setGoogleRedirectUriCopied(false), 2000);
                      });
                    }}
                  >
                    <Copy className="h-4 w-4 mr-1.5" />
                    {googleRedirectUriCopied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Add this URL in Google Cloud Console → Credentials → OAuth 2.0 Client ID → Authorized redirect URIs
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Platform list (master)</CardTitle>
            <CardDescription>
              Options shown in test case &quot;Platform&quot; dropdown. Add items then Save.
            </CardDescription>
          </div>
          <Button
            type="button"
            size="sm"
            disabled={platformSaving}
            onClick={savePlatforms}
          >
            {platformSaving ? "Saving…" : "Save"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={newPlatform}
              onChange={(e) => setNewPlatform(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addPlatform())}
              placeholder="New platform name"
              className="max-w-xs"
            />
            <Button type="button" variant="secondary" size="sm" onClick={addPlatform}>
              Add
            </Button>
          </div>
          <ul className="space-y-2">
            {platforms.length === 0 ? (
              <li className="text-sm text-muted-foreground">No platforms. Add one above.</li>
            ) : (
              platforms.map((p, i) => (
                <li key={`${p.name}-${i}`} className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-elevated/30 px-3 py-2 text-sm">
                  <span className="min-w-[120px] text-foreground">{p.name}</span>
                  <span className="text-muted-foreground">Test type:</span>
                  <div className="flex gap-4">
                    {TEST_TYPE_OPTIONS.map((opt) => (
                      <label key={opt} className="flex cursor-pointer items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={p.testTypes.includes(opt)}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...p.testTypes, opt]
                              : p.testTypes.filter((t) => t !== opt);
                            setPlatformTestTypes(i, next.length ? next : [...TEST_TYPE_OPTIONS]);
                          }}
                          className="h-3.5 w-3.5 rounded border-border"
                        />
                        <span>{opt}</span>
                      </label>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ml-auto text-muted-foreground hover:text-destructive"
                    onClick={() => removePlatform(i)}
                  >
                    Remove
                  </Button>
                </li>
              ))
            )}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>API Keys</CardTitle>
            <CardDescription>
              Manage API keys for N8N or other integrations. Each key has a name and secret; use the key as Bearer token when calling this platform. Key is shown only once when created.
            </CardDescription>
          </div>
          <Button size="sm" onClick={openApiKeyDrawer}>
            Add
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {apiKeys.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                    No API keys. Add one for N8N or external integration.
                  </TableCell>
                </TableRow>
              ) : (
                apiKeys.map((k) => (
                  <TableRow key={k.id}>
                    <TableCell className="font-medium">{k.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{k.key}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(k.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => deleteApiKey(k.id)}
                      >
                        Revoke
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Schedules</CardTitle>
            <CardDescription>
              Set up recurring test runs by project and environment.
            </CardDescription>
          </div>
          <Button size="sm" onClick={openScheduleDrawer}>
            Create schedule
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Environments</TableHead>
                <TableHead>Cron</TableHead>
                <TableHead>Next run</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedules.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                    No schedules yet. Create one to run tests on a schedule.
                  </TableCell>
                </TableRow>
              ) : (
                schedules.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-muted-foreground">{s.project?.name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.environments?.length ? s.environments.map((e) => e.name).join(", ") : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{s.cronExpression}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.nextRunAt ? new Date(s.nextRunAt).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell>
                      <span
                        className={
                          s.isActive
                            ? "text-sm text-success"
                            : "text-sm text-muted-foreground"
                        }
                      >
                        {s.isActive ? "Active" : "Inactive"}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Sheet open={apiKeyDrawerOpen} onOpenChange={setApiKeyDrawerOpen}>
        <SheetContent side="right">
          <SheetHeader>
            <div className="flex flex-row items-center justify-between gap-4">
              <div>
                <SheetTitle>Add API key</SheetTitle>
                <SheetDescription>
                  Enter a name. The system will generate an API token after you click Create; copy it then — it is shown only once.
                </SheetDescription>
              </div>
              <div className="flex gap-2 shrink-0">
                {createdKeyOnce ? (
                  <Button type="button" size="sm" onClick={() => { setCreatedKeyOnce(null); setApiKeyDrawerOpen(false); }}>
                    Done
                  </Button>
                ) : (
                  <>
                    <Button type="submit" form="api-key-form" disabled={apiKeySubmitting} size="sm">
                      {apiKeySubmitting ? "Creating…" : "Create"}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </SheetHeader>
          <form id="api-key-form" onSubmit={createApiKey} className="flex flex-col flex-1">
            <SheetBody>
              <div className="space-y-4">
                {createdKeyOnce ? (
                  <>
                    <p className="text-sm font-medium text-success">API token created. Copy it now — it cannot be shown again.</p>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-muted-foreground">API Token</label>
                      <div className="flex gap-2">
                        <Input
                          readOnly
                          value={createdKeyOnce}
                          className="font-mono text-sm"
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            navigator.clipboard.writeText(createdKeyOnce).then(() => {
                              setCopySuccess(true);
                              setTimeout(() => setCopySuccess(false), 2000);
                            });
                          }}
                        >
                          Copy
                        </Button>
                      </div>
                      {copySuccess && (
                        <p className="text-sm font-medium text-success">Copy access token key to clipboard successfully</p>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-muted-foreground">Name</label>
                      <Input
                        value={apiKeyForm.name}
                        onChange={(e) => setApiKeyForm((p) => ({ ...p, name: e.target.value }))}
                        placeholder="e.g. N8N Production"
                        required
                      />
                    </div>
                    {apiKeyError && <p className="text-sm text-destructive">{apiKeyError}</p>}
                  </>
                )}
              </div>
            </SheetBody>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet open={scheduleDrawerOpen} onOpenChange={setScheduleDrawerOpen}>
        <SheetContent side="right">
          <SheetHeader>
            <div className="flex flex-row items-center justify-between gap-4">
              <div>
                <SheetTitle>Create schedule</SheetTitle>
                <SheetDescription>
                  Set up a recurring test run. Select project, one or more environments, and cron. Ready test cases will run automatically.
                </SheetDescription>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button type="submit" form="schedule-form" disabled={scheduleSubmitting} size="sm">
                  {scheduleSubmitting ? "Creating…" : "Create schedule"}
                </Button>
              </div>
            </div>
          </SheetHeader>
          <form id="schedule-form" onSubmit={handleCreateSchedule} className="flex flex-col flex-1">
            <SheetBody>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-muted-foreground">Name</label>
                  <Input
                    value={scheduleForm.name}
                    onChange={(e) => setScheduleForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Nightly run"
                    className="w-full"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-muted-foreground">Project</label>
                  <select
                    value={scheduleForm.projectId}
                    onChange={(e) => setScheduleForm((p) => ({ ...p, projectId: e.target.value }))}
                    className={selectClass}
                  >
                    <option value="">— Select project —</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-muted-foreground">Environments (at least one)</label>
                  {environments.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">
                      {scheduleForm.projectId ? "No environments in this project." : "Select a project first."}
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {scheduleForm.environmentIds.length > 0 &&
                        scheduleForm.environmentIds.map((envId) => {
                          const env = environments.find((e) => e.id === envId);
                          return (
                            <span
                              key={envId}
                              className="inline-flex items-center gap-1 rounded-md bg-elevated px-2 py-0.5 text-xs font-medium"
                            >
                              {env ? env.name : envId}
                              <button
                                type="button"
                                onClick={() =>
                                  setScheduleForm((p) => ({
                                    ...p,
                                    environmentIds: p.environmentIds.filter((x) => x !== envId),
                                  }))
                                }
                                className="rounded hover:bg-background p-0.5"
                                aria-label={`Remove ${env?.name ?? envId}`}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          );
                        })}
                      {environments
                        .filter((e) => !scheduleForm.environmentIds.includes(e.id))
                        .map((e) => (
                          <button
                            key={e.id}
                            type="button"
                            onClick={() =>
                              setScheduleForm((p) => ({ ...p, environmentIds: [...p.environmentIds, e.id] }))
                            }
                            className="rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-elevated"
                          >
                            + {e.name}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-muted-foreground">Schedule</label>
                  <select
                    value={
                      scheduleCronIsCustom ? "custom" : (CRON_PRESETS.find((p) => p.value === scheduleForm.cronExpression)?.id ?? "custom")
                    }
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === "custom") {
                        setScheduleCronIsCustom(true);
                      } else {
                        const preset = CRON_PRESETS.find((p) => p.id === value);
                        if (preset) {
                          setScheduleCronIsCustom(false);
                          setScheduleForm((p) => ({ ...p, cronExpression: preset.value }));
                        }
                      }
                    }}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    <option value="">— Select schedule —</option>
                    {CRON_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                    <option value="custom">Custom expression…</option>
                  </select>
                  {(scheduleCronIsCustom || !CRON_PRESETS.find((p) => p.value === scheduleForm.cronExpression)) && (
                    <div className="space-y-1">
                      <Input
                        value={scheduleForm.cronExpression}
                        onChange={(e) => setScheduleForm((p) => ({ ...p, cronExpression: e.target.value }))}
                        placeholder="e.g. 0 9 * * 1-5 (min hour day month weekday)"
                        className="w-full font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground">
                        Format: minute hour day-of-month month day-of-week. Use * for “every”.
                      </p>
                    </div>
                  )}
                  {scheduleForm.cronExpression.trim() && (
                    <p className="text-xs text-muted-foreground">
                      {validateCronExpression(scheduleForm.cronExpression) ? (
                        <>
                          Next run:{" "}
                          <span className="text-foreground font-medium">
                            {getNextRunFromCron(scheduleForm.cronExpression).toLocaleString()}
                          </span>
                        </>
                      ) : (
                        <span className="text-destructive">Invalid cron expression.</span>
                      )}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-muted-foreground">Concurrency limit</label>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={scheduleForm.concurrencyLimit}
                    onChange={(e) =>
                      setScheduleForm((p) => ({ ...p, concurrencyLimit: parseInt(e.target.value, 10) || 1 }))
                    }
                    className="w-full"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="schedule-active"
                    checked={scheduleForm.isActive}
                    onCheckedChange={(checked) => setScheduleForm((p) => ({ ...p, isActive: checked }))}
                  />
                  <label htmlFor="schedule-active" className="text-sm text-muted-foreground cursor-pointer">
                    {scheduleForm.isActive ? "Active" : "Inactive"}
                  </label>
                </div>
                {scheduleError && <p className="text-sm text-destructive">{scheduleError}</p>}
              </div>
            </SheetBody>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
