/**
 * Require session and optional permission. Use in API route handlers.
 * Accepts either session (cookie or JWT Bearer) or API key as Bearer token (for N8N/external integrations).
 * withApiKeyLogging() ห่อ handler แล้ว log request/response อัตโนมัติเมื่อเรียกด้วย API key (ทุก endpoint).
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getSession } from "./session";
import { hasPermission } from "./rbac";
import { getApiKeyIdIfValid } from "@/lib/api-keys";
import { logApiKeyRequestIfNeeded } from "@/lib/api-key-log";
import { Role } from "@prisma/client";

export interface AuthResult {
  userId: string;
  email: string;
  role: Role;
  /** Set when authenticated via API key (for request logging). */
  apiKeyId?: string | null;
}

export async function requireAuth(): Promise<AuthResult | NextResponse> {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const session = await getSession();
  if (session) {
    return {
      userId: session.userId,
      email: session.email,
      role: session.role as Role,
    };
  }
  const bearer = (await headers()).get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (bearer && bearer.length >= 8) {
    const apiKeyId = await getApiKeyIdIfValid(bearer);
    if (apiKeyId !== null) {
      return {
        userId: "api-key",
        email: "api-key@system",
        role: "manager" as Role,
        apiKeyId,
      };
    }
  }
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

export type ApiKeyLoggingContext = { params?: Promise<Record<string, string>> };
export type ApiKeyLoggingHandler = (
  req: NextRequest,
  auth: AuthResult,
  context?: ApiKeyLoggingContext
) => Promise<NextResponse>;

async function runWithApiKeyLogging(
  req: NextRequest,
  getAuth: () => Promise<AuthResult | NextResponse>,
  handler: ApiKeyLoggingHandler,
  context?: { params?: Promise<Record<string, string>> }
): Promise<NextResponse> {
  const auth = await getAuth();
  if (auth instanceof NextResponse) return auth;

  // อ่าน tokenLast4 ตอนต้น (ตอนที่ headers() ยังชัวร์) เฉพาะเมื่อ auth ผ่าน API key
  let tokenLast4: string | null = null;
  if (auth.apiKeyId) {
    const bearer = (await headers()).get("authorization")?.replace(/^Bearer\s+/i, "").trim();
    if (bearer && bearer.length >= 4) tokenLast4 = bearer.slice(-4);
  }

  let requestBody: unknown = undefined;
  if (["POST", "PUT", "PATCH"].includes(req.method ?? "")) {
    try {
      const clone = req.clone();
      requestBody = await clone.json();
    } catch {
      // ignore
    }
  }

  const res = await handler(req, auth, context);

  // บันทึก log เฉพาะเมื่อเรียกด้วย API key (ถ้า session/cookie จะไม่ log)
  if (auth.apiKeyId != null) {
    await logApiKeyRequestIfNeeded(req, {
      method: req.method ?? "GET",
      path: req.nextUrl.pathname,
      requestBody,
      responseStatus: res.status,
      responseBody: await res.clone().json().catch(() => null),
      apiKeyId: auth.apiKeyId,
      tokenLast4: tokenLast4 ?? undefined,
    });
  }
  return res;
}

/**
 * ห่อ route handler ด้วย permission + บันทึก API Request Log อัตโนมัติเมื่อ request ใช้ API key (Bearer).
 * ใช้กับทุก API route ที่ต้องการทั้ง auth และ log; log จะเขียนทุก endpoint ที่เรียกผ่าน API key.
 */
export function withApiKeyLogging(
  permission: string,
  handler: ApiKeyLoggingHandler
): (req: NextRequest, context?: ApiKeyLoggingContext) => Promise<NextResponse> {
  return (req: NextRequest, context?: ApiKeyLoggingContext) =>
    runWithApiKeyLogging(req, () => requirePermission(permission), handler, context);
}

/**
 * เหมือน withApiKeyLogging แต่ใช้ requireAuth() (ไม่เช็ค permission) สำหรับ route เช่น GET /api/auth/me.
 */
export function withApiKeyLoggingAuth(
  handler: ApiKeyLoggingHandler
): (req: NextRequest, context?: ApiKeyLoggingContext) => Promise<NextResponse> {
  return (req: NextRequest, context?: ApiKeyLoggingContext) =>
    runWithApiKeyLogging(req, requireAuth, handler, context);
}
