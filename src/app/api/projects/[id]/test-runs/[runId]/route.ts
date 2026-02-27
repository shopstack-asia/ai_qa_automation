/**
 * GET /api/projects/[id]/test-runs/[runId] - test run detail with executions.
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-auth";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/client";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  const auth = await requirePermission(PERMISSIONS.VIEW_EXECUTION_RESULTS);
  if (auth instanceof NextResponse) return auth;

  const { id: projectId, runId } = await params;
  const run = await prisma.testRun.findFirst({
    where: { id: runId, projectId },
    select: {
      id: true,
      status: true,
      startedAt: true,
      completedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const executions = await prisma.execution.findMany({
    where: { runId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      status: true,
      createdAt: true,
      startedAt: true,
      finishedAt: true,
      duration: true,
      testCaseId: true,
      testCase: { select: { id: true, title: true } },
    },
  });

  return NextResponse.json({
    ...run,
    executions: executions.map((e) => ({
      id: e.id,
      status: e.status,
      createdAt: e.createdAt,
      startedAt: e.startedAt,
      finishedAt: e.finishedAt,
      duration: e.duration,
      testCaseId: e.testCaseId,
      testCaseTitle: e.testCase?.title ?? "",
    })),
  });
}
