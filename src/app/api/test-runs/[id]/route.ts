/**
 * GET /api/test-runs/[id] – single test run with executions (test case, status, times, duration).
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-auth";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/client";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(PERMISSIONS.VIEW_EXECUTION_RESULTS);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const run = await prisma.testRun.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, name: true } },
      executions: {
        orderBy: { createdAt: "asc" },
        include: {
          testCase: { select: { id: true, title: true } },
        },
      },
    },
  });
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const executions = run.executions.map((e) => ({
    id: e.id,
    testCaseId: e.testCaseId,
    testCaseTitle: e.testCase?.title ?? null,
    status: e.status,
    startedAt: e.startedAt,
    finishedAt: e.finishedAt,
    duration: e.duration,
  }));

  return NextResponse.json({
    id: run.id,
    projectId: run.projectId,
    project: run.project,
    status: run.status,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    executions,
  });
}
