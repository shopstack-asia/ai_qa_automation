/**
 * GET /api/schedules?projectId= | POST – create (manager+).
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-auth";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/client";
import { createScheduleSchema } from "@/lib/validations/schemas";
import { getNextRunFromCron } from "@/lib/scheduler/next-run";

export async function GET(req: NextRequest) {
  const auth = await requirePermission(PERMISSIONS.VIEW_REPORTS);
  if (auth instanceof NextResponse) return auth;

  const projectId = req.nextUrl.searchParams.get("projectId");
  const list = await prisma.schedule.findMany({
    where: projectId ? { projectId } : undefined,
    include: {
      project: { select: { id: true, name: true } },
    },
    orderBy: { nextRunAt: "asc" },
  });
  const allEnvIds = [...new Set(list.flatMap((s) => s.environmentIds))];
  const envMap = new Map<string, { id: string; name: string }>();
  if (allEnvIds.length > 0) {
    const envs = await prisma.environment.findMany({
      where: { id: { in: allEnvIds } },
      select: { id: true, name: true },
    });
    envs.forEach((e) => envMap.set(e.id, e));
  }
  const withEnvironments = list.map((s) => ({
    ...s,
    environments: s.environmentIds.map((id) => envMap.get(id) ?? { id, name: id }).filter(Boolean),
  }));
  return NextResponse.json(withEnvironments);
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission(PERMISSIONS.MANAGE_SCHEDULE);
  if (auth instanceof NextResponse) return auth;

  const parsed = createScheduleSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const nextRunAt = getNextRunFromCron(parsed.data.cronExpression);
  const schedule = await prisma.schedule.create({
    data: {
      projectId: parsed.data.projectId,
      environmentIds: parsed.data.environmentIds,
      name: parsed.data.name,
      cronExpression: parsed.data.cronExpression,
      testCaseIds: parsed.data.testCaseIds ?? [],
      concurrencyLimit: parsed.data.concurrencyLimit ?? 3,
      retryPolicy: parsed.data.retryPolicy ? (parsed.data.retryPolicy as object) : null,
      isActive: parsed.data.isActive ?? true,
      nextRunAt,
    },
    include: {
      project: { select: { id: true, name: true } },
    },
  });
  const envs = await prisma.environment.findMany({
    where: { id: { in: schedule.environmentIds } },
    select: { id: true, name: true },
  });
  return NextResponse.json({ ...schedule, environments: envs });
}
