import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "./server/auth/session";

// Redirect convenience only: it sees the cookie, not whether the session is valid. requireAdmin() is the check (KTD6).
export function proxy(request: NextRequest) {
  if (!request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = { matcher: "/admin/:path*" };
