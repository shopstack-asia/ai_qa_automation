/**
 * GET /api/queue-monitor – stats and job list for AI test case generation queue.
 * Admin only (VIEW_REPORTS).
 */

import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-auth";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { aiTestcaseQueue } from "@/lib/queue/ai-testcase-queue";

export async function GET() {
  const auth = await requirePermission(PERMISSIONS.VIEW_REPORTS);
  if (auth instanceof NextResponse) return auth;

  try {
    const counts = await aiTestcaseQueue.getJobCounts();
    const [waiting, active, failed] = await Promise.all([
      aiTestcaseQueue.getJobs(["waiting"], 0, 99),
      aiTestcaseQueue.getJobs(["active"], 0, 99),
      aiTestcaseQueue.getJobs(["failed"], 0, 99),
    ]);

    const mapJob = (j: { id?: string; data?: { ticketId: string; retryCount: number }; failedReason?: string; timestamp?: number }) => ({
      id: j.id,
      ticketId: j.data?.ticketId ?? null,
      retryCount: j.data?.retryCount ?? 0,
      lastError: j.failedReason ?? null,
      timestamp: j.timestamp ?? null,
    });

    return NextResponse.json({
      counts: {
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        delayed: counts.delayed ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
      },
      jobs: {
        waiting: waiting.map(mapJob),
        active: active.map(mapJob),
        failed: failed.map(mapJob),
      },
    });
  } catch (err) {
    console.error("[queue-monitor]", err);
    return NextResponse.json(
      { error: "Failed to read queue", details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
