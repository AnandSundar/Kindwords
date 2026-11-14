import { createClient, type ResultSet } from "@libsql/client";
import { drizzle as drizzleLibsql } from "drizzle-orm/libsql";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { Pool } from "pg";
import { getConfig } from "../config";
import * as pgSchema from "./schema.pg";
import * as sqliteSchema from "./schema.sqlite";

type Schema = typeof sqliteSchema;

/**
 * What repositories receive. `q` and `t` are typed against the SQLite schema for both dialects.
 * shortcut: Drizzle has no shared type for both dialects, so Postgres builders are cast to the SQLite
 * ones; the schema-parity test keeps row shapes identical and repositories use only builder methods
 * both dialects share (await, returning, onConflictDoNothing, transaction). Branch on `dialect` if a
 * query ever needs dialect-specific SQL; the Postgres integration run catches misuse.
 */
export type Db = {
  dialect: "sqlite" | "pg";
  q: BaseSQLiteDatabase<"async", ResultSet, Schema>;
  t: Schema;
};

export type OpenDb = Db & { close(): Promise<void> };

/** Picks the dialect from the URL scheme (KTD2): `file:` is libsql, `postgres://` is pg. */
export function openDb(url: string): OpenDb {
  if (url.startsWith("file:")) {
    // timeout: wait for a busy lock instead of failing, since libsql pools several connections.
    const client = createClient({ url, timeout: 5000 });
    return {
      dialect: "sqlite",
      q: drizzleLibsql(client, { schema: sqliteSchema }),
      t: sqliteSchema,
      close: async () => client.close(),
    };
  }
  if (/^postgres(ql)?:\/\//.test(url)) {
    const pool = new Pool({ connectionString: url });
    return {
      dialect: "pg",
      q: drizzlePg(pool, { schema: pgSchema }) as unknown as Db["q"],
      t: pgSchema as unknown as Schema,
      close: () => pool.end(),
    };
  }
  throw new Error("DATABASE_URL must start with file: or postgres://");
}

let shared: OpenDb | undefined;

/** The app-wide database handle, opened on first use. */
export function getDb(): Db {
  return (shared ??= openDb(getConfig().databaseUrl));
}

let sqliteTxTail: Promise<unknown> = Promise.resolve();

/** Runs `fn` in one transaction; it rolls back if `fn` throws. Do not nest calls. */
export async function withTransaction<T>(db: Db, fn: (tx: Db) => Promise<T>): Promise<T> {
  const run = () => db.q.transaction((tx) => fn({ ...db, q: tx }));
  if (db.dialect === "pg") return run();
  // libsql executes statements synchronously, so a second open transaction would busy-wait on the
  // event loop for the lock the first one holds and neither could finish. Queue them instead.
  // shortcut: a plain write issued while a transaction is open blocks the event loop up to the 5 s busy
  // timeout and then fails; keep transactions short and rare (setup only), or move to WAL + a write queue.
  const result = sqliteTxTail.then(run);
  sqliteTxTail = result.catch(() => undefined);
  return result;
}
