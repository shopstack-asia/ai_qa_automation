/**
 * GET /api/executions/[id] – single execution with step_log, video_url, etc.
 */

import { NextRequest, NextResponse } from "next/server";
import { withApiKeyLogging } from "@/lib/auth/require-auth";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/client";

export const GET = withApiKeyLogging(PERMISSIONS.VIEW_EXECUTION_RESULTS, async (_req, _auth, context) => {
  const params = await context?.params ?? {};
  const id = params.id as string;
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
});
