/** `pnpm db:migrate`: apply pending migrations and exit. */
import { runMigrations } from "./migrate.js";

try {
  const applied = await runMigrations();
  if (!applied) {
    console.error("DATABASE_URL is not set, so there is nothing to migrate.");
    process.exit(1);
  }
} catch (err) {
  console.error("Migration failed:", err instanceof Error ? err.message : err);
  process.exit(1);
}
