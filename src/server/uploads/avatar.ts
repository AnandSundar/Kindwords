import sharp, { type Metadata } from "sharp";

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_PIXELS = 24_000_000;
const FORMATS = new Set(["jpeg", "png", "webp"]);

function isRaster(b: Buffer): boolean {
  const jpeg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const png = b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp = b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP";
  return jpeg || png || webp;
}

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
  // Magic bytes first, so nothing but JPEG, PNG or WebP ever reaches sharp's parsers (SVG, TIFF, ...).
  if (!isRaster(input)) throw new AvatarError("This file is not an image we accept. Please upload a JPEG, PNG or WebP.");
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
