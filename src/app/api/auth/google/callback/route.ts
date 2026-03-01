/**
 * GET /api/auth/google/callback – handles Google OAuth callback
 */

import { NextRequest, NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "@/lib/db/client";
import { sign } from "@/lib/auth/jwt";
import { sessionCookieName } from "@/lib/auth/session";
import { getRequestOrigin } from "@/lib/auth/request-origin";
import { getConfig } from "@/lib/config";

export async function GET(req: NextRequest) {
  const origin = getRequestOrigin(req);
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error)}`, origin));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", origin));
  }

  const config = await getConfig();
  const clientId = config.google_client_id;
  const clientSecret = config.google_client_secret;
  const allowedDomain = config.google_allowed_domain;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/login?error=oauth_not_configured", origin));
  }

  try {
    const redirectUri = new URL("/api/auth/google/callback", origin).toString();
    const oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUri);

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    if (!tokens.id_token) {
      return NextResponse.redirect(new URL("/login?error=no_id_token", origin));
    }

    // Verify and decode the ID token
    const ticket = await oauth2Client.verifyIdToken({
      idToken: tokens.id_token,
      audience: clientId,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return NextResponse.redirect(new URL("/login?error=invalid_token", origin));
    }

    const email = payload.email;
    const name = payload.name || null;
    const emailDomain = email.split("@")[1];

    // Check domain restriction if configured
    if (allowedDomain && emailDomain !== allowedDomain) {
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(`Email domain must be @${allowedDomain}`)}`, origin)
      );
    }

    // Find or create user
    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      // Create new user with default role "qa"
      user = await prisma.user.create({
        data: {
          email,
          name,
          role: "qa", // Default role for Google login users
          passwordHash: null, // OAuth users don't have passwords
          isActive: true,
        },
      });
    } else {
      // Update existing user if needed (e.g., update name)
      if (name && user.name !== name) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { name },
        });
      }

      // Ensure user is active
      if (!user.isActive) {
        return NextResponse.redirect(new URL("/login?error=account_disabled", origin));
      }
    }

    // Generate JWT token
    const token = await sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    // Set session cookie and redirect to dashboard
    const res = NextResponse.redirect(new URL("/", origin));
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
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Google OAuth callback error:", err);
    const friendly =
      /redirect_uri_mismatch|redirect_uri/i.test(msg)
        ? "Redirect URI mismatch — add the exact callback URL in Google Console"
        : /invalid_grant|invalid code|code already used/i.test(msg)
          ? "Login link expired — try signing in with Google again"
          : /JWT_SECRET|signing/i.test(msg)
            ? "Server configuration error — JWT_SECRET not set or too short"
            : "Authentication failed";
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(friendly)}`, origin)
    );
  }
}
