import { afterEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  failClosedOnDbError,
  memoryStorageRequested,
  storageMode,
} from "./db/storage-mode.js";
import { MIGRATIONS_FOLDER } from "./db/migrate.js";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("storage mode", () => {
  it("fails closed in production by default", () => {
    process.env.NODE_ENV = "production";
    delete process.env.LEASH_STORAGE;
    expect(failClosedOnDbError()).toBe(true);
  });

  it("does not fail closed outside production", () => {
    process.env.NODE_ENV = "development";
    expect(failClosedOnDbError()).toBe(false);
  });

  it("LEASH_STORAGE=memory is an explicit opt-out of the database, even in production", () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "postgresql://x@localhost/db";
    process.env.LEASH_STORAGE = "memory";
    expect(memoryStorageRequested()).toBe(true);
    expect(failClosedOnDbError()).toBe(false);
    expect(storageMode()).toBe("memory");
  });

  it("reports postgres only when a database is configured and memory was not requested", () => {
    delete process.env.LEASH_STORAGE;
    process.env.DATABASE_URL = "postgresql://x@localhost/db";
    expect(storageMode()).toBe("postgres");
    delete process.env.DATABASE_URL;
    expect(storageMode()).toBe("memory");
  });
});

describe("migrations", () => {
  it("ships the initial SQL migration and journal", () => {
    expect(existsSync(join(MIGRATIONS_FOLDER, "meta/_journal.json"))).toBe(true);
    const sql = readFileSync(join(MIGRATIONS_FOLDER, "0000_init.sql"), "utf8");
    for (const table of ["ledger", "mandates", "merchants", "transactions", "users", "carts"]) {
      expect(sql).toContain(`CREATE TABLE "${table}"`);
    }
  });
});
