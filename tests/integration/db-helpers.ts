import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { openDb, type OpenDb } from "@/server/db/client";
import { runMigrations } from "@/server/db/migrate";

export type Target = { name: string; open(): Promise<OpenDb> };

const tempDirs: string[] = [];

/** Each `open()` returns a fresh, migrated database: a temp SQLite file always, Postgres when TEST_DATABASE_URL is set. */
export const targets: Target[] = [
  {
    name: "sqlite",
    async open() {
      const dir = mkdtempSync(path.join(os.tmpdir(), "kindwords-test-"));
      tempDirs.push(dir);
      const db = openDb(`file:${path.join(dir, "test.db").replaceAll("\\", "/")}`);
      await runMigrations(db);
      return db;
    },
  },
];

const pgUrl = process.env.TEST_DATABASE_URL;
if (pgUrl) {
  // Test files run in parallel workers; each worker gets its own database so one file's schema reset
  // cannot wipe another's tables mid-test.
  const workerUrl = new URL(pgUrl);
  workerUrl.pathname = `${workerUrl.pathname}_w${process.env.VITEST_POOL_ID ?? "0"}`;
  let created = false;
  targets.push({
    name: "postgres",
    async open() {
      if (!created) {
        const admin = new pg.Client({ connectionString: pgUrl });
        await admin.connect();
        await admin.query(`CREATE DATABASE "${workerUrl.pathname.slice(1)}"`).catch((error: { code?: string }) => {
          if (error.code !== "42P04") throw error; // already exists from an earlier run
        });
        await admin.end();
        created = true;
      }
      // Each test starts from an empty schema.
      const client = new pg.Client({ connectionString: workerUrl.href });
      await client.connect();
      await client.query("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
      await client.end();
      const db = openDb(workerUrl.href);
      await runMigrations(db);
      return db;
    },
  });
}

export function removeTempDirs(): void {
  for (const dir of tempDirs.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // libsql keeps the file open past client.close() on Windows (EPERM); the OS temp dir is cleaned later.
    }
  }
}
