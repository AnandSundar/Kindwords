// KTD14: bundles the migrate and reset-password CLIs into dist-cli/ so the Docker image can run them
// without tsx. Native drivers stay external and resolve from the app's node_modules at run time.
import { build } from "esbuild";

await build({
  entryPoints: ["src/cli/migrate.ts", "src/cli/reset-password.ts"],
  outdir: "dist-cli",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  external: ["@libsql/client", "pg", "pg-native", "sharp", "@aws-sdk/*"],
  // drizzle and its helpers are CommonJS in places; give the ESM bundle a require().
  // Generated output: the source in src/cli is what gets linted.
  banner: { js: "/* eslint-disable */ import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  legalComments: "none",
});
