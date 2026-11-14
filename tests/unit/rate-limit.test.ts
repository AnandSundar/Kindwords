import { describe, expect, it } from "vitest";
import { createSubmitLimiter } from "@/server/rate-limit";

const MIN = 60 * 1000;

describe("submission rate limit (KTD7)", () => {
  it("allows 5 per IP per space in 10 minutes, then refuses; other spaces and IPs are unaffected", () => {
    const limiter = createSubmitLimiter();
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) expect(limiter.take("1.1.1.1", "space-a", now + i)).toBeDefined();
    expect(limiter.take("1.1.1.1", "space-a", now + 10)).toBeUndefined();
    expect(limiter.take("1.1.1.1", "space-b", now + 10)).toBeDefined();
    expect(limiter.take("2.2.2.2", "space-a", now + 10)).toBeDefined();
  });

  it("allows the IP again once 10 minutes have passed", () => {
    const limiter = createSubmitLimiter();
    for (let i = 0; i < 5; i++) limiter.take("1.1.1.1", "s", 0);
    expect(limiter.take("1.1.1.1", "s", 10 * MIN - 1)).toBeUndefined();
    expect(limiter.take("1.1.1.1", "s", 10 * MIN)).toBeDefined();
  });

  it("caps a space at 50 per hour across IPs", () => {
    const limiter = createSubmitLimiter();
    for (let i = 0; i < 50; i++) expect(limiter.take(`10.0.0.${i}`, "s", i)).toBeDefined();
    expect(limiter.take("10.0.1.1", "s", 100)).toBeUndefined();
    expect(limiter.take("10.0.1.1", "other", 100)).toBeDefined();
    expect(limiter.take("10.0.1.1", "s", 60 * MIN)).toBeDefined();
  });

  it("gives the allowance back on refund", () => {
    const limiter = createSubmitLimiter();
    for (let i = 0; i < 5; i++) limiter.take("1.1.1.1", "s", 0)!.refund();
    for (let i = 0; i < 5; i++) expect(limiter.take("1.1.1.1", "s", 0)).toBeDefined();
    expect(limiter.take("1.1.1.1", "s", 0)).toBeUndefined();
  });
});
