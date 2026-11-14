import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { withTransaction, type OpenDb } from "@/server/db/client";
import { runMigrations } from "@/server/db/migrate";
import { createAdmin, getAdmin, setAdminPassword } from "@/server/db/repositories/admin";
import { createSession, deleteAllSessions, deleteSession, getSession, touchSession } from "@/server/db/repositories/sessions";
import {
  createSpace,
  deleteSpace,
  getSpace,
  getSpaceByPublicId,
  listSpaces,
  renameSpace,
} from "@/server/db/repositories/spaces";
import {
  createTestimonial,
  deleteTestimonial,
  getTestimonial,
  listTestimonials,
  updateTestimonial,
} from "@/server/db/repositories/testimonials";
import { removeTempDirs, targets } from "./db-helpers";

afterAll(removeTempDirs);

describe.each(targets)("repositories on $name", (target) => {
  let db: OpenDb;
  beforeEach(async () => {
    db = await target.open();
  });
  afterEach(async () => {
    await db.close();
  });

  describe("transactions", () => {
    it("rolls back every write when the async callback throws midway", async () => {
      await expect(
        withTransaction(db, async (tx) => {
          await createSpace(tx, "first");
          await new Promise((resolve) => setTimeout(resolve, 5)); // a real await between writes
          await createSpace(tx, "second");
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
      expect(await listSpaces(db)).toEqual([]);
    });

    it("commits when the callback succeeds and returns its value", async () => {
      const result = await withTransaction(db, async (tx) => (await createSpace(tx, "kept")).name);
      expect(result).toBe("kept");
      expect((await listSpaces(db)).map((s) => s.name)).toEqual(["kept"]);
    });
  });

  it("runs migrations again without error (idempotent startup)", async () => {
    await runMigrations(db);
    await runMigrations(db);
    expect(await listSpaces(db)).toEqual([]);
  });

  describe("admin", () => {
    it("creates, reads and updates the single admin", async () => {
      expect(await getAdmin(db)).toBeUndefined();
      await createAdmin(db, "hash-1");
      expect(await setAdminPassword(db, "hash-2")).toBe(true);
      expect((await getAdmin(db))?.passwordHash).toBe("hash-2");
    });

    it("rejects a second admin", async () => {
      await createAdmin(db, "hash-1");
      await expect(createAdmin(db, "hash-2")).rejects.toThrow();
      expect((await getAdmin(db))?.passwordHash).toBe("hash-1");
    });

    it("rejects an admin row with any other id (check constraint)", async () => {
      const now = Date.now();
      await expect(
        db.q.insert(db.t.admin).values({ id: "second", passwordHash: "h", createdAt: now, updatedAt: now }),
      ).rejects.toThrow();
    });

    it("lets only one of two simultaneous setups win inside transactions", async () => {
      const results = await Promise.allSettled([
        withTransaction(db, (tx) => createAdmin(tx, "a")),
        withTransaction(db, (tx) => createAdmin(tx, "b")),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    });
  });

  describe("sessions", () => {
    it("creates, touches and deletes sessions; reset revokes all", async () => {
      await createAdmin(db, "h");
      await createSession(db, "s1", 1_000);
      await createSession(db, "s2", 1_000);
      await touchSession(db, "s1", 5_000);
      expect(await getSession(db, "s1")).toEqual({ id: "s1", adminId: "admin", createdAt: 1_000, lastUsedAt: 5_000 });
      await deleteSession(db, "s1");
      expect(await getSession(db, "s1")).toBeUndefined();
      await deleteAllSessions(db);
      expect(await getSession(db, "s2")).toBeUndefined();
    });

    it("refuses a session without an admin (foreign key)", async () => {
      await expect(createSession(db, "orphan")).rejects.toThrow();
    });
  });

  describe("spaces", () => {
    it("gives each space a unique public ID not derived from its name", async () => {
      const a = await createSpace(db, "Acme");
      const b = await createSpace(db, "Acme");
      expect(a.publicId).not.toBe(b.publicId);
      expect(a.publicId).not.toBe(a.id);
      expect(a.publicId.toLowerCase()).not.toContain("acme");
      expect(a.publicId).toMatch(/^[A-Za-z0-9_-]{22}$/);
    });

    it("rejects a duplicate public ID at the database", async () => {
      const a = await createSpace(db, "A");
      const now = Date.now();
      await expect(
        db.q.insert(db.t.spaces).values({ id: "other", publicId: a.publicId, name: "B", createdAt: now, updatedAt: now }),
      ).rejects.toThrow();
    });

    it("renames without changing the public ID and finds by public ID", async () => {
      const space = await createSpace(db, "Old");
      expect(await renameSpace(db, space.id, "New")).toBe(true);
      const found = await getSpaceByPublicId(db, space.publicId);
      expect(found).toMatchObject({ id: space.id, publicId: space.publicId, name: "New" });
      expect(await renameSpace(db, "missing", "x")).toBe(false);
    });

    it("deleting a space removes its testimonials but not other spaces' testimonials", async () => {
      const doomed = await createSpace(db, "Doomed");
      const kept = await createSpace(db, "Kept");
      await createTestimonial(db, { spaceId: doomed.id, name: "A", text: "Great product overall." });
      const other = await createTestimonial(db, { spaceId: kept.id, name: "B", text: "Also great, truly." });
      expect(await deleteSpace(db, doomed.id)).toBe(true);
      expect(await getSpace(db, doomed.id)).toBeUndefined();
      expect(await listTestimonials(db, doomed.id)).toEqual([]);
      expect(await listTestimonials(db, kept.id)).toEqual([other]);
      expect(await deleteSpace(db, doomed.id)).toBe(false);
    });
  });

  describe("testimonials", () => {
    it("round-trips every field with defaults and 64-bit timestamps", async () => {
      const space = await createSpace(db, "S");
      const submitted = "Line one\nline two";
      const created = await createTestimonial(db, { spaceId: space.id, name: "Ann", text: submitted, originalText: submitted });
      expect(created).toMatchObject({ status: "pending", featured: false, roleCompany: null, email: null, rating: null });
      expect(created.createdAt).toBeGreaterThan(2 ** 31);

      const updated = await updateTestimonial(db, created.id, {
        status: "approved",
        featured: true,
        rating: 5,
        text: "Fixed typo",
      });
      expect(updated).toMatchObject({ status: "approved", featured: true, rating: 5, text: "Fixed typo", originalText: "Line one\nline two" });
      expect(await getTestimonial(db, created.id)).toEqual(updated);
    });

    it("filters by status and lists newest first", async () => {
      const space = await createSpace(db, "S");
      const older = await createTestimonial(db, { spaceId: space.id, name: "A", text: "First one here." });
      await new Promise((resolve) => setTimeout(resolve, 5));
      const newer = await createTestimonial(db, { spaceId: space.id, name: "B", text: "Second one here.", status: "approved" });
      expect((await listTestimonials(db, space.id)).map((t) => t.id)).toEqual([newer.id, older.id]);
      expect((await listTestimonials(db, space.id, "approved")).map((t) => t.id)).toEqual([newer.id]);
    });

    it("refuses a testimonial for a missing space and deletes by id", async () => {
      await expect(createTestimonial(db, { spaceId: "missing", name: "A", text: "Orphaned text." })).rejects.toThrow();
      const space = await createSpace(db, "S");
      const t = await createTestimonial(db, { spaceId: space.id, name: "A", text: "To be deleted." });
      expect(await deleteTestimonial(db, t.id)).toBe(true);
      expect(await getTestimonial(db, t.id)).toBeUndefined();
      expect(await updateTestimonial(db, t.id, { name: "x" })).toBeUndefined();
    });
  });
});
