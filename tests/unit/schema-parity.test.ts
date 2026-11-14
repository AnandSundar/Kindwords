import { getTableConfig as pgTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { getTableConfig as sqliteTableConfig, integer, sqliteTable, text, type SQLiteTable } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import * as pg from "@/server/db/schema.pg";
import * as sqlite from "@/server/db/schema.sqlite";

// Logical types (KTD3): SQLite integers are 64-bit, so they pair with Postgres integer or bigint(number).
const logicalType: Record<string, string> = {
  SQLiteText: "text",
  PgText: "text",
  SQLiteInteger: "integer",
  PgInteger: "integer",
  PgBigInt53: "integer",
  SQLiteBoolean: "boolean",
  PgBoolean: "boolean",
};

type Config = ReturnType<typeof sqliteTableConfig> | ReturnType<typeof pgTableConfig>;

function describeTable(config: Config) {
  return {
    name: config.name,
    columns: config.columns
      .map((c) => ({
        name: c.name,
        type: logicalType[c.columnType] ?? `unmapped:${c.columnType}`,
        notNull: c.notNull,
        primary: c.primary,
        unique: c.isUnique,
        enum: c.enumValues ?? null,
        hasDefault: c.hasDefault,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    indexes: config.indexes
      .map((i) => ({
        name: i.config.name ?? "<unnamed>",
        unique: i.config.unique,
        columns: i.config.columns.map((c) => ("name" in c ? c.name : "<expr>")),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    foreignKeys: config.foreignKeys
      .map((fk) => {
        const ref = fk.reference();
        return {
          columns: ref.columns.map((c) => c.name),
          foreignTable: (ref.foreignTable as unknown as { [k: symbol]: string })[Symbol.for("drizzle:Name")],
          foreignColumns: ref.foreignColumns.map((c) => c.name),
          onDelete: fk.onDelete ?? "no action",
        };
      })
      .sort((a, b) => a.columns.join().localeCompare(b.columns.join())),
    checks: config.checks.map((c) => c.name).sort(),
  };
}

const describeSqlite = (tables: SQLiteTable[]) =>
  tables.map((t) => describeTable(sqliteTableConfig(t))).sort((a, b) => a.name.localeCompare(b.name));
const describePg = (tables: PgTable[]) =>
  tables.map((t) => describeTable(pgTableConfig(t))).sort((a, b) => a.name.localeCompare(b.name));

describe("schema parity", () => {
  it("exports the same tables from both schemas", () => {
    expect(Object.keys(sqlite).sort()).toEqual(Object.keys(pg).sort());
  });

  it("declares the same columns, nullability, indexes, foreign keys and checks", () => {
    const s = describeSqlite(Object.values(sqlite));
    expect(JSON.stringify(s)).not.toContain("unmapped:");
    // Guard against a vacuous comparison: the description really carries the details.
    const testimonials = s.find((t) => t.name === "testimonials");
    expect(testimonials?.foreignKeys).toEqual([
      { columns: ["space_id"], foreignTable: "spaces", foreignColumns: ["id"], onDelete: "cascade" },
    ]);
    expect(testimonials?.indexes).toEqual([
      { name: "testimonials_space_status_idx", unique: false, columns: ["space_id", "status"] },
    ]);
    expect(describePg(Object.values(pg))).toEqual(s);
  });

  it("stores every timestamp as 64-bit in Postgres", () => {
    for (const table of Object.values(pg)) {
      for (const column of pgTableConfig(table).columns.filter((c) => c.name.endsWith("_at"))) {
        expect(`${column.name}:${column.columnType}`).toBe(`${column.name}:PgBigInt53`);
      }
    }
  });

  it("fails when one schema gains a column the other lacks", () => {
    const drifted = sqliteTable("spaces", {
      id: text("id").primaryKey(),
      publicId: text("public_id").notNull().unique(),
      name: text("name").notNull(),
      createdAt: integer("created_at").notNull(),
      updatedAt: integer("updated_at").notNull(),
      extra: text("extra"),
    });
    const tables = { ...sqlite, spaces: drifted };
    expect(describePg(Object.values(pg))).not.toEqual(describeSqlite(Object.values(tables)));
  });
});
