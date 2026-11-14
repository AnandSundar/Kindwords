import { getDb } from "@/server/db/client";
import { publicOrigin } from "@/server/origin";
import { publicWall } from "@/server/testimonials/public-view";

/**
 * R17 public JSON feed. KTD12: readable from any site without credentials, cached briefly.
 * `version` lets the widget detect a future shape change. `?featured=1` limits it to featured (R15).
 */
export async function GET(request: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const featuredOnly = new URL(request.url).searchParams.get("featured") === "1";
  const { testimonials } = await publicWall(getDb(), publicId, { featuredOnly, origin: publicOrigin(request.headers) });
  return Response.json(
    { version: 1, testimonials },
    { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=30" } },
  );
}
