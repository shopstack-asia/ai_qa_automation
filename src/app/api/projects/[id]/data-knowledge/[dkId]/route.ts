/**
 * PATCH /api/projects/[id]/data-knowledge/[dkId] - update.
 * DELETE /api/projects/[id]/data-knowledge/[dkId] - delete.
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-auth";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/client";
import { updateDataKnowledgeSchema } from "@/lib/validations/schemas";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; dkId: string }> }
) {
  const auth = await requirePermission(PERMISSIONS.EDIT_TEST_CASES);
  if (auth instanceof NextResponse) return auth;

  const { id: projectId, dkId } = await params;
  const existing = await prisma.dataKnowledge.findFirst({
    where: { id: dkId, projectId },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = updateDataKnowledgeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const p = parsed.data;
  const data: Record<string, unknown> = {};
  if (p.key !== undefined) data.key = p.key;
  if (p.type !== undefined) data.type = p.type;
  if (p.scenario !== undefined) data.scenario = p.scenario;
  if (p.role !== undefined) data.role = p.role;
  if (p.value !== undefined) data.value = p.value;

  const row = await prisma.dataKnowledge.update({
    where: { id: dkId },
    data: data as Parameters<typeof prisma.dataKnowledge.update>[0]["data"],
  });

  return NextResponse.json(row);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; dkId: string }> }
) {
  const auth = await requirePermission(PERMISSIONS.EDIT_TEST_CASES);
  if (auth instanceof NextResponse) return auth;

  const { id: projectId, dkId } = await params;
  const existing = await prisma.dataKnowledge.findFirst({
    where: { id: dkId, projectId },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.dataKnowledge.delete({ where: { id: dkId } });
  return NextResponse.json({ ok: true });
}
