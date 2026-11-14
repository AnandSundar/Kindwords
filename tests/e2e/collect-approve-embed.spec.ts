import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

// F2 end to end (U11): set up the admin, create a space, submit through the public form with a photo,
// approve and feature it, then see it inside the embed's shadow root on another origin.
const PASSWORD = "e2e admin password";
const EMAIL = "submitter-e2e@example.com";
const TEXT = 'Saved us hours every week. <script>alert("pwned")</script> really.';

function setupCode(): string {
  const log = readFileSync(path.resolve("test-data/e2e/server.log"), "utf8");
  const code = /Kindwords setup code: ([A-Z2-7]+)/.exec(log)?.[1];
  if (!code) throw new Error(`No setup code in the server log:\n${log}`);
  return code;
}

test("submit, approve and feature a testimonial, then it shows in the embed (F2, AE2)", async ({ browser }) => {
  const dialogs: string[] = [];
  const watchDialogs = (page: Page) => page.on("dialog", (d) => (dialogs.push(d.message()), d.dismiss()));
  const adminContext = await browser.newContext();
  // CSP violations, collected the same way in every engine.
  await adminContext.addInitScript(() => {
    const seen: string[] = ((window as unknown as { __csp: string[] }).__csp = []);
    document.addEventListener("securitypolicyviolation", (e) => seen.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  const admin = await adminContext.newPage();
  watchDialogs(admin);

  // F1: first-run setup with the code from the server output. The browser projects share one server,
  // so only the first one sets up; the others sign in (setup is a 404 once the admin exists).
  const setupPage = await admin.goto("/setup");
  if (setupPage!.status() === 404) {
    await admin.goto("/login");
    await admin.getByLabel("Password").fill(PASSWORD);
    await admin.getByRole("button", { name: "Sign in" }).click();
  } else {
    expect(setupPage!.headers()["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    await admin.getByLabel("Setup code").fill(setupCode());
    await admin.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await admin.getByLabel("Confirm password").fill(PASSWORD);
    await admin.getByRole("button", { name: "Create admin account" }).click();
  }
  await expect(admin).toHaveURL(/\/admin$/);

  // A space and its public collection link.
  await admin.getByLabel("Space name").fill("Acme Notes");
  await admin.getByRole("button", { name: "Create space" }).click();
  await expect(admin).toHaveURL(/\/admin\/spaces\/[\w-]+$/);
  const spacePath = new URL(admin.url()).pathname;
  const collect = await admin.getByRole("link", { name: /\/c\// }).getAttribute("href");
  const publicId = collect!.split("/c/")[1];

  // F2: an anonymous customer submits through the real form, with a photo.
  const customer = await (await browser.newContext()).newPage();
  watchDialogs(customer);
  await customer.goto(collect!);
  await customer.getByLabel("Your name").fill("Rosa Díaz");
  await customer.getByLabel("Email").fill(EMAIL);
  await customer.getByLabel("Role and company (optional)").fill("Founder, Pebble");
  // What a screen reader announces: a named radio group, and choice rows at least 44px tall to click.
  await expect(customer.getByRole("radiogroup", { name: "Rating" }).getByRole("radio")).toHaveCount(5);
  for (const label of [customer.locator("label").filter({ has: customer.getByLabel("4 stars") }), customer.locator("label").filter({ hasText: "I agree that my name" })]) {
    expect((await label.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await customer.getByLabel("4 stars").check();
  await customer.getByLabel("Your testimonial").fill(TEXT);
  const photo = await sharp({ create: { width: 120, height: 120, channels: 3, background: "#3a7d6b" } }).png().toBuffer();
  await customer.getByLabel("Photo (optional)").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: photo });
  await customer.getByLabel(/I agree that my name/).check();
  await customer.getByRole("button", { name: "Send testimonial" }).click();
  await expect(customer.getByRole("heading", { name: "Thank you!" })).toBeVisible();

  // Moderation: approve, then feature.
  await admin.goto(`${spacePath}/inbox`);
  const pending = admin.getByRole("article").filter({ hasText: "Rosa Díaz" });
  await expect(pending).toContainText(TEXT);
  await pending.getByRole("button", { name: "Approve" }).click();
  await admin.goto(`${spacePath}/inbox?status=approved`);
  await admin.getByRole("article").filter({ hasText: "Rosa Díaz" }).getByRole("button", { name: "Feature" }).click();
  await expect(admin.getByRole("article").filter({ hasText: "Rosa Díaz" })).toContainText("Featured");
  // The admin flow above ran under the nonce CSP; nothing Next.js needs was blocked.
  expect(await admin.evaluate(() => (window as unknown as { __csp: string[] }).__csp)).toEqual([]);

  // The embed on a different origin: card inside the shadow root, text literal, no script ran.
  const host = await (await browser.newContext()).newPage();
  watchDialogs(host);
  await host.goto(`http://localhost:3301/?space=${publicId}`);
  const card = host.locator("kindwords-wall .kw-card"); // Playwright CSS pierces open shadow roots
  await expect(card).toHaveCount(1);
  await expect(card.locator(".kw-name")).toHaveText("Rosa Díaz");
  await expect(card.locator(".kw-role")).toHaveText("Founder, Pebble");
  await expect(card.locator(".kw-text")).toHaveText(TEXT);
  await expect(card.getByRole("img", { name: "4 out of 5 stars" })).toBeVisible();
  await expect(card).toHaveAttribute("data-featured", "");
  const avatar = card.locator("img.kw-avatar");
  await expect(avatar).toHaveJSProperty("complete", true);
  expect(await avatar.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  expect(await card.locator(".kw-text").evaluate((el) => getComputedStyle(el).color)).not.toBe("rgb(255, 0, 0)");

  // No <script> from the testimonial ran anywhere, and the email never reached the host page.
  expect(dialogs).toEqual([]);
  const everything = await host.evaluate(() => {
    const root = document.querySelector("kindwords-wall")!.shadowRoot!;
    return document.documentElement.outerHTML + new XMLSerializer().serializeToString(root);
  });
  expect(everything).not.toContain(EMAIL);
  expect(everything).not.toContain('<script>alert("pwned")');
});
