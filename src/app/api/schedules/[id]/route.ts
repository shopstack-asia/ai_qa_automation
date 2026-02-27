/**
 * GET /api/schedules/[id] | PATCH | DELETE.
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-auth";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/client";
import { updateScheduleSchema } from "@/lib/validations/schemas";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(PERMISSIONS.VIEW_REPORTS);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const schedule = await prisma.schedule.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, name: true } },
    },
  });
  if (!schedule) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const envs =
    schedule.environmentIds.length > 0
      ? await prisma.environment.findMany({
          where: { id: { in: schedule.environmentIds } },
          select: { id: true, name: true },
        })
      : [];
  return NextResponse.json({ ...schedule, environments: envs });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(PERMISSIONS.MANAGE_SCHEDULE);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const parsed = updateScheduleSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = {
    ...parsed.data,
    ...(parsed.data.retryPolicy !== undefined && { retryPolicy: parsed.data.retryPolicy as object }),
  };
  const schedule = await prisma.schedule.update({
    where: { id },
    data,
    include: {
      project: { select: { id: true, name: true } },
    },
  });
  const envs =
    schedule.environmentIds.length > 0
      ? await prisma.environment.findMany({
          where: { id: { in: schedule.environmentIds } },
          select: { id: true, name: true },
        })
      : [];
  return NextResponse.json({ ...schedule, environments: envs });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(PERMISSIONS.MANAGE_SCHEDULE);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  await prisma.schedule.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
