/**
 * Session from request: cookie or Authorization header.
 */

import { cookies, headers } from "next/headers";
import { verify } from "./jwt";

const COOKIE_NAME = "qa_session";

export async function getSession(): Promise<{ userId: string; email: string; role: string } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value ?? headers().get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  try {
    const payload = await verify(token);
    return { userId: payload.sub, email: payload.email, role: payload.role };
  } catch {
    return null;
  }
}

export function sessionCookieName(): string {
  return COOKIE_NAME;
}
