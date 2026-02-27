/**
 * GET /api/test-cases/[id]/executions - list executions for this test case (newest first).
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

  const { id: testCaseId } = await params;
  const tc = await prisma.testCase.findUnique({
    where: { id: testCaseId },
    select: { id: true },
  });
  if (!tc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const executions = await prisma.execution.findMany({
    where: { testCaseId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      createdAt: true,
      startedAt: true,
      finishedAt: true,
      duration: true,
    },
  });

  return NextResponse.json({
    executions: executions.map((e) => ({
      id: e.id,
      status: e.status,
      createdAt: e.createdAt,
      startedAt: e.startedAt,
      finishedAt: e.finishedAt,
      duration: e.duration,
    })),
  });
}
