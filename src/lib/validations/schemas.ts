/**
 * Zod schemas for API and AI-generated structured plans.
 */

import { z } from "zod";

// ----- Structured test plan (JSONB) -----

export const stepActionSchema = z.enum([
  "navigate",
  "click",
  "fill",
  "select",
  "hover",
  "assert_text",
  "assert_visible",
  "assert_url",
  "wait",
  "api_request",
]);

export const stepSchema = z.object({
  order: z.number().int().min(1),
  action: stepActionSchema,
  target: z.string().optional(), // selector or description for AI resolution
  value: z.string().optional(),
  assertion: z.string().optional(),
});

export const structuredPlanSchema = z.object({
  version: z.literal(1),
  steps: z.array(stepSchema).min(1),
});

export type StructuredPlan = z.infer<typeof structuredPlanSchema>;
export type Step = z.infer<typeof stepSchema>;

// ----- Project -----

export const createProjectSchema = z.object({
  name: z.string().min(1).max(255),
  jiraProjectKey: z.string().max(32).optional(),
  n8nWebhookToken: z.string().optional(),
  defaultExecutionStrategy: z.enum(["sequential", "parallel", "adaptive"]).optional(),
  isActive: z.boolean().optional(),
});

export const updateProjectSchema = createProjectSchema.partial();

// ----- Environment -----

const e2eCredentialSchema = z.object({
  role: z.string().max(255).optional(),
  username: z.string().min(1),
  password: z.string(),
});

export const apiAuthModeEnum = z.enum(["NONE", "BASIC_AUTH", "BEARER_TOKEN"]);
export const e2eAuthModeEnum = z.enum(["ALWAYS_AUTH", "NEVER_AUTH", "CONDITIONAL"]);

export const createEnvironmentSchema = z.object({
  projectId: z.string().cuid(),
  name: z.string().min(1).max(255),
  baseUrl: z.string().url(),
  applicationId: z.string().cuid().optional(),
  platform: z.string().max(255).optional(),
  type: z.enum(["API", "E2E"]).default("E2E"),
  isActive: z.boolean().optional(),
  apiAuthMode: apiAuthModeEnum.optional(),
  e2eAuthMode: e2eAuthModeEnum.optional(),
  // API credentials (BASIC_AUTH: appKey+secretKey; BEARER_TOKEN: apiToken)
  appKey: z.string().optional(),
  secretKey: z.string().optional(),
  apiToken: z.string().optional(),
  // E2E: multiple username/password (e.g. per role)
  credentials: z.array(e2eCredentialSchema).optional(),
});

export const updateEnvironmentSchema = createEnvironmentSchema.omit({ projectId: true }).partial();

// ----- Application -----

export const createApplicationSchema = z.object({
  projectId: z.string().cuid(),
  name: z.string().min(1).max(255),
  code: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  enabled: z.boolean().default(true),
  platform: z.string().max(255).optional(),
  testTypes: z.array(z.enum(["API", "E2E"])).optional(),
});

export const updateApplicationSchema = createApplicationSchema
  .omit({ projectId: true })
  .partial();

// ----- Ticket -----

export const createTicketSchema = z.object({
  projectId: z.string().cuid(),
  title: z.string().min(1).max(500),
  description: z.string().max(10000).optional(),
  acceptanceCriteria: z.string().max(10000).optional(),
  externalId: z.string().max(255).optional(),
  priority: z.string().max(64).optional(),
  applicationIds: z.array(z.string().cuid()).optional(),
  primaryActor: z.string().max(100).optional().nullable(),
});

export const updateTicketSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10000).optional(),
  acceptanceCriteria: z.string().max(10000).optional(),
  status: z.enum(["DRAFT", "READY_TO_TEST", "DONE", "CANCEL"]).optional(),
  externalId: z.string().max(255).optional(),
  priority: z.string().max(64).optional(),
  applicationIds: z.array(z.string().cuid()).optional(),
  primaryActor: z.string().max(100).optional().nullable(),
});

const importTicketItemSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(10000).optional(),
  acceptanceCriteria: z.string().max(10000).optional(),
  externalId: z.string().max(255).optional(),
  priority: z.string().max(64).optional(),
  applicationIds: z.array(z.string().cuid()).optional(),
});

export const importTicketsSchema = z.object({
  projectId: z.string().cuid(),
  tickets: z.array(importTicketItemSchema).min(1).max(500),
});

// ----- Test case -----

/** Regex: alias must start with letter, then alphanumeric or underscore */
const DATA_REQUIREMENT_ALIAS_REGEX = /^[a-zA-Z][a-zA-Z0-9_]*$/;

/** Single data requirement: intent + alias for resolver lookup. No canonical keys. */
export const dataRequirementItemSchema = z.object({
  alias: z.string().min(1).regex(DATA_REQUIREMENT_ALIAS_REGEX, "alias must match ^[a-zA-Z][a-zA-Z0-9_]*$"),
  type: z.string().min(1).refine((s) => s === s.toUpperCase(), "type must be uppercase string"),
  scenario: z.enum(["VALID", "INVALID", "EDGE", "EMPTY"]),
  role: z
    .union([
      z.null(),
      z.string().min(1).refine((s) => s === s.toUpperCase(), "role must be uppercase string"),
    ])
    .optional()
    .nullable(),
});

/** Array of data requirements; aliases must be unique within the test case */
export const dataRequirementSchema = z
  .array(dataRequirementItemSchema)
  .refine(
    (arr) => {
      const aliases = arr.map((x) => x.alias);
      return new Set(aliases).size === aliases.length;
    },
    { message: "alias must be unique within test case" }
  );

export type DataRequirementItem = z.infer<typeof dataRequirementItemSchema>;
export type DataRequirement = z.infer<typeof dataRequirementSchema>;

const testCaseCategoryEnum = z.enum([
  "FUNCTIONAL", "NEGATIVE", "VALIDATION", "SECURITY", "ROLE_BASED", "DATA_MASKING",
  "ACCESS_CONTROL", "ERROR_HANDLING", "EDGE_CASE", "COMPLIANCE",
]);
const testCaseDataConditionEnum = z.enum([
  "RECORD_MUST_EXIST", "RECORD_MUST_NOT_EXIST", "NO_DATA_DEPENDENCY",
  "STATEFUL_DEPENDENCY", "CROSS_ENTITY_DEPENDENCY",
]);

export const createTestCaseSchema = z.object({
  projectId: z.string().cuid(),
  ticketId: z.string().cuid().optional(),
  applicationId: z.string().cuid().optional(),
  title: z.string().min(1).max(500),
  priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).optional(),
  status: z.enum(["DRAFT", "READY", "TESTING", "PASSED", "FAILED", "CANCEL", "IGNORE"]).optional(),
  testType: z.enum(["API", "E2E"]).optional(),
  platform: z.string().max(255).optional(),
  testSteps: z.array(z.string().max(2000)).optional(),
  expectedResult: z.string().max(5000).optional(),
  category: testCaseCategoryEnum.optional(),
  data_condition: testCaseDataConditionEnum.optional(),
  data_requirement: dataRequirementSchema.optional().nullable().default([]),
  setup_hint: z.string().max(2000).nullable().optional(),
  structuredPlan: structuredPlanSchema.optional(),
  source: z.enum(["manual", "import", "n8n", "AI"]).optional(),
  primaryActor: z.string().max(100).nullable().optional(),
});

export const updateTestCaseSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  ticketId: z.string().cuid().nullable().optional(),
  applicationId: z.string().cuid().nullable().optional(),
  priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).optional(),
  status: z.enum(["DRAFT", "READY", "TESTING", "PASSED", "FAILED", "CANCEL", "IGNORE"]).optional(),
  testType: z.enum(["API", "E2E"]).optional(),
  platform: z.string().max(255).optional(),
  testSteps: z.array(z.string().max(2000)).optional(),
  expectedResult: z.string().max(5000).optional(),
  category: testCaseCategoryEnum.optional(),
  data_condition: testCaseDataConditionEnum.optional(),
  data_requirement: dataRequirementSchema.optional().nullable(),
  setup_hint: z.string().max(2000).nullable().optional(),
  structuredPlan: structuredPlanSchema.optional(),
  ignoreReason: z.string().max(2000).nullable().optional(),
  primaryActor: z.string().max(100).nullable().optional(),
});

// ----- Execution (trigger) -----

export const triggerExecutionSchema = z.object({
  projectId: z.string().cuid(),
  environmentId: z.string().cuid(),
  testCaseIds: z.array(z.string().cuid()).min(1),
});

// ----- Schedule -----

export const retryPolicySchema = z.object({
  maxRetries: z.number().int().min(0).max(10),
  backoffMs: z.number().int().min(0),
});

export const createScheduleSchema = z.object({
  projectId: z.string().cuid(),
  environmentIds: z.array(z.string().cuid()).min(1),
  name: z.string().min(1).max(255),
  cronExpression: z.string().min(1),
  testCaseIds: z.array(z.string().cuid()).optional().default([]),
  concurrencyLimit: z.number().int().min(1).max(20).optional(),
  retryPolicy: retryPolicySchema.optional(),
  isActive: z.boolean().optional(),
});

export const updateScheduleSchema = createScheduleSchema.omit({ projectId: true }).partial();

// ----- Data Knowledge -----

export const createDataKnowledgeSchema = z.object({
  projectId: z.string().cuid(),
  key: z.string().min(1).max(500),
  type: z.string().min(1).refine((s) => s === s.toUpperCase(), "type must be uppercase"),
  scenario: z.string().min(1).refine((s) => s === s.toUpperCase(), "scenario must be uppercase"),
  role: z
    .union([
      z.null(),
      z.string().min(1).refine((s) => s === s.toUpperCase(), "role must be uppercase"),
    ])
    .optional()
    .nullable(),
  value: z.union([
    z.string().min(1).refine(
      (s) => {
        try {
          JSON.parse(s);
          return true;
        } catch {
          return false;
        }
      },
      "value must be valid JSON"
    ),
    z.record(z.unknown()),
  ]).transform((v) => (typeof v === "string" ? (JSON.parse(v) as object) : v)),
  verified: z.boolean().optional().nullable(),
  previously_passed: z.boolean().optional().nullable(),
});

export const updateDataKnowledgeSchema = z.object({
  key: z.string().min(1).max(500).optional(),
  type: z.string().min(1).refine((s) => s === s.toUpperCase(), "type must be uppercase").optional(),
  scenario: z.string().min(1).refine((s) => s === s.toUpperCase(), "scenario must be uppercase").optional(),
  role: z
    .union([
      z.null(),
      z.string().min(1).refine((s) => s === s.toUpperCase(), "role must be uppercase"),
    ])
    .optional()
    .nullable(),
  value: z
    .union([
      z.string().min(1).refine(
        (s) => {
          try {
            JSON.parse(s);
            return true;
          } catch {
            return false;
          }
        },
        "value must be valid JSON"
      ),
      z.record(z.unknown()),
    ])
    .transform((v) => (typeof v === "string" ? (JSON.parse(v) as object) : v))
    .optional(),
  verified: z.boolean().optional().nullable(),
  previously_passed: z.boolean().optional().nullable(),
});

// ----- System config -----

export const setSystemConfigSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
  description: z.string().optional(),
});

export const bulkConfigSchema = z.record(z.string(), z.string());

// ----- AI: accept AC (generate plan) -----

export const aiGeneratePlanSchema = z.object({
  acceptanceCriteria: z.string().min(1),
  projectId: z.string().cuid().optional(),
});

// ----- AI: generate test cases from ticket (response shape) -----

export const aiGeneratedTestCaseItemSchema = z.object({
  title: z.string().min(1),
  testSteps: z.array(z.string()).optional(),
  expectedResult: z.string().optional(),
  priority: z
    .enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "critical", "high", "medium", "low"])
    .optional()
    .transform((v) => (v ? (v.toUpperCase() as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW") : undefined)),
  testType: z.enum(["API", "E2E"]).optional(),
  category: testCaseCategoryEnum.optional(),
  data_condition: testCaseDataConditionEnum.optional(),
  data_requirement: dataRequirementSchema.optional(),
  setup_hint: z.string().nullable().optional(),
});

/** Only the shape we produce after normalization (object with testCases array). */
export const aiGeneratedTestCasesResponseSchema = z.object({
  testCases: z.array(aiGeneratedTestCaseItemSchema).min(1),
});

export type AIGeneratedTestCaseItem = z.infer<typeof aiGeneratedTestCaseItemSchema>;

export const aiGenerateTestCaseFromTicketSchema = z.object({
  ticketId: z.string().cuid(),
});
