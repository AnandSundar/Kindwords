/** The private header server/start.mjs sets and src/server/client-ip.ts reads. */
export const CLIENT_IP_HEADER = "x-kindwords-client-ip";

/**
 * KTD7: records the client IP on a Node request's headers before Next sees them. Any client-sent copy
 * of the private header is replaced. With no trusted proxy the client is the socket address; with
 * `trustedProxyCount` proxies, each appends the address it received from to X-Forwarded-For, so the
 * client is that many entries from the right.
 * @param {import("node:http").IncomingHttpHeaders} headers
 * @param {string | undefined} remoteAddress
 * @param {number} trustedProxyCount
 */
export function setClientIpHeader(headers, remoteAddress, trustedProxyCount) {
  delete headers[CLIENT_IP_HEADER];
  let ip = remoteAddress;
  if (trustedProxyCount > 0) {
    const hops = String(headers["x-forwarded-for"] ?? "")
      .split(",")
      .map((hop) => hop.trim())
      .filter(Boolean);
    ip = hops[Math.max(0, hops.length - trustedProxyCount)] ?? remoteAddress;
  } else {
    // Next sets X-Forwarded-For from the socket only when absent; drop a forged one so nothing downstream trusts it.
    delete headers["x-forwarded-for"];
  }
  if (ip) headers[CLIENT_IP_HEADER] = ip;
}
