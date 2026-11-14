// KTD11: the embed must stay under 15 KB gzipped; CI fails otherwise.
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const LIMIT = 15 * 1024;
const size = gzipSync(readFileSync("public/embed.js"), { level: 9 }).length;
console.log(`embed.js: ${size} bytes gzipped (limit ${LIMIT})`);
if (size >= LIMIT) {
  console.error("embed.js is over the 15 KB gzipped budget.");
  process.exit(1);
}
