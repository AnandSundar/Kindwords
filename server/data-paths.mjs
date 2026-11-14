import path from "node:path";

/**
 * server/start.mjs chdirs into the standalone build, so relative data paths are pinned first to `cwd`
 * (where the server was started, as `migrate` sees them). Mutates and returns `env`.
 * @param {Record<string, string | undefined>} env
 * @param {string} cwd
 */
export function pinDataPaths(env, cwd) {
  const dbUrl = env.DATABASE_URL;
  if (dbUrl?.startsWith("file:") && !path.isAbsolute(dbUrl.slice(5))) {
    env.DATABASE_URL = `file:${path.resolve(cwd, dbUrl.slice(5)).replaceAll("\\", "/")}`;
  }
  if (env.UPLOADS_DIR) env.UPLOADS_DIR = path.resolve(cwd, env.UPLOADS_DIR);
  return env;
}
