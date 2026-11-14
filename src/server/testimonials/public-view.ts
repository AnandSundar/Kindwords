import type { Db } from "../db/client";
import { getSpaceByPublicId } from "../db/repositories/spaces";
import { listPublicTestimonials, type PublicRow } from "../db/repositories/testimonials";

/** KTD9: the only shape of a testimonial that ever leaves the server. Email and original text cannot reach it. */
export type PublicTestimonial = {
  name: string;
  roleCompany: string | null;
  rating: number | null;
  text: string;
  avatarUrl: string | null;
  featured: boolean;
  createdAt: string;
};

export const PUBLIC_KEYS = ["name", "roleCompany", "rating", "text", "avatarUrl", "featured", "createdAt"] as const;

/** Builds the public item from an allowlist, field by field, never by spreading the row. */
export function toPublic(row: PublicRow, origin: string): PublicTestimonial {
  return {
    name: row.name,
    roleCompany: row.roleCompany,
    rating: row.rating,
    text: row.text,
    avatarUrl: row.avatarKey ? `${origin}/media/${row.avatarKey}` : null,
    featured: row.featured,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

/**
 * Approved testimonials of a space, featured first, then newest (R12, R15, R18). An unknown or
 * deleted space is an empty wall, not an error, so old embeds render quietly (R26).
 */
export async function publicWall(
  db: Db,
  publicId: string,
  opts: { featuredOnly?: boolean; origin: string },
): Promise<{ spaceName: string | undefined; testimonials: PublicTestimonial[] }> {
  const space = await getSpaceByPublicId(db, publicId);
  if (!space) return { spaceName: undefined, testimonials: [] };
  const rows = await listPublicTestimonials(db, space.id, opts.featuredOnly ?? false);
  return { spaceName: space.name, testimonials: rows.map((row) => toPublic(row, opts.origin)) };
}
