import sharp, { type Metadata } from "sharp";

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_PIXELS = 24_000_000;
const FORMATS = new Set(["jpeg", "png", "webp"]);

/** A rejection whose message is safe and meant to be shown to the uploader (R8). */
export class AvatarError extends Error {}

/**
 * KTD8: accept jpeg/png/webp detected from the content, at most 2 MB and 24 megapixels,
 * and re-encode to a 256×256 webp. Re-encoding drops EXIF/ICC/XMP and any polyglot payload.
 */
export async function processAvatar(input: Buffer): Promise<Buffer> {
  if (input.length > MAX_BYTES) {
    throw new AvatarError("The image is larger than 2 MB. Please choose a smaller file.");
  }
  let meta: Metadata;
  try {
    // Header-only read; lifting sharp's default pixel cap here lets a bomb get the "too many megapixels" message below.
    meta = await sharp(input, { limitInputPixels: false }).metadata();
  } catch {
    throw new AvatarError("This file is not an image. Please upload a JPEG, PNG or WebP.");
  }
  if (!FORMATS.has(meta.format)) {
    throw new AvatarError("Only JPEG, PNG or WebP images are accepted.");
  }
  if (meta.width * meta.height > MAX_PIXELS) {
    throw new AvatarError("The image is larger than 24 megapixels. Please choose a smaller image.");
  }
  try {
    return await sharp(input, { limitInputPixels: MAX_PIXELS })
      .rotate()
      .resize(256, 256, { fit: "cover" })
      .webp()
      .toBuffer();
  } catch {
    throw new AvatarError("This image could not be read. It may be damaged; please try another file.");
  }
}
