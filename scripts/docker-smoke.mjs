// U10 container smoke test: `docker compose up` on a throwaway project, then F1 setup, a submission
// with a photo, persistence across down/up, reset-password through exec, and a non-root user.
// Usage: node scripts/docker-smoke.mjs   (builds the image if it is missing)
import { execFileSync } from "node:child_process";

const PROJECT = "kindwords-smoke";
const PORT = "3400";
const BASE = `http://127.0.0.1:${PORT}`;
const env = { ...process.env, KINDWORDS_PORT: PORT };
const compose = (args, input) => execFileSync("docker", ["compose", "-p", PROJECT, ...args], { env, encoding: "utf8", input });
const step = (message) => console.log(`- ${message}`);
const fail = (message) => {
  throw new Error(message);
};

async function healthy() {
  for (let i = 0; i < 90; i++) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  fail(`not healthy:\n${compose(["logs"])}`);
}

/** Posts the page's form holding these fields the way a browser without JavaScript does. */
async function submitForm(page, fields, cookie) {
  const html = await (await fetch(BASE + page, { headers: cookie ? { cookie } : {} })).text();
  const first = Object.keys(fields)[0];
  const formHtml = [...html.matchAll(/<form[\s\S]*?<\/form>/g)].map((m) => m[0]).find((f) => f.includes(`name="${first}"`));
  if (!formHtml) fail(`no form with ${first} on ${page}`);
  const form = new FormData();
  for (const [tag] of formHtml.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
    const attr = (name) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1]?.replaceAll("&quot;", '"').replaceAll("&amp;", "&") ?? "";
    form.append(attr("name"), attr("value"));
  }
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  return fetch(BASE + page, { method: "POST", body: form, redirect: "manual", headers: { origin: BASE, ...(cookie && { cookie }) } });
}
const sessionCookie = (res) => res.headers.getSetCookie().find((c) => c.startsWith("kindwords_session="))?.split(";")[0];

try {
  compose(["up", "-d", "--build", "--wait"]);
  await healthy();
  step("container healthy");

  const uid = compose(["exec", "-T", "kindwords", "id", "-u"]).trim();
  if (uid === "0") fail("container runs as root");
  step(`runs as uid ${uid}, not root`);

  const code = /Kindwords setup code: ([A-Z2-7]+)/.exec(compose(["logs", "kindwords"]))?.[1] ?? fail("no setup code in logs");
  const setup = await submitForm("/setup", { code, password: "smoke test password", confirm: "smoke test password" });
  const cookie = sessionCookie(setup) ?? fail(`setup failed: ${setup.status}`);
  step("setup code printed at boot and accepted (F1)");

  const created = await submitForm("/admin", { name: "Smoke" }, cookie);
  const spacePath = created.headers.get("location") ?? fail(`space not created: ${created.status}`);
  const spaceHtml = await (await fetch(BASE + spacePath, { headers: { cookie } })).text();
  const publicId = /\/c\/([A-Za-z0-9_-]+)/.exec(spaceHtml)?.[1] ?? fail("no collection link");

  // A 1x1 PNG is enough: the server re-encodes it to webp.
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  const form = new FormData();
  for (const [k, v] of Object.entries({ name: "Ann", email: "ann@example.com", rating: "5", text: "Works in Docker.", consent: "on" })) form.append(k, v);
  form.append("avatar", new Blob([png], { type: "image/png" }), "a.png");
  const sent = await fetch(`${BASE}/api/submit/${publicId}`, { method: "POST", body: form, redirect: "manual", headers: { origin: BASE } });
  if (sent.status !== 303) fail(`submission failed: ${sent.status} ${await sent.text()}`);
  const inbox = async (c) => (await fetch(`${BASE}${spacePath}/inbox`, { headers: { cookie: c } })).text();
  const mediaKey = /\/media\/([A-Za-z0-9_-]+)/.exec(await inbox(cookie))?.[1] ?? fail("no photo in the inbox");
  step("public form stored a testimonial with its photo");

  compose(["down"]);
  compose(["up", "-d", "--wait"]);
  await healthy();
  if ((await fetch(`${BASE}/setup`)).status !== 404) fail("setup reopened after restart");
  if (!(await inbox(cookie)).includes("Works in Docker.")) fail("testimonial lost across down/up");
  if ((await fetch(`${BASE}/media/${mediaKey}`, { headers: { cookie } })).status !== 200) fail("photo lost across down/up");
  step("data and photo survive docker compose down + up");

  compose(["exec", "-T", "kindwords", "reset-password"], "a brand new password\n");
  if ((await fetch(`${BASE}/admin`, { headers: { cookie }, redirect: "manual" })).status !== 307) fail("old session survived the reset");
  const login = await submitForm("/login", { password: "a brand new password" });
  if (!sessionCookie(login)) fail("login with the reset password failed");
  step("reset-password through docker compose exec works and signs out old sessions (R3)");
  console.log("Docker smoke test passed.");
} finally {
  compose(["down", "-v"]);
}
