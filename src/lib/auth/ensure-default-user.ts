/**
 * Ensure a default admin user exists when the system has no users.
 * Called on app startup (instrumentation) so login works even if seed was never run.
 */

import { prisma } from "@/lib/db/client";
import * as bcrypt from "bcryptjs";

const DEFAULT_EMAIL = "admin@qa.local";
const DEFAULT_PASSWORD = "admin-change-me";

export async function ensureDefaultUser(): Promise<void> {
  try {
    const count = await prisma.user.count();
    if (count > 0) return;

    const email = process.env.SEED_ADMIN_EMAIL ?? DEFAULT_EMAIL;
    const password = process.env.SEED_ADMIN_PASSWORD ?? DEFAULT_PASSWORD;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return;

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: "Admin",
        role: "admin",
      },
    });
    console.log("[ensureDefaultUser] Created default admin:", email);
  } catch (e) {
    console.error("[ensureDefaultUser] Failed:", e);
  }
}
