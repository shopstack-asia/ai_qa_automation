/**
 * GET /api/config/api-keys – list (name + masked).
 * POST – create (name only); server generates token, returns once.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { requirePermission } from "@/lib/auth/require-auth";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/client";
import { hashApiKey } from "@/lib/api-keys";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1).max(120).trim(),
});

/** 64 bytes (512 bits) → ~86 chars base64url; aligns with common API key / secret length (e.g. Stripe, GitHub). */
function generateApiToken(): string {
  return randomBytes(64).toString("base64url");
}

export async function GET() {
  const auth = await requirePermission(PERMISSIONS.MANAGE_GLOBAL_CONFIG);
  if (auth instanceof NextResponse) return auth;

  const list = await prisma.apiKey.findMany({
    select: { id: true, name: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(
    list.map((r) => ({ id: r.id, name: r.name, key: "••••••", createdAt: r.createdAt }))
  );
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission(PERMISSIONS.MANAGE_GLOBAL_CONFIG);
  if (auth instanceof NextResponse) return auth;

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.apiKey.findUnique({ where: { name: parsed.data.name } });
  if (existing) {
    return NextResponse.json({ error: { name: ["Name already in use"] } }, { status: 400 });
  }

  const plainToken = generateApiToken();
  const keyHash = await hashApiKey(plainToken);
  const row = await prisma.apiKey.create({
    data: { name: parsed.data.name, keyHash },
    select: { id: true, name: true, createdAt: true },
  });
  return NextResponse.json({
    id: row.id,
    name: row.name,
    key: "••••••",
    createdAt: row.createdAt,
    createdKey: plainToken,
    message: "Copy the API token now — it cannot be shown again.",
  });
}
