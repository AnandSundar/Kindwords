import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenDb } from "@/server/db/client";
import { createSpace, deleteSpace, type Space } from "@/server/db/repositories/spaces";
import { listTestimonials } from "@/server/db/repositories/testimonials";
import { createSubmitLimiter } from "@/server/rate-limit";
import { createStorage } from "@/server/storage";
import { MAX_BODY_BYTES, submitTestimonial, type SubmitDeps } from "@/server/testimonials/submit";
import { removeTempDirs, targets } from "./db-helpers";

// Lets one test make the testimonial insert fail after the avatar is stored.
const failInsert = vi.hoisted(() => ({ on: false }));
vi.mock("@/server/db/repositories/testimonials", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/server/db/repositories/testimonials")>();
  return {
    ...real,
    createTestimonial: (...args: Parameters<typeof real.createTestimonial>) =>
      failInsert.on ? Promise.reject(new Error("insert failed")) : real.createTestimonial(...args),
  };
});

const ORIGIN = "http://kw.test";
const valid = {
  name: "Ann Lee",
  email: "ann@example.com",
  role: "CTO, Acme",
  rating: "5",
  text: "Kindwords made collecting reviews painless.",
  consent: "on",
};

afterAll(removeTempDirs);

describe.each(targets)("public submission on $name", (target) => {
  let db: OpenDb;
  let uploadsDir: string;
  let deps: SubmitDeps;
  let space: Space;

  beforeEach(async () => {
    db = await target.open();
    uploadsDir = mkdtempSync(path.join(os.tmpdir(), "kindwords-submit-"));
    deps = { db, storage: createStorage({ driver: "local", uploadsDir }), limiter: createSubmitLimiter(), publicUrl: undefined };
    space = await createSpace(db, "Acme");
  });
  afterEach(async () => {
    failInsert.on = false;
    await db.close();
    rmSync(uploadsDir, { recursive: true, force: true });
  });

  /** A browser-shaped multipart POST with a Content-Length, from `ip`. */
  async function post(
    fields: Record<string, string>,
    opts: { ip?: string; publicId?: string; origin?: string; avatar?: Buffer } = {},
  ): Promise<Response> {
    const form = new FormData();
    for (const [name, value] of Object.entries(fields)) form.append(name, value);
    form.append("avatar", new Blob(opts.avatar ? [new Uint8Array(opts.avatar)] : []), opts.avatar ? "me.png" : "");
    const encoded = new Request(ORIGIN, { method: "POST", body: form });
    const body = await encoded.arrayBuffer();
    const publicId = opts.publicId ?? space.publicId;
    const request = new Request(`${ORIGIN}/api/submit/${publicId}`, {
      method: "POST",
      body,
      headers: {
        "content-type": encoded.headers.get("content-type")!,
        "content-length": String(body.byteLength),
        origin: opts.origin ?? ORIGIN,
        "x-kindwords-client-ip": opts.ip ?? "203.0.113.1",
      },
    });
    return submitTestimonial(request, publicId, deps);
  }

  const stored = () => listTestimonials(db, space.id);
  const files = () => (existsSync(uploadsDir) ? readdirSync(uploadsDir) : []);
  const fieldErrors = async (res: Response) => Object.keys(((await res.json()) as { fieldErrors: object }).fieldErrors);
  const expectThanks = (res: Response, publicId = space.publicId) => {
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`/c/${publicId}/thanks`);
  };

  it("stores a real submission as pending with its avatar (F2)", async () => {
    const avatar = await sharp({ create: { width: 40, height: 40, channels: 3, background: "#c33" } }).png().toBuffer();
    expectThanks(await post(valid, { avatar }));
    const [row] = await stored();
    expect(row).toMatchObject({
      status: "pending",
      featured: false,
      name: "Ann Lee",
      email: "ann@example.com",
      roleCompany: "CTO, Acme",
      rating: 5,
      text: valid.text,
    });
    expect(files()).toEqual([row.avatarKey]);
  });

  it("refuses a complete submission without consent and stores nothing (AE1)", async () => {
    const noConsent: Record<string, string> = { ...valid };
    delete noConsent.consent;
    const res = await post(noConsent, { avatar: await sharp({ create: { width: 8, height: 8, channels: 3, background: "#000" } }).png().toBuffer() });
    expect(res.status).toBe(400);
    expect(await fieldErrors(res)).toEqual(["consent"]);
    expect(await stored()).toEqual([]);
    expect(files()).toEqual([]);
  });

  it("silently discards a filled honeypot with the thank-you redirect (AE5)", async () => {
    expectThanks(await post({ ...valid, website: "http://spam.example" }));
    expect(await stored()).toEqual([]);
  });

  it("does not charge a filled honeypot against the client's allowance", async () => {
    for (let i = 0; i < 6; i++) expectThanks(await post({ ...valid, website: "spam" }));
    for (let i = 0; i < 5; i++) expectThanks(await post(valid));
    expect(await stored()).toHaveLength(5);
  });

  it("refuses the 6th submission from one IP to one space in 10 minutes; another space is unaffected (AE5)", async () => {
    for (let i = 0; i < 5; i++) expectThanks(await post(valid));
    const res = await post(valid);
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: string }).error).toMatch(/try again later/i);
    expect(await stored()).toHaveLength(5);

    const other = await createSpace(db, "Other");
    expectThanks(await post(valid, { publicId: other.publicId }), other.publicId);
  });

  it("refuses the 51st submission to a space within an hour from varied IPs", async () => {
    for (let i = 0; i < 50; i++) expectThanks(await post(valid, { ip: `198.51.100.${i}` }));
    expect((await post(valid, { ip: "192.0.2.200" })).status).toBe(429);
    expect(await stored()).toHaveLength(50);
  }, 30_000);

  /** A request whose body is a stream; `pulled` counts the bytes the handler actually read. */
  function streamed(bytes: number, contentLength?: string) {
    const counter = { pulled: 0 };
    let sent = 0;
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (sent >= bytes) return controller.close();
          const chunk = new Uint8Array(Math.min(64 * 1024, bytes - sent));
          sent += chunk.length;
          counter.pulled += chunk.length;
          controller.enqueue(chunk);
        },
      },
      { highWaterMark: 0 },
    );
    const request = new Request(`${ORIGIN}/api/submit/${space.publicId}`, {
      method: "POST",
      body,
      duplex: "half",
      headers: {
        "content-type": "multipart/form-data; boundary=x",
        origin: ORIGIN,
        ...(contentLength && { "content-length": contentLength }),
      },
    } as RequestInit);
    return { request, counter };
  }

  it("refuses a 10 MB body before reading it", async () => {
    const { request, counter } = streamed(10 * 1024 * 1024, String(10 * 1024 * 1024));
    expect((await submitTestimonial(request, space.publicId, deps)).status).toBe(413);
    expect(counter.pulled).toBe(0);
  });

  it("refuses a body with no Content-Length before reading it", async () => {
    const { request, counter } = streamed(1000);
    expect((await submitTestimonial(request, space.publicId, deps)).status).toBe(411);
    expect(counter.pulled).toBe(0);
  });

  it("stops reading a body that streams past the limit despite a small Content-Length", async () => {
    const { request, counter } = streamed(10 * 1024 * 1024, "1000");
    expect((await submitTestimonial(request, space.publicId, deps)).status).toBe(413);
    expect(counter.pulled).toBeLessThanOrEqual(MAX_BODY_BYTES + 64 * 1024);
  });

  it("stores markup byte-for-byte as plain text (R9)", async () => {
    const text = `<script>alert(1)</script> & <b>"bold"</b> &amp; it's fine`;
    expectThanks(await post({ ...valid, text }));
    expect((await stored())[0].text).toBe(text);
  });

  it("keeps emoji, right-to-left text and line breaks unchanged", async () => {
    const text = "Great 👍🏽 product\r\n\r\nשלום עולם — مرحبا\r\nthanks!";
    expectThanks(await post({ ...valid, name: "Zoë 李 محمد", text: `  ${text}\r\n ` }));
    const [row] = await stored();
    expect(row.text).toBe(text);
    expect(row.name).toBe("Zoë 李 محمد");
  });

  it.each([
    ["9-character text", { text: "123456789" }, "text"],
    ["2001-character text", { text: "x".repeat(2001) }, "text"],
    ["missing name", { name: "" }, "name"],
    ["rating 0", { rating: "0" }, "rating"],
    ["rating 6", { rating: "6" }, "rating"],
  ])("refuses a %s with a field error", async (_label, patch, field) => {
    const res = await post({ ...valid, ...patch });
    expect(res.status).toBe(400);
    expect(await fieldErrors(res)).toEqual([field]);
    expect(await stored()).toEqual([]);
  });

  it("refuses a file that is not an image with an avatar error", async () => {
    const res = await post(valid, { avatar: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>") });
    expect(res.status).toBe(400);
    expect(await fieldErrors(res)).toEqual(["avatar"]);
    expect(await stored()).toEqual([]);
    expect(files()).toEqual([]);
  });

  it("deletes the stored avatar when the testimonial insert fails", async () => {
    failInsert.on = true;
    const avatar = await sharp({ create: { width: 40, height: 40, channels: 3, background: "#3c3" } }).png().toBuffer();
    await expect(post(valid, { avatar })).rejects.toThrow("insert failed");
    expect(files()).toEqual([]);
  });

  it("refuses an unknown or deleted space's public ID", async () => {
    expect((await post(valid, { publicId: "no-such-space" })).status).toBe(404);
    await deleteSpace(db, space.id);
    expect((await post(valid)).status).toBe(404);
    expect(await stored()).toEqual([]);
  });

  it("refuses a foreign Origin, and with PUBLIC_URL set accepts only that origin (KTD6, KTD13)", async () => {
    expect((await post(valid, { origin: "http://evil.test" })).status).toBe(403);
    deps.publicUrl = "https://reviews.example.com";
    expect((await post(valid)).status).toBe(403);
    expectThanks(await post(valid, { origin: "https://reviews.example.com" }));
    expect(await stored()).toHaveLength(1);
  });
});
