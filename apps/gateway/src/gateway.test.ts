import { describe, it, expect, beforeEach } from 'vitest';
import { createServer } from './index.js';
import { handleRequestPaymentTool } from './mcp/index.js';
import { GatewayRepository } from './db/repository.js';
import { seedInMemoryMandate, lockAndReserveBudget } from './db/budget-mutex.js';
import { verifyLedgerChain } from '@leash/shared';
import type { PaymentRequest } from '@leash/mandates';

describe('Leash Gateway API & Budget Mutex Rails', () => {
  beforeEach(() => {
    seedInMemoryMandate({
      id: 'mdt_gateway_test',
      maxAmount: 100.0,
      spentAmount: 0.0,
    });
  });

  it('returns healthy status and ledger height from /health', async () => {
    const server = await createServer();
    const res = await server.inject({
      method: 'GET',
      url: '/health',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('leash-gateway');
    expect(typeof body.ledgerHeight).toBe('number');
  });

  it('blocks payment requests containing banned categories (gift cards)', async () => {
    const attackReq: PaymentRequest = {
      mandateId: 'mdt_gateway_test',
      cart: {
        id: 'cart_attack_1',
        merchantId: 'mer_gadgethub',
        total: '100.00',
        shipping: '0.00',
        currency: 'USD',
        expiresAt: '2026-11-12T00:00:00Z',
        items: [
          {
            sku: 'GIFT-CARD-100',
            name: '$100 Gift Card',
            category: 'gift_cards',
            qty: 1,
            unitAmount: '100.00',
          },
        ],
      },
      rationale: 'User requested gift cards',
      evidence: [{ url: 'https://store.example.com/item' }],
      idempotencyKey: 'idem_attack_1',
    };

    const result = await handleRequestPaymentTool(attackReq);
    expect(result.status).toBe('BLOCKED');
    expect(result.trace.verdict).toBe('BLOCK');
    expect(result.holdReason).toContain('gift cards');
  });

  it('enforces budget mutex locking and stops concurrent over-budget requests', async () => {
    seedInMemoryMandate({
      id: 'mdt_limited_budget',
      maxAmount: 50.0,
      spentAmount: 0.0,
    });

    // First reservation for $35 should succeed
    const res1 = await lockAndReserveBudget('mdt_limited_budget', 35.0);
    expect(res1.success).toBe(true);
    expect(res1.remainingBudget).toBe('15.00');

    // Second reservation for $20 exceeds remaining $15 and must fail
    const res2 = await lockAndReserveBudget('mdt_limited_budget', 20.0);
    expect(res2.success).toBe(false);
    expect(res2.reason).toContain('exceeds remaining mandate budget');
    expect(res2.remainingBudget).toBe('15.00');
  });

  it('authorizes clean purchases, creates PayPal hold, and logs to ledger', async () => {
    const cleanReq: PaymentRequest = {
      mandateId: 'mdt_gateway_test',
      cart: {
        id: 'cart_clean_1',
        merchantId: 'mer_gadgethub',
        total: '14.99',
        shipping: '0.00',
        currency: 'USD',
        expiresAt: '2026-11-12T00:00:00Z',
        items: [
          {
            sku: 'CASE-USBC-01',
            name: 'Slim USB-C Case',
            category: 'phone_accessories',
            qty: 1,
            unitAmount: '14.99',
          },
        ],
      },
      rationale: 'Purchasing phone case within budget',
      evidence: [{ url: 'https://store.example.com/case' }],
      idempotencyKey: 'idem_clean_1',
    };

    const result = await handleRequestPaymentTool(cleanReq);
    expect(result.status).toBe('AUTHORIZED');
    expect(result.orderId).toBeDefined();
    expect(result.authorizationId).toBeDefined();
    expect(result.trace.verdict).toBe('ALLOW');

    // Verify ledger chain validity
    const rows = await GatewayRepository.getLedgerRows();
    expect(rows.length).toBeGreaterThan(0);
    const verification = verifyLedgerChain([...rows]);
    expect(verification.valid).toBe(true);
  });

  it('exposes cryptographic ledger verification over REST (/api/v1/ledger/verify)', async () => {
    const server = await createServer();
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/ledger/verify',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.valid).toBe(true);
    expect(typeof body.totalEvents).toBe('number');
  });

  it('handles MCP JSON-RPC protocol over /mcp endpoint', async () => {
    const server = await createServer();

    // 1. tools/list
    const listRes = await server.inject({
      method: 'POST',
      url: '/mcp',
      payload: {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
      },
    });
    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.body);
    expect(listBody.result.tools.length).toBeGreaterThanOrEqual(3);
    const toolNames = listBody.result.tools.map((t: { name: string }) => t.name);
    expect(toolNames).toContain('request_payment');
    expect(toolNames).toContain('check_mandate_budget');
    expect(toolNames).toContain('verify_ledger_integrity');

    // 2. tools/call: check_mandate_budget
    const callRes = await server.inject({
      method: 'POST',
      url: '/mcp',
      payload: {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'check_mandate_budget',
          arguments: { mandateId: 'mdt_gateway_test' },
        },
      },
    });
    expect(callRes.statusCode).toBe(200);
    const callBody = JSON.parse(callRes.body);
    const mandateData = JSON.parse(callBody.result.content[0].text);
    expect(mandateData.id).toBe('mdt_gateway_test');
    expect(mandateData.maxAmount).toBe(100);
  });

  it('supports human action (APPROVE / DENY) for held transactions', async () => {
    const server = await createServer();

    // Seed transaction
    const txId = 'tx_held_human_review';
    await GatewayRepository.saveTransaction({
      id: txId,
      mandateId: 'mdt_gateway_test',
      merchantId: 'mer_unknown_retailer',
      amount: '49.99',
      currency: 'USD',
      verdict: 'HOLD',
      status: 'HELD',
      holdReason: 'New merchant step-up required',
    });

    // Human approves transaction
    const approveRes = await server.inject({
      method: 'POST',
      url: `/api/v1/transactions/${txId}/action`,
      payload: {
        action: 'APPROVE',
        reason: 'Confirmed by phone push approval',
      },
    });

    expect(approveRes.statusCode).toBe(200);
    const approveBody = JSON.parse(approveRes.body);
    expect(approveBody.action).toBe('APPROVE');
    expect(approveBody.status).toBe('AUTHORIZED');

    // Verify transaction updated
    const updated = await GatewayRepository.getTransaction(txId);
    expect(updated?.status).toBe('AUTHORIZED');
    expect(updated?.verdict).toBe('ALLOW');
  });
});
