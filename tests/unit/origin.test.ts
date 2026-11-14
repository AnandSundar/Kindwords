import { describe, expect, it, vi } from "vitest";
import { publicOrigin } from "@/server/origin";

vi.mock("@/server/config", () => ({ getConfig: () => ({}) }));

const headers = (h: Record<string, string>) => new Headers(h);

describe("publicOrigin (KTD13)", () => {
  it("prefers PUBLIC_URL over the request headers", () => {
    expect(publicOrigin(headers({ host: "evil.test" }), "https://reviews.example.com")).toBe("https://reviews.example.com");
  });

  it("falls back to the Host header, https only when x-forwarded-proto says exactly https", () => {
    expect(publicOrigin(headers({ host: "reviews.test" }))).toBe("http://reviews.test");
    expect(publicOrigin(headers({ host: "reviews.test", "x-forwarded-proto": "https" }))).toBe("https://reviews.test");
    expect(publicOrigin(headers({ host: "reviews.test", "x-forwarded-proto": "javascript" }))).toBe("http://reviews.test");
  });

  it("ignores X-Forwarded-Host, so a forged host never reaches cached avatar URLs", () => {
    expect(publicOrigin(headers({ host: "reviews.test", "x-forwarded-host": "evil.test" }))).toBe("http://reviews.test");
  });
});
