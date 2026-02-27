/**
 * GET /api/projects/[id]/data-knowledge - list data knowledge for the project.
 * POST - create data knowledge entry.
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-auth";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/client";
import { createDataKnowledgeSchema } from "@/lib/validations/schemas";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

type SortField = "key" | "type" | "scenario" | "role" | "updatedAt";

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
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page")) || 1);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || DEFAULT_LIMIT)
  );
  const skip = (page - 1) * limit;
  const sortBy = (req.nextUrl.searchParams.get("sortBy")?.trim() || "updatedAt") as SortField;
  const sortOrder = req.nextUrl.searchParams.get("sortOrder")?.toLowerCase() === "asc" ? "asc" : "desc";

  const where: { projectId: string; OR?: Array<{ key?: { contains: string; mode: "insensitive" }; type?: { contains: string; mode: "insensitive" }; scenario?: { contains: string; mode: "insensitive" }; role?: { contains: string; mode: "insensitive" } }> } = { projectId };
  if (search) {
    where.OR = [
      { key: { contains: search, mode: "insensitive" } },
      { type: { contains: search, mode: "insensitive" } },
      { scenario: { contains: search, mode: "insensitive" } },
      { role: { contains: search, mode: "insensitive" } },
    ];
  }

  const orderBy =
    sortBy === "key" ? { key: sortOrder } :
    sortBy === "type" ? { type: sortOrder } :
    sortBy === "scenario" ? { scenario: sortOrder } :
    sortBy === "role" ? { role: sortOrder } :
    { updatedAt: sortOrder };

  const [list, total] = await Promise.all([
    prisma.dataKnowledge.findMany({
      where,
      orderBy,
      skip,
      take: limit,
    }),
    prisma.dataKnowledge.count({ where }),
  ]);

  return NextResponse.json({
    data: list,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(PERMISSIONS.EDIT_TEST_CASES);
  if (auth instanceof NextResponse) return auth;

  const { id: projectId } = await params;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = createDataKnowledgeSchema.safeParse({ ...body, projectId });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const p = parsed.data;
  const row = await prisma.dataKnowledge.create({
    data: {
      projectId,
      key: p.key,
      type: p.type,
      scenario: p.scenario,
      role: p.role ?? null,
      value: p.value,
    },
  });

  return NextResponse.json(row);
}
