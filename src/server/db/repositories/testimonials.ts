import { and, desc, eq, isNotNull } from "drizzle-orm";
import type { Db } from "../client";
import { newId } from "../ids";

export type TestimonialStatus = "pending" | "approved" | "rejected";

export type Testimonial = {
  id: string;
  spaceId: string;
  status: TestimonialStatus;
  featured: boolean;
  name: string;
  roleCompany: string | null;
  email: string | null;
  rating: number | null;
  text: string;
  originalText: string | null;
  avatarKey: string | null;
  createdAt: number;
  updatedAt: number;
};

export type NewTestimonial = Pick<Testimonial, "spaceId" | "name" | "text"> &
  Partial<Pick<Testimonial, "status" | "featured" | "roleCompany" | "email" | "rating" | "avatarKey">>;

export type TestimonialPatch = Partial<
  Pick<Testimonial, "status" | "featured" | "name" | "roleCompany" | "email" | "rating" | "text" | "originalText" | "avatarKey">
>;

export async function createTestimonial(db: Db, input: NewTestimonial): Promise<Testimonial> {
  const now = Date.now();
  const [row] = await db.q
    .insert(db.t.testimonials)
    .values({ ...input, id: newId(), createdAt: now, updatedAt: now })
    .returning();
  return row;
}

export async function getTestimonial(db: Db, id: string): Promise<Testimonial | undefined> {
  const [row] = await db.q.select().from(db.t.testimonials).where(eq(db.t.testimonials.id, id));
  return row;
}

/** Newest first, optionally filtered by status. */
export async function listTestimonials(db: Db, spaceId: string, status?: TestimonialStatus): Promise<Testimonial[]> {
  const t = db.t.testimonials;
  return db.q
    .select()
    .from(t)
    .where(status ? and(eq(t.spaceId, spaceId), eq(t.status, status)) : eq(t.spaceId, spaceId))
    .orderBy(desc(t.createdAt), desc(t.id));
}

export async function updateTestimonial(db: Db, id: string, patch: TestimonialPatch): Promise<Testimonial | undefined> {
  const [row] = await db.q
    .update(db.t.testimonials)
    .set({ ...patch, updatedAt: Date.now() })
    .where(eq(db.t.testimonials.id, id))
    .returning();
  return row;
}

/** Avatar storage keys of every testimonial in the space. */
export async function listAvatarKeys(db: Db, spaceId: string): Promise<string[]> {
  const t = db.t.testimonials;
  const rows = await db.q.select({ key: t.avatarKey }).from(t).where(and(eq(t.spaceId, spaceId), isNotNull(t.avatarKey)));
  return rows.map((row) => row.key!);
}

export async function deleteTestimonial(db: Db, id: string): Promise<boolean> {
  const t = db.t.testimonials;
  const rows = await db.q.delete(t).where(eq(t.id, id)).returning({ id: t.id });
  return rows.length > 0;
}
