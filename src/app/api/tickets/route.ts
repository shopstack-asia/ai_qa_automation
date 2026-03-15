/**
 * GET /api/tickets?projectId= | POST – create.
 * When created via API (Bearer API key): status READY_TO_TEST + ส่ง job สร้าง TC ไปรันใน background (queue).
 * Log ผ่าน withApiKeyLogging (ทุก endpoint ที่เรียกด้วย API key จะถูก log ที่กลาง).
 */

import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { withApiKeyLogging } from "@/lib/auth/require-auth";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/client";
import { getConfig } from "@/lib/config";
import { createTicketSchema } from "@/lib/validations/schemas";
import { enqueueAITestcaseJob } from "@/lib/queue/ai-testcase-queue";
import { sendSlackNotification } from "@/lib/slack/send-message";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

export const GET = withApiKeyLogging(PERMISSIONS.VIEW_EXECUTION_RESULTS, async (req) => {
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
});

export const POST = withApiKeyLogging(PERMISSIONS.CREATE_TEST_CASES, async (req, auth) => {
  const parsed = createTicketSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let projectId: string;
  if (parsed.data.projectId) {
    projectId = parsed.data.projectId;
    const exists = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!exists) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
  } else {
    const project = await prisma.project.findFirst({
      where: { jiraProjectKey: { equals: parsed.data.projectKey!.trim(), mode: "insensitive" } },
      select: { id: true },
    });
    if (!project) {
      return NextResponse.json(
        { error: `No project found with Jira project key: ${parsed.data.projectKey}` },
        { status: 404 }
      );
    }
    projectId = project.id;
  }

  let applicationIds: string[] | undefined;
  if (parsed.data.applicationIds?.length) {
    applicationIds = parsed.data.applicationIds;
  } else if (parsed.data.applicationCodes?.length) {
    const codes = [...new Set(parsed.data.applicationCodes.map((c) => c.trim()).filter(Boolean))];
    const apps = await prisma.application.findMany({
      where: {
        projectId,
        OR: codes.map((code) => ({ code: { equals: code, mode: "insensitive" } })),
      },
      select: { id: true, code: true },
    });
    const foundCodes = new Set(apps.map((a) => a.code.toUpperCase()));
    const missing = codes.filter((c) => !foundCodes.has(c.toUpperCase()));
    if (missing.length) {
      return NextResponse.json(
        { error: `Application(s) not found for project: ${missing.join(", ")}` },
        { status: 404 }
      );
    }
    applicationIds = apps.map((a) => a.id);
  }

  const isApiKeyAuth = auth.userId === "api-key";
  const ticket = await prisma.ticket.create({
    data: {
      projectId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      acceptanceCriteria: parsed.data.acceptanceCriteria ?? null,
      status: isApiKeyAuth ? "READY_TO_TEST" : "DRAFT",
      externalId: parsed.data.externalId ?? null,
      priority: parsed.data.priority ?? null,
      applicationIds: applicationIds?.length ? applicationIds : Prisma.DbNull,
      primaryActor: parsed.data.primaryActor ?? null,
    },
  });

  // Slack: New ticket notification (fire-and-forget; do not fail request)
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { slackChannelId: true, name: true },
  });
  if (project?.slackChannelId) {
    sendSlackNotification("new_ticket", {
      channelId: project.slackChannelId,
      text: `New ticket: *${ticket.title}*${ticket.externalId ? ` (${ticket.externalId})` : ""}\nProject: ${project.name}\nStatus: ${ticket.status}`,
    }).catch(() => {});
  }

  let payload: Record<string, unknown> = { ...ticket };
  if (isApiKeyAuth) {
    const config = await getConfig();
    const queueEnabled = (config.ai_queue_enabled ?? "true").toLowerCase() !== "false";
    if (queueEnabled) {
      try {
        const jobId = await enqueueAITestcaseJob({ ticketId: ticket.id, retryCount: 0 });
        payload.autoGenerateQueued = jobId !== null;
        if (jobId) payload.autoGenerateJobId = jobId;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await prisma.ticket.update({
          where: { id: ticket.id },
          data: { status: "DRAFT" },
        });
        payload = { ...ticket, status: "DRAFT" };
        payload.autoGenerateQueued = false;
        payload.autoGenerateError = "Failed to queue TC generation. Check Redis (REDIS_URL).";
      }
    } else {
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: { status: "DRAFT" },
      });
      payload = { ...ticket, status: "DRAFT" };
      payload.autoGenerateQueued = false;
      payload.autoGenerateError = "AI test case queue is disabled (Config: ai_queue_enabled).";
    }
  }

  return NextResponse.json(payload);
});
