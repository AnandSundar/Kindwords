import { afterEach, describe, expect, it } from "vitest";
import { generateSetupCode, setSetupCode, setupCodeMatches } from "@/server/auth/setup-code";

afterEach(() => setSetupCode(undefined));

describe("setup code", () => {
  it("carries at least 128 bits in base32", () => {
    const code = generateSetupCode();
    expect(code).toMatch(/^[A-Z2-7]+$/);
    expect(code.length * 5).toBeGreaterThanOrEqual(128);
    expect(generateSetupCode()).not.toBe(code);
  });

  it("accepts only the stored code, ignoring case and spaces", () => {
    const code = generateSetupCode();
    setSetupCode(code);
    expect(setupCodeMatches(code)).toBe(true);
    expect(setupCodeMatches(` ${code.toLowerCase()} `)).toBe(true);
    expect(setupCodeMatches(code.slice(1))).toBe(false);
    expect(setupCodeMatches("")).toBe(false);
  });

  it("accepts nothing when no code was generated", () => {
    expect(setupCodeMatches("")).toBe(false);
    expect(setupCodeMatches("AAAA")).toBe(false);
  });

  it("is shared through globalThis so separately bundled modules read the same value", () => {
    setSetupCode("ABC");
    expect((globalThis as Record<symbol, unknown>)[Symbol.for("kindwords.setupCode")]).toBe("ABC");
  });
});
