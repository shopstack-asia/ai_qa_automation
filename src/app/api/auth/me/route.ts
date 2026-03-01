/**
 * GET /api/auth/me – current user (requires auth).
 */

import { NextRequest, NextResponse } from "next/server";
import { withApiKeyLoggingAuth } from "@/lib/auth/require-auth";
import { prisma } from "@/lib/db/client";

export const GET = withApiKeyLoggingAuth(async (_req, auth) => {
  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  return NextResponse.json(user);
});
