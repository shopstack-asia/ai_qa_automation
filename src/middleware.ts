import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "qa_session";

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isApi = path.startsWith("/api");
  if (isApi) return NextResponse.next();

  const token = request.cookies.get(COOKIE_NAME)?.value ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const isAuth = Boolean(token);
  const isAuthRoute = path.startsWith("/login");

  if (isAuthRoute && isAuth) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  if (!isAuthRoute && !isAuth) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
