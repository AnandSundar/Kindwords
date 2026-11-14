import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb, type OpenDb } from "@/server/db/client";
import { runMigrations } from "@/server/db/migrate";
import { createSpace } from "@/server/db/repositories/spaces";
import { createTestimonial, type NewTestimonial } from "@/server/db/repositories/testimonials";
import { changeStatus, setFeatured } from "@/server/testimonials/moderate";
import { PUBLIC_KEYS, publicWall } from "@/server/testimonials/public-view";
import { removeTempDirs, targets } from "./db-helpers";

const appDbDir = mkdtempSync(path.join(os.tmpdir(), "kindwords-feed-db-"));
process.env.DATABASE_URL = `file:${path.join(appDbDir, "app.db").replaceAll("\\", "/")}`;

afterAll(() => {
  removeTempDirs();
  try {
    rmSync(appDbDir, { recursive: true, force: true });
  } catch {}
});

const origin = "https://r.example.com";

describe.each(targets)("public wall on $name", (target) => {
  let db: OpenDb;
  let spaceId: string;
  let publicId: string;
  beforeEach(async () => {
    db = await target.open();
    ({ id: spaceId, publicId } = await createSpace(db, "Acme"));
  });
  afterEach(async () => {
    await db.close();
  });
  const add = (patch: Partial<NewTestimonial>) =>
    createTestimonial(db, { spaceId, name: "Ann", text: "Some kind words.", email: "ann@example.com", ...patch });

  it("returns only approved testimonials, without email or original text (AE3)", async () => {
    await add({ name: "Pending" });
    await add({ name: "Rejected", status: "rejected" });
    await add({ name: "Approved", status: "approved", originalText: "secret original" });
    const { spaceName, testimonials } = await publicWall(db, publicId, { origin });
    expect(spaceName).toBe("Acme");
    expect(testimonials.map((t) => t.name)).toEqual(["Approved"]);
    expect(Object.keys(testimonials[0]).sort()).toEqual([...PUBLIC_KEYS].sort());
    expect(JSON.stringify(testimonials)).not.toMatch(/ann@example\.com|secret original/);
  });

  it("puts featured first, then newest; featured-only returns just the featured (AE7)", async () => {
    const old = await add({ name: "Old", status: "approved" });
    await new Promise((r) => setTimeout(r, 5));
    await add({ name: "New", status: "approved" });
    await new Promise((r) => setTimeout(r, 5));
    await add({ name: "Newest", status: "approved" });
    await setFeatured(db, old.id, true);
    expect((await publicWall(db, publicId, { origin })).testimonials.map((t) => t.name)).toEqual(["Old", "Newest", "New"]);
    expect((await publicWall(db, publicId, { origin, featuredOnly: true })).testimonials.map((t) => t.name)).toEqual(["Old"]);
  });

  it("drops a testimonial moved back to pending on the next read (AE8)", async () => {
    const t = await add({ status: "approved" });
    expect((await publicWall(db, publicId, { origin })).testimonials).toHaveLength(1);
    await changeStatus(db, t.id, "pending");
    expect((await publicWall(db, publicId, { origin })).testimonials).toEqual([]);
  });

  it("returns an empty wall for an unknown public ID (R26)", async () => {
    expect(await publicWall(db, "no-such-space", { origin })).toEqual({ spaceName: undefined, testimonials: [] });
  });
});

describe("feed route", () => {
  const route = import("@/app/api/public/[publicId]/testimonials/route");
  let publicId: string;
  beforeAll(async () => {
    const db = getDb();
    await runMigrations(db);
    const space = await createSpace(db, "Feed");
    publicId = space.publicId;
    const payload = "<script>alert(1)</script>";
    await createTestimonial(db, { spaceId: space.id, name: payload, text: payload, status: "approved", email: "x@example.com" });
    await createTestimonial(db, { spaceId: space.id, name: "Hidden", text: "Still pending here." });
  });

  const get = async (id: string, query = "") =>
    (await route).GET(new Request(`http://localhost/api/public/${id}/testimonials${query}`, { headers: { host: "reviews.test" } }), {
      params: Promise.resolve({ publicId: id }),
    });

  it("serves versioned JSON with script text as a plain string, open CORS without credentials (AE2, KTD12)", async () => {
    const res = await get(publicId);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^application\/json/);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-credentials")).toBeNull();
    expect(res.headers.get("cache-control")).toBe("public, max-age=30");
    const body = await res.json();
    expect(body.version).toBe(1);
    expect(body.testimonials).toHaveLength(1);
    expect(body.testimonials[0].text).toBe("<script>alert(1)</script>");
  });

  it("returns an empty list for an unknown public ID and honours featured=1", async () => {
    expect(await (await get("missing")).json()).toEqual({ version: 1, testimonials: [] });
    expect((await (await get(publicId, "?featured=1")).json()).testimonials).toEqual([]);
  });
});
