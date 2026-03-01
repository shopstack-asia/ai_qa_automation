/**
 * GET /api/auth/login-options – public. Returns whether manual (email/password) login is allowed.
 * Used by the login page to show or hide the email/password form.
 */

import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";

export async function GET() {
  const config = await getConfig();
  const allowManual =
    (config.google_allow_manual_login ?? "true").toLowerCase() !== "false";
  return NextResponse.json({ allowManualLogin: allowManual });
}
