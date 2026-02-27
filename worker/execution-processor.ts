/**
 * Execution job processor. Flow: Load execution + testCase → PreExecutionService → PlaywrightExecutor (agent_execution only).
 * No AI in Playwright; PreExecution may call AI only for selector resolution when no knowledge.
 */
import { Prisma } from "@prisma/client";
import type { ExecutionJobPayload } from "../src/lib/queue/execution-queue";
import { prisma } from "../src/lib/db/client";
import type { ApplicationConfig } from "../src/core/data-orchestrator";
import { runPreExecution, type ExecutionSelectorCache } from "../src/core/pre-execution-service";
import type { AgentExecution } from "../src/lib/agent-execution-types";
import { runPlaywrightExecutionFromAgentExecution } from "./playwright-runner";

function buildApplicationConfig(): ApplicationConfig {
  return {
    domain: { entities: {}, defaultEntity: undefined },
  };
}

export async function processExecutionJob(payload: ExecutionJobPayload): Promise<void> {
  const { executionId, baseUrl, envCredentials } = payload;

  await prisma.execution.update({
    where: { id: executionId },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  const execution = await prisma.execution.findUnique({
    where: { id: executionId },
    include: {
      testCase: {
        select: {
          id: true,
          title: true,
          testType: true,
          testSteps: true,
          expectedResult: true,
          category: true,
          data_condition: true,
          dataRequirement: true,
          setup_hint: true,
          applicationId: true,
          ticket: {
            select: { title: true, description: true, acceptanceCriteria: true },
          },
        },
      },
      environment: { select: { baseUrl: true, e2eAuthMode: true, apiAuthMode: true } },
    },
  });

  if (!execution?.testCase) {
    await prisma.execution.update({
      where: { id: executionId },
      data: { status: "FAILED", errorMessage: "Execution or test case not found", finishedAt: new Date() },
    });
    await prisma.testCase.updateMany({
      where: { id: payload.testCaseId },
      data: { status: "FAILED" },
    });
    throw new Error("Execution or test case not found");
  }

  const testSteps = execution.testCase.testSteps ?? [];
  if (testSteps.length === 0) {
    await prisma.execution.update({
      where: { id: executionId },
      data: { status: "FAILED", errorMessage: "Test case has no steps", finishedAt: new Date() },
    });
    await prisma.testCase.update({
      where: { id: payload.testCaseId },
      data: { status: "FAILED" },
    });
    throw new Error("Test case has no steps");
  }

  const envConfig = {
    baseUrl: baseUrl ?? execution.environment?.baseUrl ?? "",
    credentials: envCredentials,
    e2eAuthMode: execution.environment?.e2eAuthMode ?? undefined,
    apiAuthMode: execution.environment?.apiAuthMode ?? undefined,
  };

  let variables: Record<string, string> = {};
  let executionSelectorCache: ExecutionSelectorCache = new Map();
  try {
    const preResult = await runPreExecution({
      executionId,
      projectId: execution.projectId,
      applicationId: execution.testCase.applicationId ?? null,
      testCaseId: execution.testCaseId,
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
              title: execution.testCase.ticket.title,
              description: execution.testCase.ticket.description ?? null,
              acceptanceCriteria: execution.testCase.ticket.acceptanceCriteria ?? null,
            }
          : null,
      },
      envConfig,
      appConfig: buildApplicationConfig(),
    });
    variables = preResult.variables;
    executionSelectorCache = preResult.executionSelectorCache;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[execution-processor] PreExecution failed", { executionId, error: message });
    await prisma.execution.update({
      where: { id: executionId },
      data: { status: "FAILED", errorMessage: message, finishedAt: new Date() },
    });
    await prisma.testCase.update({
      where: { id: payload.testCaseId },
      data: { status: "FAILED" },
    });
    throw err;
  }

  const updated = await prisma.execution.findUnique({
    where: { id: executionId },
    select: { agentExecution: true },
  });
  const agentExecution = updated?.agentExecution as AgentExecution | null;
  if (!agentExecution?.steps?.length) {
    await prisma.execution.update({
      where: { id: executionId },
      data: { status: "FAILED", errorMessage: "PreExecution produced no agent_execution steps", finishedAt: new Date() },
    });
    await prisma.testCase.update({
      where: { id: payload.testCaseId },
      data: { status: "FAILED" },
    });
    throw new Error("PreExecution produced no agent_execution steps");
  }

  try {
    const result = await runPlaywrightExecutionFromAgentExecution({
      baseUrl: envConfig.baseUrl,
      agentExecution,
      credentials: envCredentials,
      executionId,
      variables,
      projectId: execution.projectId,
      applicationId: execution.testCase.applicationId ?? undefined,
      executionSelectorCache,
    });

    const executionStatus = result.passed ? "PASSED" : "FAILED";
    await prisma.execution.update({
      where: { id: executionId },
      data: {
        status: executionStatus,
        duration: result.duration,
        videoUrl: result.videoUrl ?? null,
        screenshotUrls: result.screenshotUrls?.length ? (result.screenshotUrls as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
        stepLog: result.stepLog?.length ? (result.stepLog as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
        resultSummary: result.resultSummary ?? null,
        errorMessage: result.errorMessage ?? null,
        executionMetadata: result.executionMetadata != null ? (result.executionMetadata as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
        readableSteps: result.readableSteps != null ? (result.readableSteps as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
        finishedAt: new Date(),
      },
    });
    await prisma.testCase.update({
      where: { id: payload.testCaseId },
      data: { status: result.passed ? "PASSED" : "FAILED" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.execution.update({
      where: { id: executionId },
      data: { status: "FAILED", errorMessage: message, finishedAt: new Date() },
    });
    await prisma.testCase.update({
      where: { id: payload.testCaseId },
      data: { status: "FAILED" },
    });
    throw err;
  }
}
