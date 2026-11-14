import { mkdir, open, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { assertValidKey, type Storage } from "./index";

export function localStorage(uploadsDir: string): Storage {
  // assertValidKey refuses separators and `..`, so every path stays inside uploadsDir.
  const file = (key: string) => {
    assertValidKey(key);
    return path.join(uploadsDir, key);
  };
  return {
    async put(key, data) {
      const target = file(key);
      await mkdir(uploadsDir, { recursive: true });
      await writeFile(target, data);
    },
    async get(key) {
      const target = file(key);
      try {
        const handle = await open(target, "r");
        return Readable.toWeb(handle.createReadStream()) as ReadableStream<Uint8Array>;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async delete(key) {
      await rm(file(key), { force: true });
    },
  };
}
