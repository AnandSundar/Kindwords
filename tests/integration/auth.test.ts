import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { requireAdminRequest } from "@/server/auth/guard";
import { createThrottle, GLOBAL_THRESHOLD, TOO_MANY_ATTEMPTS } from "@/server/auth/login-throttle";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { attemptLogin, hashToken, SESSION_COOKIE, startSession, validateSession } from "@/server/auth/session";
import { completeSetup, setSetupCode, SETUP_DONE } from "@/server/auth/setup-code";
import { openDb, type OpenDb } from "@/server/db/client";
import { runMigrations } from "@/server/db/migrate";
import { createAdmin, getAdmin } from "@/server/db/repositories/admin";
import { getSession, touchSession } from "@/server/db/repositories/sessions";
import { removeTempDirs, targets } from "./db-helpers";

const DAY = 24 * 60 * 60 * 1000;
const root = process.cwd();

afterAll(removeTempDirs);

describe.each(targets)("auth on $name", (target) => {
  let db: OpenDb;
  beforeEach(async () => {
    db = await target.open();
    setSetupCode("RIGHTCODE");
  });
  afterEach(async () => {
    setSetupCode(undefined);
    await db.close();
  });

  const setupInput = (code: string) => ({ code, password: "a good password", confirm: "a good password" });

  describe("setup", () => {
    it("refuses once an admin exists (AE6)", async () => {
      await createAdmin(db, await hashPassword("existing password"));
      expect(await completeSetup(db, "1.1.1.1", setupInput("RIGHTCODE"), createThrottle())).toEqual({ error: SETUP_DONE });
      expect(await verifyPassword("existing password", (await getAdmin(db))!.passwordHash)).toBe(true);
    });

    it("refuses a wrong code and creates no admin (AE6)", async () => {
      const result = await completeSetup(db, "1.1.1.1", setupInput("WRONGCODE"), createThrottle());
      expect(result).toMatchObject({ fieldErrors: { code: expect.any(String) } });
      expect(await getAdmin(db)).toBeUndefined();
    });

    it("creates exactly one admin from two concurrent submissions with the right code", async () => {
      const throttle = createThrottle();
      const results = await Promise.all([
        completeSetup(db, "1.1.1.1", setupInput("RIGHTCODE"), throttle),
        completeSetup(db, "2.2.2.2", setupInput("RIGHTCODE"), throttle),
      ]);
      expect(results.filter((r) => "token" in r)).toHaveLength(1);
      expect(results.filter((r) => "error" in r && r.error === SETUP_DONE)).toHaveLength(1);
      expect(await db.q.select().from(db.t.admin)).toHaveLength(1);
      expect(await db.q.select().from(db.t.sessions)).toHaveLength(1);
    });

    it("throttles repeated wrong codes from one IP, even when the sixth is right", async () => {
      const throttle = createThrottle();
      for (let i = 0; i < 5; i++) {
        expect(await completeSetup(db, "6.6.6.6", setupInput(`WRONG${i}`), throttle)).toHaveProperty("fieldErrors.code");
      }
      expect(await completeSetup(db, "6.6.6.6", setupInput("RIGHTCODE"), throttle)).toEqual({ error: TOO_MANY_ATTEMPTS });
      expect(await getAdmin(db)).toBeUndefined();
    });
  });

  describe("login", () => {
    beforeEach(async () => {
      await createAdmin(db, await hashPassword("the password"));
    });

    it("throttles the sixth attempt from one IP within 15 minutes, but not other IPs", async () => {
      const throttle = createThrottle();
      for (let i = 0; i < 5; i++) {
        expect(await attemptLogin(db, "6.6.6.6", "wrong", throttle)).toEqual({ error: "That password is not correct." });
      }
      expect(await attemptLogin(db, "6.6.6.6", "the password", throttle)).toEqual({ error: TOO_MANY_ATTEMPTS });
      expect(await attemptLogin(db, "7.7.7.7", "the password", throttle)).toHaveProperty("token");
    });

    it("slows attempts past the global threshold but never refuses the right password", async () => {
      const throttle = createThrottle();
      for (let i = 0; i < GLOBAL_THRESHOLD + 2; i++) await throttle.attempt(`10.0.0.${i}`, async () => false);
      const started = performance.now();
      expect(await attemptLogin(db, "10.9.9.9", "wrong", throttle)).toEqual({ error: "That password is not correct." });
      expect(await attemptLogin(db, "10.9.9.8", "the password", throttle)).toHaveProperty("token");
      expect(performance.now() - started).toBeGreaterThanOrEqual(500); // 300 ms + 400 ms of added delay
    });
  });

  describe("sessions", () => {
    beforeEach(async () => {
      await createAdmin(db, "hash");
    });

    it("refuses a session idle for more than 7 days and deletes it", async () => {
      const now = Date.now();
      const token = await startSession(db, now - 8 * DAY);
      expect(await validateSession(db, token, now)).toBeUndefined();
      expect(await getSession(db, hashToken(token))).toBeUndefined();
    });

    it("refuses a session older than 30 days even if it was used recently", async () => {
      const now = Date.now();
      const token = await startSession(db, now - 31 * DAY);
      await touchSession(db, hashToken(token), now - DAY);
      expect(await validateSession(db, token, now)).toBeUndefined();
    });

    it("slides the idle window on use", async () => {
      const now = Date.now();
      const token = await startSession(db, now - 6 * DAY);
      expect(await validateSession(db, token, now)).toBeDefined();
      expect(await validateSession(db, token, now + 6 * DAY)).toBeDefined();
    });

    it("guards mutating route handlers: foreign Origin 403, missing or expired session 401", async () => {
      const valid = await startSession(db);
      const expired = await startSession(db, Date.now() - 31 * DAY);
      const call = (origin: string, token?: string, publicUrl?: string) =>
        requireAdminRequest(
          new Request("http://kw.test/admin/thing", {
            method: "POST",
            headers: { origin, ...(token && { cookie: `other=1; ${SESSION_COOKIE}=${token}` }) },
          }),
          db,
          publicUrl,
        );
      expect(await call("http://evil.test", valid)).toHaveProperty("status", 403);
      expect(await call("http://kw.test")).toHaveProperty("status", 401);
      expect(await call("http://kw.test", expired)).toHaveProperty("status", 401);
      expect(await call("http://kw.test", valid)).toHaveProperty("adminId", "admin");
      // With PUBLIC_URL set, it is the only accepted origin.
      expect(await call("http://kw.test", valid, "https://reviews.example.com")).toHaveProperty("status", 403);
      expect(await call("https://reviews.example.com", valid, "https://reviews.example.com")).toHaveProperty("adminId");
    });
  });
});

async function tempSqlite(): Promise<{ url: string; db: OpenDb }> {
  const dir = mkdtempSync(path.join(os.tmpdir(), "kindwords-auth-"));
  const url = `file:${path.join(dir, "app.db").replaceAll("\\", "/")}`;
  const db = openDb(url);
  await runMigrations(db);
  return { url, db };
}

describe("reset-password CLI", () => {
  it("replaces the password and signs out every session", async () => {
    const { url, db } = await tempSqlite();
    await createAdmin(db, await hashPassword("old password"));
    const token = await startSession(db);
    const run = spawnSync(process.execPath, [path.join(root, "node_modules/tsx/dist/cli.mjs"), "src/cli/reset-password.ts"], {
      cwd: root,
      env: { ...process.env, DATABASE_URL: url },
      input: "brand new password\n",
      encoding: "utf8",
    });
    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
    expect(await validateSession(db, token)).toBeUndefined();
    const { passwordHash } = (await getAdmin(db))!;
    expect(await verifyPassword("brand new password", passwordHash)).toBe(true);
    expect(await verifyPassword("old password", passwordHash)).toBe(false);
    await db.close();
  }, 30_000);
});

// The real production startup path: `next build`, then server/start.mjs on a random port.
describe("built app via server/start.mjs", () => {
  type App = { base: string; db: OpenDb; setupCode?: string; child: ChildProcess };
  const apps: App[] = [];

  beforeAll(() => {
    const build = spawnSync(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "build"], {
      cwd: root,
      env: { ...process.env, NODE_ENV: "production" },
      encoding: "utf8",
    });
    if (build.status !== 0) throw new Error(`next build failed:\n${build.stdout}\n${build.stderr}`);
  }, 600_000);

  afterAll(async () => {
    for (const app of apps) {
      app.child.kill();
      await app.db.close();
    }
  });

  async function startApp(env: Record<string, string> = {}): Promise<App> {
    const { url, db } = await tempSqlite();
    const port = await new Promise<number>((resolve) => {
      const probe = net.createServer().listen(0, "127.0.0.1", () => {
        const { port } = probe.address() as net.AddressInfo;
        probe.close(() => resolve(port));
      });
    });
    const child = spawn(process.execPath, ["server/start.mjs"], {
      cwd: root,
      env: { ...process.env, PORT: String(port), HOSTNAME: "127.0.0.1", DATABASE_URL: url, TRUSTED_PROXY_COUNT: "0", ...env },
    });
    let output = "";
    child.stdout!.on("data", (chunk) => (output += chunk));
    child.stderr!.on("data", (chunk) => (output += chunk));
    await new Promise<void>((resolve, reject) => {
      const timer = setInterval(() => output.includes("Kindwords listening") && (clearInterval(timer), resolve()), 50);
      child.on("exit", (code) => (clearInterval(timer), reject(new Error(`server exited (${code}):\n${output}`))));
    });
    const app = { base: `http://127.0.0.1:${port}`, db, child, setupCode: /Kindwords setup code: ([A-Z2-7]+)/.exec(output)?.[1] };
    apps.push(app);
    return app;
  }

  const decode = (s: string) =>
    s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

  /** Submits the page's form the way a browser without JavaScript does: hidden inputs plus fields. */
  async function submit(
    app: App,
    page: string,
    fields: Record<string, string>,
    opts: { cookie?: string; pageCookie?: string; origin?: string; xff?: string } = {},
  ): Promise<Response> {
    const pageCookie = opts.pageCookie ?? opts.cookie;
    const html = await (await fetch(app.base + page, { headers: pageCookie ? { cookie: pageCookie } : {} })).text();
    const form = new FormData();
    for (const [tag] of html.matchAll(/<input[^>]*>/g)) {
      if (!tag.includes('type="hidden"')) continue;
      const attr = (name: string) => decode(new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? "");
      form.append(attr("name"), attr("value"));
    }
    for (const [name, value] of Object.entries(fields)) form.append(name, value);
    return fetch(app.base + page, {
      method: "POST",
      body: form,
      redirect: "manual",
      headers: {
        origin: opts.origin ?? app.base,
        ...(opts.cookie && { cookie: opts.cookie }),
        ...(opts.xff && { "x-forwarded-for": opts.xff }),
      },
    });
  }

  const sessionCookie = (res: Response) => res.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  const get = (app: App, page: string, cookie?: string) =>
    fetch(app.base + page, { redirect: "manual", headers: cookie ? { cookie } : {} });

  let app: App;
  let cookie: string;

  it("prints a setup code at boot that the setup action accepts, then setup is gone (F1, AE6)", async () => {
    app = await startApp();
    expect(app.setupCode!.length * 5).toBeGreaterThanOrEqual(128);
    expect((await get(app, "/admin")).headers.get("location")).toMatch(/\/login$/);

    const res = await submit(app, "/setup", { code: app.setupCode!, password: "a good password", confirm: "a good password" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/admin");
    const setCookie = sessionCookie(res)!;
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=lax/i);
    expect(setCookie).not.toMatch(/Secure/i);
    cookie = setCookie.split(";")[0];

    const admin = await get(app, "/admin", cookie);
    expect(admin.status).toBe(200);
    expect(await admin.text()).toContain("Dashboard");
    expect((await get(app, "/setup")).status).toBe(404);
  }, 60_000);

  it("refuses an admin server action from a foreign Origin", async () => {
    const res = await submit(app, "/admin", {}, { cookie, origin: "http://evil.example" });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await get(app, "/admin", cookie)).status).toBe(200); // logout did not run
  });

  it("refuses an expired session at an admin page and an admin server action", async () => {
    const expired = `${SESSION_COOKIE}=${await startSession(app.db, Date.now() - 31 * DAY)}`;
    expect((await get(app, "/admin", expired)).headers.get("location")).toMatch(/\/login$/);
    const res = await submit(app, "/admin", {}, { cookie: expired, pageCookie: cookie });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/login"); // the guard's redirect, not logout's "?signed-out"
  });

  it("logs out, after which the deleted session is refused", async () => {
    const res = await submit(app, "/admin", {}, { cookie });
    expect(res.headers.get("location")).toBe("/login?signed-out");
    expect((await get(app, "/admin", cookie)).headers.get("location")).toMatch(/\/login$/);
  });

  it("logs in with HttpOnly, SameSite=Lax cookie and no Secure under http", async () => {
    const res = await submit(app, "/login", { password: "a good password" });
    expect(res.status).toBe(303);
    const setCookie = sessionCookie(res)!;
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=lax/i);
    expect(setCookie).not.toMatch(/Secure/i);
  });

  it("keeps counting failures per IP when the client forges X-Forwarded-For (TRUSTED_PROXY_COUNT=0)", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await submit(app, "/login", { password: "wrong" }, { xff: `198.51.100.${i}` });
      expect(await res.text()).toContain("That password is not correct.");
    }
    const res = await submit(app, "/login", { password: "a good password" }, { xff: "198.51.100.99" });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain(TOO_MANY_ATTEMPTS);
  });

  it("marks the cookie Secure under an https PUBLIC_URL", async () => {
    const secureApp = await startApp({ PUBLIC_URL: "https://reviews.example.com" });
    const res = await submit(secureApp, "/setup", {
      code: secureApp.setupCode!,
      password: "a good password",
      confirm: "a good password",
    });
    expect(res.status).toBe(303);
    expect(sessionCookie(res)).toMatch(/;\s*Secure/i);
  }, 60_000);
});
