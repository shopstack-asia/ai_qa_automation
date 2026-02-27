/**
 * GET /api/environments/[id] | PATCH | DELETE.
 * GET returns decrypted credentials only to authorized (e.g. for worker token); API can return masked.
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-auth";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/client";
import { updateEnvironmentSchema } from "@/lib/validations/schemas";
import { encrypt, decrypt } from "@/lib/encryption";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(PERMISSIONS.VIEW_EXECUTION_RESULTS);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const env = await prisma.environment.findUnique({
    where: { id },
    include: { application: { select: { id: true, name: true, code: true, platform: true, testTypes: true } } },
  });
  if (!env) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let credentials: { role?: string; username: string; password: string }[] | undefined;
  if (env.credentialsEnc) {
    try {
      const raw = JSON.parse(decrypt(env.credentialsEnc)) as { role?: string; username: string; password: string }[];
      credentials = Array.isArray(raw)
        ? raw.map((c) => ({ role: c.role ?? "", username: c.username ?? "", password: "" }))
        : undefined;
    } catch {
      credentials = undefined;
    }
  }

  return NextResponse.json({
    id: env.id,
    projectId: env.projectId,
    name: env.name,
    baseUrl: env.baseUrl,
    applicationId: env.applicationId ?? undefined,
    application: env.application ?? undefined,
    platform: env.platform ?? undefined,
    type: env.type,
    isActive: env.isActive,
    apiAuthMode: env.apiAuthMode,
    e2eAuthMode: env.e2eAuthMode,
    createdAt: env.createdAt,
    username: env.usernameEnc ? decrypt(env.usernameEnc) : undefined,
    password: undefined,
    hasPassword: !!env.passwordEnc,
    hasApiToken: !!env.apiTokenEnc,
    credentials,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(PERMISSIONS.EDIT_ENVIRONMENT);
  if (auth instanceof NextResponse) return auth;
  
  // QA role cannot edit environments
  if (auth.role === "qa") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = updateEnvironmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const p = parsed.data;
  const data: Parameters<typeof prisma.environment.update>[0]["data"] = {};
  if (p.name !== undefined) data.name = p.name;
  if (p.baseUrl !== undefined) data.baseUrl = p.baseUrl;
  if (p.applicationId !== undefined) data.applicationId = p.applicationId || null;
  if (p.platform !== undefined) data.platform = p.platform || null;
  if (p.applicationId !== undefined && !p.platform) {
    if (p.applicationId) {
      const app = await prisma.application.findUnique({
        where: { id: p.applicationId },
        select: { platform: true },
      });
      data.platform = app?.platform ?? null;
    } else {
      data.platform = null;
    }
  }
  if (p.type !== undefined) data.type = p.type;
  if (p.isActive !== undefined) data.isActive = p.isActive;
  if (p.apiAuthMode !== undefined) data.apiAuthMode = p.apiAuthMode;
  if (p.e2eAuthMode !== undefined) data.e2eAuthMode = p.e2eAuthMode;
  if ("username" in body) data.usernameEnc = body.username ? encrypt(body.username) : null;
  if ("password" in body) data.passwordEnc = body.password ? encrypt(body.password) : null;
  if ("apiToken" in body) data.apiTokenEnc = body.apiToken ? encrypt(body.apiToken) : null;
  if (p.appKey !== undefined) data.appKeyEnc = p.appKey ? encrypt(p.appKey) : null;
  if (p.secretKey !== undefined) data.secretKeyEnc = p.secretKey ? encrypt(p.secretKey) : null;
  if (p.credentials !== undefined && Array.isArray(p.credentials)) {
    let credentialsToSave = p.credentials as { role?: string; username: string; password: string }[];
    if (credentialsToSave.length > 0) {
      const existing = await prisma.environment.findUnique({ where: { id }, select: { credentialsEnc: true } });
      let existingList: { role?: string; username: string; password: string }[] = [];
      if (existing?.credentialsEnc) {
        try {
          existingList = JSON.parse(decrypt(existing.credentialsEnc)) as { role?: string; username: string; password: string }[];
        } catch {
          /* ignore */
        }
      }
      credentialsToSave = credentialsToSave.map((c, i) => ({
        role: c.role ?? "",
        username: c.username,
        password: c.password !== "" ? c.password : (existingList[i]?.password ?? ""),
      }));
      data.credentialsEnc = encrypt(JSON.stringify(credentialsToSave));
    } else {
      data.credentialsEnc = null;
    }
  }

  const env = await prisma.environment.update({
    where: { id },
    data,
  });
  return NextResponse.json({
    id: env.id,
    projectId: env.projectId,
    name: env.name,
    baseUrl: env.baseUrl,
    platform: env.platform,
    type: env.type,
    isActive: env.isActive,
    apiAuthMode: env.apiAuthMode,
    e2eAuthMode: env.e2eAuthMode,
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(PERMISSIONS.EDIT_ENVIRONMENT);
  if (auth instanceof NextResponse) return auth;
  
  // QA role cannot delete environments
  if (auth.role === "qa") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  try {
    await prisma.environment.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = String(e ?? "").toLowerCase();
    if (msg.includes("foreign key") || msg.includes("constraint")) {
      return NextResponse.json(
        { error: "Cannot delete: environment is used by executions or schedules" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
