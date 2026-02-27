/**
 * Require session and optional permission. Use in API route handlers.
 */

import { NextResponse } from "next/server";
import { getSession } from "./session";
import { hasPermission } from "./rbac";
import { Role } from "@prisma/client";

export interface AuthResult {
  userId: string;
  email: string;
  role: Role;
}

export async function requireAuth(): Promise<AuthResult | NextResponse> {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return {
    userId: session.userId,
    email: session.email,
    role: session.role as Role,
  };
}

export async function requirePermission(
  permission: string
): Promise<AuthResult | NextResponse> {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  if (!hasPermission(auth.role, permission)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return auth;
}
