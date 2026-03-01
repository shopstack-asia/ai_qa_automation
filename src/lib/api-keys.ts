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
  const id = await getApiKeyIdIfValid(plainKey);
  return id !== null;
}

/** Returns the ApiKey id when the plain key is valid; null otherwise. Use for request logging. */
export async function getApiKeyIdIfValid(plainKey: string): Promise<string | null> {
  if (!plainKey || plainKey.length < 8) return null;
  const keys = await prisma.apiKey.findMany({ select: { id: true, keyHash: true } });
  for (const { id, keyHash } of keys) {
    const ok = await bcrypt.compare(plainKey, keyHash);
    if (ok) return id;
  }
  return null;
}
