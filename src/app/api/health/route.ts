/**
 * GET /api/health – system health (Redis, DB). No auth for internal checks.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { createRedisConnection } from "@/lib/queue/config";

/** Skip DB/Redis during Next.js build (no services available in Docker build). */
const isBuildTime = () => process.env.NEXT_PHASE === "phase-production-build";

export async function GET() {
  if (isBuildTime()) {
    return NextResponse.json({ db: "down", redis: "down" }, { status: 503 });
  }

  const status: { db: "up" | "down"; redis: "up" | "down" } = {
    db: "down",
    redis: "down",
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    status.db = "up";
  } catch {
    // leave db down
  }

  try {
    const redis = createRedisConnection();
    await redis.ping();
    redis.disconnect();
    status.redis = "up";
  } catch {
    // leave redis down
  }

  const healthy = status.db === "up" && status.redis === "up";
  return NextResponse.json(status, { status: healthy ? 200 : 503 });
}
