/**
 * Runs when the Next.js server starts. Ensures a default admin user exists if the system has none.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureDefaultUser } = await import("@/lib/auth/ensure-default-user");
    await ensureDefaultUser();
  }
}
