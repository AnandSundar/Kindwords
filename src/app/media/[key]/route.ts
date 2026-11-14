import { getAdminSession } from "@/server/auth/guard";
import { getDb } from "@/server/db/client";
import { getAvatarStatus } from "@/server/db/repositories/testimonials";
import { getStorage, isValidKey } from "@/server/storage";

// KTD8: fixed type, no sniffing, no active content, and loadable by the embed on other origins.
const headers = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox",
  "Cross-Origin-Resource-Policy": "cross-origin",
};

/**
 * R18: a photo is public only while its testimonial is approved; pending and rejected ones (and their
 * previews in the admin inbox) are served to the signed-in admin only, never cached. Public copies are
 * cached for a day, so a withdrawn testimonial's photo stops being served soon after.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const status = isValidKey(key) ? await getAvatarStatus(getDb(), key) : undefined;
  const isPublic = status === "approved";
  const visible = isPublic || (status !== undefined && (await getAdminSession()) !== undefined);
  const body = visible ? await getStorage().get(key) : null;
  if (!body) return new Response("Not found", { status: 404, headers: { ...headers, "Cache-Control": "no-store" } });
  return new Response(body, {
    headers: {
      ...headers,
      "Content-Type": "image/webp",
      "Cache-Control": isPublic ? "public, max-age=86400" : "private, no-store",
    },
  });
}
