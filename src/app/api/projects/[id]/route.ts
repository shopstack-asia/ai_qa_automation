/**
 * GET /api/projects/[id] | PATCH | DELETE (admin for delete).
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-auth";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/client";
import { updateProjectSchema } from "@/lib/validations/schemas";
import { encrypt } from "@/lib/encryption";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(PERMISSIONS.VIEW_EXECUTION_RESULTS);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      _count: { select: { testCases: true, executions: true, environments: true, tickets: true } },
    },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [executionCounts, testRunCounts] = await Promise.all([
    prisma.execution.groupBy({
      by: ["status"],
      where: { projectId: id },
      _count: { id: true },
    }),
    prisma.testRun.groupBy({
      by: ["status"],
      where: { projectId: id },
      _count: { id: true },
    }),
  ]);

  const statusCounts = { PASSED: 0, FAILED: 0, QUEUED: 0, RUNNING: 0, IGNORE: 0 };
  for (const row of executionCounts) {
    const key = row.status as keyof typeof statusCounts;
    if (key in statusCounts) statusCounts[key] = row._count.id;
  }

  const runStatusCounts = { RUNNING: 0, COMPLETED: 0 };
  for (const row of testRunCounts) {
    const key = row.status as keyof typeof runStatusCounts;
    if (key in runStatusCounts) runStatusCounts[key] = row._count.id;
  }
  const testRunTotal = runStatusCounts.RUNNING + runStatusCounts.COMPLETED;

  return NextResponse.json({
    ...project,
    ticketsCount: project._count.tickets,
    passedCount: statusCounts.PASSED,
    failedCount: statusCounts.FAILED,
    executionRunningCount: statusCounts.RUNNING,
    testRunTotal,
    testRunRunningCount: runStatusCounts.RUNNING,
    testRunCompletedCount: runStatusCounts.COMPLETED,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(PERMISSIONS.EDIT_TEST_CASES);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await req.json();
  const parsed = updateProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data: Record<string, unknown> = { ...parsed.data };
  if ("n8nWebhookToken" in body && body.n8nWebhookToken !== undefined) {
    data.n8nWebhookToken = body.n8nWebhookToken ? encrypt(body.n8nWebhookToken) : null;
  }

  const project = await prisma.project.update({
    where: { id },
    data: data as Parameters<typeof prisma.project.update>[0]["data"],
  });
  return NextResponse.json(project);
}
