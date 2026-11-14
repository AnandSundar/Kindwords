import { sameOrigin } from "../auth/guard";
import { clientIp } from "../client-ip";
import type { Db } from "../db/client";
import { getSpaceByPublicId } from "../db/repositories/spaces";
import { createTestimonial } from "../db/repositories/testimonials";
import type { SubmitLimiter } from "../rate-limit";
import { newMediaKey, type Storage } from "../storage";
import { AvatarError, processAvatar } from "../uploads/avatar";
import { validateSubmission, type FieldErrors } from "./validate";

/** KTD7: a 2 MB avatar plus the text fields and multipart framing. */
export const MAX_BODY_BYTES = 2.5 * 1024 * 1024;

export type SubmitDeps = { db: Db; storage: Storage; limiter: SubmitLimiter; publicUrl: string | undefined };

/** The JSON body of every refusal; the form shows `error` above it and each field error beside its field. */
export type SubmitError = { error?: string; fieldErrors?: FieldErrors };

const refuse = (status: number, body: SubmitError) => Response.json(body, { status });

/** Reads at most MAX_BODY_BYTES, whatever Content-Length claimed; undefined when the body is larger. */
async function readLimited(request: Request): Promise<Buffer | undefined> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return Buffer.concat(chunks);
    total += value.length;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }
}

/**
 * The public form's POST (R5–R9), checked in the KTD7 order: body size, rate limit, parse, honeypot,
 * fields, avatar, store avatar, store testimonial. Success and a filled honeypot both redirect to the
 * thank-you page (POST-redirect-GET).
 */
export async function submitTestimonial(request: Request, publicId: string, deps: SubmitDeps): Promise<Response> {
  if (!sameOrigin(request, deps.publicUrl)) return refuse(403, { error: "Cross-origin request refused." });
  const space = await getSpaceByPublicId(deps.db, publicId);
  if (!space) return refuse(404, { error: "This collection link no longer exists." });

  const length = request.headers.get("content-length");
  if (length === null) return refuse(411, { error: "The submission could not be read. Please try again." });
  const tooLarge = { error: "The submission is too large. Choose a photo under 2 MB." };
  if (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES) return refuse(413, tooLarge);

  const slot = deps.limiter.take(clientIp(request.headers), space.id);
  if (!slot) return refuse(429, { error: "Too many submissions from your network. Please try again later." });

  const body = await readLimited(request);
  if (!body) return refuse(413, tooLarge);
  let form: FormData;
  try {
    form = await new Response(new Uint8Array(body), {
      headers: { "content-type": request.headers.get("content-type") ?? "" },
    }).formData();
  } catch {
    return refuse(400, { error: "The submission could not be read. Please try again." });
  }
  const field = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value : "";
  };

  const thanks = new Response(null, { status: 303, headers: { location: `/c/${publicId}/thanks` } });
  if (field("website")) {
    slot.refund();
    return thanks;
  }

  const result = validateSubmission({
    name: field("name"),
    email: field("email"),
    roleCompany: field("role"),
    rating: field("rating"),
    text: field("text"),
    consent: form.has("consent"),
  });
  if ("fieldErrors" in result) return refuse(400, { fieldErrors: result.fieldErrors });

  const file = form.get("avatar");
  let avatar: Buffer | undefined;
  if (file instanceof File && file.size > 0) {
    try {
      avatar = await processAvatar(Buffer.from(await file.arrayBuffer()));
    } catch (error) {
      if (!(error instanceof AvatarError)) throw error;
      return refuse(400, { fieldErrors: { avatar: error.message } });
    }
  }

  const avatarKey = avatar ? newMediaKey() : null;
  if (avatarKey) await deps.storage.put(avatarKey, avatar!);
  try {
    await createTestimonial(deps.db, { spaceId: space.id, status: "pending", ...result.values, avatarKey });
  } catch (error) {
    if (avatarKey) await deps.storage.delete(avatarKey).catch(() => {});
    throw error;
  }
  return thanks;
}
