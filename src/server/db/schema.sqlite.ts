import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Mirrors schema.pg.ts; tests/unit/schema-parity.test.ts fails if they drift (KTD3).
// Timestamps are epoch milliseconds.

export const admin = sqliteTable(
  "admin",
  {
    // The only allowed id is 'admin', so the primary key permits at most one row.
    id: text("id").primaryKey(),
    passwordHash: text("password_hash").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [check("admin_single_row", sql`${t.id} = 'admin'`)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    /** SHA-256 of the opaque session token. */
    id: text("id").primaryKey(),
    adminId: text("admin_id")
      .notNull()
      .references(() => admin.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull(),
    lastUsedAt: integer("last_used_at").notNull(),
  },
  (t) => [index("sessions_admin_id_idx").on(t.adminId)],
);

export const spaces = sqliteTable("spaces", {
  id: text("id").primaryKey(),
  publicId: text("public_id").notNull().unique(),
  name: text("name").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const testimonials = sqliteTable(
  "testimonials",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
    featured: integer("featured", { mode: "boolean" }).notNull().default(false),
    name: text("name").notNull(),
    roleCompany: text("role_company"),
    email: text("email"),
    rating: integer("rating"),
    text: text("text").notNull(),
    /** The submitted text, set once at submission (null for manual adds); admin-only, never public. */
    originalText: text("original_text"),
    avatarKey: text("avatar_key"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("testimonials_space_status_idx").on(t.spaceId, t.status)],
);
