import { describe, expect, it } from "vitest";
import { parseConfig } from "@/server/config";

describe("parseConfig", () => {
  it("defaults to SQLite, local storage and no trusted proxies", () => {
    expect(parseConfig({})).toEqual({
      databaseUrl: "file:/data/kindwords.db",
      publicUrl: undefined,
      cookieSecure: false,
      trustedProxyCount: 0,
      storage: { driver: "local", uploadsDir: "/data/uploads" },
    });
  });

  it("accepts a Postgres URL", () => {
    expect(parseConfig({ DATABASE_URL: "postgres://u:p@db/kw" }).databaseUrl).toBe("postgres://u:p@db/kw");
  });

  it("rejects an unknown database scheme", () => {
    expect(() => parseConfig({ DATABASE_URL: "mysql://x" })).toThrow(/DATABASE_URL/);
  });

  it("requires S3_BUCKET when STORAGE_DRIVER=s3", () => {
    expect(() => parseConfig({ STORAGE_DRIVER: "s3" })).toThrow(/S3_BUCKET/);
  });

  it("parses S3 settings", () => {
    expect(parseConfig({ STORAGE_DRIVER: "s3", S3_BUCKET: "b", S3_ENDPOINT: "http://minio:9000" }).storage).toEqual({
      driver: "s3",
      bucket: "b",
      region: "us-east-1",
      endpoint: "http://minio:9000",
      accessKeyId: undefined,
      secretAccessKey: undefined,
    });
  });

  it("rejects an S3 access key without its secret", () => {
    expect(() => parseConfig({ STORAGE_DRIVER: "s3", S3_BUCKET: "b", S3_ACCESS_KEY_ID: "k" })).toThrow(/S3_SECRET_ACCESS_KEY/);
  });

  it("rejects an unknown storage driver", () => {
    expect(() => parseConfig({ STORAGE_DRIVER: "ftp" })).toThrow(/STORAGE_DRIVER/);
  });

  it("rejects PUBLIC_URL without a scheme", () => {
    expect(() => parseConfig({ PUBLIC_URL: "reviews.example.com" })).toThrow(/PUBLIC_URL/);
  });

  it("rejects a non-http PUBLIC_URL", () => {
    expect(() => parseConfig({ PUBLIC_URL: "ftp://reviews.example.com" })).toThrow(/PUBLIC_URL/);
  });

  it("marks cookies secure for an https PUBLIC_URL and normalizes it to an origin", () => {
    const config = parseConfig({ PUBLIC_URL: "https://reviews.example.com/" });
    expect(config.publicUrl).toBe("https://reviews.example.com");
    expect(config.cookieSecure).toBe(true);
  });

  it("keeps cookies non-secure for an http PUBLIC_URL", () => {
    expect(parseConfig({ PUBLIC_URL: "http://192.168.1.5:3000" }).cookieSecure).toBe(false);
  });

  it.each(["-1", "abc", "1.5"])("rejects TRUSTED_PROXY_COUNT=%s", (value) => {
    expect(() => parseConfig({ TRUSTED_PROXY_COUNT: value })).toThrow(/TRUSTED_PROXY_COUNT/);
  });

  it("parses a valid TRUSTED_PROXY_COUNT", () => {
    expect(parseConfig({ TRUSTED_PROXY_COUNT: "2" }).trustedProxyCount).toBe(2);
  });
});
