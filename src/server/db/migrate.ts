import path from "node:path";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { migrate as migrateLibsql } from "drizzle-orm/libsql/migrator";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import type { Db } from "./client";

/** Applies pending migrations from drizzle/<dialect>; already-applied ones are skipped. */
export async function runMigrations(db: Db, migrationsRoot = path.join(process.cwd(), "drizzle")): Promise<void> {
  const migrationsFolder = path.join(migrationsRoot, db.dialect);
  if (db.dialect === "sqlite") {
    await migrateLibsql(db.q as unknown as LibSQLDatabase, { migrationsFolder });
  } else {
    await migratePg(db.q as unknown as NodePgDatabase, { migrationsFolder });
  }
}
