import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startSession } from "@/server/auth/session";
import { getDb, type OpenDb } from "@/server/db/client";
import { runMigrations } from "@/server/db/migrate";
import { createAdmin } from "@/server/db/repositories/admin";
import { createSpace } from "@/server/db/repositories/spaces";
import { createTestimonial, getTestimonial, listTestimonials } from "@/server/db/repositories/testimonials";
import { createStorage, newMediaKey, type Storage } from "@/server/storage";
import { changeStatus, removeTestimonial, saveTestimonial, setFeatured } from "@/server/testimonials/moderate";
import { removeTempDirs, targets } from "./db-helpers";

const uploadsDir = mkdtempSync(path.join(os.tmpdir(), "kindwords-moderation-"));
// The server actions read the app-wide config; point it at temp files before first use.
const appDbDir = mkdtempSync(path.join(os.tmpdir(), "kindwords-moderation-db-"));
process.env.DATABASE_URL = `file:${path.join(appDbDir, "app.db").replaceAll("\\", "/")}`;
process.env.STORAGE_DRIVER = "local";
process.env.UPLOADS_DIR = uploadsDir;

const failUpdate = vi.hoisted(() => ({ mode: undefined as "throw" | "gone" | undefined }));
vi.mock("@/server/db/repositories/testimonials", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/server/db/repositories/testimonials")>();
  return {
    ...real,
    updateTestimonial: (...args: Parameters<typeof real.updateTestimonial>) =>
      failUpdate.mode === "throw"
        ? Promise.reject(new Error("update failed"))
        : failUpdate.mode === "gone"
          ? Promise.resolve(undefined)
          : real.updateTestimonial(...args),
  };
});

const cookieJar = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "kindwords_session" && cookieJar.token ? { name, value: cookieJar.token } : undefined),
  }),
}));

afterAll(() => {
  removeTempDirs();
  rmSync(uploadsDir, { recursive: true, force: true });
  try {
    rmSync(appDbDir, { recursive: true, force: true });
  } catch {}
});

const fields = { name: "Ann Lee", email: "", roleCompany: "CTO, Acme", rating: "5", text: "Kindwords made this easy." };
const png = (size: number, background = "#c33") =>
  sharp({ create: { width: size, height: size, channels: 3, background } }).png().toBuffer();
/** Random noise does not compress, so this PNG is about 1.5 MB. */
const bigPng = () => {
  const noise = Buffer.from(Array.from({ length: 710 * 710 * 3 }, () => Math.floor(Math.random() * 256)));
  return sharp(noise, { raw: { width: 710, height: 710, channels: 3 } }).png().toBuffer();
};
const stored = (key: string | null) => key !== null && existsSync(path.join(uploadsDir, key));
const files = () => readdirSync(uploadsDir, { recursive: true }).sort();

describe.each(targets)("moderation on $name", (target) => {
  let db: OpenDb;
  let spaceId: string;
  const storage: Storage = createStorage({ driver: "local", uploadsDir });
  beforeEach(async () => {
    db = await target.open();
    spaceId = (await createSpace(db, "Acme")).id;
  });
  afterEach(async () => {
    failUpdate.mode = undefined;
    await db.close();
  });

  const submitted = (text = "As submitted, with a typo.") =>
    createTestimonial(db, { spaceId, name: "Ann", text, originalText: text, email: "ann@example.com" });

  it("clears featured when a featured testimonial leaves approved; re-approving keeps it unfeatured (AE8)", async () => {
    const t = await submitted();
    await changeStatus(db, t.id, "approved");
    expect(await setFeatured(db, t.id, true)).toMatchObject({ featured: true });
    expect(await changeStatus(db, t.id, "pending")).toMatchObject({ status: "pending", featured: false });
    expect(await changeStatus(db, t.id, "approved")).toMatchObject({ status: "approved", featured: false });
  });

  it("moves rejected to approved and to pending (R25)", async () => {
    const t = await submitted();
    await changeStatus(db, t.id, "rejected");
    expect(await changeStatus(db, t.id, "approved")).toMatchObject({ status: "approved" });
    await changeStatus(db, t.id, "rejected");
    expect(await changeStatus(db, t.id, "pending")).toMatchObject({ status: "pending" });
  });

  it("refuses to feature a pending or rejected testimonial", async () => {
    const t = await submitted();
    expect(await setFeatured(db, t.id, true)).toBeUndefined();
    await changeStatus(db, t.id, "rejected");
    expect(await setFeatured(db, t.id, true)).toBeUndefined();
    expect((await getTestimonial(db, t.id))!.featured).toBe(false);
  });

  it("edits displayed fields and keeps the original text unchanged (AE4)", async () => {
    const t = await submitted();
    const result = await saveTestimonial(db, storage, { id: t.id }, { ...fields, text: "As submitted, with no typo." });
    expect(result).toHaveProperty("testimonial");
    expect(await getTestimonial(db, t.id)).toMatchObject({
      name: "Ann Lee",
      roleCompany: "CTO, Acme",
      email: null,
      rating: 5,
      text: "As submitted, with no typo.",
      originalText: "As submitted, with a typo.",
    });
  });

  it("refuses invalid edits and leaves the testimonial unchanged", async () => {
    const t = await submitted();
    expect(await saveTestimonial(db, storage, { id: t.id }, { ...fields, name: " ", text: "short" })).toEqual({
      fieldErrors: { name: expect.any(String), text: expect.any(String) },
    });
    expect(await getTestimonial(db, t.id)).toEqual(t);
  });

  it("adds by hand: approved with publish on, pending with it off, no original text (R13)", async () => {
    const on = await saveTestimonial(db, storage, { spaceId, publish: true }, { ...fields, rating: "" });
    const off = await saveTestimonial(db, storage, { spaceId, publish: false }, fields);
    if (!("testimonial" in on) || !("testimonial" in off)) throw new Error("expected both saved");
    expect(on.testimonial).toMatchObject({ status: "approved", rating: null, email: null, originalText: null });
    expect(off.testimonial).toMatchObject({ status: "pending", originalText: null });
    expect(await saveTestimonial(db, storage, { spaceId: "missing", publish: true }, fields)).toHaveProperty("error");
  });

  it("replaces an avatar with a 1.5 MB image, deleting the old file; remove drops it", async () => {
    const t = await submitted();
    const first = await saveTestimonial(db, storage, { id: t.id }, fields, { file: await png(40) });
    const firstKey = "testimonial" in first ? first.testimonial.avatarKey : null;
    expect(stored(firstKey)).toBe(true);

    const big = await bigPng();
    expect(big.length).toBeGreaterThan(1.4 * 1024 * 1024);
    expect(big.length).toBeLessThan(2 * 1024 * 1024);
    const second = await saveTestimonial(db, storage, { id: t.id }, fields, { file: big });
    const secondKey = "testimonial" in second ? second.testimonial.avatarKey : null;
    expect(stored(secondKey)).toBe(true);
    expect(stored(firstKey)).toBe(false);

    const removed = await saveTestimonial(db, storage, { id: t.id }, fields, { remove: true });
    expect("testimonial" in removed && removed.testimonial.avatarKey).toBeNull();
    expect(stored(secondKey)).toBe(false);
  });

  it("refuses a non-image avatar and keeps the current one", async () => {
    const t = await submitted();
    const first = await saveTestimonial(db, storage, { id: t.id }, fields, { file: await png(40) });
    const key = "testimonial" in first ? first.testimonial.avatarKey : null;
    expect(await saveTestimonial(db, storage, { id: t.id }, fields, { file: Buffer.from("<svg/>") })).toEqual({
      fieldErrors: { avatar: expect.any(String) },
    });
    expect((await getTestimonial(db, t.id))!.avatarKey).toBe(key);
    expect(stored(key)).toBe(true);
  });

  it("keeps the current avatar when an edit leaves the photo alone", async () => {
    const t = await submitted();
    const first = await saveTestimonial(db, storage, { id: t.id }, fields, { file: await png(40) });
    const key = "testimonial" in first ? first.testimonial.avatarKey : null;
    expect(await saveTestimonial(db, storage, { id: t.id }, { ...fields, name: "Ann B" })).toMatchObject({ testimonial: { avatarKey: key } });
    expect(stored(key)).toBe(true);
  });

  it.each([
    ["the update fails", "throw"],
    ["the row is deleted mid-save", "gone"],
  ] as const)("deletes the newly stored avatar when %s", async (_label, mode) => {
    const t = await submitted();
    const before = files();
    failUpdate.mode = mode;
    const save = saveTestimonial(db, storage, { id: t.id }, fields, { file: await png(40) });
    if (mode === "throw") await expect(save).rejects.toThrow("update failed");
    else expect(await save).toEqual({ error: expect.any(String) });
    expect(files()).toEqual(before);
  });

  it("deletes a testimonial and its avatar file", async () => {
    const key = newMediaKey();
    await storage.put(key, await png(8));
    const t = await createTestimonial(db, { spaceId, name: "Ann", text: "Bye for now.", avatarKey: key });
    expect(await removeTestimonial(db, storage, t.id)).toBe(true);
    expect(await getTestimonial(db, t.id)).toBeUndefined();
    expect(stored(key)).toBe(false);
    expect(await removeTestimonial(db, storage, t.id)).toBe(false);
  });
});

describe("moderation server actions", () => {
  const actions = import("@/app/admin/spaces/[id]/testimonials/actions");
  let db: OpenDb;
  let validToken: string;
  let spaceId: string;
  beforeAll(async () => {
    db = getDb() as OpenDb;
    await runMigrations(db);
    await createAdmin(db, "hash");
    validToken = await startSession(db);
    spaceId = (await createSpace(db, "Acme")).id;
  });
  afterEach(() => {
    cookieJar.token = undefined;
  });

  const form = (values: Record<string, string | Blob>) => {
    const data = new FormData();
    for (const [name, value] of Object.entries(values)) data.append(name, value);
    return data;
  };
  const refusedToLogin = { digest: expect.stringMatching(/^NEXT_REDIRECT;.*;\/login;/) };
  const redirectTo = (url: string) => ({ digest: expect.stringContaining(`;${url};`) });

  it.each([undefined, "not-a-session"])("refuses every moderation action without a valid session (%s)", async (token) => {
    const a = await actions;
    const t = await createTestimonial(db, { spaceId, name: "Ann", text: "Untouched text." });
    cookieJar.token = token;
    await expect(a.setStatusAction(form({ id: t.id, status: "approved" }))).rejects.toMatchObject(refusedToLogin);
    await expect(a.setFeaturedAction(form({ id: t.id, featured: "true" }))).rejects.toMatchObject(refusedToLogin);
    await expect(a.deleteTestimonialAction(form({ id: t.id }))).rejects.toMatchObject(refusedToLogin);
    await expect(a.saveTestimonialAction({}, form({ id: t.id, name: "X", text: "Changed text here." }))).rejects.toMatchObject(
      refusedToLogin,
    );
    await expect(
      a.saveTestimonialAction({}, form({ spaceId, publish: "on", name: "X", text: "Sneaky manual add." })),
    ).rejects.toMatchObject(refusedToLogin);
    expect(await getTestimonial(db, t.id)).toEqual(t);
    expect((await listTestimonials(db, spaceId)).some((x) => x.name === "X")).toBe(false);
  });

  it("approves, features, edits with a 1.5 MB avatar, and deletes with a valid session", async () => {
    const a = await actions;
    const t = await createTestimonial(db, { spaceId, name: "Ann", text: "Original words.", originalText: "Original words." });
    cookieJar.token = validToken;
    const inbox = `/admin/spaces/${spaceId}/inbox`;

    await expect(a.setStatusAction(form({ id: t.id, status: "approved", filter: "pending" }))).rejects.toMatchObject(
      redirectTo(`${inbox}?status=pending`),
    );
    await expect(a.setFeaturedAction(form({ id: t.id, featured: "true", filter: "evil?x=1" }))).rejects.toMatchObject(
      redirectTo(inbox),
    );
    expect(await getTestimonial(db, t.id)).toMatchObject({ status: "approved", featured: true });

    // Refused input is echoed back so the form keeps what the admin typed.
    expect(await a.saveTestimonialAction({}, form({ id: t.id, name: "", text: "Edited words." }))).toMatchObject({
      fieldErrors: { name: expect.any(String) },
      values: { name: "", text: "Edited words." },
    });
    const avatar = new File([new Uint8Array(await bigPng())], "me.png");
    await expect(a.saveTestimonialAction({}, form({ id: t.id, name: "Ann", text: "Edited words.", avatar }))).rejects.toMatchObject(
      redirectTo(`${inbox}?status=approved&saved`),
    );
    const edited = (await getTestimonial(db, t.id))!;
    expect(edited).toMatchObject({ text: "Edited words.", originalText: "Original words.", featured: true });
    expect(stored(edited.avatarKey)).toBe(true);

    await expect(a.deleteTestimonialAction(form({ id: t.id }))).rejects.toMatchObject(redirectTo(inbox));
    expect(await getTestimonial(db, t.id)).toBeUndefined();
    expect(stored(edited.avatarKey)).toBe(false);
  });
});
