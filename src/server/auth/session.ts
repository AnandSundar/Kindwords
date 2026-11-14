import { createHash, randomBytes } from "node:crypto";
import type { Db } from "../db/client";
import { getAdmin } from "../db/repositories/admin";
import { createSession, deleteSession, getSession, touchSession, type Session } from "../db/repositories/sessions";
import { loginThrottle, TOO_MANY_ATTEMPTS, type Throttle } from "./login-throttle";
import { verifyPassword } from "./password";

export const SESSION_COOKIE = "kindwords_session";
const DAY_MS = 24 * 60 * 60 * 1000;
const ABSOLUTE_MS = 30 * DAY_MS;
const IDLE_MS = 7 * DAY_MS;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Creates a session and returns the raw token for the cookie; only its hash is stored. */
export async function startSession(db: Db, now = Date.now()): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await createSession(db, hashToken(token), now);
  return token;
}

/** Returns the session if it is within 30 days of creation and 7 days of last use, sliding the idle window. */
export async function validateSession(db: Db, token: string, now = Date.now()): Promise<Session | undefined> {
  const id = hashToken(token);
  const session = await getSession(db, id);
  if (!session) return undefined;
  if (now - session.createdAt > ABSOLUTE_MS || now - session.lastUsedAt > IDLE_MS) {
    await deleteSession(db, id);
    return undefined;
  }
  await touchSession(db, id, now);
  return session;
}

/** KTD5: `Secure` only under an https PUBLIC_URL, so plain-HTTP LAN installs can still log in. */
export function sessionCookieOptions(secure: boolean) {
  return { httpOnly: true, sameSite: "lax" as const, secure, path: "/", maxAge: ABSOLUTE_MS / 1000 };
}

export async function attemptLogin(
  db: Db,
  ip: string,
  password: string,
  throttle: Throttle = loginThrottle,
): Promise<{ token: string } | { error: string }> {
  const admin = await getAdmin(db);
  if (!admin) return { error: "No admin account exists yet. Complete setup first." };
  const ok = await throttle.attempt(ip, () => verifyPassword(password, admin.passwordHash));
  if (ok === "throttled") return { error: TOO_MANY_ATTEMPTS };
  if (!ok) return { error: "That password is not correct." };
  return { token: await startSession(db) };
}
