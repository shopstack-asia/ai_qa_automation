/**
 * GET /api/projects/[id]/test-runs - list test runs for a project with counts.
 * Query: page, limit, status, sortBy, sortOrder
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-auth";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/client";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(PERMISSIONS.VIEW_EXECUTION_RESULTS);
  if (auth instanceof NextResponse) return auth;

  const { id: projectId } = await params;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page")) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || DEFAULT_LIMIT));
  const status = req.nextUrl.searchParams.get("status")?.trim() || undefined;
  const sortBy = (req.nextUrl.searchParams.get("sortBy")?.trim() || "startedAt") as "startedAt" | "completedAt" | "status";
  const sortOrder = (req.nextUrl.searchParams.get("sortOrder")?.toLowerCase() === "asc" ? "asc" : "desc") as "asc" | "desc";
  const skip = (page - 1) * limit;

  const where = { projectId, ...(status && { status: status as "RUNNING" | "COMPLETED" }) };

  const orderBy =
    sortBy === "completedAt" ? { completedAt: sortOrder } :
    sortBy === "status" ? { status: sortOrder } :
    { startedAt: sortOrder };

  const [runs, total] = await Promise.all([
    prisma.testRun.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      select: {
        id: true,
        status: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { executions: true } },
      },
    }),
    prisma.testRun.count({ where }),
  ]);

  const executionCounts = await prisma.execution.groupBy({
    by: ["runId", "status"],
    where: { runId: { in: runs.map((r) => r.id) } },
    _count: { id: true },
  });

  const countsByRun: Record<string, { passed: number; failed: number; total: number }> = {};
  for (const r of runs) {
    countsByRun[r.id] = { passed: 0, failed: 0, total: r._count.executions };
  }
  for (const row of executionCounts) {
    if (!row.runId) continue;
    const c = countsByRun[row.runId];
    if (!c) continue;
    if (row.status === "PASSED") c.passed = row._count.id;
    if (row.status === "FAILED") c.failed = row._count.id;
  }

  const data = runs.map((r) => ({
    id: r.id,
    status: r.status,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    totalExecutions: countsByRun[r.id]?.total ?? 0,
    passed: countsByRun[r.id]?.passed ?? 0,
    failed: countsByRun[r.id]?.failed ?? 0,
  }));

  return NextResponse.json({
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  });
}
