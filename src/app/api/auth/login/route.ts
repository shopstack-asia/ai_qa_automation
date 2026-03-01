/**
 * POST /api/auth/login – email + password, returns JWT and sets cookie.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { sign } from "@/lib/auth/jwt";
import { sessionCookieName } from "@/lib/auth/session";
import { getConfig } from "@/lib/config";
import * as bcrypt from "bcryptjs";
import { z } from "zod";

const bodySchema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(req: NextRequest) {
  const config = await getConfig();
  const allowManual = (config.google_allow_manual_login ?? "true").toLowerCase() !== "false";
  if (!allowManual) {
    return NextResponse.json(
      { error: "Manual login is disabled. Please sign in with Google." },
      { status: 403 }
    );
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  // Check if user has a password (OAuth users don't have passwords)
  if (!user.passwordHash) {
    return NextResponse.json({ error: "Please sign in with Google" }, { status: 401 });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = await sign({
    sub: user.id,
    email: user.email,
    role: user.role,
  });

  const res = NextResponse.json({ token });
  const isHttps =
    req.nextUrl.protocol === "https:" ||
    req.headers.get("x-forwarded-proto") === "https";
  res.cookies.set(sessionCookieName(), token, {
    httpOnly: true,
    secure: isHttps,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
  return res;
}
