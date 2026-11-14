import { asc, eq } from "drizzle-orm";
import type { Db } from "../client";
import { newId } from "../ids";

export type Space = { id: string; publicId: string; name: string; createdAt: number; updatedAt: number };

export async function createSpace(db: Db, name: string): Promise<Space> {
  const now = Date.now();
  // KTD4: the public ID is random and permanent, independent of the name.
  const [space] = await db.q
    .insert(db.t.spaces)
    .values({ id: newId(), publicId: newId(), name, createdAt: now, updatedAt: now })
    .returning();
  return space;
}

export async function listSpaces(db: Db): Promise<Space[]> {
  return db.q.select().from(db.t.spaces).orderBy(asc(db.t.spaces.createdAt), asc(db.t.spaces.id));
}

export async function getSpace(db: Db, id: string): Promise<Space | undefined> {
  const [space] = await db.q.select().from(db.t.spaces).where(eq(db.t.spaces.id, id));
  return space;
}

export async function getSpaceByPublicId(db: Db, publicId: string): Promise<Space | undefined> {
  const [space] = await db.q.select().from(db.t.spaces).where(eq(db.t.spaces.publicId, publicId));
  return space;
}

export async function renameSpace(db: Db, id: string, name: string): Promise<boolean> {
  const rows = await db.q
    .update(db.t.spaces)
    .set({ name, updatedAt: Date.now() })
    .where(eq(db.t.spaces.id, id))
    .returning({ id: db.t.spaces.id });
  return rows.length > 0;
}

/** Deletes the space; the database cascades to its testimonials. Avatar files: see deleteSpaceAndFiles. */
export async function deleteSpace(db: Db, id: string): Promise<boolean> {
  const rows = await db.q.delete(db.t.spaces).where(eq(db.t.spaces.id, id)).returning({ id: db.t.spaces.id });
  return rows.length > 0;
}
