import Fastify, { type FastifyInstance } from "fastify";
import {
  initMerchantRegistry,
  getPublicMerchantRegistry,
  getMerchantByStoreId,
  type StoreId,
} from "./registry.js";
import {
  STORE_PRODUCTS,
  getProductBySku,
  renderProductHtml,
  type StoreProduct,
  type HiddenInjectionTechnique,
} from "./catalog.js";
import {
  createSignedCartMandate,
  verifyStoreCartMandate,
  type CartItemInput,
} from "./cart.js";
import {
  createSignedFulfilmentNotice,
  verifyFulfilmentNotice,
  type CarrierName,
  type SignedFulfilmentNotice,
} from "./fulfilment.js";
import { merchantToolkit } from "./toolkit.js";
import { type SignedCartMandate } from "@leash/mandates";

export async function createStoresServer(): Promise<FastifyInstance> {
  // Ensure merchant registry and signing keys are initialized
  await initMerchantRegistry();

  const app = Fastify({ logger: false });

  // CORS headers
  app.addHook("onRequest", async (req, reply) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS",
    );
    reply.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      reply.status(204).send();
    }
  });

  // Health Endpoint
  app.get("/health", async () => {
    return {
      status: "ok",
      service: "leash-stores",
      activeStores: 3,
      stores: ["gadgethub", "trendboutique", "dailymart"],
      timestamp: new Date().toISOString(),
    };
  });

  // List all demo stores with public keys and PayPal payee info
  app.get("/stores", async () => {
    const stores = await getPublicMerchantRegistry();
    return {
      total: Object.keys(stores).length,
      stores,
    };
  });

  // Get specific store profile
  app.get("/stores/:storeId", async (req, reply) => {
    const { storeId } = req.params as { storeId: string };
    const merchant = await getMerchantByStoreId(storeId as StoreId);
    if (!merchant) {
      reply.status(404);
      return {
        error: `Store '${storeId}' not found. Available stores: gadgethub, trendboutique, dailymart`,
      };
    }
    return {
      storeId: merchant.storeId,
      merchantId: merchant.merchantId,
      name: merchant.name,
      description: merchant.description,
      domain: merchant.domain,
      payeeEmail: merchant.payeeEmail,
      payeeMerchantId: merchant.payeeMerchantId,
      brandColor: merchant.brandColor,
      accentColor: merchant.accentColor,
      publicKey: merchant.keyPair.publicKey,
    };
  });

  // Query store catalog
  app.get("/stores/:storeId/catalog", async (req, reply) => {
    const { storeId } = req.params as { storeId: string };
    const query = req.query as {
      query?: string;
      category?: string;
      attack?: string;
      includeAttack?: string;
      maxPrice?: string;
    };

    const isAttack =
      query.attack === "true" ||
      query.attack === "1" ||
      query.includeAttack === "true" ||
      query.includeAttack === "1";

    try {
      const result = await merchantToolkit.queryCatalog({
        storeId: storeId as StoreId,
        query: query.query,
        category: query.category,
        maxPrice: query.maxPrice ? parseFloat(query.maxPrice) : undefined,
        includeAttackProducts: isAttack,
      });
      return result;
    } catch (err) {
      reply.status(400);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Get product by SKU (JSON or rendered HTML with hidden injection)
  app.get("/stores/:storeId/products/:sku", async (req, reply) => {
    const { storeId, sku } = req.params as { storeId: string; sku: string };
    const query = req.query as {
      format?: string;
      technique?: HiddenInjectionTechnique;
    };

    const product = getProductBySku(sku);
    if (!product || product.storeId !== storeId) {
      reply.status(404);
      return {
        error: `Product with SKU '${sku}' not found in store '${storeId}'`,
      };
    }

    const acceptsHtml =
      req.headers.accept?.includes("text/html") || query.format === "html";

    if (acceptsHtml) {
      const html = renderProductHtml(product, {
        technique: query.technique || "display_none",
      });
      reply.type("text/html; charset=utf-8").send(html);
      return;
    }

    return product;
  });

  // Create and cryptographically sign a Cart Mandate
  app.post("/stores/:storeId/cart", async (req, reply) => {
    const { storeId } = req.params as { storeId: string };
    const body = req.body as {
      items?: CartItemInput[];
      shipping?: string;
      currency?: string;
      expiresInSeconds?: number;
    };

    if (
      !body ||
      !body.items ||
      !Array.isArray(body.items) ||
      body.items.length === 0
    ) {
      reply.status(400);
      return {
        error:
          "Missing or empty 'items' array. Each item must have { sku, qty }.",
      };
    }

    try {
      const signedCart = await createSignedCartMandate({
        storeId: storeId as StoreId,
        items: body.items,
        shipping: body.shipping || "0.00",
        currency: body.currency || "USD",
        expiresInSeconds: body.expiresInSeconds || 3600,
      });
      return signedCart;
    } catch (err) {
      reply.status(400);
      return {
        error: "Failed to sign Cart Mandate",
        details: err instanceof Error ? err.message : String(err),
      };
    }
  });

  // Verify a signed cart mandate
  app.post("/stores/:storeId/cart/verify", async (req, reply) => {
    const body = req.body as SignedCartMandate;
    if (!body || !body.sig) {
      reply.status(400);
      return { error: "Missing signed cart body or signature" };
    }
    const result = await verifyStoreCartMandate(body);
    return result;
  });

  // Issue a cryptographically signed Fulfilment Notice with carrier tracking
  app.post("/stores/:storeId/fulfill", async (req, reply) => {
    const { storeId } = req.params as { storeId: string };
    const body = req.body as {
      orderId?: string;
      authorizationId?: string;
      carrier?: CarrierName;
      trackingNumber?: string;
      items?: Array<{ sku: string; qty: number }>;
      notes?: string;
    };

    if (!body || !body.orderId || !body.authorizationId) {
      reply.status(400);
      return {
        error:
          "orderId and authorizationId are required to issue a Fulfilment Notice",
      };
    }

    try {
      const notice = await createSignedFulfilmentNotice({
        storeId: storeId as StoreId,
        orderId: body.orderId,
        authorizationId: body.authorizationId,
        carrier: body.carrier,
        trackingNumber: body.trackingNumber,
        items: body.items,
        notes: body.notes,
      });
      return notice;
    } catch (err) {
      reply.status(400);
      return {
        error: "Failed to issue Fulfilment Notice",
        details: err instanceof Error ? err.message : String(err),
      };
    }
  });

  // Verify a signed fulfilment notice
  app.post("/stores/:storeId/fulfill/verify", async (req, reply) => {
    const body = req.body as SignedFulfilmentNotice;
    if (!body || !body.sig) {
      reply.status(400);
      return { error: "Missing signed fulfilment notice body or signature" };
    }
    const result = await verifyFulfilmentNotice(body);
    return result;
  });

  // Process Merchant Refund
  app.post("/stores/:storeId/refund", async (req, reply) => {
    const { storeId } = req.params as { storeId: string };
    const body = req.body as {
      captureId?: string;
      amount?: string;
      reason?: string;
    };

    if (!body || !body.captureId || !body.amount) {
      reply.status(400);
      return { error: "captureId and amount are required to process a refund" };
    }

    try {
      const result = await merchantToolkit.refundOrder({
        storeId: storeId as StoreId,
        captureId: body.captureId,
        amount: body.amount,
        reason: body.reason,
      });
      return result;
    } catch (err) {
      reply.status(400);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Handle Merchant Dispute
  app.post("/stores/:storeId/dispute", async (req, reply) => {
    const { storeId } = req.params as { storeId: string };
    const body = req.body as { orderId?: string; reason?: string };

    if (!body || !body.orderId || !body.reason) {
      reply.status(400);
      return { error: "orderId and reason are required to log a dispute" };
    }

    try {
      const result = await merchantToolkit.disputeOrder({
        storeId: storeId as StoreId,
        orderId: body.orderId,
        reason: body.reason,
      });
      return result;
    } catch (err) {
      reply.status(400);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Interactive Multi-Tenant Demo Storefront Web Dashboard
  app.get("/", async (_req, reply) => {
    const registry = await getPublicMerchantRegistry();
    const html = renderStorefrontUi(registry, STORE_PRODUCTS);
    reply.type("text/html; charset=utf-8").send(html);
  });

  return app;
}

/**
 * Renders an Obsidian-themed multi-tenant demo storefront dashboard.
 */
function renderStorefrontUi(
  registry: Record<
    string,
    {
      name: string;
      description: string;
      payeeEmail: string;
      brandColor: string;
      domain: string;
    }
  >,
  products: StoreProduct[],
): string {
  const productsJson = JSON.stringify(products);
  const registryJson = JSON.stringify(registry);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Leash Demo Storefronts · Autonomous Merchant Agents</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-void: #08090d;
      --surface-flat: #0c0e13;
      --surface-elevated: #12151c;
      --border: rgba(255, 255, 255, 0.1);
      --border-dashed: rgba(255, 255, 255, 0.12);
      --foreground: #fafafa;
      --muted: #9f9fa9;
      --emerald: #00c758;
      --amber: #f0a830;
      --crimson: #e05a4a;
      --paypal-blue: #0070ba;
      --font-display: "Plus Jakarta Sans", -apple-system, sans-serif;
      --font-mono: "JetBrains Mono", Menlo, monospace;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg-void);
      color: var(--foreground);
      font-family: var(--font-display);
      padding: 32px 24px;
      line-height: 1.5;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 32px;
      padding-bottom: 24px;
      border-bottom: 1px dashed var(--border-dashed);
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 9999px;
      font-size: 11px;
      font-family: var(--font-mono);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background: rgba(0, 199, 88, 0.12);
      color: var(--emerald);
      border: 1px solid rgba(0, 199, 88, 0.4);
    }
    h1 { font-size: 26px; font-weight: 800; margin-top: 8px; }
    .subtitle { color: var(--muted); font-size: 14px; margin-top: 4px; }
    .store-tabs {
      display: flex;
      gap: 12px;
      margin-bottom: 28px;
    }
    .store-tab {
      background: var(--surface-flat);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 14px 20px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 4px;
      transition: all 0.2s ease;
      flex: 1;
    }
    .store-tab:hover { border-color: rgba(255, 255, 255, 0.3); }
    .store-tab.active {
      background: var(--surface-elevated);
      border-color: var(--paypal-blue);
      box-shadow: 0 0 20px rgba(0, 112, 186, 0.2);
    }
    .store-tab-name { font-weight: 700; font-size: 16px; }
    .store-tab-email { font-size: 11px; font-family: var(--font-mono); color: var(--muted); }
    .controls {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      background: var(--surface-flat);
      padding: 14px 20px;
      border-radius: 12px;
      border: 1px solid var(--border);
    }
    .toggle-group {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 13px;
      font-weight: 600;
    }
    .toggle {
      width: 44px;
      height: 24px;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 9999px;
      position: relative;
      cursor: pointer;
      transition: background 0.2s ease;
    }
    .toggle.active { background: var(--crimson); }
    .toggle-thumb {
      width: 18px;
      height: 18px;
      background: white;
      border-radius: 50%;
      position: absolute;
      top: 3px;
      left: 3px;
      transition: transform 0.2s ease;
    }
    .toggle.active .toggle-thumb { transform: translateX(20px); }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 20px;
      margin-bottom: 40px;
    }
    .product-card {
      background: var(--surface-flat);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      position: relative;
      overflow: hidden;
    }
    .product-card.attack {
      border-color: rgba(224, 90, 74, 0.5);
      background: rgba(224, 90, 74, 0.04);
    }
    .card-tag {
      font-family: var(--font-mono);
      font-size: 10px;
      padding: 2px 8px;
      border-radius: 4px;
      width: fit-content;
      margin-bottom: 8px;
      background: rgba(255, 255, 255, 0.08);
      color: var(--muted);
    }
    .card-title { font-size: 16px; font-weight: 700; margin-bottom: 6px; }
    .card-desc { font-size: 12px; color: var(--muted); margin-bottom: 16px; min-height: 36px; }
    .card-price-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding-top: 14px;
      border-top: 1px dashed var(--border-dashed);
    }
    .price { font-size: 20px; font-weight: 800; font-family: var(--font-mono); color: var(--foreground); }
    .attack-alert {
      margin-top: 12px;
      padding: 10px;
      border-radius: 8px;
      background: rgba(224, 90, 74, 0.15);
      border: 1px solid rgba(224, 90, 74, 0.4);
      font-size: 11px;
      font-family: var(--font-mono);
      color: #fca5a5;
    }
    .tools-panel {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      background: var(--surface-flat);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 24px;
    }
    .tool-box h3 { font-size: 16px; font-weight: 700; margin-bottom: 8px; }
    .tool-box p { font-size: 12px; color: var(--muted); margin-bottom: 16px; }
    .btn {
      background: var(--paypal-blue);
      color: white;
      border: none;
      border-radius: 8px;
      padding: 10px 18px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .btn:hover { background: #005ea6; }
    .output-pre {
      margin-top: 14px;
      background: var(--bg-void);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 14px;
      font-family: var(--font-mono);
      font-size: 11px;
      max-height: 220px;
      overflow-y: auto;
      color: #38bdf8;
      white-space: pre-wrap;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <div class="badge">PayPal AI Hackathon 2026 · Demo Stores</div>
        <h1>Multi-Tenant Merchant Ecosystem</h1>
        <p class="subtitle">3 Autonomous Storefronts with AP2 Signed Cart Mandates & Fulfilment Receipts</p>
      </div>
      <div style="text-align: right;">
        <span class="badge" style="background: rgba(0, 112, 186, 0.15); color: #38bdf8; border-color: rgba(0, 112, 186, 0.4);">PayPal Agent Toolkit Active</span>
      </div>
    </header>

    <div class="store-tabs">
      <div class="store-tab active" onclick="switchStore('gadgethub')" id="tab-gadgethub">
        <span class="store-tab-name">⚡ GadgetHub</span>
        <span class="store-tab-email">merchant-gadgethub@sandbox.paypal.com</span>
      </div>
      <div class="store-tab" onclick="switchStore('trendboutique')" id="tab-trendboutique">
        <span class="store-tab-name">✨ TrendBoutique</span>
        <span class="store-tab-email">merchant-trendboutique@sandbox.paypal.com</span>
      </div>
      <div class="store-tab" onclick="switchStore('dailymart')" id="tab-dailymart">
        <span class="store-tab-name">🛒 DailyMart</span>
        <span class="store-tab-email">merchant-dailymart@sandbox.paypal.com</span>
      </div>
    </div>

    <div class="controls">
      <div class="toggle-group">
        <span>Attack Mode (Show Adversarial Injections)</span>
        <div class="toggle" id="attack-toggle" onclick="toggleAttackMode()">
          <div class="toggle-thumb"></div>
        </div>
      </div>
      <div id="catalog-count" style="font-size: 13px; font-family: var(--font-mono); color: var(--muted);">
        Showing 5 items
      </div>
    </div>

    <div class="grid" id="products-grid"></div>

    <div class="tools-panel">
      <div class="tool-box">
        <h3>AP2 Signed Cart Mandate Generator</h3>
        <p>Issues a cryptographically signed cart using the merchant's ECDSA P-256 private key and RFC 8785 canonical JSON.</p>
        <button class="btn" onclick="testSignCart()">Sign Sample Cart Mandate</button>
        <div class="output-pre" id="cart-output">// Click above to generate signed Cart Mandate...</div>
      </div>

      <div class="tool-box">
        <h3>Signed Fulfilment Notice Attestation</h3>
        <p>Issues a cryptographically signed carrier fulfilment notice required to trigger PayPal Payments v2 capture.</p>
        <button class="btn" style="background: var(--emerald);" onclick="testFulfill()">Generate Signed Fulfilment Notice</button>
        <div class="output-pre" id="fulfill-output" style="color: #4ade80;">// Click above to attest delivery tracking...</div>
      </div>
    </div>
  </div>

  <script>
    const ALL_PRODUCTS = ${productsJson};
    const REGISTRY = ${registryJson};
    let currentStore = 'gadgethub';
    let attackMode = false;

    function switchStore(storeId) {
      currentStore = storeId;
      document.querySelectorAll('.store-tab').forEach(t => t.classList.remove('active'));
      document.getElementById('tab-' + storeId).classList.add('active');
      renderCatalog();
    }

    function toggleAttackMode() {
      attackMode = !attackMode;
      document.getElementById('attack-toggle').classList.toggle('active', attackMode);
      renderCatalog();
    }

    function renderCatalog() {
      const grid = document.getElementById('products-grid');
      grid.innerHTML = '';

      const filtered = ALL_PRODUCTS.filter(p => {
        if (p.storeId !== currentStore) return false;
        if (!attackMode && p.hiddenInjection) return false;
        return true;
      });

      document.getElementById('catalog-count').innerText = \`Showing \${filtered.length} products\`;

      filtered.forEach(p => {
        const isAttack = !!p.hiddenInjection;
        const card = document.createElement('div');
        card.className = 'product-card' + (isAttack ? ' attack' : '');
        card.innerHTML = \`
          <div>
            <div class="card-tag">\${p.sku} · \${p.category}</div>
            <div class="card-title">\${p.name}</div>
            <div class="card-desc">\${p.description}</div>
            \${isAttack ? \`<div class="attack-alert">⚠️ <strong>HIDDEN INJECTION:</strong><br>\${p.hiddenInjection}</div>\` : ''}
          </div>
          <div class="card-price-row">
            <span class="price">$\${p.price}</span>
            <button class="btn" style="padding: 6px 12px; font-size: 11px;" onclick="quickSign('\${p.sku}')">Add & Sign Cart</button>
          </div>
        \`;
        grid.appendChild(card);
      });
    }

    async function testSignCart() {
      const out = document.getElementById('cart-output');
      out.innerText = 'Signing Cart Mandate via POST /stores/' + currentStore + '/cart...';
      try {
        const items = ALL_PRODUCTS.filter(p => p.storeId === currentStore).slice(0, 2).map(p => ({ sku: p.sku, qty: 1 }));
        const res = await fetch('/stores/' + currentStore + '/cart', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items, shipping: '0.00' })
        });
        const data = await res.json();
        out.innerText = JSON.stringify(data, null, 2);
      } catch (e) {
        out.innerText = 'Error: ' + e.message;
      }
    }

    async function quickSign(sku) {
      const out = document.getElementById('cart-output');
      out.innerText = 'Signing Cart with SKU ' + sku + '...';
      try {
        const res = await fetch('/stores/' + currentStore + '/cart', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: [{ sku, qty: 1 }] })
        });
        const data = await res.json();
        out.innerText = JSON.stringify(data, null, 2);
      } catch (e) {
        out.innerText = 'Error: ' + e.message;
      }
    }

    async function testFulfill() {
      const out = document.getElementById('fulfill-output');
      out.innerText = 'Generating Signed Fulfilment Notice via POST /stores/' + currentStore + '/fulfill...';
      try {
        const res = await fetch('/stores/' + currentStore + '/fulfill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: 'ORDER_PP_SANDBOX_' + Math.random().toString(36).substring(2, 8).toUpperCase(),
            authorizationId: 'AUTH_PP_SANDBOX_' + Math.random().toString(36).substring(2, 8).toUpperCase(),
            carrier: 'UPS',
            notes: 'Shipped via UPS Next Day Air'
          })
        });
        const data = await res.json();
        out.innerText = JSON.stringify(data, null, 2);
      } catch (e) {
        out.innerText = 'Error: ' + e.message;
      }
    }

    renderCatalog();
  </script>
</body>
</html>`;
}
