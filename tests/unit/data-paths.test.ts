import path from "node:path";
import { describe, expect, it } from "vitest";
import { pinDataPaths } from "../../server/data-paths.mjs";

const CWD = path.resolve("/srv/kindwords");
const abs = (...parts: string[]) => path.resolve(CWD, ...parts);

describe("pinDataPaths (server/start.mjs)", () => {
  it("pins a relative file: DATABASE_URL to the start directory", () => {
    const env = pinDataPaths({ DATABASE_URL: "file:./data/kindwords.db" }, CWD);
    expect(env.DATABASE_URL).toBe(`file:${abs("data", "kindwords.db").replaceAll("\\", "/")}`);
  });

  it("leaves absolute file: and non-file URLs alone", () => {
    expect(pinDataPaths({ DATABASE_URL: "file:/data/kindwords.db" }, CWD).DATABASE_URL).toBe("file:/data/kindwords.db");
    const pg = "postgres://kindwords:pw@db:5432/kindwords";
    expect(pinDataPaths({ DATABASE_URL: pg }, CWD).DATABASE_URL).toBe(pg);
  });

  it("resolves a relative UPLOADS_DIR and leaves unset values unset", () => {
    expect(pinDataPaths({ UPLOADS_DIR: "uploads" }, CWD).UPLOADS_DIR).toBe(abs("uploads"));
    expect(pinDataPaths({}, CWD)).toEqual({});
  });
});
