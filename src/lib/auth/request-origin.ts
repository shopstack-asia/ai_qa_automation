/**
 * Get the public origin (scheme + host) for the current request.
 * Uses X-Forwarded-Proto / X-Forwarded-Host from Cloudflare or other proxies
 * so OAuth redirect_uri matches the domain users see in the browser.
 */

import { NextRequest } from "next/server";

export function getRequestOrigin(req: NextRequest): string {
  const url = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase() || url.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.headers.get("host") || url.host;

  if (host && (proto === "https" || proto === "http")) {
    const origin = `${proto}://${host}`;
    try {
      new URL(origin);
      return origin;
    } catch {
      // fall through to fallback
    }
  }

  return process.env.APP_URL?.trim() || url.origin;
}
