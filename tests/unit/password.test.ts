import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/server/auth/password";

describe("password hashing", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const hash = await hashPassword("correct horse");
    expect(hash).toMatch(/^scrypt\$17\$8\$1\$/);
    expect(await verifyPassword("correct horse", hash)).toBe(true);
    expect(await verifyPassword("correct hors", hash)).toBe(false);
  });

  it("hashes the same password differently each time", async () => {
    const [a, b] = await Promise.all([hashPassword("same password"), hashPassword("same password")]);
    expect(a).not.toBe(b);
    expect(await verifyPassword("same password", b)).toBe(true);
  });

  it("rejects a malformed stored hash instead of throwing", async () => {
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
  });
});
