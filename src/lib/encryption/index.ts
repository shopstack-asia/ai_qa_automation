/**
 * Field-level encryption for credentials (username, password, api_token, n8n_webhook_token).
 * Uses AES-256-GCM with key from env ENCRYPTION_KEY (32-byte hex or base64).
 * Fails fast if key is missing or invalid.
 */

import * as crypto from "crypto";

const ALGORITHM = "AES-256-GCM";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw || raw.length < 32) {
    throw new Error("ENCRYPTION_KEY must be set and at least 32 characters (e.g. 64-char hex)");
  }
  if (raw.length === 64 && /^[0-9a-fA-F]+$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  return Buffer.from(raw.slice(0, 32), "utf8");
}

export function encrypt(plaintext: string): string {
  if (!plaintext) return "";
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH } as crypto.CipherGCMOptions);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = (cipher as crypto.CipherGCM).getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decrypt(ciphertext: string): string {
  if (!ciphertext) return "";
  const key = getKey();
  const buf = Buffer.from(ciphertext, "base64");
  if (buf.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error("Invalid encrypted payload");
  }
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const enc = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH } as crypto.CipherGCMOptions);
  (decipher as crypto.DecipherGCM).setAuthTag(tag);
  return decipher.update(enc).toString("utf8") + decipher.final("utf8");
}
