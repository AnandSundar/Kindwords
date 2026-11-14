import { describe, expect, it } from "vitest";
import { clientIp } from "@/server/client-ip";

const xff = (value?: string) => new Headers(value === undefined ? {} : { "x-forwarded-for": value });

describe("clientIp", () => {
  it("uses the socket address Next filled in when no proxy is trusted", () => {
    expect(clientIp(xff("203.0.113.9"), 0)).toBe("203.0.113.9");
  });

  it("reads the client from the right with one trusted proxy, ignoring forged entries on the left", () => {
    expect(clientIp(xff("1.1.1.1, 2.2.2.2, 203.0.113.9"), 1)).toBe("203.0.113.9");
  });

  it("skips the hops added by further trusted proxies", () => {
    expect(clientIp(xff("1.1.1.1, 203.0.113.9, 10.0.0.2"), 2)).toBe("203.0.113.9");
  });

  it("falls back to the leftmost entry when there are fewer hops than trusted proxies", () => {
    expect(clientIp(xff("203.0.113.9"), 3)).toBe("203.0.113.9");
  });

  it("returns a shared bucket when the header is missing", () => {
    expect(clientIp(xff(), 0)).toBe("unknown");
  });
});
