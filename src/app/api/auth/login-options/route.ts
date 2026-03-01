/**
 * GET /api/auth/login-options – public. Returns whether manual (email/password) login is allowed.
 * Used by the login page to show or hide the email/password form.
 * Uses skipCache so the latest config is always returned (e.g. right after admin disables manual login).
 * ?debug=1 – include debug info in response (no secrets) so you can see in DevTools → Network.
 */

import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@/lib/config";

export async function GET(req: NextRequest) {
  const config = await getConfig({ skipCache: true });
  const rawVal = config.google_allow_manual_login ?? "true";
  const allowManual = String(rawVal).toLowerCase() !== "false";

  const body: { allowManualLogin: boolean; debug?: { raw: string } } = {
    allowManualLogin: allowManual,
  };
  if (req.nextUrl.searchParams.get("debug") === "1") {
    body.debug = { raw: String(rawVal) };
  }

  const res = NextResponse.json(body);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}
