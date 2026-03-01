/**
 * GET /api/auth/google – initiates Google OAuth flow
 */

import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { getRequestOrigin } from "@/lib/auth/request-origin";

const isBuildTime = () => process.env.NEXT_PHASE === "phase-production-build";

export async function GET(req: NextRequest) {
  if (isBuildTime()) {
    return NextResponse.json({ error: "Not available during build" }, { status: 400 });
  }
  const config = await getConfig();
  const clientId = config.google_client_id;
  const allowedDomain = config.google_allowed_domain;

  if (!clientId) {
    return NextResponse.json({ error: "Google OAuth not configured" }, { status: 400 });
  }

  const origin = getRequestOrigin(req);
  const redirectUri = new URL("/api/auth/google/callback", origin).toString();
  const scopes = ["openid", "https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/userinfo.profile"];
  
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
    prompt: "consent",
  });

  if (allowedDomain) {
    params.append("hd", allowedDomain);
  }

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  
  return NextResponse.redirect(authUrl);
}
