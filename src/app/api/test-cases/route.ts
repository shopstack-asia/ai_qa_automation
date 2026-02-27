/**
 * GET /api/test-cases?projectId= | POST – create.
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-auth";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/client";
import { createTestCaseSchema } from "@/lib/validations/schemas";

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
  const priority = req.nextUrl.searchParams.get("priority")?.trim() || undefined;
  const status = req.nextUrl.searchParams.get("status")?.trim() || undefined;
  const testType = req.nextUrl.searchParams.get("testType")?.trim() || undefined;
  const platform = req.nextUrl.searchParams.get("platform")?.trim() || undefined;
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page")) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || DEFAULT_LIMIT));
  const skip = (page - 1) * limit;
  const sortBy = req.nextUrl.searchParams.get("sortBy")?.trim() || "updatedAt";
  const sortOrder = req.nextUrl.searchParams.get("sortOrder")?.toLowerCase() === "asc" ? "asc" : "desc";

  const where: { projectId: string; title?: { contains: string; mode: "insensitive" }; priority?: string; status?: string; testType?: string | null; platform?: string | null } = {
    projectId,
  };
  if (search) {
    where.title = { contains: search, mode: "insensitive" };
  }
  if (priority) where.priority = priority;
  if (status) where.status = status;
  if (testType) where.testType = testType;
  if (platform) where.platform = platform;

  const orderField = ["title", "priority", "status", "updatedAt"].includes(sortBy) ? sortBy : "updatedAt";
  const orderBy = { [orderField]: sortOrder as "asc" | "desc" };

  const [list, total] = await Promise.all([
    prisma.testCase.findMany({
      where,
      select: {
        id: true,
        projectId: true,
        title: true,
        priority: true,
        status: true,
        testType: true,
        platform: true,
        applicationId: true,
        application: { select: { id: true, name: true, code: true, platform: true, testTypes: true } },
        testSteps: true,
        expectedResult: true,
        category: true,
        data_condition: true,
        dataRequirement: true,
        setup_hint: true,
        ignoreReason: true,
        ticketId: true,
        primaryActor: true,
        source: true,
        createdAt: true,
        createdById: true,
        updatedAt: true,
      },
      orderBy,
      skip,
      take: limit,
    }),
    prisma.testCase.count({ where }),
  ]);

  const normalized = list.map((tc) => ({
    ...tc,
    dataRequirement: tc.dataRequirement ?? [],
  }));
  return NextResponse.json({
    data: normalized,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission(PERMISSIONS.CREATE_TEST_CASES);
  if (auth instanceof NextResponse) return auth;

  const parsed = createTestCaseSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let platform: string | null = parsed.data.platform ?? null;
  if (parsed.data.applicationId && !platform) {
    const app = await prisma.application.findUnique({
      where: { id: parsed.data.applicationId },
      select: { platform: true },
    });
    if (app?.platform) platform = app.platform;
  }

  let primaryActor: string | null = parsed.data.primaryActor ?? null;
  if (primaryActor === null && parsed.data.ticketId) {
    const ticket = await prisma.ticket.findUnique({
      where: { id: parsed.data.ticketId },
      select: { primaryActor: true },
    });
    primaryActor = ticket?.primaryActor ?? null;
  }

  const testCase = await prisma.testCase.create({
    data: {
      projectId: parsed.data.projectId,
      ticketId: parsed.data.ticketId ?? null,
      applicationId: parsed.data.applicationId ?? null,
      title: parsed.data.title,
      priority: (parsed.data.priority as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW") ?? "MEDIUM",
      status: (parsed.data.status as "DRAFT" | "READY" | "TESTING" | "PASSED" | "FAILED" | "CANCEL") ?? "DRAFT",
      testType: parsed.data.testType as "API" | "E2E" | undefined,
      platform,
      testSteps: parsed.data.testSteps ?? [],
      expectedResult: parsed.data.expectedResult ?? null,
      category: parsed.data.category ?? null,
      data_condition: parsed.data.data_condition ?? null,
      dataRequirement: Array.isArray(parsed.data.data_requirement) ? parsed.data.data_requirement : [],
      setup_hint: parsed.data.setup_hint ?? null,
      structuredPlan: parsed.data.structuredPlan ? (parsed.data.structuredPlan as object) : null,
      source: (parsed.data.source as "manual" | "import" | "n8n" | "AI") ?? "manual",
      primaryActor,
      createdById: auth.userId,
    },
  });
  return NextResponse.json({
    ...testCase,
    dataRequirement: testCase.dataRequirement ?? [],
  });
}
