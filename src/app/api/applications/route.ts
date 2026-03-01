/**
 * GET /api/applications?projectId= | POST – create.
 */

import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { withApiKeyLogging } from "@/lib/auth/require-auth";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/client";
import { createApplicationSchema } from "@/lib/validations/schemas";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

export const GET = withApiKeyLogging(PERMISSIONS.VIEW_EXECUTION_RESULTS, async (req) => {
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }

  const search = req.nextUrl.searchParams.get("search")?.trim() ?? "";
  const platform = req.nextUrl.searchParams.get("platform")?.trim() || undefined;
  const enabledParam = req.nextUrl.searchParams.get("enabled")?.trim();
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page")) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || DEFAULT_LIMIT));
  const sortBy = (req.nextUrl.searchParams.get("sortBy")?.trim() || "name") as "name" | "code" | "platform" | "enabled" | "createdAt";
  const sortOrder = (req.nextUrl.searchParams.get("sortOrder")?.trim() || "asc") as "asc" | "desc";
  const skip = (page - 1) * limit;

  const where = {
    projectId,
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" as const } },
        { code: { contains: search, mode: "insensitive" as const } },
        { description: { contains: search, mode: "insensitive" as const } },
      ],
    }),
    ...(platform && { platform }),
    ...(enabledParam === "true" && { enabled: true }),
    ...(enabledParam === "false" && { enabled: false }),
  };

  const orderBy =
    sortBy === "name" ? { name: sortOrder } :
    sortBy === "code" ? { code: sortOrder } :
    sortBy === "platform" ? { platform: sortOrder } :
    sortBy === "enabled" ? { enabled: sortOrder } :
    sortBy === "createdAt" ? { createdAt: sortOrder } :
    { name: sortOrder };

  const [list, total] = await Promise.all([
    prisma.application.findMany({
      where,
      select: {
        id: true,
        projectId: true,
        name: true,
        code: true,
        description: true,
        enabled: true,
        platform: true,
        testTypes: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy,
      skip,
      take: limit,
    }),
    prisma.application.count({ where }),
  ]);

  return NextResponse.json({
    data: list,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  });
});

export const POST = withApiKeyLogging(PERMISSIONS.CREATE_TEST_CASES, async (req) => {
  const body = await req.json();
  const parsed = createApplicationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const app = await prisma.application.create({
    data: {
      projectId: parsed.data.projectId,
      name: parsed.data.name,
      code: parsed.data.code.trim(),
      description: parsed.data.description ?? null,
      enabled: parsed.data.enabled ?? true,
      platform: parsed.data.platform ?? null,
      testTypes: Array.isArray(parsed.data.testTypes) && parsed.data.testTypes.length > 0 ? parsed.data.testTypes : Prisma.DbNull,
    },
  });

  return NextResponse.json({
    id: app.id,
    projectId: app.projectId,
    name: app.name,
    code: app.code,
    description: app.description,
    enabled: app.enabled,
    platform: app.platform,
    testTypes: app.testTypes,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
  });
});
