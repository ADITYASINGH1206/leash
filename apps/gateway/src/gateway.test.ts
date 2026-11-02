import { describe, it, expect } from 'vitest';
import { createServer } from './index.js';
import { handleRequestPaymentTool } from './mcp/index.js';
import type { PaymentRequest } from '@leash/mandates';

describe('Leash Gateway API & Fail-Closed Processing', () => {
  it('returns healthy status from /health', async () => {
    const server = await createServer();
    const res = await server.inject({
      method: 'GET',
      url: '/health'
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('leash-gateway');
  });

  it('blocks payment requests containing gift cards (Policy Layer 1)', async () => {
    const attackReq: PaymentRequest = {
      mandateId: 'mdt_test_123',
      cart: {
        id: 'cart_attack_1',
        merchantId: 'mer_gadgethub',
        total: '100.00',
        shipping: '0.00',
        currency: 'USD',
        expiresAt: '2026-11-12T00:00:00Z',
        items: [{
          sku: 'GIFT-CARD-100',
          name: '$100 Gift Card',
          category: 'gift_cards',
          qty: 1,
          unitAmount: '100.00'
        }]
      },
      rationale: 'User requested gift cards',
      evidence: [{ url: 'https://store.example.com/item' }],
      idempotencyKey: 'idem_attack_1'
    };

    const result = await handleRequestPaymentTool(attackReq);
    expect(result.status).toBe('BLOCKED');
    expect(result.trace.verdict).toBe('BLOCK');
    expect(result.holdReason).toContain('gift cards');
  });

  it('authorizes clean purchases for known merchants passing policies', async () => {
    const cleanReq: PaymentRequest = {
      mandateId: 'mdt_clean_123',
      cart: {
        id: 'cart_clean_1',
        merchantId: 'mer_gadgethub',
        total: '14.99',
        shipping: '0.00',
        currency: 'USD',
        expiresAt: '2026-11-12T00:00:00Z',
        items: [{
          sku: 'CASE-USBC-01',
          name: 'Slim USB-C Case',
          category: 'phone_accessories',
          qty: 1,
          unitAmount: '14.99'
        }]
      },
      rationale: 'Purchasing phone case within budget',
      evidence: [{ url: 'https://store.example.com/case' }],
      idempotencyKey: 'idem_clean_1'
    };

    const result = await handleRequestPaymentTool(cleanReq);
    expect(result.status).toBe('AUTHORIZED');
    expect(result.orderId).toBeDefined();
    expect(result.trace.verdict).toBe('ALLOW');
  });
});
