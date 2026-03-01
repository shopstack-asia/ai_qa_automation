/**
 * Log request/response when API is called with API key (N8N / external integration).
 * ใช้ฟังก์ชันกลาง logApiKeyRequestIfNeeded() จากทุก route ที่ต้องการบันทึก log
 */

import type { NextRequest } from "next/server";
import { headers } from "next/headers";
import { getApiKeyIdIfValid } from "@/lib/api-keys";
import { prisma } from "@/lib/db/client";

export interface ApiKeyRequestLogInput {
  apiKeyId: string | null | undefined;
  /** Last 4 characters of the Bearer token (for display in log, e.g. "••••5Byb"). */
  tokenLast4?: string | null;
  method: string;
  path: string;
  requestBody?: unknown;
  responseStatus: number;
  responseBody?: unknown;
}

/** Persist API key request/response to ApiKeyRequestLog. Fire-and-forget; errors are logged only. */
export async function saveApiKeyRequestLog(input: ApiKeyRequestLogInput): Promise<void> {
  try {
    const requestBody =
      input.requestBody != null ? (JSON.parse(JSON.stringify(input.requestBody)) as object) : undefined;
    const responseBody =
      input.responseBody != null ? (JSON.parse(JSON.stringify(input.responseBody)) as object) : undefined;
    await prisma.apiKeyRequestLog.create({
      data: {
        apiKeyId: input.apiKeyId ?? null,
        tokenLast4:
          input.tokenLast4 != null && input.tokenLast4.length > 0
            ? input.tokenLast4.slice(-4)
            : null,
        method: input.method,
        path: input.path,
        requestBody,
        responseStatus: input.responseStatus,
        responseBody,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ApiKeyRequestLog] save failed:", msg);
    if (err instanceof Error && err.stack) {
      console.error(err.stack);
    }
  }
}

/** Helper to get path from NextRequest. */
export function getPathFromRequest(req: NextRequest): string {
  return req.nextUrl.pathname;
}

export interface LogApiKeyRequestOptions {
  method: string;
  path: string;
  requestBody?: unknown;
  responseStatus: number;
  responseBody?: unknown;
  /** เมื่อ wrapper ส่งมา = แน่ใจว่า auth ผ่าน API key แล้ว, ไม่ต้องอ่าน headers() อีก */
  apiKeyId?: string | null;
  tokenLast4?: string | null;
}

/**
 * บันทึก request/response ลง ApiKeyRequestLog.
 * - ถ้า options มี apiKeyId (ส่งจาก wrapper) = ใช้เลย ไม่ต้องอ่าน headers()
 * - ถ้าไม่มี = อ่าน Authorization แล้วเช็ค Bearer ความยาว >= 8 และ getApiKeyIdIfValid (สำหรับกรณีเรียกจากที่อื่น)
 */
export async function logApiKeyRequestIfNeeded(
  req: NextRequest,
  options: LogApiKeyRequestOptions
): Promise<void> {
  let apiKeyId: string | null = options.apiKeyId ?? null;
  let tokenLast4: string | null = options.tokenLast4 ?? null;

  if (apiKeyId == null) {
    const authHeader = (await headers()).get("authorization") ?? "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (bearer.length < 8) return;
    apiKeyId = await getApiKeyIdIfValid(bearer);
    tokenLast4 = bearer.slice(-4);
  }

  await saveApiKeyRequestLog({
    apiKeyId,
    tokenLast4,
    method: options.method,
    path: options.path,
    requestBody: options.requestBody,
    responseStatus: options.responseStatus,
    responseBody: options.responseBody,
  });
}
