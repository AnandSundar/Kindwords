import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startSession } from "@/server/auth/session";
import { getDb, type OpenDb } from "@/server/db/client";
import { runMigrations } from "@/server/db/migrate";
import { createAdmin } from "@/server/db/repositories/admin";
import { createSpace, getSpace, getSpaceByPublicId, listSpaces } from "@/server/db/repositories/spaces";
import { createTestimonial, listTestimonials } from "@/server/db/repositories/testimonials";
import { addSpace, deleteSpaceAndFiles, editSpaceName, spaceSnippets } from "@/server/spaces";
import { createStorage, newMediaKey, type Storage } from "@/server/storage";
import { removeTempDirs, targets } from "./db-helpers";

const uploadsDir = mkdtempSync(path.join(os.tmpdir(), "kindwords-spaces-"));
// The server actions read the app-wide config; point it at temp files before first use.
const appDbDir = mkdtempSync(path.join(os.tmpdir(), "kindwords-spaces-db-"));
process.env.DATABASE_URL = `file:${path.join(appDbDir, "app.db").replaceAll("\\", "/")}`;
process.env.STORAGE_DRIVER = "local";
process.env.UPLOADS_DIR = uploadsDir;

// Server actions read the session cookie through next/headers, which only works inside a request.
const cookieJar = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "kindwords_session" && cookieJar.token ? { name, value: cookieJar.token } : undefined),
  }),
}));

afterAll(() => {
  removeTempDirs();
  rmSync(uploadsDir, { recursive: true, force: true });
  // libsql keeps the file open past close() on Windows (EPERM); the OS temp dir is cleaned later.
  try {
    rmSync(appDbDir, { recursive: true, force: true });
  } catch {}
});

describe.each(targets)("spaces on $name", (target) => {
  let db: OpenDb;
  const storage: Storage = createStorage({ driver: "local", uploadsDir });
  beforeEach(async () => {
    db = await target.open();
  });
  afterEach(async () => {
    await db.close();
  });

  it("creates a space with a public ID; renaming keeps the public ID and snippets", async () => {
    const created = await addSpace(db, "  Acme app  ");
    if (!("space" in created)) throw new Error("expected a space");
    expect(created.space.name).toBe("Acme app");
    expect(created.space.publicId).toMatch(/^[A-Za-z0-9_-]+$/);
    const before = spaceSnippets("https://reviews.example.com", created.space.publicId);

    expect(await editSpaceName(db, created.space.id, "Acme 2")).toEqual({ saved: true });
    const renamed = (await getSpace(db, created.space.id))!;
    expect(renamed.name).toBe("Acme 2");
    expect(renamed.publicId).toBe(created.space.publicId);
    expect(spaceSnippets("https://reviews.example.com", renamed.publicId)).toEqual(before);
  });

  it.each([
    ["empty", ""],
    ["blank", "   "],
    ["101 characters", "x".repeat(101)],
  ])("refuses a %s name on create and rename", async (_label, name) => {
    expect(await addSpace(db, name)).toHaveProperty("error");
    const space = await createSpace(db, "Keep me");
    expect(await editSpaceName(db, space.id, name)).toHaveProperty("error");
    expect((await listSpaces(db)).map((s) => s.name)).toEqual(["Keep me"]);
  });

  it("accepts a 100-character name, counting emoji as one character", async () => {
    expect(await addSpace(db, "x".repeat(100))).toHaveProperty("space");
    expect(await addSpace(db, "😀".repeat(100))).toHaveProperty("space");
  });

  it("refuses delete with a mismatched typed name and changes nothing", async () => {
    const space = await createSpace(db, "Acme");
    const key = newMediaKey();
    await storage.put(key, Buffer.from("avatar"));
    await createTestimonial(db, { spaceId: space.id, name: "Ann", text: "Great", avatarKey: key });

    for (const typed of ["acme", "Acm", "", "Acme "]) {
      expect(await deleteSpaceAndFiles(db, storage, space.id, typed)).toHaveProperty("error");
    }
    expect(await getSpace(db, space.id)).toBeDefined();
    expect(await listTestimonials(db, space.id)).toHaveLength(1);
    expect(existsSync(path.join(uploadsDir, key))).toBe(true);
  });

  it("deletes a space with its testimonials and avatar files (AE9)", async () => {
    const space = await createSpace(db, "Acme");
    const other = await createSpace(db, "Other");
    const keys = [newMediaKey(), newMediaKey()];
    const otherKey = newMediaKey();
    for (const key of [...keys, otherKey]) await storage.put(key, Buffer.from(`avatar ${key}`));
    await createTestimonial(db, { spaceId: space.id, name: "Ann", text: "Great", avatarKey: keys[0] });
    await createTestimonial(db, { spaceId: space.id, name: "Bo", text: "Fine", avatarKey: keys[1], status: "approved" });
    await createTestimonial(db, { spaceId: space.id, name: "Cy", text: "No avatar" });
    await createTestimonial(db, { spaceId: other.id, name: "Di", text: "Elsewhere", avatarKey: otherKey });

    expect(await deleteSpaceAndFiles(db, storage, space.id, "Acme")).toEqual({ deleted: true });
    expect(await getSpace(db, space.id)).toBeUndefined();
    // The embed and wall look spaces up by public ID; a deleted one is simply not found (empty wall).
    expect(await getSpaceByPublicId(db, space.publicId)).toBeUndefined();
    expect(await listTestimonials(db, space.id)).toEqual([]);
    for (const key of keys) expect(existsSync(path.join(uploadsDir, key))).toBe(false);
    expect(existsSync(path.join(uploadsDir, otherKey))).toBe(true);
    expect(await listTestimonials(db, other.id)).toHaveLength(1);
  });

  it("still deletes the space when an avatar file delete fails, and logs it", async () => {
    const space = await createSpace(db, "Acme");
    await createTestimonial(db, { spaceId: space.id, name: "Ann", text: "Great", avatarKey: newMediaKey() });
    const failing: Storage = { ...storage, delete: async () => Promise.reject(new Error("disk gone")) };
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await deleteSpaceAndFiles(db, failing, space.id, "Acme")).toEqual({ deleted: true });
    expect(await getSpace(db, space.id)).toBeUndefined();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});

describe("spaceSnippets", () => {
  it("builds links and embed code from the origin and public ID", () => {
    expect(spaceSnippets("https://r.example.com", "abc_123")).toEqual({
      collect: "https://r.example.com/c/abc_123",
      wall: "https://r.example.com/w/abc_123",
      iframe:
        '<iframe src="https://r.example.com/w/abc_123" title="Testimonials" loading="lazy" style="width:100%;height:600px;border:0"></iframe>',
      script: '<script src="https://r.example.com/embed.js" data-space="abc_123" async></script>',
    });
  });
});

describe("space server actions", () => {
  const actions = import("@/app/admin/spaces/actions");
  let db: OpenDb;
  let validToken: string;
  beforeAll(async () => {
    db = getDb() as OpenDb;
    await runMigrations(db);
    await createAdmin(db, "hash");
    validToken = await startSession(db);
  });
  afterEach(() => {
    cookieJar.token = undefined;
  });

  const form = (fields: Record<string, string>) => {
    const data = new FormData();
    for (const [name, value] of Object.entries(fields)) data.append(name, value);
    return data;
  };
  // requireAdmin() redirects to /login by throwing Next's redirect error.
  const refusedToLogin = { digest: expect.stringMatching(/^NEXT_REDIRECT;.*;\/login;/) };

  it.each([undefined, "not-a-session"])("refuses every space action without a valid session (%s)", async (token) => {
    const { createSpaceAction, renameSpaceAction, deleteSpaceAction } = await actions;
    const space = await createSpace(db, "Untouched");
    cookieJar.token = token;
    await expect(createSpaceAction({}, form({ name: "Sneaky" }))).rejects.toMatchObject(refusedToLogin);
    await expect(renameSpaceAction({}, form({ id: space.id, name: "Sneaky" }))).rejects.toMatchObject(refusedToLogin);
    await expect(deleteSpaceAction({}, form({ id: space.id, confirm: "Untouched" }))).rejects.toMatchObject(refusedToLogin);
    expect((await getSpace(db, space.id))?.name).toBe("Untouched");
    expect((await listSpaces(db)).some((s) => s.name === "Sneaky")).toBe(false);
  });

  it("creates, renames and deletes with a valid session", async () => {
    const { createSpaceAction, renameSpaceAction, deleteSpaceAction } = await actions;
    cookieJar.token = validToken;
    expect(await createSpaceAction({}, form({ name: "" }))).toHaveProperty("error");
    await expect(createSpaceAction({}, form({ name: "Via action" }))).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT;.*;\/admin\/spaces\/[A-Za-z0-9_-]+;/),
    });
    const space = (await listSpaces(db)).find((s) => s.name === "Via action")!;
    expect(await renameSpaceAction({}, form({ id: space.id, name: " " }))).toHaveProperty("error");
    await expect(renameSpaceAction({}, form({ id: space.id, name: "Renamed" }))).rejects.toMatchObject({
      digest: expect.stringMatching(new RegExp(`^NEXT_REDIRECT;.*;/admin/spaces/${space.id}\\?renamed;`)),
    });
    expect(await deleteSpaceAction({}, form({ id: space.id, confirm: "Via action" }))).toHaveProperty("error");
    await expect(deleteSpaceAction({}, form({ id: space.id, confirm: "Renamed" }))).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT;.*;\/admin\?deleted;/),
    });
    expect(await getSpace(db, space.id)).toBeUndefined();
  });
});
