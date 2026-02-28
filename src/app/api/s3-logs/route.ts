/**
 * GET /api/s3-logs – list executions that have S3 artifacts (video or screenshots). Monitoring.
 * Query: page, limit.
 */

import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-auth";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/client";

export async function GET(req: NextRequest) {
  const auth = await requirePermission(PERMISSIONS.VIEW_REPORTS);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20));
  const skip = (page - 1) * limit;

  const where = {
    OR: [
      { videoUrl: { not: null } },
      { screenshotUrls: { not: Prisma.DbNull } },
    ],
  };

  const [list, total] = await Promise.all([
    prisma.execution.findMany({
      where,
      select: {
        id: true,
        status: true,
        executionMetadata: true,
        videoUrl: true,
        screenshotUrls: true,
        finishedAt: true,
        duration: true,
        testCaseId: true,
        testCase: { select: { id: true, title: true } },
        project: { select: { id: true, name: true } },
      },
      orderBy: { finishedAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.execution.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit) || 1;

  return NextResponse.json({
    data: list.map((e) => {
      const meta = e.executionMetadata as { execution_status?: string } | null;
      return {
        id: e.id,
        status: e.status,
        execution_status: meta?.execution_status ?? e.status,
        videoUrl: e.videoUrl,
        screenshotCount: Array.isArray(e.screenshotUrls) ? e.screenshotUrls.length : 0,
        finishedAt: e.finishedAt,
        duration: e.duration,
        testCaseId: e.testCaseId,
        testCaseTitle: e.testCase?.title ?? null,
        projectId: e.project?.id ?? null,
        projectName: e.project?.name ?? null,
      };
    }),
    total,
    page,
    limit,
    totalPages,
  });
}
