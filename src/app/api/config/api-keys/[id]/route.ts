/**
 * DELETE /api/config/api-keys/[id]
 */

import { NextRequest, NextResponse } from "next/server";
import { withApiKeyLogging } from "@/lib/auth/require-auth";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/client";

export const DELETE = withApiKeyLogging(PERMISSIONS.MANAGE_GLOBAL_CONFIG, async (_req, _auth, context) => {
  const params = await context?.params ?? {};
  const id = params.id as string;
  const key = await prisma.apiKey.findUnique({ where: { id } });
  if (!key) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.apiKey.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
