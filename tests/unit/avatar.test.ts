import { randomBytes } from "node:crypto";
import zlib from "node:zlib";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { AvatarError, processAvatar } from "@/server/uploads/avatar";

// Fixtures are generated in code so no binary files live in the repo.
function solid(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: "#c33" } });
}

/** A PNG whose header claims 50000×50000 pixels but carries almost no data. */
function decompressionBombPng(): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(50_000, 0);
  ihdr.writeUInt32BE(50_000, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(Buffer.alloc(1024))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}


describe("processAvatar", () => {
  it.each(["jpeg", "png", "webp"] as const)("accepts %s and outputs a 256×256 webp without EXIF", async (format) => {
    const input = await solid(640, 480)
      .withExif({ IFD0: { Artist: "Someone", ImageDescription: "secret place" } })
      .toFormat(format)
      .toBuffer();
    expect((await sharp(input).metadata()).exif).toBeDefined();

    const out = await processAvatar(input);
    const meta = await sharp(out).metadata();
    expect(meta).toMatchObject({ format: "webp", width: 256, height: 256 });
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
  });

  it("applies the EXIF orientation before cropping", async () => {
    // 200×100 left red / right blue, tagged "rotate 90° clockwise": upright it is red on top.
    const raw = await sharp({ create: { width: 200, height: 100, channels: 3, background: "#00f" } })
      .composite([{ input: await solid(100, 100).png().toBuffer(), left: 0, top: 0 }])
      .jpeg()
      .toBuffer();
    const input = await sharp(raw).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const { data } = await sharp(await processAvatar(input)).raw().toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number) => [...data.subarray((y * 256 + x) * 3, (y * 256 + x) * 3 + 3)];
    expect(pixel(128, 10)[0]).toBeGreaterThan(150); // red at the top
    expect(pixel(128, 245)[2]).toBeGreaterThan(150); // blue at the bottom
  });

  it("rejects SVG", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
    await expect(processAvatar(svg)).rejects.toThrow(/JPEG, PNG or WebP/);
  });

  it("rejects a text file renamed .png", async () => {
    await expect(processAvatar(Buffer.from("just some text, not an image\n"))).rejects.toThrow(/not an image/);
  });

  it("rejects a file over 2 MB", async () => {
    // Random noise does not compress, so this is a genuine PNG over the byte limit.
    const input = await sharp(randomBytes(1000 * 800 * 3), { raw: { width: 1000, height: 800, channels: 3 } })
      .png()
      .toBuffer();
    expect(input.length).toBeGreaterThan(2 * 1024 * 1024);
    await expect(processAvatar(input)).rejects.toThrow(/2 MB/);
  });

  it("rejects an image over 24 megapixels", async () => {
    const input = await solid(5000, 5000).png().toBuffer();
    expect(input.length).toBeLessThan(2 * 1024 * 1024);
    await expect(processAvatar(input)).rejects.toThrow(/24 megapixels/);
  });

  it("rejects a decompression-bomb PNG from its header alone", async () => {
    await expect(processAvatar(decompressionBombPng())).rejects.toThrow(/24 megapixels/);
  });

  it("rejects with AvatarError so callers can show the message", async () => {
    await expect(processAvatar(Buffer.from("x"))).rejects.toBeInstanceOf(AvatarError);
  });
});
