import { eq } from "drizzle-orm";
import type { Db } from "../client";
import { ADMIN_ID } from "./admin";

export type Session = { id: string; adminId: string; createdAt: number; lastUsedAt: number };

/** `id` is the hash of the session token; the raw token is never stored. */
export async function createSession(db: Db, id: string, now = Date.now()): Promise<Session> {
  const [row] = await db.q
    .insert(db.t.sessions)
    .values({ id, adminId: ADMIN_ID, createdAt: now, lastUsedAt: now })
    .returning();
  return row;
}

export async function getSession(db: Db, id: string): Promise<Session | undefined> {
  const [row] = await db.q.select().from(db.t.sessions).where(eq(db.t.sessions.id, id));
  return row;
}

export async function touchSession(db: Db, id: string, now = Date.now()): Promise<void> {
  await db.q.update(db.t.sessions).set({ lastUsedAt: now }).where(eq(db.t.sessions.id, id));
}

export async function deleteSession(db: Db, id: string): Promise<void> {
  await db.q.delete(db.t.sessions).where(eq(db.t.sessions.id, id));
}

/** Revokes every session (password reset). */
export async function deleteAllSessions(db: Db): Promise<void> {
  await db.q.delete(db.t.sessions);
}
