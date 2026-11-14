import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "./server/auth/session";

// Second layer behind React's escaping on admin surfaces: only scripts carrying this request's nonce run.
// Next.js reads the nonce from the request's CSP header and adds it to its own scripts.
export function adminCsp(nonce: string, dev = process.env.NODE_ENV === "development"): string {
  return [
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function proxy(request: NextRequest) {
  // Redirect convenience only: it sees the cookie, not whether the session is valid. requireAdmin() is the check (KTD6).
  if (request.nextUrl.pathname.startsWith("/admin") && !request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  const csp = adminCsp(btoa(crypto.randomUUID()));
  const headers = new Headers(request.headers);
  headers.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = { matcher: ["/admin/:path*", "/login", "/setup"] };
