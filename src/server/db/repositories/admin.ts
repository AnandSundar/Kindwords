import { eq } from "drizzle-orm";
import type { Db } from "../client";

export type Admin = { id: string; passwordHash: string; createdAt: number; updatedAt: number };

/** The single admin row's id; the schema's check constraint allows no other. */
export const ADMIN_ID = "admin";

export async function getAdmin(db: Db): Promise<Admin | undefined> {
  const [row] = await db.q.select().from(db.t.admin).where(eq(db.t.admin.id, ADMIN_ID));
  return row;
}

/** Throws (primary key violation) if an admin already exists. */
export async function createAdmin(db: Db, passwordHash: string): Promise<Admin> {
  const now = Date.now();
  const [row] = await db.q
    .insert(db.t.admin)
    .values({ id: ADMIN_ID, passwordHash, createdAt: now, updatedAt: now })
    .returning();
  return row;
}

export async function setAdminPassword(db: Db, passwordHash: string): Promise<boolean> {
  const rows = await db.q
    .update(db.t.admin)
    .set({ passwordHash, updatedAt: Date.now() })
    .where(eq(db.t.admin.id, ADMIN_ID))
    .returning({ id: db.t.admin.id });
  return rows.length > 0;
}
