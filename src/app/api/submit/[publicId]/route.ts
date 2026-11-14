import { getConfig } from "@/server/config";
import { getDb } from "@/server/db/client";
import { submitLimiter } from "@/server/rate-limit";
import { getStorage } from "@/server/storage";
import { submitTestimonial } from "@/server/testimonials/submit";

export async function POST(request: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  return submitTestimonial(request, publicId, {
    db: getDb(),
    storage: getStorage(),
    limiter: submitLimiter,
    publicUrl: getConfig().publicUrl,
  });
}
