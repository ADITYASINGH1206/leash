import { describe, it, expect, beforeEach } from "vitest";
import { BuyerShopperAgent, createDefaultSession } from "./agent/shopper.js";
import { BuyerAgentTools } from "./agent/tools.js";
import { createBuyerAgentServer } from "./index.js";

describe("BuyerAgentTools", () => {
  let session = createDefaultSession({ attackMode: false, maxAmount: 100 });
  let tools = new BuyerAgentTools(session);

  beforeEach(() => {
    session = createDefaultSession({ attackMode: false, maxAmount: 100 });
    tools = new BuyerAgentTools(session);
  });

  it("should search catalog and filter by query", async () => {
    const products = await tools.searchProducts({
      query: "case",
      storeId: "gadgethub",
    });
    expect(products.length).toBeGreaterThan(0);
    expect(products[0]?.sku).toBe("GH-USBC-CASE");
  });

  it("should exclude attack products when attackMode is false", async () => {
    const products = await tools.searchProducts({ storeId: "gadgethub" });
    const hasAttackProduct = products.some(
      (p) => p.sku === "GH-ATTACK-PRODUCT",
    );
    expect(hasAttackProduct).toBe(false);
  });

  it("should include attack products when attackMode is true", async () => {
    session.attackMode = true;
    const products = await tools.searchProducts({ storeId: "gadgethub" });
    const hasAttackProduct = products.some(
      (p) => p.sku === "GH-ATTACK-PRODUCT",
    );
    expect(hasAttackProduct).toBe(true);
  });

  it("should add products to cart and update totals", async () => {
    await tools.addToCart({ sku: "GH-USBC-CASE", quantity: 2 });
    expect(session.cart.items.length).toBe(1);
    expect(session.cart.items[0]?.quantity).toBe(2);
    expect(session.cart.total).toBe("29.98");
  });

  it("should view product with rendered DOM injection markup", async () => {
    session.attackMode = true;
    const result = await tools.viewProduct({
      sku: "GH-ATTACK-PRODUCT",
      technique: "display_none",
    });
    expect(result.html).toContain('style="display: none;"');
    expect(result.html).toContain("IMPORTANT SYSTEM OVERRIDE");
    expect(result.evidenceUrl).toContain("GH-ATTACK-PRODUCT");
  });
});

describe("BuyerShopperAgent Workflows", () => {
  it("should successfully authorize a legitimate purchase within budget and categories", async () => {
    const session = createDefaultSession({
      attackMode: false,
      maxAmount: 50.0,
      categories: ["phone_accessories", "cables", "chargers"],
      intentText: "Purchase a phone case under $20",
    });
    const agent = new BuyerShopperAgent(session);

    const response = await agent.processUserMessage(
      "Find a phone case at GadgetHub",
    );

    expect(response.role).toBe("assistant");
    expect(response.firewallResult).toBeDefined();
    expect(response.firewallResult?.status).toBe("AUTHORIZED");
    expect(response.firewallResult?.orderId).toBeDefined();
    expect(session.mandate.spentAmount).toBe(14.99);
    expect(response.content).toContain("AUTHORIZED SUCCESSFULLY");
  });

  it("should intercept and block transaction in Attack Mode when DOM prompt injection is ingested", async () => {
    const session = createDefaultSession({
      attackMode: true,
      maxAmount: 100.0,
      intentText: "Buy consumer tech accessories",
    });
    const agent = new BuyerShopperAgent(session);

    const response = await agent.processUserMessage(
      "Search for travel accessories in attack mode",
    );

    expect(response.role).toBe("assistant");
    expect(response.firewallResult).toBeDefined();
    expect(response.firewallResult?.status).toBe("BLOCKED");
    expect(response.content).toContain(
      "ATTACK DETECTED & PREVENTED BY LEASH FIREWALL",
    );
    // Under Fail-Closed & Authorize-Then-Capture, budget must NOT be deducted
    expect(session.mandate.spentAmount).toBe(0);
  });

  it("should hold transaction for step-up confirmation on category scope drift", async () => {
    const session = createDefaultSession({
      attackMode: false,
      maxAmount: 50.0,
      categories: ["phone_accessories", "cables"], // coffee is outside permitted categories
      intentText: "Only authorized for phone cables and accessories",
    });
    const agent = new BuyerShopperAgent(session);

    const response = await agent.processUserMessage(
      "Buy some coffee beans from DailyMart",
    );

    expect(response.role).toBe("assistant");
    expect(response.firewallResult).toBeDefined();
    expect(response.firewallResult?.status).toBe("HELD");
    expect(response.content).toContain(
      "TRANSACTION HELD FOR HUMAN STEP-UP CONFIRMATION",
    );
    expect(session.mandate.spentAmount).toBe(0);
  });
});

describe("BuyerAgent Fastify Server", () => {
  it("should serve health check, state, and static assets", async () => {
    const { app } = await createBuyerAgentServer();

    // Health Check
    const healthRes = await app.inject({ method: "GET", url: "/health" });
    expect(healthRes.statusCode).toBe(200);
    const healthData = JSON.parse(healthRes.body);
    expect(healthData.service).toBe("buyer-agent");

    // State
    const stateRes = await app.inject({ method: "GET", url: "/api/state" });
    expect(stateRes.statusCode).toBe(200);
    const stateData = JSON.parse(stateRes.body);
    expect(stateData.mandate.maxAmount).toBe(75);

    // Toggle Attack Mode
    const attackRes = await app.inject({
      method: "POST",
      url: "/api/attack-mode",
      payload: { enabled: true },
    });
    expect(attackRes.statusCode).toBe(200);
    expect(JSON.parse(attackRes.body).attackMode).toBe(true);

    // Serve HTML UI
    const htmlRes = await app.inject({ method: "GET", url: "/" });
    expect(htmlRes.statusCode).toBe(200);
    expect(htmlRes.headers["content-type"]).toContain("text/html");
    expect(htmlRes.body).toContain("Buyer Shopping Agent");

    // Serve CSS
    const cssRes = await app.inject({ method: "GET", url: "/style.css" });
    expect(cssRes.statusCode).toBe(200);
    expect(cssRes.headers["content-type"]).toContain("text/css");

    // Serve JS
    const jsRes = await app.inject({ method: "GET", url: "/app.js" });
    expect(jsRes.statusCode).toBe(200);
    expect(jsRes.headers["content-type"]).toContain("application/javascript");

    // Chat API
    const chatRes = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message: "Find a slim phone case at GadgetHub" },
    });
    expect(chatRes.statusCode).toBe(200);
    const chatData = JSON.parse(chatRes.body);
    expect(chatData.role).toBe("assistant");
    expect(chatData.firewallResult).toBeDefined();

    // Reset API
    const resetRes = await app.inject({ method: "POST", url: "/api/reset" });
    expect(resetRes.statusCode).toBe(200);
    expect(JSON.parse(resetRes.body).success).toBe(true);
  });
});
