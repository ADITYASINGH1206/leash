/**
 * Process entry point for the Leash gateway.
 *
 * Kept separate from index.ts so that packages importing @leash/gateway as a
 * library (buyer-agent, e2e tests) do not accidentally start a second gateway
 * on the same port.
 */
import "./env.js";
import { createServer } from "./index.js";
import { runMigrations } from "./db/migrate.js";
import { memoryStorageRequested } from "./db/storage-mode.js";
import { config } from "./config.js";
import { logger } from "@leash/shared";

// Create the tables on first start so a fresh database works without a manual step.
try {
  if (memoryStorageRequested()) {
    logger.warn("LEASH_STORAGE=memory: state is kept in memory and is lost on restart (demo mode)");
  } else {
    try {
      await runMigrations();
    } catch (migErr) {
      logger.warn("PostgreSQL not reachable, falling back to memory storage mode", { error: String(migErr) });
      process.env.LEASH_STORAGE = "memory";
    }
  }
} catch (err) {
  logger.warn("Database initialization notice", { error: String(err) });
}

const app = await createServer();
app.listen({ port: config.port, host: "0.0.0.0" }, (err, address) => {
  if (err) {
    logger.error("Gateway startup error", { error: String(err) });
    process.exit(1);
  }
  logger.info(`Leash Gateway running on ${address}`);
});
