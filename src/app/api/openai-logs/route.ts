/**
 * GET /api/openai-logs – list OpenAI request/response logs (Monitoring).
 * Query: page, limit, source (optional filter).
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-auth";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/client";

const SOURCES = ["generate-test-case-from-ticket", "generate-plan", "step-resolver"] as const;

export async function GET(req: NextRequest) {
  const auth = await requirePermission(PERMISSIONS.VIEW_REPORTS);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20));
  const source = searchParams.get("source") ?? undefined;
  const sourceFilter =
    source && SOURCES.includes(source as (typeof SOURCES)[number]) ? source : undefined;

  const where = sourceFilter ? { source: sourceFilter } : {};
  const skip = (page - 1) * limit;

  const [list, total] = await Promise.all([
    prisma.openAILog.findMany({
      where,
      select: {
        id: true,
        source: true,
        model: true,
        requestPayload: true,
        responsePayload: true,
        promptTokens: true,
        completionTokens: true,
        totalTokens: true,
        estimatedCostUsd: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.openAILog.count({ where }),
  ]);

  return NextResponse.json({
    data: list,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  });
}
