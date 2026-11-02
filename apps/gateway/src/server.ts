/**
 * Process entry point for the Leash gateway.
 *
 * Kept separate from index.ts so that packages importing @leash/gateway as a
 * library (buyer-agent, e2e tests) do not accidentally start a second gateway
 * on the same port.
 */
import { createServer } from "./index.js";
import { config } from "./config.js";
import { logger } from "@leash/shared";

const app = await createServer();
app.listen({ port: config.port, host: "0.0.0.0" }, (err, address) => {
  if (err) {
    logger.error("Gateway startup error", { error: String(err) });
    process.exit(1);
  }
  logger.info(`Leash Gateway running on ${address}`);
});
