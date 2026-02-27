/**
 * GET /api/executions?projectId=&environmentId=&limit= | POST – trigger run (manager+).
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-auth";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/client";
import { triggerExecutionSchema } from "@/lib/validations/schemas";
import { enqueueExecution } from "@/lib/queue/execution-queue";
import { decrypt } from "@/lib/encryption";

export async function GET(req: NextRequest) {
  const auth = await requirePermission(PERMISSIONS.VIEW_EXECUTION_RESULTS);
  if (auth instanceof NextResponse) return auth;

  const projectId = req.nextUrl.searchParams.get("projectId");
  const environmentId = req.nextUrl.searchParams.get("environmentId");
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 50, 100);

  const list = await prisma.execution.findMany({
    where: {
      ...(projectId && { projectId }),
      ...(environmentId && { environmentId }),
    },
    include: {
      testCase: { select: { id: true, title: true, priority: true } },
      environment: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return NextResponse.json(list);
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission(PERMISSIONS.TRIGGER_EXECUTION);
  if (auth instanceof NextResponse) return auth;

  const parsed = triggerExecutionSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const env = await prisma.environment.findUnique({
    where: { id: parsed.data.environmentId },
  });
  if (!env || env.projectId !== parsed.data.projectId) {
    return NextResponse.json({ error: "Environment not found" }, { status: 404 });
  }

  const testCases = await prisma.testCase.findMany({
    where: {
      id: { in: parsed.data.testCaseIds },
      projectId: parsed.data.projectId },
    select: { id: true, testSteps: true },
  });
  if (testCases.length !== parsed.data.testCaseIds.length) {
    return NextResponse.json({ error: "One or more test cases not found" }, { status: 404 });
  }

  const credentials = {
    username: env.usernameEnc ? decrypt(env.usernameEnc) : undefined,
    password: env.passwordEnc ? decrypt(env.passwordEnc) : undefined,
    apiToken: env.apiTokenEnc ? decrypt(env.apiTokenEnc) : undefined,
  };

  const created: { id: string; testCaseId: string }[] = [];

  for (const tc of testCases) {
    const steps = tc.testSteps ?? [];
    if (steps.length === 0) {
      return NextResponse.json(
        { error: `Test case ${tc.id} has no test steps` },
        { status: 400 }
      );
    }

    const execution = await prisma.execution.create({
      data: {
        projectId: parsed.data.projectId,
        environmentId: parsed.data.environmentId,
        testCaseId: tc.id,
        status: "QUEUED",
        triggeredById: auth.userId,
      },
    });

    await enqueueExecution({
      executionId: execution.id,
      projectId: parsed.data.projectId,
      environmentId: parsed.data.environmentId,
      testCaseId: tc.id,
      baseUrl: env.baseUrl,
      envCredentials: credentials,
    });

    created.push({ id: execution.id, testCaseId: tc.id });
  }

  return NextResponse.json({ created });
}
