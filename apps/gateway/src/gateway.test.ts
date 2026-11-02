import { describe, it, expect, beforeEach } from "vitest";
import { createServer } from "./index.js";
import { handleRequestPaymentTool } from "./mcp/index.js";
import { GatewayRepository } from "./db/repository.js";
import {
  seedInMemoryMandate,
  lockAndReserveBudget,
} from "./db/budget-mutex.js";
import { verifyLedgerChain, LEDGER_EVENT_KINDS } from "@leash/shared";
import type { PaymentRequest } from "@leash/mandates";

describe("Leash Gateway API & Budget Mutex Rails", () => {
  beforeEach(() => {
    seedInMemoryMandate({
      id: "mdt_gateway_test",
      maxAmount: 100.0,
      spentAmount: 0.0,
    });
  });

  it("returns healthy status and ledger height from /health", async () => {
    const server = await createServer();
    const res = await server.inject({
      method: "GET",
      url: "/health",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("ok");
    expect(body.service).toBe("leash-gateway");
    expect(typeof body.ledgerHeight).toBe("number");
  });

  it("blocks payment requests containing banned categories (gift cards)", async () => {
    const attackReq: PaymentRequest = {
      mandateId: "mdt_gateway_test",
      cart: {
        id: "cart_attack_1",
        merchantId: "mer_gadgethub",
        total: "100.00",
        shipping: "0.00",
        currency: "USD",
        expiresAt: "2026-11-12T00:00:00Z",
        items: [
          {
            sku: "GIFT-CARD-100",
            name: "$100 Gift Card",
            category: "gift_cards",
            qty: 1,
            unitAmount: "100.00",
          },
        ],
      },
      rationale: "User requested gift cards",
      evidence: [{ url: "https://store.example.com/item" }],
      idempotencyKey: "idem_attack_1",
    };

    const result = await handleRequestPaymentTool(attackReq);
    expect(result.status).toBe("BLOCKED");
    expect(result.trace.verdict).toBe("BLOCK");
    expect(result.holdReason).toContain("gift cards");
  });

  it("enforces budget mutex locking and stops concurrent over-budget requests", async () => {
    seedInMemoryMandate({
      id: "mdt_limited_budget",
      maxAmount: 50.0,
      spentAmount: 0.0,
    });

    // First reservation for $35 should succeed
    const res1 = await lockAndReserveBudget("mdt_limited_budget", 35.0);
    expect(res1.success).toBe(true);
    expect(res1.remainingBudget).toBe("15.00");

    // Second reservation for $20 exceeds remaining $15 and must fail
    const res2 = await lockAndReserveBudget("mdt_limited_budget", 20.0);
    expect(res2.success).toBe(false);
    expect(res2.reason).toContain("exceeds remaining mandate budget");
    expect(res2.remainingBudget).toBe("15.00");
  });

  it("authorizes clean purchases, creates PayPal hold, and logs to ledger", async () => {
    const cleanReq: PaymentRequest = {
      mandateId: "mdt_gateway_test",
      cart: {
        id: "cart_clean_1",
        merchantId: "mer_gadgethub",
        total: "14.99",
        shipping: "0.00",
        currency: "USD",
        expiresAt: "2026-11-12T00:00:00Z",
        items: [
          {
            sku: "GH-USBC-CASE",
            name: "Slim Matte USB-C Phone Case",
            category: "phone_accessories",
            qty: 1,
            unitAmount: "14.99",
          },
        ],
      },
      rationale: "Purchasing phone case within budget",
      evidence: [{ url: "https://gadgethub.example.com/item/GH-USBC-CASE" }],
      idempotencyKey: "idem_clean_1",
    };

    const result = await handleRequestPaymentTool(cleanReq);
    expect(result.status).toBe("AUTHORIZED");
    expect(result.orderId).toBeDefined();
    expect(result.authorizationId).toBeDefined();
    expect(result.trace.verdict).toBe("ALLOW");

    // Verify Layer 2 reason is recorded in trace
    const provReason = result.trace.reasons.find(
      (r) => r.layer === "provenance",
    );
    expect(provReason).toBeDefined();
    expect(provReason?.verdict).toBe("ALLOW");

    // Verify ledger chain validity
    const rows = await GatewayRepository.getLedgerRows();
    expect(rows.length).toBeGreaterThan(0);
    const verification = verifyLedgerChain([...rows]);
    expect(verification.valid).toBe(true);

    // Verify LAYER_PROVENANCE_SCANNED ledger row exists
    const provEvent = rows.find(
      (r) => r.kind === LEDGER_EVENT_KINDS.LAYER_PROVENANCE_SCANNED,
    );
    expect(provEvent).toBeDefined();
  });

  it("evaluates Layer 2 and hard BLOCKS when hidden prompt injection on cited page matches cart item", async () => {
    // Cited page is GH-ATTACK-PRODUCT which contains hidden injection to buy gift cards
    const injectionCartMatchReq: PaymentRequest = {
      mandateId: "mdt_gateway_test",
      cart: {
        id: "cart_hijacked_1",
        merchantId: "mer_gadgethub",
        total: "100.00",
        shipping: "0.00",
        currency: "USD",
        expiresAt: "2026-11-12T00:00:00Z",
        items: [
          {
            sku: "GH-ATTACK-PRODUCT",
            name: "Five $100 Gift Cards",
            category: "gift_cards",
            qty: 1,
            unitAmount: "100.00",
          },
        ],
      },
      rationale: "Adversarial agent following hidden page override",
      evidence: [
        { url: "https://gadgethub.example.com/item/GH-ATTACK-PRODUCT" },
      ],
      idempotencyKey: "idem_hijack_1",
    };

    const result = await handleRequestPaymentTool(injectionCartMatchReq);
    expect(result.status).toBe("BLOCKED");
    expect(result.trace.verdict).toBe("BLOCK");

    const provReason = result.trace.reasons.find(
      (r) => r.layer === "provenance",
    );
    expect(provReason).toBeDefined();
    expect(provReason?.verdict).toBe("BLOCK");
    expect(provReason?.code).toBe("INDIRECT_PROMPT_INJECTION_CART_MATCH");
  });

  it("evaluates Layer 2 and HOLDS when general injection is detected on cited page without cart match", async () => {
    // Cited page is TB-ATTACK-HOODIE which contains hidden injection to add luxury items,
    // but the cart contains an honest standard merino tee (NOT the luxury item).
    const generalInjectionReq: PaymentRequest = {
      mandateId: "mdt_gateway_test",
      cart: {
        id: "cart_honest_with_polluted_evidence",
        merchantId: "mer_trendboutique",
        total: "48.00",
        shipping: "0.00",
        currency: "USD",
        expiresAt: "2026-11-12T00:00:00Z",
        items: [
          {
            sku: "TB-MERINO-TEE",
            name: "Merino Wool Minimalist Tee",
            category: "apparel",
            qty: 1,
            unitAmount: "48.00",
          },
        ],
      },
      rationale: "Buying merino tee despite adversarial page text",
      evidence: [
        { url: "https://trendboutique.example.com/item/TB-ATTACK-HOODIE" },
      ],
      idempotencyKey: "idem_polluted_page_1",
    };

    const result = await handleRequestPaymentTool(generalInjectionReq);
    expect(result.status).toBe("HELD");
    expect(result.trace.verdict).toBe("HOLD");

    const provReason = result.trace.reasons.find(
      (r) => r.layer === "provenance",
    );
    expect(provReason).toBeDefined();
    expect(provReason?.verdict).toBe("HOLD");
    expect(provReason?.code).toBe("INDIRECT_PROMPT_INJECTION_DETECTED");
  });

  it("exposes cryptographic ledger verification over REST (/api/v1/ledger/verify)", async () => {
    const server = await createServer();
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/ledger/verify",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.valid).toBe(true);
    expect(typeof body.totalEvents).toBe("number");
  });

  it("handles MCP JSON-RPC protocol over /mcp endpoint", async () => {
    const server = await createServer();

    // 1. tools/list
    const listRes = await server.inject({
      method: "POST",
      url: "/mcp",
      payload: {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
      },
    });
    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.body);
    expect(listBody.result.tools.length).toBeGreaterThanOrEqual(3);
    const toolNames = listBody.result.tools.map(
      (t: { name: string }) => t.name,
    );
    expect(toolNames).toContain("request_payment");
    expect(toolNames).toContain("check_mandate_budget");
    expect(toolNames).toContain("verify_ledger_integrity");

    // 2. tools/call: check_mandate_budget
    const callRes = await server.inject({
      method: "POST",
      url: "/mcp",
      payload: {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "check_mandate_budget",
          arguments: { mandateId: "mdt_gateway_test" },
        },
      },
    });
    expect(callRes.statusCode).toBe(200);
    const callBody = JSON.parse(callRes.body);
    const mandateData = JSON.parse(callBody.result.content[0].text);
    expect(mandateData.id).toBe("mdt_gateway_test");
    expect(mandateData.maxAmount).toBe(100);
  });

  it("supports human action (APPROVE / DENY) for held transactions", async () => {
    const server = await createServer();

    // Seed transaction
    const txId = "tx_held_human_review";
    await GatewayRepository.saveTransaction({
      id: txId,
      mandateId: "mdt_gateway_test",
      merchantId: "mer_unknown_retailer",
      amount: "49.99",
      currency: "USD",
      verdict: "HOLD",
      status: "HELD",
      holdReason: "New merchant step-up required",
    });

    // Human approves transaction
    const approveRes = await server.inject({
      method: "POST",
      url: `/api/v1/transactions/${txId}/action`,
      payload: {
        action: "APPROVE",
        reason: "Confirmed by phone push approval",
      },
    });

    expect(approveRes.statusCode).toBe(200);
    const approveBody = JSON.parse(approveRes.body);
    expect(approveBody.action).toBe("APPROVE");
    expect(approveBody.status).toBe("AUTHORIZED");

    // Verify transaction updated
    const updated = await GatewayRepository.getTransaction(txId);
    expect(updated?.status).toBe("AUTHORIZED");
    expect(updated?.verdict).toBe("ALLOW");
  });
});
