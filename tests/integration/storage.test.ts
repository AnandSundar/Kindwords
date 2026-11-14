/**
 * Storage drivers and the media route.
 *
 * Local disk always runs. S3 runs only when these are set (for example against MinIO):
 *   TEST_S3_ENDPOINT           e.g. http://localhost:9000
 *   TEST_S3_BUCKET             an existing bucket (default "kindwords-test")
 *   TEST_S3_ACCESS_KEY_ID      access key
 *   TEST_S3_SECRET_ACCESS_KEY  secret key
 *   TEST_S3_REGION             optional, default "us-east-1"
 */
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/media/[key]/route";
import { startSession } from "@/server/auth/session";
import { getDb, type OpenDb } from "@/server/db/client";
import { runMigrations } from "@/server/db/migrate";
import { createAdmin } from "@/server/db/repositories/admin";
import { createSpace } from "@/server/db/repositories/spaces";
import { createTestimonial } from "@/server/db/repositories/testimonials";
import type { StorageConfig } from "@/server/config";
import { createStorage, getStorage, newMediaKey, type Storage } from "@/server/storage";
import { processAvatar } from "@/server/uploads/avatar";

const uploadsDir = mkdtempSync(path.join(os.tmpdir(), "kindwords-uploads-"));
const appDbDir = mkdtempSync(path.join(os.tmpdir(), "kindwords-media-db-"));
// The media route reads the app-wide config; point it at temp files before first use.
process.env.STORAGE_DRIVER = "local";
process.env.UPLOADS_DIR = uploadsDir;
process.env.DATABASE_URL = `file:${path.join(appDbDir, "app.db").replaceAll("\\", "/")}`;
afterAll(() => {
  rmSync(uploadsDir, { recursive: true, force: true });
  try {
    rmSync(appDbDir, { recursive: true, force: true });
  } catch {}
});

// The route reads the admin session cookie through next/headers, which only works inside a request.
const cookieJar = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "kindwords_session" && cookieJar.token ? { name, value: cookieJar.token } : undefined),
  }),
}));

const configs: { name: string; config: StorageConfig }[] = [{ name: "local", config: { driver: "local", uploadsDir } }];
if (process.env.TEST_S3_ENDPOINT) {
  configs.push({
    name: "s3",
    config: {
      driver: "s3",
      endpoint: process.env.TEST_S3_ENDPOINT,
      bucket: process.env.TEST_S3_BUCKET ?? "kindwords-test",
      region: process.env.TEST_S3_REGION ?? "us-east-1",
      accessKeyId: process.env.TEST_S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.TEST_S3_SECRET_ACCESS_KEY,
    },
  });
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  return Buffer.from(await new Response(stream).arrayBuffer());
}

describe.each(configs)("$name storage", ({ config }) => {
  const storage: Storage = createStorage(config);

  it("round-trips put, get and delete", async () => {
    const key = newMediaKey();
    const data = Buffer.from("hello avatar bytes");
    await storage.put(key, data);
    const stream = await storage.get(key);
    expect(stream).not.toBeNull();
    expect(await readAll(stream!)).toEqual(data);
    await storage.delete(key);
    expect(await storage.get(key)).toBeNull();
  });

  it("returns null for an unknown key and tolerates deleting it", async () => {
    const key = newMediaKey();
    expect(await storage.get(key)).toBeNull();
    await storage.delete(key);
  });

  it.each(["../escape", "..", "a/b", "a\\b", "", "..%2Fx"])("refuses the key %j", async (key) => {
    await expect(storage.put(key, Buffer.from("x"))).rejects.toThrow(/key/i);
    await expect(storage.get(key)).rejects.toThrow(/key/i);
    await expect(storage.delete(key)).rejects.toThrow(/key/i);
  });
});

describe("newMediaKey", () => {
  it("is random", () => {
    expect(newMediaKey()).not.toBe(newMediaKey());
  });
});

describe("GET /media/[key]", () => {
  const call = (key: string) => GET(new Request(`http://localhost/media/${key}`), { params: Promise.resolve({ key }) });
  let db: OpenDb;
  let spaceId: string;
  let adminToken: string;
  beforeAll(async () => {
    db = getDb() as OpenDb;
    await runMigrations(db);
    await createAdmin(db, "hash");
    adminToken = await startSession(db);
    spaceId = (await createSpace(db, "Media")).id;
  });
  afterEach(() => {
    cookieJar.token = undefined;
  });

  const stored = async (status: "pending" | "approved" | "rejected") => {
    const avatar = await processAvatar(await sharp({ create: { width: 64, height: 64, channels: 3, background: "#0a0" } }).png().toBuffer());
    const key = newMediaKey();
    await getStorage().put(key, avatar);
    await createTestimonial(db, { spaceId, name: "Ann", text: "Kind words here.", status, avatarKey: key });
    return { key, avatar };
  };

  it("serves an approved testimonial's avatar publicly with the KTD8 headers, cached for a day", async () => {
    const { key, avatar } = await stored("approved");
    const res = await call(key);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
    expect(res.headers.get("cross-origin-resource-policy")).toBe("cross-origin");
    expect(res.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(avatar);
  });

  it.each(["pending", "rejected"] as const)("hides a %s testimonial's avatar from the public but shows it to the admin, uncached", async (status) => {
    const { key } = await stored(status);
    expect((await call(key)).status).toBe(404);
    cookieJar.token = "not-a-session";
    expect((await call(key)).status).toBe(404);
    cookieJar.token = adminToken;
    const res = await call(key);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("returns 404 for a stored file no testimonial uses", async () => {
    const key = newMediaKey();
    await getStorage().put(key, Buffer.from("orphan"));
    cookieJar.token = adminToken;
    expect((await call(key)).status).toBe(404);
  });

  it.each(["doesnotexist", "../etc", "..", "a%2Fb"])("returns 404 for %j", async (key) => {
    const res = await call(key);
    expect(res.status).toBe(404);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
