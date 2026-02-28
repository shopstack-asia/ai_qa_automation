/**
 * GET /api/test-cases/[id] | PATCH | DELETE.
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-auth";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/client";
import { updateTestCaseSchema } from "@/lib/validations/schemas";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(PERMISSIONS.VIEW_EXECUTION_RESULTS);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const testCase = await prisma.testCase.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, name: true } },
      application: { select: { id: true, name: true, code: true, platform: true, testTypes: true } },
      executions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, status: true, executionMetadata: true, stepLog: true, createdAt: true },
      },
    },
  });
  if (!testCase) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { executions, ...rest } = testCase;
  const latest = executions?.[0];
  const latestExecution = latest
    ? {
        id: latest.id,
        status: latest.status,
        execution_status: (latest.executionMetadata as { execution_status?: string } | null)?.execution_status ?? latest.status,
        stepLog: latest.stepLog,
        createdAt: latest.createdAt,
      }
    : null;
  return NextResponse.json({
    ...rest,
    dataRequirement: rest.dataRequirement ?? [],
    latestExecution,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(PERMISSIONS.EDIT_TEST_CASES);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const parsed = updateTestCaseSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let platform: string | null | undefined = parsed.data.platform;
  if (parsed.data.applicationId !== undefined) {
    if (parsed.data.applicationId) {
      const app = await prisma.application.findUnique({
        where: { id: parsed.data.applicationId },
        select: { platform: true },
      });
      platform = app?.platform ?? null;
    } else {
      platform = null;
    }
  }
  const data: Record<string, unknown> = {
    ...(parsed.data.title !== undefined && { title: parsed.data.title }),
    ...(parsed.data.ticketId !== undefined && { ticketId: parsed.data.ticketId }),
    ...(parsed.data.applicationId !== undefined && { applicationId: parsed.data.applicationId }),
    ...(parsed.data.priority !== undefined && { priority: parsed.data.priority }),
    ...(parsed.data.status !== undefined && { status: parsed.data.status }),
    ...(parsed.data.testType !== undefined && { testType: parsed.data.testType as "API" | "E2E" }),
    ...(platform !== undefined && { platform }),
    ...(parsed.data.testSteps !== undefined && { testSteps: parsed.data.testSteps }),
    ...(parsed.data.expectedResult !== undefined && { expectedResult: parsed.data.expectedResult ?? null }),
    ...(parsed.data.category !== undefined && { category: parsed.data.category ?? null }),
    ...(parsed.data.data_condition !== undefined && { data_condition: parsed.data.data_condition ?? null }),
    ...(parsed.data.data_requirement !== undefined && {
      dataRequirement: parsed.data.data_requirement === null ? [] : parsed.data.data_requirement,
    }),
    ...(parsed.data.setup_hint !== undefined && { setup_hint: parsed.data.setup_hint ?? null }),
    ...(parsed.data.structuredPlan !== undefined && { structuredPlan: parsed.data.structuredPlan as object }),
    ...(parsed.data.ignoreReason !== undefined && { ignoreReason: parsed.data.ignoreReason ?? null }),
    ...(parsed.data.primaryActor !== undefined && { primaryActor: parsed.data.primaryActor }),
  };
  if (parsed.data.ticketId !== undefined && parsed.data.primaryActor === undefined) {
    const ticketId = parsed.data.ticketId ?? null;
    if (ticketId) {
      const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { primaryActor: true },
      });
      (data as Record<string, unknown>).primaryActor = ticket?.primaryActor ?? null;
    } else {
      (data as Record<string, unknown>).primaryActor = null;
    }
  }
  const testCase = await prisma.testCase.update({
    where: { id },
    data: data as Parameters<typeof prisma.testCase.update>[0]["data"],
  });
  return NextResponse.json({
    ...testCase,
    dataRequirement: testCase.dataRequirement ?? [],
  });
}
