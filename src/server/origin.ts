import { getConfig } from "./config";

/**
 * KTD13: PUBLIC_URL, else the origin this request came in on. X-Forwarded-Host is ignored here: the
 * feed is publicly cacheable, and a forged forwarded host must not end up in cached avatar URLs.
 */
export function publicOrigin(headers: Headers, publicUrl: string | undefined = getConfig().publicUrl): string {
  return publicUrl ?? `${headers.get("x-forwarded-proto") === "https" ? "https" : "http"}://${headers.get("host")}`;
}
