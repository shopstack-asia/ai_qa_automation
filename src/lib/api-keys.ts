/**
 * API key storage (bcrypt hash) and verification for N8N / external callers.
 */

import * as bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/client";

const SALT_ROUNDS = 10;

export async function hashApiKey(plainKey: string): Promise<string> {
  return bcrypt.hash(plainKey, SALT_ROUNDS);
}

export async function verifyApiKey(plainKey: string): Promise<boolean> {
  if (!plainKey || plainKey.length < 8) return false;
  const keys = await prisma.apiKey.findMany({ select: { keyHash: true } });
  for (const { keyHash } of keys) {
    const ok = await bcrypt.compare(plainKey, keyHash);
    if (ok) return true;
  }
  return false;
}
