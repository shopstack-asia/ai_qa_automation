/**
 * POST /api/queue-monitor/clean – remove completed and failed jobs from the queue (so counts drop).
 * Admin only (VIEW_REPORTS).
 */

import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-auth";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { aiTestcaseQueue } from "@/lib/queue/ai-testcase-queue";

export async function POST() {
  const auth = await requirePermission(PERMISSIONS.VIEW_REPORTS);
  if (auth instanceof NextResponse) return auth;

  try {
    const [removedCompleted, removedFailed] = await Promise.all([
      aiTestcaseQueue.clean(0, 1000, "completed"),
      aiTestcaseQueue.clean(0, 1000, "failed"),
    ]);
    const counts = await aiTestcaseQueue.getJobCounts();
    return NextResponse.json({
      removed: { completed: removedCompleted.length, failed: removedFailed.length },
      counts: {
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        delayed: counts.delayed ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
      },
    });
  } catch (err) {
    console.error("[queue-monitor/clean]", err);
    return NextResponse.json(
      { error: "Clean failed", details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
