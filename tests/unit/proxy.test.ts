import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { adminCsp, proxy } from "../../src/proxy";
import { SESSION_COOKIE } from "../../src/server/auth/session";

const req = (path: string, cookie = false) =>
  new NextRequest(`http://localhost:3000${path}`, { headers: cookie ? { cookie: `${SESSION_COOKIE}=x` } : {} });

const nonceOf = (csp: string | null) => /'nonce-([^']+)'/.exec(csp ?? "")?.[1];

describe("admin proxy", () => {
  it("still redirects /admin without a session cookie to /login", () => {
    const res = proxy(req("/admin"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/login");
  });

  it.each(["/admin/spaces", "/login", "/setup"])("sends a per-request nonce script CSP on %s", (path) => {
    const a = proxy(req(path, true));
    const b = proxy(req(path, true));
    const csp = a.headers.get("content-security-policy");
    expect(csp).toContain("script-src 'self' 'nonce-");
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    // Next.js reads the nonce from the forwarded request header, so it must match the response's.
    expect(a.headers.get("x-middleware-request-content-security-policy")).toBe(csp);
    expect(nonceOf(csp)).toBeTruthy();
    expect(nonceOf(csp)).not.toBe(nonceOf(b.headers.get("content-security-policy")));
  });

  it("allows eval only in development", () => {
    expect(adminCsp("n", true)).toContain("'unsafe-eval'");
    expect(adminCsp("n", false)).not.toContain("'unsafe-eval'");
  });
});
