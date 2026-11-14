/**
 * KTD7: the client IP that server/start.mjs records in a private header (it replaces any client-sent
 * copy). Without it (`next dev`, or any other entry) every request shares the "unknown" throttle bucket
 * rather than trusting a forgeable header.
 */
export function clientIp(headers: Headers): string {
  return headers.get("x-kindwords-client-ip") ?? "unknown";
}
