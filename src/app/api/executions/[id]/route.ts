/**
 * GET /api/executions/[id] – single execution with step_log, video_url, etc.
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-auth";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/client";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(PERMISSIONS.VIEW_EXECUTION_RESULTS);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const execution = await prisma.execution.findUnique({
    where: { id },
    include: {
      testCase: true,
      environment: { select: { id: true, name: true, baseUrl: true, type: true } },
      project: { select: { id: true, name: true } },
    },
  });
  if (!execution) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(execution);
}
