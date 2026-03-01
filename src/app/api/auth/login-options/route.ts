/**
 * GET /api/auth/login-options – public. Returns whether manual (email/password) login is allowed.
 * Used by the login page to show or hide the email/password form.
 * Uses skipCache so the latest config is always returned (e.g. right after admin disables manual login).
 */

import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";

export async function GET() {
  const config = await getConfig({ skipCache: true });
  const allowManual =
    (config.google_allow_manual_login ?? "true").toLowerCase() !== "false";
  const res = NextResponse.json({ allowManualLogin: allowManual });
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}
