import { getStorage, isValidKey } from "@/server/storage";

// KTD8: fixed type, no sniffing, no active content, and loadable by the embed on other origins.
const headers = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox",
  "Cross-Origin-Resource-Policy": "cross-origin",
};

export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const body = isValidKey(key) ? await getStorage().get(key) : null;
  if (!body) return new Response("Not found", { status: 404, headers });
  return new Response(body, {
    headers: {
      ...headers,
      "Content-Type": "image/webp",
      // Keys are random and never reused, so the bytes behind a URL never change.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
