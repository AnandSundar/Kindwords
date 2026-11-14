// `next build` with output "standalone" leaves out public/ and .next/static; without them /embed.js and
// every client chunk 404 under server/start.mjs. Copy them in, as Next's standalone docs require.
import { cpSync, existsSync } from "node:fs";

const out = ".next/standalone";
if (!existsSync(out)) throw new Error("Run `next build` first: .next/standalone is missing.");
cpSync("public", `${out}/public`, { recursive: true });
cpSync(".next/static", `${out}/.next/static`, { recursive: true });
