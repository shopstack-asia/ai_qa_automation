/**
 * POST /api/tickets/import – bulk create tickets. Body: { projectId, tickets: [{ title, description?, acceptanceCriteria?, externalId?, priority?, platforms? }] }
 */

import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { withApiKeyLogging } from "@/lib/auth/require-auth";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/client";
import { importTicketsSchema } from "@/lib/validations/schemas";

export const POST = withApiKeyLogging(PERMISSIONS.CREATE_TEST_CASES, async (req) => {
  const parsed = importTicketsSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { projectId, tickets } = parsed.data;
  const created = await prisma.$transaction(
    tickets.map((t) =>
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
  );

  return NextResponse.json({ created: created.length, ids: created.map((c) => c.id) });
});
