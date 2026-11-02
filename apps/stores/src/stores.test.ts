import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  getStoreCatalog,
  getProductBySku,
  renderProductHtml,
  initMerchantRegistry,
  getMerchantRegistry,
  getPublicMerchantRegistry,
  getMerchantByStoreId,
  createSignedCartMandate,
  verifyStoreCartMandate,
  createSignedFulfilmentNotice,
  verifyFulfilmentNotice,
  PayPalMerchantAgentToolkit,
  createStoresServer,
  type StoreProduct,
} from "./index.js";

describe("Issue #8: Demo Storefronts & Merchant Agents (@leash/stores)", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    await initMerchantRegistry();
    server = await createStoresServer();
    await server.ready();
  });

  afterAll(async () => {
    if (server) {
      await server.close();
    }
  });

  // =========================================================================
  // 1. Catalog & Product Fixtures
  // =========================================================================
  describe("Product Catalog & Fixtures", () => {
    it("provides standard products for all 3 demo storefronts", () => {
      const gadgetHub = getStoreCatalog("gadgethub");
      const trend = getStoreCatalog("trendboutique");
      const daily = getStoreCatalog("dailymart");

      expect(gadgetHub.length).toBeGreaterThanOrEqual(5);
      expect(trend.length).toBeGreaterThanOrEqual(5);
      expect(daily.length).toBeGreaterThanOrEqual(5);

      for (const p of [...gadgetHub, ...trend, ...daily]) {
        expect(p.price).toMatch(/^\d+(\.\d{2})?$/);
        expect(p.name.length).toBeGreaterThan(3);
        expect(p.hiddenInjection).toBeUndefined();
      }
    });

    it("filters out attack products unless includeAttackProducts is enabled", () => {
      const clean = getStoreCatalog("gadgethub", { includeAttackProducts: false });
      expect(clean.some((p: StoreProduct) => !!p.hiddenInjection)).toBe(false);

      const attack = getStoreCatalog("gadgethub", { includeAttackProducts: true });
      const injectionItem = attack.find((p: StoreProduct) => !!p.hiddenInjection);
      expect(injectionItem).toBeDefined();
      expect(injectionItem?.hiddenInjection).toContain("SYSTEM OVERRIDE");
    });

    it("renders HTML with various hidden injection techniques", () => {
      const normal = getProductBySku("GH-USBC-CASE")!;
      const normalHtml = renderProductHtml(normal);
      expect(normalHtml).toContain("Slim Matte USB-C Phone Case");
      expect(normalHtml).not.toContain("SYSTEM OVERRIDE");

      const attack = getProductBySku("GH-ATTACK-PRODUCT")!;
      expect(renderProductHtml(attack, { technique: "comment" })).toContain("<!-- IMPORTANT SYSTEM OVERRIDE:");
      expect(renderProductHtml(attack, { technique: "display_none" })).toContain('style="display: none;"');
      expect(renderProductHtml(attack, { technique: "aria_hidden" })).toContain('aria-hidden="true"');
      expect(renderProductHtml(attack, { technique: "font_zero" })).toContain('font-size: 0px;');
    });
  });

  // =========================================================================
  // 2. Merchant Cryptographic Registry & PayPal Payee Metadata
  // =========================================================================
  describe("Merchant Registry & ECDSA Keypairs", () => {
    it("registers all 3 stores with ECDSA P-256 keypairs and PayPal payee accounts", async () => {
      const registry = await getMerchantRegistry();
      expect(Object.keys(registry)).toEqual(["gadgethub", "trendboutique", "dailymart"]);

      expect(registry.gadgethub.payeeEmail).toBe("merchant-gadgethub@sandbox.paypal.com");
      expect(registry.trendboutique.payeeEmail).toBe("merchant-trendboutique@sandbox.paypal.com");
      expect(registry.dailymart.payeeEmail).toBe("merchant-dailymart@sandbox.paypal.com");

      // Verify each store has distinct keypairs and kids
      expect(registry.gadgethub.keyPair.publicKey.kid).toBe("kid_mer_gadgethub");
      expect(registry.trendboutique.keyPair.publicKey.kid).toBe("kid_mer_trendboutique");
      expect(registry.dailymart.keyPair.publicKey.kid).toBe("kid_mer_dailymart");
    });

    it("exposes public registry without leaking private keys", async () => {
      const publicRegistry = await getPublicMerchantRegistry();
      for (const merchant of Object.values(publicRegistry)) {
        expect(merchant.publicKey).toBeDefined();
        expect(merchant.publicKey.alg).toBe("ES256");
        expect((merchant as unknown as Record<string, unknown>).keyPair).toBeUndefined();
      }
    });

    it("retrieves merchant by storeId or merchantId", async () => {
      const byStore = await getMerchantByStoreId("gadgethub");
      expect(byStore?.name).toBe("GadgetHub Official Store");

      const byMerId = await getMerchantByStoreId("trendboutique");
      expect(byMerId?.merchantId).toBe("mer_trendboutique");
    });
  });

  // =========================================================================
  // 3. AP2 Cart Mandate Signing & Verification
  // =========================================================================
  describe("Cart Mandate Signing & Verification", () => {
    it("creates and cryptographically verifies an AP2 Signed Cart Mandate", async () => {
      const signedCart = await createSignedCartMandate({
        storeId: "gadgethub",
        items: [
          { sku: "GH-USBC-CASE", qty: 2 }, // $14.99 * 2 = $29.98
          { sku: "GH-BRAIDED-CABLE", qty: 1 }, // $9.99
        ],
        shipping: "5.00",
      });

      expect(signedCart.merchantId).toBe("mer_gadgethub");
      expect(signedCart.items.length).toBe(2);
      expect(signedCart.shipping).toBe("5.00");
      expect(signedCart.total).toBe("44.97"); // 29.98 + 9.99 + 5.00 = 44.97
      expect(signedCart.sig.alg).toBe("ES256");
      expect(signedCart.sig.kid).toBe("kid_mer_gadgethub");
      expect(signedCart.sig.jws).toBeTruthy();

      // Cryptographically verify against the merchant's public key
      const verification = await verifyStoreCartMandate(signedCart);
      expect(verification.valid).toBe(true);
    });

    it("rejects items from a foreign store", async () => {
      await expect(
        createSignedCartMandate({
          storeId: "gadgethub",
          items: [{ sku: "TB-MERINO-TEE", qty: 1 }], // belongs to trendboutique
        }),
      ).rejects.toThrow("belongs to 'trendboutique', not 'gadgethub'");
    });

    it("detects tampering on signed Cart Mandate", async () => {
      const signedCart = await createSignedCartMandate({
        storeId: "gadgethub",
        items: [{ sku: "GH-USBC-CASE", qty: 1 }],
      });

      // Tamper with total amount
      const tamperedCart = {
        ...signedCart,
        total: "999.00",
      };

      const result = await verifyStoreCartMandate(tamperedCart);
      expect(result.valid).toBe(false);
    });
  });

  // =========================================================================
  // 4. Merchant Fulfilment Notices with Carrier Tracking
  // =========================================================================
  describe("Fulfilment Notices & Attestation", () => {
    it("creates a cryptographically signed Fulfilment Notice with valid carrier tracking", async () => {
      const notice = await createSignedFulfilmentNotice({
        storeId: "gadgethub",
        orderId: "ORDER_PP_123456",
        authorizationId: "AUTH_PP_789012",
        carrier: "UPS",
        items: [{ sku: "GH-USBC-CASE", qty: 1 }],
      });

      expect(notice.fulfilmentId).toMatch(/^flf_/);
      expect(notice.merchantId).toBe("mer_gadgethub");
      expect(notice.orderId).toBe("ORDER_PP_123456");
      expect(notice.authorizationId).toBe("AUTH_PP_789012");
      expect(notice.carrier).toBe("UPS");
      expect(notice.trackingNumber).toMatch(/^1Z/);
      expect(notice.items[0]?.name).toBe("Slim Matte USB-C Phone Case");
      expect(notice.sig.alg).toBe("ES256");

      // Verify cryptographic signature
      const verification = await verifyFulfilmentNotice(notice);
      expect(verification.valid).toBe(true);
    });

    it("detects tampering on signed Fulfilment Notice", async () => {
      const notice = await createSignedFulfilmentNotice({
        storeId: "trendboutique",
        orderId: "ORDER_TB_100",
        authorizationId: "AUTH_TB_200",
        carrier: "FedEx",
      });

      // Tamper with tracking number
      const tamperedNotice = {
        ...notice,
        trackingNumber: "794900000000TAMPERED",
      };

      const verification = await verifyFulfilmentNotice(tamperedNotice);
      expect(verification.valid).toBe(false);
    });
  });

  // =========================================================================
  // 5. PayPal Merchant Agent Toolkit
  // =========================================================================
  describe("PayPal Merchant Agent Toolkit", () => {
    const toolkit = new PayPalMerchantAgentToolkit();

    it("queries catalog with filters", async () => {
      const res = await toolkit.queryCatalog({
        storeId: "trendboutique",
        category: "apparel",
      });

      expect(res.storeId).toBe("trendboutique");
      expect(res.products.length).toBeGreaterThan(0);
      expect(res.products.every((p: StoreProduct) => p.category === "apparel")).toBe(true);
    });

    it("executes merchant agent tool suite for signing, fulfilling, and refunds", async () => {
      // 1. Sign Cart
      const cart = await toolkit.signCart({
        storeId: "dailymart",
        items: [{ sku: "DM-COFFEE-BEANS", qty: 2 }],
      });
      expect(cart.total).toBe("32.00"); // 16.00 * 2

      // 2. Fulfill
      const fulfillment = await toolkit.fulfillOrder({
        storeId: "dailymart",
        orderId: "ORD_DAILY_01",
        authorizationId: "AUTH_DAILY_01",
        carrier: "USPS",
      });
      expect(fulfillment.trackingNumber).toMatch(/^9400/);

      // 3. Refund
      const refund = await toolkit.refundOrder({
        storeId: "dailymart",
        captureId: "CAP_DAILY_01",
        amount: "32.00",
        reason: "Customer cancellation",
      });
      expect(refund.status).toBe("COMPLETED");

      // 4. Dispute
      const dispute = await toolkit.disputeOrder({
        storeId: "dailymart",
        orderId: "ORD_DAILY_01",
        reason: "Package reported missing",
      });
      expect(dispute.status).toBe("UNDER_REVIEW");
    });

    it("provides valid schema definitions for agent tool calling", () => {
      const toolDefs = toolkit.getToolDefinitions();
      expect(toolDefs.length).toBeGreaterThanOrEqual(4);
      expect(toolDefs.some((t) => t.name === "merchant_query_catalog")).toBe(true);
      expect(toolDefs.some((t) => t.name === "merchant_sign_cart")).toBe(true);
      expect(toolDefs.some((t) => t.name === "merchant_fulfill_order")).toBe(true);
    });
  });

  // =========================================================================
  // 6. Fastify HTTP Endpoints
  // =========================================================================
  describe("Fastify Storefront HTTP Server", () => {
    it("serves GET /health", async () => {
      const res = await server.inject({ method: "GET", url: "/health" });
      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.status).toBe("ok");
      expect(data.activeStores).toBe(3);
    });

    it("serves GET /stores with public registry", async () => {
      const res = await server.inject({ method: "GET", url: "/stores" });
      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.total).toBe(3);
      expect(data.stores.gadgethub.payeeEmail).toBe("merchant-gadgethub@sandbox.paypal.com");
    });

    it("serves GET /stores/:storeId/catalog", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/stores/gadgethub/catalog?maxPrice=30",
      });
      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.products.length).toBeGreaterThan(0);
      for (const p of data.products) {
        expect(parseFloat(p.price)).toBeLessThanOrEqual(30);
      }
    });

    it("serves GET /stores/:storeId/products/:sku in JSON and HTML formats", async () => {
      // JSON
      const jsonRes = await server.inject({
        method: "GET",
        url: "/stores/gadgethub/products/GH-USBC-CASE",
      });
      expect(jsonRes.statusCode).toBe(200);
      expect(jsonRes.json().name).toBe("Slim Matte USB-C Phone Case");

      // HTML
      const htmlRes = await server.inject({
        method: "GET",
        url: "/stores/gadgethub/products/GH-USBC-CASE?format=html",
      });
      expect(htmlRes.statusCode).toBe(200);
      expect(htmlRes.headers["content-type"]).toContain("text/html");
      expect(htmlRes.body).toContain("<!DOCTYPE html>");
      expect(htmlRes.body).toContain("Slim Matte USB-C Phone Case");
    });

    it("handles POST /stores/:storeId/cart and POST /stores/:storeId/cart/verify", async () => {
      const cartRes = await server.inject({
        method: "POST",
        url: "/stores/trendboutique/cart",
        payload: {
          items: [{ sku: "TB-CANVAS-TOTE", qty: 2 }],
          shipping: "3.50",
        },
      });

      expect(cartRes.statusCode).toBe(200);
      const cart = cartRes.json();
      expect(cart.total).toBe("47.50"); // 22.00 * 2 + 3.50 = 47.50
      expect(cart.sig.kid).toBe("kid_mer_trendboutique");

      // Verify via API
      const verifyRes = await server.inject({
        method: "POST",
        url: "/stores/trendboutique/cart/verify",
        payload: cart,
      });
      expect(verifyRes.statusCode).toBe(200);
      expect(verifyRes.json().valid).toBe(true);
    });

    it("handles POST /stores/:storeId/fulfill and POST /stores/:storeId/fulfill/verify", async () => {
      const fulfillRes = await server.inject({
        method: "POST",
        url: "/stores/dailymart/fulfill",
        payload: {
          orderId: "PP_ORDER_999",
          authorizationId: "PP_AUTH_888",
          carrier: "USPS",
        },
      });

      expect(fulfillRes.statusCode).toBe(200);
      const notice = fulfillRes.json();
      expect(notice.trackingNumber).toMatch(/^9400/);
      expect(notice.sig.jws).toBeTruthy();

      // Verify via API
      const verifyRes = await server.inject({
        method: "POST",
        url: "/stores/dailymart/fulfill/verify",
        payload: notice,
      });
      expect(verifyRes.statusCode).toBe(200);
      expect(verifyRes.json().valid).toBe(true);
    });

    it("serves GET / interactive web dashboard", async () => {
      const res = await server.inject({ method: "GET", url: "/" });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("text/html");
      expect(res.body).toContain("PayPal AI Hackathon 2026 · Demo Stores");
      expect(res.body).toContain("GadgetHub");
      expect(res.body).toContain("TrendBoutique");
      expect(res.body).toContain("DailyMart");
    });
  });
});
