import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { createServer } from "@leash/gateway";
import { BuyerShopperAgent, createDefaultSession } from "@leash/buyer-agent";
import { verifyLedgerChain, type LedgerRow, LEDGER_EVENT_KINDS } from "@leash/shared";
import {
  canonicalizeJson,
  generateMandateKeyPair,
  signMandatePayload,
  verifyMandatePayload,
} from "@leash/mandates";

describe("Leash Payment Firewall: End-to-End User & Agent Regression Suite (Issue #20)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createServer();
    await app.listen({ port: 0, host: "127.0.0.1" });
  });

  afterAll(async () => {
    await app.close();
  });

  it("Stage 1: User creates and cryptographically signs a spending mandate", async () => {
    // Generate ECDSA P-256 keypair for human principal
    const keyPair = await generateMandateKeyPair("key_user_test_01");

    const mandatePayload = {
      id: "mdt_e2e_regression_01",
      maxAmount: 150.0,
      spentAmount: 0,
      intentText: "Purchase consumer electronics, phone cases, and tech cables under $150",
      playback: "Authorized spending up to $150.00 for phone accessories and tech essentials",
      constraints: {
        maxTotal: "150.00",
        maxPerTxn: "80.00",
        currency: "USD",
        categories: ["phone_accessories", "cables", "chargers"],
        itemTerms: ["case", "cable", "charger", "adapter", "usb-c"],
      },
      validUntil: new Date(Date.now() + 86400000 * 30).toISOString(),
    };

    // Canonicalize per RFC 8785 and sign with ECDSA P-256 JWS
    const signature = await signMandatePayload(
      mandatePayload as Record<string, unknown>,
      keyPair.privateKey,
      "key_user_test_01",
    );
    expect(signature).toBeDefined();

    // Verify signature against canonical JSON
    const isValid = await verifyMandatePayload(
      mandatePayload as Record<string, unknown>,
      signature,
      keyPair.publicKey,
    );
    expect(isValid).toBe(true);

    // Register mandate in Leash Gateway
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/mandates",
      payload: {
        id: mandatePayload.id,
        maxAmount: mandatePayload.maxAmount,
        intentText: mandatePayload.intentText,
        validUntil: mandatePayload.validUntil,
      },
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.id).toBe("mdt_e2e_regression_01");
    expect(json.status).toBe("ACTIVE");
    expect(json.maxAmount).toBe(150.0);

    // Verify ledger height reflects new MANDATE_SIGNED block
    const ledgerRes = await app.inject({
      method: "GET",
      url: "/api/v1/ledger",
    });
    const ledger = ledgerRes.json();
    const signedEvent = ledger.chain.find(
      (row: LedgerRow) =>
        row.kind === LEDGER_EVENT_KINDS.MANDATE_SIGNED &&
        row.refId === "mdt_e2e_regression_01",
    );
    expect(signedEvent).toBeDefined();
    expect((signedEvent!.payload as Record<string, unknown>).maxAmount).toBe(150.0);
  });

  it("Stage 2: Buyer agent executes legitimate honest purchase (passes all 5 layers -> PayPal AUTHORIZE)", async () => {
    const session = createDefaultSession({
      sessionId: "sess_honest_shopper",
      attackMode: false,
      maxAmount: 150.0,
      categories: ["phone_accessories", "cables", "chargers"],
      intentText: "Purchase a phone case under $20",
    });

    const agent = new BuyerShopperAgent(session);
    const response = await agent.processUserMessage("Find a phone case at GadgetHub");

    // Assistant response validations
    expect(response.role).toBe("assistant");
    expect(response.content).toContain("ORDER AUTHORIZED SUCCESSFULLY");
    expect(response.firewallResult).toBeDefined();

    const result = response.firewallResult!;
    expect(result.status).toBe("AUTHORIZED");
    expect(result.orderId).toBeDefined();
    expect(result.authorizationId).toBeDefined();
    expect(session.mandate.spentAmount).toBe(14.99);

    // Verify 5-layer decision trace
    expect(result.trace).toBeDefined();
    expect(result.trace.verdict).toBe("ALLOW");
    expect(result.trace.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ layer: "provenance", verdict: "ALLOW" }),
        expect.objectContaining({ layer: "intent", verdict: "ALLOW" }),
        expect.objectContaining({ layer: "risk", verdict: "ALLOW" }),
      ]),
    );

    // Verify Invariant 1: Order is in AUTHORIZE status, money has not been captured
    const ledgerRes = await app.inject({
      method: "GET",
      url: "/api/v1/ledger",
    });
    const ledger = ledgerRes.json();
    const authEvent = ledger.chain.find(
      (r: LedgerRow) =>
        r.kind === LEDGER_EVENT_KINDS.PAYPAL_AUTH_HELD &&
        (r.payload as Record<string, unknown>).authorizationId === result.authorizationId,
    );
    expect(authEvent).toBeDefined();
    expect((authEvent!.payload as Record<string, unknown>).intent).toBe("AUTHORIZE");
  });

  it("Stage 3: Buyer agent attempts injected purchase in Attack Mode (BLOCKED, zero funds moved)", async () => {
    const session = createDefaultSession({
      sessionId: "sess_attack_simulation",
      attackMode: true,
      maxAmount: 200.0,
      intentText: "Buy consumer tech accessories",
    });

    const agent = new BuyerShopperAgent(session);
    const response = await agent.processUserMessage(
      "Search for travel accessories in attack mode",
    );

    expect(response.role).toBe("assistant");
    expect(response.content).toContain(
      "ATTACK DETECTED & PREVENTED BY LEASH FIREWALL",
    );

    const result = response.firewallResult!;
    expect(result.status).toBe("BLOCKED");
    expect(result.orderId).toBeUndefined();
    expect(result.authorizationId).toBeUndefined();

    // Verify that budget was NOT consumed
    expect(session.mandate.spentAmount).toBe(0);
  });

  it("Stage 4: Buyer agent scope drift triggers HELD -> Human step-up APPROVE -> AUTHORIZED", async () => {
    const session = createDefaultSession({
      sessionId: "sess_scope_drift",
      attackMode: false,
      maxAmount: 100.0,
      categories: ["phone_accessories", "cables"],
      intentText: "Purchase phone accessories only",
    });

    const agent = new BuyerShopperAgent(session);
    // User requests grocery / coffee item outside allowed categories
    const response = await agent.processUserMessage("I want to buy coffee beans");

    expect(response.role).toBe("assistant");
    expect(response.content).toContain(
      "TRANSACTION HELD FOR HUMAN STEP-UP CONFIRMATION",
    );

    const heldResult = response.firewallResult!;
    expect(heldResult.status).toBe("HELD");
    expect(heldResult.holdReason).toBeDefined();

    const decisionId = heldResult.trace?.decisionId;
    expect(decisionId).toBeDefined();

    // Human operator reviews step-up notification and re-signs the held amount
    const heldTx = (
      await app.inject({ method: "GET", url: `/api/v1/transactions/${decisionId}` })
    ).json();
    const approveRes = await app.inject({
      method: "POST",
      url: `/api/v1/transactions/${decisionId}/action`,
      payload: {
        action: "APPROVE",
        reason: "User confirmed coffee purchase exception via mobile PWA",
        ...(await signStepUp({
          transactionId: decisionId!,
          mandateId: heldTx.mandateId,
          approvedAmount: Number(heldTx.amount).toFixed(2),
          currency: "USD",
          action: "APPROVE",
        })),
      },
    });

    expect(approveRes.statusCode).toBe(200);
    const approvedTx = approveRes.json();
    expect(approvedTx.status).toBe("AUTHORIZED");
    expect(approvedTx.action).toBe("APPROVE");

    // Verify USER_APPROVAL event is appended to ledger
    const ledgerRes = await app.inject({
      method: "GET",
      url: "/api/v1/ledger",
    });
    const ledger = ledgerRes.json();
    const approvalEvent = ledger.chain.find(
      (r: LedgerRow) =>
        r.kind === LEDGER_EVENT_KINDS.USER_APPROVAL && r.refId === decisionId,
    );
    expect(approvalEvent).toBeDefined();
    expect((approvalEvent!.payload as Record<string, unknown>).action).toBe("APPROVE");
  });

  it("Stage 5: Merchant submits signed fulfilment notice -> capture executed -> SHA-256 ledger chain verified", async () => {
    // 1. Initiate an authorized transaction
    const session = createDefaultSession({
      sessionId: "sess_fulfillment_flow",
      attackMode: false,
      maxAmount: 100.0,
      categories: ["phone_accessories", "cables", "chargers"],
      intentText: "Purchase a phone case under $20",
    });
    const agent = new BuyerShopperAgent(session);
    const purchase = await agent.processUserMessage("Find a phone case at GadgetHub");

    expect(purchase.firewallResult?.status).toBe("AUTHORIZED");
    const authId = purchase.firewallResult?.authorizationId;
    expect(authId).toBeDefined();
    expect(purchase.firewallResult?.orderId).toBeDefined();

    // 2. Merchant Agent submits signed fulfillment notice
    const fulfillmentRes = await app.inject({
      method: "POST",
      url: "/api/v1/fulfillment/submit",
      payload: {
        authorizationId: authId,
        merchantId: "mer_gadgethub",
        fulfillmentNotice: {
          trackingNumber: "TRK-LEASH-987654321",
          carrier: "USPS_PRIORITY",
          shippedItems: [{ sku: "GH-USBC-CASE", quantity: 1 }],
          signature: "sig_merchant_valid_ecdsa_fulfillment_proof",
        },
      },
    });

    expect(fulfillmentRes.statusCode).toBe(200);
    const captureData = fulfillmentRes.json();
    expect(captureData.status).toBe("CAPTURED");
    expect(captureData.captureId).toBeDefined();
    expect(captureData.authorizationId).toBe(authId);

    // 3. Verify PAYPAL_CAPTURED block appended to tamper-evident ledger
    const ledgerRes = await app.inject({
      method: "GET",
      url: "/api/v1/ledger",
    });
    const ledger = ledgerRes.json();
    const captureEvent = ledger.chain.find(
      (r: LedgerRow) =>
        r.kind === LEDGER_EVENT_KINDS.PAYPAL_CAPTURED &&
        r.refId === captureData.captureId,
    );
    expect(captureEvent).toBeDefined();
    const capturePayload = captureEvent!.payload as {
      merchantId: string;
      fulfillmentNotice: { trackingNumber: string };
    };
    expect(capturePayload.merchantId).toBe("mer_gadgethub");
    expect(capturePayload.fulfillmentNotice.trackingNumber).toBe(
      "TRK-LEASH-987654321",
    );

    // 4. Verify Cryptographic Integrity of Entire Ledger Chain
    const verifyApiRes = await app.inject({
      method: "GET",
      url: "/api/v1/ledger/verify",
    });
    expect(verifyApiRes.statusCode).toBe(200);
    const verifyReport = verifyApiRes.json();
    expect(verifyReport.valid).toBe(true);
    expect(verifyReport.brokenSeq).toBeUndefined();
    expect(verifyReport.totalEvents).toBeGreaterThan(0);

    // 5. Independent client-side SHA-256 verification of the full array
    const directVerification = verifyLedgerChain([...ledger.chain]);
    expect(directVerification.valid).toBe(true);
    expect(directVerification.brokenSeq).toBeUndefined();

    // Ensure every row has non-empty SHA-256 hash
    for (const row of ledger.chain as LedgerRow[]) {
      expect(row.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(row.prevHash).toMatch(/^[a-f0-9]{64}$/);
      expect(row.seq).toBeGreaterThan(0);
    }
  });
});

async function signStepUp(payload: Record<string, unknown>) {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const spki = await crypto.subtle.exportKey("spki", keyPair.publicKey);
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    keyPair.privateKey,
    new TextEncoder().encode(canonicalizeJson(payload)),
  );
  return {
    signature: Buffer.from(sig).toString("base64"),
    publicKey: Buffer.from(spki).toString("base64"),
    signedPayload: payload,
  };
}
