/**
 * Redis connection for BullMQ. Shared by API (producer) and worker (consumer).
 * Connection is lazy so Next.js build (no Redis available) does not try to connect.
 */

import IORedis from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

export function createRedisConnection(): IORedis {
  return new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
  });
}

export const QUEUE_NAMES = {
  EXECUTION: "qa-execution",
  AI_TESTCASE_GENERATION: "ai-testcase-generation",
  SCHEDULER_TICK: "qa-scheduler-tick",
  CREATE_TEST_RUN: "qa-create-test-run",
  ORCHESTRATOR: "qa-orchestrator",
} as const;
