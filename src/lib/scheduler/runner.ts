/**
 * Scheduler: two separate responsibilities.
 *
 * Schedule A — Run Creator: creates test_run + executions (env per TC by testType + application), runs PreExecution, then done.
 * Schedule B — Run Orchestrator: processes active RUNNING runs (dispatch QUEUED → Bull, completion). No run creation.
 */

import cronParser from "cron-parser";
import { prisma } from "@/lib/db/client";
import { enqueueExecution } from "@/lib/queue/execution-queue";
import { decrypt } from "@/lib/encryption";
import { runPreExecution } from "@/core/pre-execution-service";
import type { ApplicationConfig } from "@/core/data-orchestrator";
import type { AgentExecution } from "@/lib/agent-execution-types";

export async function getScheduleConfig(key: string): Promise<number | null> {
  const row = await prisma.systemConfig.findUnique({
    where: { key },
  });
  if (!row) return null;
  const n = parseInt(row.value, 10);
  return Number.isNaN(n) ? null : n;
}

// -----------------------------------------------------------------------------
// Schedule A — Run Creator (no Bull, only DB). Environment per TC by testType + applicationId. PreExecution after create.
// -----------------------------------------------------------------------------

/** Pick an environment from the list that matches TC's testType and applicationId. */
function findEnvironmentForTestCase(
  tc: { testType: string | null; applicationId: string | null },
  environments: { id: string; type: string; applicationId: string | null }[]
): { id: string; type: string; applicationId: string | null } | null {
  const wantType = tc.testType ?? "E2E";
  const wantApp = tc.applicationId ?? null;
  const match = environments.find(
    (e) =>
      e.type === wantType &&
      (wantApp ? e.applicationId === wantApp : true)
  );
  return match ?? null;
}

function buildApplicationConfig(): ApplicationConfig {
  return {
    domain: { entities: {}, defaultEntity: undefined },
  };
}

/** E2E credential entry in credentialsEnc JSON. */
type E2ECredentialEntry = { role?: string; username: string; password: string };

/**
 * Resolve E2E credentials from env: use credentialsEnc (pick by role or first), fallback to legacy usernameEnc/passwordEnc.
 */
function resolveE2ECredentials(
  env: {
    credentialsEnc: string | null;
    usernameEnc: string | null;
    passwordEnc: string | null;
    apiTokenEnc: string | null;
  },
  role?: string | null
): { username?: string; password?: string; apiToken?: string } {
  let username: string | undefined;
  let password: string | undefined;
  if (env.credentialsEnc) {
    try {
      const list = JSON.parse(decrypt(env.credentialsEnc)) as E2ECredentialEntry[];
      if (Array.isArray(list) && list.length > 0) {
        // ไม่ระบุ role → ใช้แถวแรก; ระบุ role → หาให้ตรงหรือ fallback แถวแรก
        const chosen = role
          ? list.find((c) => (c.role ?? "").trim().toLowerCase() === (role ?? "").trim().toLowerCase()) ?? list[0]
          : list[0];
        username = chosen.username || undefined;
        password = chosen.password || undefined;
      }
    } catch {
      /* ignore */
    }
  }
  if (username === undefined && env.usernameEnc) username = decrypt(env.usernameEnc);
  if (password === undefined && env.passwordEnc) password = decrypt(env.passwordEnc);
  const apiToken = env.apiTokenEnc ? decrypt(env.apiTokenEnc) : undefined;
  return { username, password, apiToken };
}

/**
 * Run Creator: for each due schedule, create test_run + executions (one env per TC by testType + application).
 * Then run PreExecution for each new execution. Does NOT push to Bull. Updates schedule nextRunAt.
 */
export async function runRunCreator(): Promise<void> {
  const now = new Date();
  const due = await prisma.schedule.findMany({
    where: {
      isActive: true,
      nextRunAt: { lte: now },
    },
    include: {
      project: true,
    },
  });

  for (const schedule of due) {
    try {
      const projectId = schedule.projectId;

      // 1. If RUNNING run exists → do nothing (only update nextRunAt)
      const activeRun = await prisma.testRun.findFirst({
        where: {
          projectId,
          status: "RUNNING",
          completedAt: null,
        },
        orderBy: { startedAt: "desc" },
      });

      if (activeRun) {
        await updateScheduleNextRun(schedule.id, now);
        continue;
      }

      // 2. Find tickets READY_TO_TEST and TCs ready (with testType, applicationId for env matching)
      const readyTickets = await prisma.ticket.findMany({
        where: { projectId, status: "READY_TO_TEST" },
        select: { id: true },
      });
      const ticketIds = readyTickets.map((t) => t.id);
      if (ticketIds.length === 0) {
        await updateScheduleNextRun(schedule.id, now);
        continue;
      }

      const testCases = await prisma.testCase.findMany({
        where: {
          projectId,
          status: "READY",
          ticketId: { in: ticketIds },
        },
        select: {
          id: true,
          testSteps: true,
          testType: true,
          applicationId: true,
        },
      });

      const withSteps = testCases.filter(
        (tc) => Array.isArray(tc.testSteps) && tc.testSteps.length > 0
      );
      if (withSteps.length === 0) {
        await updateScheduleNextRun(schedule.id, now);
        continue;
      }

      // 3. Load environments for this schedule (to pick per TC by testType + applicationId)
      const envIds = schedule.environmentIds ?? [];
      if (envIds.length === 0) {
        await updateScheduleNextRun(schedule.id, now);
        continue;
      }
      const scheduleEnvs = await prisma.environment.findMany({
        where: { id: { in: envIds }, projectId },
        select: { id: true, type: true, applicationId: true },
      });
      if (scheduleEnvs.length === 0) {
        await updateScheduleNextRun(schedule.id, now);
        continue;
      }

      // Re-check no RUNNING run (avoid race)
      const again = await prisma.testRun.findFirst({
        where: { projectId, status: "RUNNING", completedAt: null },
      });
      if (again) {
        await updateScheduleNextRun(schedule.id, now);
        continue;
      }

      // 4. Create test_run + executions (one environment per TC by testType + applicationId)
      const created: { executionId: string; testCaseId: string }[] = [];
      const tcIdsWithEnv: string[] = [];
      const skippedNoEnv: { id: string; testType: string | null; applicationId: string | null }[] = [];

      await prisma.$transaction(async (tx) => {
        const run = await tx.testRun.create({
          data: {
            projectId,
            status: "RUNNING",
            startedAt: now,
          },
        });
        for (const tc of withSteps) {
          const env = findEnvironmentForTestCase(tc, scheduleEnvs);
          if (!env) {
            skippedNoEnv.push({
              id: tc.id,
              testType: tc.testType,
              applicationId: tc.applicationId,
            });
            continue;
          }
          const ex = await tx.execution.create({
            data: {
              runId: run.id,
              projectId,
              environmentId: env.id,
              testCaseId: tc.id,
              status: "QUEUED",
            },
          });
          created.push({ executionId: ex.id, testCaseId: tc.id });
          tcIdsWithEnv.push(tc.id);
        }
        if (tcIdsWithEnv.length > 0) {
          await tx.testCase.updateMany({
            where: { id: { in: tcIdsWithEnv } },
            data: { status: "TESTING" },
          });
        }
      });

      // 4b. Mark TCs with no matching env as ignore + reason
      for (const tc of skippedNoEnv) {
        const testTypeLabel = tc.testType ?? "E2E";
        const appPart = tc.applicationId
          ? ` and application ${tc.applicationId.slice(0, 8)}…`
          : " and no application";
        const reason = `No environment in schedule for testType ${testTypeLabel}${appPart}. Add a matching environment to the schedule or set test case application/test type.`;
        await prisma.testCase.update({
          where: { id: tc.id },
          data: { status: "IGNORE", ignoreReason: reason },
        });
      }

      // 5. PreExecution for each new execution (prepare agent_execution before orchestrator pushes to Bull)
      for (const { executionId, testCaseId } of created) {
        try {
          const execution = await prisma.execution.findUnique({
            where: { id: executionId },
            include: {
              testCase: {
                select: {
                  title: true,
                  testType: true,
                  testSteps: true,
                  expectedResult: true,
                  category: true,
                  data_condition: true,
                  dataRequirement: true,
                  setup_hint: true,
                  applicationId: true,
                  primaryActor: true,
                  ticket: {
                    select: {
                      primaryActor: true,
                      title: true,
                      description: true,
                      acceptanceCriteria: true,
                    },
                  },
                },
              },
              environment: {
                select: {
                  baseUrl: true,
                  credentialsEnc: true,
                  usernameEnc: true,
                  passwordEnc: true,
                  apiTokenEnc: true,
                  e2eAuthMode: true,
                  apiAuthMode: true,
                },
              },
            },
          });
          if (!execution?.testCase || !execution.environment) continue;
          const primaryActor = execution.testCase.primaryActor ?? execution.testCase.ticket?.primaryActor ?? null;
          const credentials = resolveE2ECredentials(execution.environment, primaryActor);
          const envConfig = {
            baseUrl: execution.environment.baseUrl,
            credentials,
            e2eAuthMode: execution.environment.e2eAuthMode ?? undefined,
            apiAuthMode: execution.environment.apiAuthMode ?? undefined,
          };
          await runPreExecution({
            executionId,
            projectId,
            applicationId: execution.testCase.applicationId ?? null,
            testCaseId,
            agentExecution: (execution.agentExecution as unknown as AgentExecution) ?? null,
            testCase: {
              title: execution.testCase.title,
              testType: execution.testCase.testType,
              testSteps: execution.testCase.testSteps ?? [],
              expectedResult: execution.testCase.expectedResult,
              category: execution.testCase.category,
              data_condition: execution.testCase.data_condition,
              data_requirement: (execution.testCase.dataRequirement ?? []) as Array<{ alias: string; type: string; scenario: string; role?: string | null }>,
              setup_hint: execution.testCase.setup_hint,
              ticket: execution.testCase.ticket
                ? {
                    title: execution.testCase.ticket.title ?? null,
                    description: execution.testCase.ticket.description ?? null,
                    acceptanceCriteria: execution.testCase.ticket.acceptanceCriteria ?? null,
                  }
                : null,
            },
            envConfig,
            appConfig: buildApplicationConfig(),
          });
        } catch (preErr) {
          console.error("[run-creator] PreExecution failed for execution", executionId, preErr);
        }
      }

      await updateScheduleNextRun(schedule.id, now);
    } catch (err) {
      console.error("[run-creator] Schedule error:", schedule.id, err);
    }
  }
}

// -----------------------------------------------------------------------------
// Schedule B — Run Orchestrator (dispatch + completion only, no run creation)
// -----------------------------------------------------------------------------

/**
 * Run Orchestrator: for each RUNNING test_run, either dispatch QUEUED to Bull or mark run COMPLETED.
 * Does NOT create test_run.
 */
export async function runRunOrchestrator(): Promise<void> {
  const activeRuns = await prisma.testRun.findMany({
    where: {
      status: "RUNNING",
      completedAt: null,
    },
    orderBy: { startedAt: "asc" },
  });

  for (const run of activeRuns) {
    try {
      const runId = run.id;
      const projectId = run.projectId;

      // 1. Check execution state
      const counts = await prisma.execution.groupBy({
        by: ["status"],
        where: { runId },
        _count: true,
      });
      const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count]));
      const runningCount = (byStatus.RUNNING as number | undefined) ?? 0;
      const queuedCount = (byStatus.QUEUED as number | undefined) ?? 0;

      // 2. If any RUNNING → do nothing (wait for workers)
      if (runningCount > 0) {
        continue;
      }

      // 3. If any QUEUED → load batch and push to Bull
      if (queuedCount > 0) {
        const envAndBatch = await getEnvironmentAndBatchSizeForRun(projectId, runId);
        if (envAndBatch) {
          await loadQueuedExecutionsToBull(runId, envAndBatch.env, envAndBatch.batchSize);
        }
        continue;
      }

      // 4. No RUNNING, no QUEUED → all finished; sync any TC still TESTING from execution result, then mark run COMPLETED
      const executions = await prisma.execution.findMany({
        where: { runId, status: { in: ["PASSED", "FAILED"] } },
        select: { testCaseId: true, status: true },
      });
      for (const ex of executions) {
        await prisma.testCase.updateMany({
          where: { id: ex.testCaseId, status: "TESTING" },
          data: { status: ex.status as "PASSED" | "FAILED" },
        });
      }
      await prisma.testRun.update({
        where: { id: runId },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
    } catch (err) {
      console.error("[run-orchestrator] Run error:", run.id, err);
    }
  }
}

/** Env with encrypted fields for per-execution credential resolution (by ticket role). */
type EnvWithEnc = {
  id: string;
  baseUrl: string;
  credentialsEnc: string | null;
  usernameEnc: string | null;
  passwordEnc: string | null;
  apiTokenEnc: string | null;
};

/**
 * Get environment and batch size for a run (from first execution's env + first active schedule for project).
 * Credentials are resolved per execution using testCase.primaryActor (inherited from Ticket; match role in credentials; else first row).
 */
async function getEnvironmentAndBatchSizeForRun(
  projectId: string,
  runId: string
): Promise<{ env: EnvWithEnc; batchSize: number } | null> {
  const firstExecution = await prisma.execution.findFirst({
    where: { runId },
    select: { environmentId: true },
  });
  if (!firstExecution) return null;

  const env = await prisma.environment.findUnique({
    where: { id: firstExecution.environmentId },
    select: {
      id: true,
      baseUrl: true,
      credentialsEnc: true,
      usernameEnc: true,
      passwordEnc: true,
      apiTokenEnc: true,
    },
  });
  if (!env) return null;

  const schedule = await prisma.schedule.findFirst({
    where: { projectId, isActive: true },
    orderBy: { nextRunAt: "asc" },
    select: { concurrencyLimit: true },
  });
  const maxParallel = (await getScheduleConfig("max_parallel_execution")) ?? 10;
  const batchSize = Math.min(schedule?.concurrencyLimit ?? 3, maxParallel);

  return { env, batchSize };
}

// -----------------------------------------------------------------------------
// Shared helpers
// -----------------------------------------------------------------------------

export async function updateScheduleNextRun(scheduleId: string, now: Date): Promise<void> {
  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId },
    select: { cronExpression: true },
  });
  if (!schedule) return;
  const interval = cronParser.parseExpression(schedule.cronExpression);
  const nextRun = interval.next().toDate();
  await prisma.schedule.update({
    where: { id: scheduleId },
    data: { lastRunAt: now, nextRunAt: nextRun },
  });
}

async function loadQueuedExecutionsToBull(
  runId: string,
  env: EnvWithEnc,
  batchSize: number
): Promise<void> {
  const queued = await prisma.execution.findMany({
    where: { runId, status: "QUEUED" },
    take: batchSize,
    include: {
      testCase: {
        select: { primaryActor: true, ticket: { select: { primaryActor: true } } },
      },
    },
  });

  for (const ex of queued) {
    await prisma.execution.update({
      where: { id: ex.id },
      data: { status: "RUNNING", startedAt: new Date() },
    });
    const primaryActor = ex.testCase?.primaryActor ?? ex.testCase?.ticket?.primaryActor ?? null;
    const credentials = resolveE2ECredentials(env, primaryActor);
    await enqueueExecution({
      executionId: ex.id,
      projectId: ex.projectId,
      environmentId: env.id,
      testCaseId: ex.testCaseId,
      baseUrl: env.baseUrl,
      envCredentials: credentials,
    });
  }
}
