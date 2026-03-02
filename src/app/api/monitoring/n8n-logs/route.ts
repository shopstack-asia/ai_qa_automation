/**
 * GET /api/monitoring/n8n-logs – list N8N webhook call logs (outgoing to N8N).
 * Query: page, limit, event (optional filter).
 */

import { NextRequest, NextResponse } from "next/server";
import { withApiKeyLogging } from "@/lib/auth/require-auth";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/client";

export const GET = withApiKeyLogging(PERMISSIONS.VIEW_REPORTS, async (req) => {
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20));
  const eventFilter = searchParams.get("event")?.trim() || undefined;
  const skip = (page - 1) * limit;

  const where = eventFilter ? { event: eventFilter } : {};

  const [list, total] = await Promise.all([
    prisma.n8nWebhookLog.findMany({
      where,
      select: {
        id: true,
        event: true,
        url: true,
        requestBody: true,
        responseStatus: true,
        responseBody: true,
        errorMessage: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.n8nWebhookLog.count({ where }),
  ]);

  return NextResponse.json({
    data: list,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  });
});
