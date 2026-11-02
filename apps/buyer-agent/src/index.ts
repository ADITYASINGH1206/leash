import Fastify from "fastify";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { BuyerShopperAgent, createDefaultSession } from "./agent/shopper.js";
import { getStoreCatalog, type StoreId } from "@leash/stores";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getPublicDir(): string {
  const localPublic = join(__dirname, "public");
  if (existsSync(localPublic)) return localPublic;
  const srcPublic = join(__dirname, "../src/public");
  if (existsSync(srcPublic)) return srcPublic;
  return join(process.cwd(), "apps/buyer-agent/src/public");
}

export async function createBuyerAgentServer() {
  const app = Fastify({ logger: false });
  const session = createDefaultSession();
  const agent = new BuyerShopperAgent(session);
  const publicDir = getPublicDir();

  // Health check
  app.get("/health", async () => {
    return {
      status: "ok",
      service: "buyer-agent",
      attackMode: agent.state.attackMode,
      timestamp: new Date().toISOString(),
    };
  });

  // Static Frontend Routes
  app.get("/", async (_, reply) => {
    const html = await readFile(join(publicDir, "index.html"), "utf-8");
    reply.type("text/html").send(html);
  });

  app.get("/style.css", async (_, reply) => {
    const css = await readFile(join(publicDir, "style.css"), "utf-8");
    reply.type("text/css").send(css);
  });

  app.get("/app.js", async (_, reply) => {
    const js = await readFile(join(publicDir, "app.js"), "utf-8");
    reply.type("application/javascript").send(js);
  });

  // REST API: Chat with Buyer Agent
  app.post("/api/chat", async (req, reply) => {
    try {
      const body = req.body as { message?: string };
      if (!body?.message || typeof body.message !== "string") {
        reply.status(400);
        return { error: "Missing or invalid 'message' field" };
      }

      const response = await agent.processUserMessage(body.message);
      return response;
    } catch (err) {
      reply.status(500);
      return {
        error: "Agent execution failed",
        details:
          process.env.NODE_ENV === "production"
            ? "An internal error occurred during agent execution."
            : err instanceof Error
              ? err.message
              : String(err),
      };
    }
  });

  // REST API: Get Current Agent State
  app.get("/api/state", async () => {
    return {
      sessionId: agent.state.sessionId,
      mandate: agent.state.mandate,
      cart: agent.state.cart,
      attackMode: agent.state.attackMode,
      historyCount: agent.state.history.length,
      lastPaymentResult: agent.state.lastPaymentResult,
    };
  });

  // REST API: Toggle Attack Mode
  app.post("/api/attack-mode", async (req) => {
    const body = req.body as { enabled?: boolean };
    const enabled = Boolean(body?.enabled);
    agent.setAttackMode(enabled);
    return {
      attackMode: agent.state.attackMode,
      message: enabled
        ? "Attack Mode enabled: Store catalog will now serve hidden DOM prompt injections"
        : "Defended Mode active: Store catalog serving standard items",
    };
  });

  // REST API: Reset Session & Cart
  app.post("/api/reset", async () => {
    const freshSession = agent.resetSession();
    return {
      success: true,
      message: "Session reset successfully",
      mandate: freshSession.mandate,
    };
  });

  // REST API: Get Store Products
  app.get("/api/products", async (req) => {
    const query = req.query as { storeId?: StoreId };
    const storeId = query?.storeId;
    const stores: StoreId[] = storeId
      ? [storeId]
      : ["gadgethub", "trendboutique", "dailymart"];

    const products = stores.flatMap((s) =>
      getStoreCatalog(s, { includeAttackProducts: agent.state.attackMode }),
    );
    return { count: products.length, products };
  });

  return { app, agent };
}

// Start server if executed directly
if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT || 3001);
  const { app } = await createBuyerAgentServer();
  app.listen({ port, host: "0.0.0.0" }, (err, address) => {
    if (err) {
      console.error("Failed to start buyer-agent server:", err);
      process.exit(1);
    }
    console.log(`⚡ Leash Buyer Agent running at ${address}`);
  });
}
