import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, pgTable, text } from "drizzle-orm/pg-core";

// Mirrors schema.sqlite.ts; tests/unit/schema-parity.test.ts fails if they drift (KTD3).
// Timestamps are epoch milliseconds in bigint (Postgres integer is 32-bit).
const ms = (name: string) => bigint(name, { mode: "number" });

export const admin = pgTable(
  "admin",
  {
    id: text("id").primaryKey(),
    passwordHash: text("password_hash").notNull(),
    createdAt: ms("created_at").notNull(),
    updatedAt: ms("updated_at").notNull(),
  },
  (t) => [check("admin_single_row", sql`${t.id} = 'admin'`)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    adminId: text("admin_id")
      .notNull()
      .references(() => admin.id, { onDelete: "cascade" }),
    createdAt: ms("created_at").notNull(),
    lastUsedAt: ms("last_used_at").notNull(),
  },
  (t) => [index("sessions_admin_id_idx").on(t.adminId)],
);

export const spaces = pgTable("spaces", {
  id: text("id").primaryKey(),
  publicId: text("public_id").notNull().unique(),
  name: text("name").notNull(),
  createdAt: ms("created_at").notNull(),
  updatedAt: ms("updated_at").notNull(),
});

export const testimonials = pgTable(
  "testimonials",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
    featured: boolean("featured").notNull().default(false),
    name: text("name").notNull(),
    roleCompany: text("role_company"),
    email: text("email"),
    rating: integer("rating"),
    text: text("text").notNull(),
    /** The submitted text, set once at submission (null for manual adds); admin-only, never public. */
    originalText: text("original_text"),
    avatarKey: text("avatar_key"),
    createdAt: ms("created_at").notNull(),
    updatedAt: ms("updated_at").notNull(),
  },
  (t) => [index("testimonials_space_status_idx").on(t.spaceId, t.status)],
);
