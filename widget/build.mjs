// KTD11: one minified IIFE at public/embed.js, served by the app as /embed.js.
import { build } from "esbuild";

await build({
  entryPoints: ["widget/src/index.ts"],
  outfile: "public/embed.js",
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2020"],
  legalComments: "none",
  // Generated, minified output: the source in widget/src is what gets linted.
  banner: { js: "/* eslint-disable */" },
});
