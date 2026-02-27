/**
 * GET /api/tickets?projectId= | POST – create.
 */

import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-auth";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/client";
import { createTicketSchema } from "@/lib/validations/schemas";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

export async function GET(req: NextRequest) {
  const auth = await requirePermission(PERMISSIONS.VIEW_EXECUTION_RESULTS);
  if (auth instanceof NextResponse) return auth;

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }

  const search = req.nextUrl.searchParams.get("search")?.trim() ?? "";
  const status = req.nextUrl.searchParams.get("status")?.trim() || undefined;
  const priority = req.nextUrl.searchParams.get("priority")?.trim() || undefined;
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page")) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || DEFAULT_LIMIT));
  const sortBy = (req.nextUrl.searchParams.get("sortBy")?.trim() || "updatedAt") as "updatedAt" | "createdAt" | "title" | "status" | "priority";
  const sortOrder = (req.nextUrl.searchParams.get("sortOrder")?.trim() || "desc") as "asc" | "desc";
  const skip = (page - 1) * limit;

  const where: {
    projectId: string;
    OR?: Array<{ title?: { contains: string; mode: "insensitive" }; description?: { contains: string; mode: "insensitive" }; acceptanceCriteria?: { contains: string; mode: "insensitive" }; externalId?: { contains: string; mode: "insensitive" } }>;
    status?: string;
    priority?: string | null;
  } = { projectId };
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
      { acceptanceCriteria: { contains: search, mode: "insensitive" } },
      { externalId: { contains: search, mode: "insensitive" } },
    ];
  }
  if (status) where.status = status;
  if (priority) where.priority = priority;

  const orderBy =
    sortBy === "title" ? { title: sortOrder } :
    sortBy === "createdAt" ? { createdAt: sortOrder } :
    sortBy === "status" ? { status: sortOrder } :
    sortBy === "priority" ? { priority: sortOrder } :
    { updatedAt: sortOrder };

  const [list, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      select: {
        id: true,
        projectId: true,
        title: true,
        description: true,
        acceptanceCriteria: true,
        status: true,
        ai_status: true,
        externalId: true,
        priority: true,
        applicationIds: true,
        primaryActor: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { testCases: true } },
      },
      orderBy,
      skip,
      take: limit,
    }),
    prisma.ticket.count({ where }),
  ]);

  return NextResponse.json({
    data: list,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission(PERMISSIONS.CREATE_TEST_CASES);
  if (auth instanceof NextResponse) return auth;

  const parsed = createTicketSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const ticket = await prisma.ticket.create({
    data: {
      projectId: parsed.data.projectId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      acceptanceCriteria: parsed.data.acceptanceCriteria ?? null,
      status: "DRAFT",
      externalId: parsed.data.externalId ?? null,
      priority: parsed.data.priority ?? null,
      applicationIds: parsed.data.applicationIds?.length ? parsed.data.applicationIds : Prisma.DbNull,
      primaryActor: parsed.data.primaryActor ?? null,
    },
  });
  return NextResponse.json(ticket);
}
