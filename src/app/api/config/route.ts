/**
 * GET /api/config – system config (admin), sensitive keys masked.
 * PATCH – set one key or bulk { key1: value1, ... }; sensitive keys: empty or mask = keep existing.
 */

import { NextRequest, NextResponse } from "next/server";
import { withApiKeyLogging } from "@/lib/auth/require-auth";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/client";
import {
  getConfigForDisplay,
  CONFIG_KEYS,
  SENSITIVE_KEYS,
  MASKED_VALUE,
  clearConfigCache,
} from "@/lib/config";
import { z } from "zod";

const setOneSchema = z.object({ key: z.string(), value: z.string(), description: z.string().optional() });
const bulkSchema = z.record(z.string(), z.string());

export const GET = withApiKeyLogging(PERMISSIONS.MANAGE_GLOBAL_CONFIG, async (_req) => {
  const config = await getConfigForDisplay();
  return NextResponse.json(config);
});

export const PATCH = withApiKeyLogging(PERMISSIONS.MANAGE_GLOBAL_CONFIG, async (req, auth) => {
  const body = await req.json();

  if (typeof body.key === "string" && body.value !== undefined) {
    const parsed = setOneSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    if (!CONFIG_KEYS.includes(parsed.data.key as (typeof CONFIG_KEYS)[number])) {
      return NextResponse.json({ error: "Invalid config key" }, { status: 400 });
    }
    const { key, value, description } = parsed.data;
    const isSensitive = SENSITIVE_KEYS.includes(key as (typeof SENSITIVE_KEYS)[number]);
    if (isSensitive && (value === "" || value === MASKED_VALUE)) {
      return NextResponse.json({ key, skipped: true });
    }
    const updatedBy = (await prisma.user.findUnique({ where: { id: auth.userId }, select: { id: true } }))
      ? auth.userId
      : null;
    await prisma.systemConfig.upsert({
      where: { key },
      create: { key, value, description: description ?? null, updatedByUserId: updatedBy },
      update: { value, description: description ?? undefined, updatedByUserId: updatedBy },
    });
    clearConfigCache();
    return NextResponse.json({ key, value: isSensitive ? MASKED_VALUE : value });
  }

  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const updates: { key: string; value: string }[] = [];
  for (const [key, value] of Object.entries(parsed.data)) {
    if (!CONFIG_KEYS.includes(key as (typeof CONFIG_KEYS)[number])) continue;
    const isSensitive = SENSITIVE_KEYS.includes(key as (typeof SENSITIVE_KEYS)[number]);
    if (isSensitive && (value === "" || value === MASKED_VALUE)) continue;
    updates.push({ key, value });
  }

  const updatedBy = (await prisma.user.findUnique({ where: { id: auth.userId }, select: { id: true } }))
    ? auth.userId
    : null;
  for (const { key, value } of updates) {
    await prisma.systemConfig.upsert({
      where: { key },
      create: { key, value, updatedByUserId: updatedBy },
      update: { value, updatedByUserId: updatedBy },
    });
  }
  clearConfigCache();
  return NextResponse.json({ updated: updates.length, keys: updates.map((u) => u.key) });
});
