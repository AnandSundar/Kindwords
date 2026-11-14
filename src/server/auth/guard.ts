import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getConfig } from "../config";
import { getDb, type Db } from "../db/client";
import type { Session } from "../db/repositories/sessions";
import { SESSION_COOKIE, validateSession } from "./session";

/** The current admin session from the cookie, or undefined. */
export async function getAdminSession(): Promise<Session | undefined> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? validateSession(getDb(), token) : undefined;
}

/** KTD6: first line of every admin page and server action; sends anyone without a valid session to login. */
export async function requireAdmin(): Promise<Session> {
  const session = await getAdminSession();
  if (!session) redirect("/login");
  return session;
}

/**
 * KTD6: first line of every mutating admin route handler. Route handlers get no built-in Origin check,
 * so a foreign Origin is refused with 403; a missing or expired session gets 401 so the admin UI can
 * keep the form and offer re-login.
 */
export async function requireAdminRequest(
  request: Request,
  db: Db = getDb(),
  publicUrl: string | undefined = getConfig().publicUrl,
): Promise<Session | Response> {
  if (request.headers.get("origin") !== (publicUrl ?? new URL(request.url).origin)) {
    return Response.json({ error: "Cross-origin request refused." }, { status: 403 });
  }
  const token = request.headers
    .get("cookie")
    ?.split(/;\s*/)
    .find((pair) => pair.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  const session = token ? await validateSession(db, token) : undefined;
  return session ?? Response.json({ error: "Your session has ended. Sign in again." }, { status: 401 });
}
