/**
 * KTD7: the client IP from X-Forwarded-For, read from the right. Each trusted proxy appends the
 * address it received from, so the client is `trustedProxyCount` entries from the right. With no
 * trusted proxy, server/start.mjs drops any incoming header and Next fills it with the socket address.
 */
export function clientIp(headers: Headers, trustedProxyCount: number): string {
  const hops = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((hop) => hop.trim())
    .filter(Boolean);
  return hops[Math.max(0, hops.length - Math.max(trustedProxyCount, 1))] ?? "unknown";
}
