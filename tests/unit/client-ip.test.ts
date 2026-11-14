import type { IncomingHttpHeaders } from "node:http";
import { describe, expect, it } from "vitest";
import { clientIp } from "@/server/client-ip";
import { CLIENT_IP_HEADER, setClientIpHeader } from "../../server/client-ip.mjs";

const SOCKET = "192.0.2.7";
const recorded = (headers: IncomingHttpHeaders, trustedProxyCount: number, remote: string | undefined = SOCKET) => {
  setClientIpHeader(headers, remote, trustedProxyCount);
  return headers[CLIENT_IP_HEADER];
};

describe("setClientIpHeader (server/start.mjs)", () => {
  it("replaces a client-supplied private header with the socket address", () => {
    expect(recorded({ [CLIENT_IP_HEADER]: "203.0.113.66" }, 0)).toBe(SOCKET);
  });

  it("ignores and drops a forged X-Forwarded-For when no proxy is trusted", () => {
    const headers: IncomingHttpHeaders = { "x-forwarded-for": "203.0.113.66" };
    expect(recorded(headers, 0)).toBe(SOCKET);
    expect(headers["x-forwarded-for"]).toBeUndefined();
  });

  it("reads the client from the right with one trusted proxy, ignoring forged entries on the left", () => {
    expect(recorded({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 203.0.113.9" }, 1)).toBe("203.0.113.9");
  });

  it("skips the hops added by further trusted proxies", () => {
    expect(recorded({ "x-forwarded-for": "1.1.1.1, 203.0.113.9, 10.0.0.2" }, 2)).toBe("203.0.113.9");
  });

  it("falls back to the leftmost entry when there are fewer hops than trusted proxies", () => {
    expect(recorded({ "x-forwarded-for": "203.0.113.9" }, 3)).toBe("203.0.113.9");
  });

  it("uses the socket address behind a trusted proxy when X-Forwarded-For is missing", () => {
    expect(recorded({ [CLIENT_IP_HEADER]: "203.0.113.66" }, 1)).toBe(SOCKET);
  });

  it("leaves no private header when the socket address is unknown", () => {
    const headers: IncomingHttpHeaders = { [CLIENT_IP_HEADER]: "203.0.113.66" };
    setClientIpHeader(headers, undefined, 0);
    expect(headers[CLIENT_IP_HEADER]).toBeUndefined();
  });
});

describe("clientIp", () => {
  it("reads only the private header, never X-Forwarded-For", () => {
    expect(clientIp(new Headers({ [CLIENT_IP_HEADER]: "203.0.113.9", "x-forwarded-for": "1.1.1.1" }))).toBe("203.0.113.9");
  });

  it("returns a shared bucket when the private header is missing", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "1.1.1.1" }))).toBe("unknown");
  });
});
