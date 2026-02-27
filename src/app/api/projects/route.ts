/**
 * GET /api/projects – list | POST – create (manager+).
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-auth";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/client";
import { createProjectSchema } from "@/lib/validations/schemas";
import { encrypt } from "@/lib/encryption";

export async function GET() {
  const auth = await requirePermission(PERMISSIONS.VIEW_EXECUTION_RESULTS);
  if (auth instanceof NextResponse) return auth;

  const list = await prisma.project.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      jiraProjectKey: true,
      defaultExecutionStrategy: true,
      isActive: true,
      _count: { select: { testCases: true, executions: true, environments: true } },
    },
    orderBy: { name: "asc" },
  });

  const projectIds = list.map((p) => p.id);
  const [executionCounts, testCasesWithExecutions] = await Promise.all([
    prisma.execution.groupBy({
      by: ["projectId", "status"],
      where: { projectId: { in: projectIds } },
      _count: { id: true },
    }),
    prisma.execution.groupBy({
      by: ["projectId", "testCaseId"],
      where: { projectId: { in: projectIds } },
      _count: { id: true },
    }),
  ]);

  const statusByProject: Record<
    string,
    { PASSED: number; FAILED: number; QUEUED: number; RUNNING: number; IGNORE: number }
  > = {};
  for (const id of projectIds) {
    statusByProject[id] = { PASSED: 0, FAILED: 0, QUEUED: 0, RUNNING: 0, IGNORE: 0 };
  }
  for (const row of executionCounts) {
    const key = row.status as keyof (typeof statusByProject)[string];
    if (statusByProject[row.projectId] && key in statusByProject[row.projectId]) {
      statusByProject[row.projectId][key] = row._count.id;
    }
  }

  // Count unique test cases that have at least one execution per project
  const testCasesWithExecutionsByProject: Record<string, number> = {};
  for (const id of projectIds) {
    testCasesWithExecutionsByProject[id] = 0;
  }
  const uniqueTestCases = new Set<string>();
  for (const row of testCasesWithExecutions) {
    const key = `${row.projectId}-${row.testCaseId}`;
    if (!uniqueTestCases.has(key)) {
      uniqueTestCases.add(key);
      testCasesWithExecutionsByProject[row.projectId] =
        (testCasesWithExecutionsByProject[row.projectId] ?? 0) + 1;
    }
  }

  const result = list.map((p) => {
    const s = statusByProject[p.id] ?? { PASSED: 0, FAILED: 0, QUEUED: 0, RUNNING: 0, IGNORE: 0 };
    const completed = s.PASSED + s.FAILED;
    const inProgress = s.QUEUED + s.RUNNING;
    return {
      ...p,
      ticketsCount: 0,
      passedCount: s.PASSED,
      failedCount: s.FAILED,
      completedCount: completed,
      inProgressCount: inProgress,
      testCasesWithExecutionsCount: testCasesWithExecutionsByProject[p.id] ?? 0,
    };
  });

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission(PERMISSIONS.CREATE_PROJECT);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data: Parameters<typeof prisma.project.create>[0]["data"] = {
    name: parsed.data.name,
    jiraProjectKey: parsed.data.jiraProjectKey ?? null,
    n8nWebhookToken: parsed.data.n8nWebhookToken ? encrypt(parsed.data.n8nWebhookToken) : null,
    defaultExecutionStrategy: (parsed.data.defaultExecutionStrategy as "sequential" | "parallel" | "adaptive") ?? "sequential",
    isActive: parsed.data.isActive ?? true,
  };

  const project = await prisma.project.create({ data });
  return NextResponse.json(project);
}
