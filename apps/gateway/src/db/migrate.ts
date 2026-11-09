import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { logger } from "@leash/shared";

/** Folder of generated SQL migrations (apps/gateway/drizzle), found from src/ or dist/. */
export const MIGRATIONS_FOLDER = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../drizzle",
);

/**
 * Applies pending SQL migrations to the database in DATABASE_URL.
 *
 * It is idempotent: already-applied migrations are skipped, so it is safe to
 * run on every start. Returns false when no database is configured (the
 * gateway then uses its in-memory stores, which is only allowed outside
 * production).
 */
export async function runMigrations(
  databaseUrl: string | undefined = process.env.DATABASE_URL,
): Promise<boolean> {
  if (!databaseUrl) return false;
  const client = postgres(databaseUrl, {
    max: 1,
    connect_timeout: 10,
    onnotice: () => {},
  });
  try {
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
    logger.info("Database migrations are up to date");
    return true;
  } finally {
    await client.end();
  }
}
