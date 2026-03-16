/**
 * POST /api/tickets/import – bulk create tickets. Body: { projectId, tickets: [{ title, description?, acceptanceCriteria?, externalId?, priority?, platforms? }] }
 */

import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { withApiKeyLogging } from "@/lib/auth/require-auth";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/client";
import { sendSlackNotification } from "@/lib/slack/send-message";
import { importTicketsSchema } from "@/lib/validations/schemas";

export const POST = withApiKeyLogging(PERMISSIONS.CREATE_TEST_CASES, async (req) => {
  const parsed = importTicketsSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { projectId, tickets } = parsed.data;

  const externalIds = tickets.map((t) => t.externalId?.trim()).filter((id): id is string => !!id);
  const existing = externalIds.length
    ? await prisma.ticket.findMany({
        where: { projectId, externalId: { in: externalIds } },
        select: { id: true, externalId: true },
      })
    : [];
  const existingSet = new Set(existing.map((e) => e.externalId).filter((id): id is string => !!id));

  const toCreate = tickets.filter((t) => {
    const ext = t.externalId?.trim();
    return !ext || !existingSet.has(ext);
  });
  const duplicates = tickets
    .filter((t) => {
      const ext = t.externalId?.trim();
      return !!ext && existingSet.has(ext);
    })
    .map((t) => t.externalId!.trim());

  const created =
    toCreate.length > 0
      ? await prisma.$transaction(
          toCreate.map((t) =>
            prisma.ticket.create({
              data: {
                projectId,
                title: t.title,
                description: t.description ?? null,
                acceptanceCriteria: t.acceptanceCriteria ?? null,
                status: "DRAFT",
                externalId: t.externalId ?? null,
                priority: t.priority ?? null,
                applicationIds: t.applicationIds?.length ? t.applicationIds : Prisma.DbNull,
              },
            })
          )
        )
      : [];

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { slackChannelId: true, name: true },
  });
  if (project?.slackChannelId && created.length > 0) {
    sendSlackNotification("new_ticket", {
      channelId: project.slackChannelId,
      text: `${created.length} ticket(s) imported in *${project.name}*: ${created.map((c) => c.title).slice(0, 5).join(", ")}${created.length > 5 ? "…" : ""}`,
    }).catch(() => {});
  }

  return NextResponse.json({
    created: created.length,
    ids: created.map((c) => c.id),
    duplicates,
  });
});
