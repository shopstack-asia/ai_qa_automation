/**
 * GET /api/projects/[id]/selector-knowledge - list selector knowledge for the project.
 * Supports: page, limit, search, applicationId (filter), sortBy, sortOrder.
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-auth";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/client";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

type SortField = "application" | "semanticKey" | "selector" | "usageCount" | "lastVerifiedAt";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(PERMISSIONS.VIEW_EXECUTION_RESULTS);
  if (auth instanceof NextResponse) return auth;

  const { id: projectId } = await params;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const search = req.nextUrl.searchParams.get("search")?.trim() ?? "";
  const applicationId = req.nextUrl.searchParams.get("applicationId")?.trim() || undefined;
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page")) || 1);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || DEFAULT_LIMIT)
  );
  const skip = (page - 1) * limit;
  const sortBy = (req.nextUrl.searchParams.get("sortBy")?.trim() || "lastVerifiedAt") as SortField;
  const sortOrder = req.nextUrl.searchParams.get("sortOrder")?.toLowerCase() === "asc" ? "asc" : "desc";

  const where: {
    projectId: string;
    applicationId?: string;
    OR?: Array<
      | { semanticKey: { contains: string; mode: "insensitive" } }
      | { selector: { contains: string; mode: "insensitive" } }
      | { application: { OR: Array<{ name: { contains: string; mode: "insensitive" } } | { code: { contains: string; mode: "insensitive" } }> } }
    >;
  } = { projectId };
  if (applicationId) where.applicationId = applicationId;
  if (search) {
    where.OR = [
      { semanticKey: { contains: search, mode: "insensitive" } },
      { selector: { contains: search, mode: "insensitive" } },
      {
        application: {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { code: { contains: search, mode: "insensitive" } },
          ],
        },
      },
    ];
  }

  const orderBy =
    sortBy === "application"
      ? { application: { name: sortOrder } }
      : sortBy === "semanticKey"
        ? { semanticKey: sortOrder }
        : sortBy === "selector"
          ? { selector: sortOrder }
          : sortBy === "usageCount"
            ? { usageCount: sortOrder }
            : { lastVerifiedAt: sortOrder };

  const [list, total] = await Promise.all([
    prisma.selectorKnowledge.findMany({
      where,
      include: {
        application: { select: { id: true, name: true, code: true } },
      },
      orderBy,
      skip,
      take: limit,
    }),
    prisma.selectorKnowledge.count({ where }),
  ]);

  return NextResponse.json({
    data: list.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      applicationId: row.applicationId,
      applicationName: row.application?.name ?? null,
      applicationCode: row.application?.code ?? null,
      semanticKey: row.semanticKey,
      selector: row.selector,
      confidenceScore: row.confidenceScore,
      usageCount: row.usageCount,
      lastVerifiedAt: row.lastVerifiedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  });
}
