/**
 * GET /api/tickets/[id] | PATCH | DELETE.
 * When status is updated to READY_TO_TEST, enqueues AI test case generation job (no direct OpenAI call).
 */

import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-auth";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/client";
import { getConfig } from "@/lib/config";
import { updateTicketSchema } from "@/lib/validations/schemas";
import { enqueueAITestcaseJob } from "@/lib/queue/ai-testcase-queue";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(PERMISSIONS.VIEW_EXECUTION_RESULTS);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, name: true } },
      testCases: {
        select: { id: true, title: true, status: true, priority: true },
      },
    },
  });
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(ticket);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(PERMISSIONS.EDIT_TEST_CASES);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const parsed = updateTicketSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const before = await prisma.ticket.findUnique({ where: { id }, select: { status: true } });
  const newStatus = parsed.data.status as string | undefined;
  const movingToReady = newStatus === "READY_TO_TEST" && before?.status !== "READY_TO_TEST";

  let aiQueueDisabled = false;
  let jobAlreadyQueued = false;
  let jobId: string | null = null;

  if (movingToReady) {
    const config = await getConfig();
    const queueEnabled = (config.ai_queue_enabled ?? "true").toLowerCase() !== "false";
    if (!queueEnabled) {
      aiQueueDisabled = true;
    } else {
      try {
        jobId = await enqueueAITestcaseJob({ ticketId: id, retryCount: 0 });
        jobAlreadyQueued = jobId === null;
      } catch (err) {
        console.error("[tickets] enqueue AI testcase job failed:", err);
        return NextResponse.json(
          {
            error: "Failed to enqueue AI job. Check Redis (REDIS_URL) and try again.",
            aiQueueError: true,
          },
          { status: 500 }
        );
      }
    }
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.description !== undefined) data.description = parsed.data.description ?? null;
  if (parsed.data.acceptanceCriteria !== undefined) data.acceptanceCriteria = parsed.data.acceptanceCriteria ?? null;
  if (parsed.data.status !== undefined) data.status = parsed.data.status;
  if (movingToReady && jobId !== null) data.ai_status = "QUEUED";
  if (parsed.data.externalId !== undefined) data.externalId = parsed.data.externalId ?? null;
  if (parsed.data.priority !== undefined) data.priority = parsed.data.priority ?? null;
  if (parsed.data.applicationIds !== undefined) data.applicationIds = parsed.data.applicationIds?.length ? parsed.data.applicationIds : Prisma.DbNull;
  if (parsed.data.primaryActor !== undefined) data.primaryActor = parsed.data.primaryActor;

  const ticket = await prisma.ticket.update({
    where: { id },
    data: data as Parameters<typeof prisma.ticket.update>[0]["data"],
  });

  if (parsed.data.primaryActor !== undefined) {
    await prisma.testCase.updateMany({
      where: { ticketId: id },
      data: { primaryActor: parsed.data.primaryActor },
    });
  }

  return NextResponse.json({
    ...ticket,
    aiGenerationTriggered: jobId !== null,
    aiQueueDisabled,
    jobAlreadyQueued,
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(PERMISSIONS.EDIT_TEST_CASES);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const ticket = await prisma.ticket.findUnique({ where: { id } });
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.ticket.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
