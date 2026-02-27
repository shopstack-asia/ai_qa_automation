/**
 * GET /api/environments?projectId= | POST – create (manager+).
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-auth";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/client";
import { createEnvironmentSchema } from "@/lib/validations/schemas";
import { encrypt } from "@/lib/encryption";

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
  const type = req.nextUrl.searchParams.get("type")?.trim() || undefined;
  const isActiveParam = req.nextUrl.searchParams.get("isActive")?.trim();
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page")) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || DEFAULT_LIMIT));
  const sortBy = (req.nextUrl.searchParams.get("sortBy")?.trim() || "name") as "name" | "baseUrl" | "type" | "isActive" | "createdAt";
  const sortOrder = (req.nextUrl.searchParams.get("sortOrder")?.trim() || "asc") as "asc" | "desc";
  const skip = (page - 1) * limit;

  const where = {
    projectId,
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" as const } },
        { baseUrl: { contains: search, mode: "insensitive" as const } },
      ],
    }),
    ...(type === "API" || type === "E2E" ? { type: type as "API" | "E2E" } : {}),
    ...(isActiveParam === "true" && { isActive: true }),
    ...(isActiveParam === "false" && { isActive: false }),
  };

  const orderBy =
    sortBy === "name" ? { name: sortOrder } :
    sortBy === "baseUrl" ? { baseUrl: sortOrder } :
    sortBy === "type" ? { type: sortOrder } :
    sortBy === "isActive" ? { isActive: sortOrder } :
    sortBy === "createdAt" ? { createdAt: sortOrder } :
    { name: sortOrder };

  const [list, total] = await Promise.all([
    prisma.environment.findMany({
      where,
      select: {
        id: true,
        projectId: true,
        name: true,
        baseUrl: true,
        platform: true,
        applicationId: true,
        application: { select: { id: true, name: true, code: true, platform: true, testTypes: true } },
        type: true,
        isActive: true,
        apiAuthMode: true,
        e2eAuthMode: true,
        createdAt: true,
      },
      orderBy,
      skip,
      take: limit,
    }),
    prisma.environment.count({ where }),
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

  const body = await req.json();
  const parsed = createEnvironmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const type = parsed.data.type as "API" | "E2E";
  const apiAuthMode = (parsed.data.apiAuthMode as string) ?? "NONE";
  const credentialsEnc =
    type === "E2E" && Array.isArray(parsed.data.credentials) && parsed.data.credentials.length > 0
      ? encrypt(JSON.stringify(parsed.data.credentials))
      : null;
  const isBearer = type === "API" && apiAuthMode === "BEARER_TOKEN";
  const isBasic = type === "API" && apiAuthMode === "BASIC_AUTH";
  const apiTokenEnc =
    isBearer && parsed.data.apiToken ? encrypt(parsed.data.apiToken) : null;
  const appKeyEnc =
    isBasic && parsed.data.appKey ? encrypt(parsed.data.appKey) : null;
  const secretKeyEnc =
    isBasic && parsed.data.secretKey ? encrypt(parsed.data.secretKey) : null;

  let platform: string | null = parsed.data.platform?.trim() || null;
  if (parsed.data.applicationId && !platform) {
    const app = await prisma.application.findUnique({
      where: { id: parsed.data.applicationId },
      select: { platform: true },
    });
    if (app?.platform) platform = app.platform;
  }

  const env = await prisma.environment.create({
    data: {
      projectId: parsed.data.projectId,
      name: parsed.data.name,
      baseUrl: parsed.data.baseUrl,
      applicationId: parsed.data.applicationId || null,
      platform,
      type,
      isActive: true,
      apiTokenEnc: isBearer ? apiTokenEnc : null,
      appKeyEnc: isBasic ? appKeyEnc : null,
      secretKeyEnc: isBasic ? secretKeyEnc : null,
      credentialsEnc,
      apiAuthMode: parsed.data.apiAuthMode ?? "NONE",
      e2eAuthMode: parsed.data.e2eAuthMode ?? "NEVER_AUTH",
    },
  });

  return NextResponse.json({
    id: env.id,
    projectId: env.projectId,
    name: env.name,
    baseUrl: env.baseUrl,
    applicationId: env.applicationId,
    platform: env.platform,
    type: env.type,
    isActive: env.isActive,
    apiAuthMode: env.apiAuthMode,
    e2eAuthMode: env.e2eAuthMode,
    createdAt: env.createdAt,
  });
}
