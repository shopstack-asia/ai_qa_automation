/**
 * GET /api/monitoring/api-request-logs – list API key request/response logs (Monitoring).
 * Query: page, limit, path (optional filter).
 */

import { NextRequest, NextResponse } from "next/server";
import { withApiKeyLogging } from "@/lib/auth/require-auth";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/client";

export const GET = withApiKeyLogging(PERMISSIONS.VIEW_REPORTS, async (req) => {
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20));
  const pathFilter = searchParams.get("path")?.trim() || undefined;
  const skip = (page - 1) * limit;

  const where = pathFilter ? { path: { contains: pathFilter, mode: "insensitive" as const } } : {};

  const model = prisma.apiKeyRequestLog;
  if (!model) {
    return NextResponse.json({
      data: [],
      total: 0,
      page: 1,
      limit,
      totalPages: 0,
    });
  }

  const [list, total] = await Promise.all([
    model.findMany({
      where,
      select: {
        id: true,
        apiKeyId: true,
        apiKey: { select: { name: true } },
        tokenLast4: true,
        method: true,
        path: true,
        requestBody: true,
        responseStatus: true,
        responseBody: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    model.count({ where }),
  ]);

  return NextResponse.json({
    data: list,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  });
});
