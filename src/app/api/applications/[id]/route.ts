/**
 * GET /api/applications/[id] | PATCH | DELETE.
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-auth";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/client";
import { updateApplicationSchema } from "@/lib/validations/schemas";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(PERMISSIONS.VIEW_EXECUTION_RESULTS);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const app = await prisma.application.findUnique({ where: { id } });
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    id: app.id,
    projectId: app.projectId,
    name: app.name,
    code: app.code,
    description: app.description,
    enabled: app.enabled,
    platform: app.platform,
    testTypes: app.testTypes,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(PERMISSIONS.EDIT_APPLICATION);
  if (auth instanceof NextResponse) return auth;
  
  // QA role cannot edit applications
  if (auth.role === "qa") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = updateApplicationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const p = parsed.data;
  const data: Parameters<typeof prisma.application.update>[0]["data"] = {};
  if (p.name !== undefined) data.name = p.name;
  if (p.code !== undefined) data.code = p.code.trim();
  if (p.description !== undefined) data.description = p.description ?? null;
  if (p.enabled !== undefined) data.enabled = p.enabled;
  if (p.platform !== undefined) data.platform = p.platform ?? null;
  if (p.testTypes !== undefined)
    data.testTypes =
      Array.isArray(p.testTypes) && p.testTypes.length > 0 ? p.testTypes : null;

  const app = await prisma.application.update({
    where: { id },
    data,
  });

  return NextResponse.json({
    id: app.id,
    projectId: app.projectId,
    name: app.name,
    code: app.code,
    description: app.description,
    enabled: app.enabled,
    platform: app.platform,
    testTypes: app.testTypes,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(PERMISSIONS.EDIT_APPLICATION);
  if (auth instanceof NextResponse) return auth;
  
  // QA role cannot delete applications
  if (auth.role === "qa") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const app = await prisma.application.findUnique({ where: { id }, select: { projectId: true } });
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [envCount, tcCount, tickets] = await Promise.all([
    prisma.environment.count({ where: { applicationId: id } }),
    prisma.testCase.count({ where: { applicationId: id } }),
    prisma.ticket.findMany({
      where: { projectId: app.projectId },
      select: { applicationIds: true },
    }),
  ]);
  const ticketLinked = tickets.some(
    (t) => Array.isArray(t.applicationIds) && (t.applicationIds as string[]).includes(id)
  );

  if (envCount > 0 || tcCount > 0 || ticketLinked) {
    const parts: string[] = [];
    if (envCount > 0) parts.push("environment(s)");
    if (tcCount > 0) parts.push("test case(s)");
    if (ticketLinked) parts.push("ticket(s)");
    return NextResponse.json(
      { error: `Cannot delete: application is linked to ${parts.join(", ")}.` },
      { status: 400 }
    );
  }

  try {
    await prisma.application.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
