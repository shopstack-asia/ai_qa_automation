/**
 * POST /api/queue-monitor/retry – retry a failed AI test case job. Body: { jobId: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-auth";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { aiTestcaseQueue } from "@/lib/queue/ai-testcase-queue";

export async function POST(req: NextRequest) {
  const auth = await requirePermission(PERMISSIONS.VIEW_REPORTS);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const jobId = typeof body.jobId === "string" ? body.jobId.trim() : null;
  if (!jobId) {
    return NextResponse.json({ error: "jobId required" }, { status: 400 });
  }

  try {
    const job = await aiTestcaseQueue.getJob(jobId);
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    const state = await job.getState();
    if (state !== "failed") {
      return NextResponse.json({ error: "Only failed jobs can be retried" }, { status: 400 });
    }
    await job.retry();
    return NextResponse.json({ ok: true, jobId });
  } catch (err) {
    console.error("[queue-monitor retry]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Retry failed" },
      { status: 500 }
    );
  }
}
