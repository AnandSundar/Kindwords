// Applies pending migrations to DATABASE_URL (KTD14 runs this before the server starts).
import { parseConfig } from "../server/config";
import { openDb } from "../server/db/client";
import { runMigrations } from "../server/db/migrate";

const db = openDb(parseConfig(process.env).databaseUrl);
try {
  await runMigrations(db);
  console.log("Migrations applied.");
} finally {
  await db.close();
}
