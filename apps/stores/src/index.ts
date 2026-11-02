export * from "./catalog.js";
export * from "./registry.js";
export * from "./cart.js";
export * from "./fulfilment.js";
export * from "./toolkit.js";
export * from "./server.js";

import { createStoresServer } from "./server.js";

const PORT = Number(process.env.STORES_PORT) || 3003;

if (process.env.NODE_ENV !== "test") {
  createStoresServer()
    .then((server) => {
      server.listen({ port: PORT, host: "0.0.0.0" }, (err, address) => {
        if (err) {
          console.error("Failed to start Leash Demo Stores server:", err);
          process.exit(1);
        }
        console.log(`[STORES] Demo Storefronts running on ${address}`);
      });
    })
    .catch((err) => {
      console.error("Fatal error during store server initialization:", err);
      process.exit(1);
    });
}
