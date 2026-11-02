import { describe, it, expect } from 'vitest';
import { PolicyEngine } from './evaluator.js';
import type { PolicyContext } from './types.js';

describe('Layer 1 Deterministic Policy Engine', () => {
  const engine = new PolicyEngine();

  const baseContext: PolicyContext = {
    cart: {
      total: 15.00,
      merchantId: 'mer_known_store',
      items: [{ category: 'electronics', name: 'USB-C Cable', unitAmount: 15.00, qty: 1 }]
    },
    agent: {
      knownMerchants: ['mer_known_store'],
      txnsLastHour: 1
    },
    time: {
      hourLocal: 14 // 2 PM
    }
  };

  it('allows safe, normal transactions that pass all policies', () => {
    const result = engine.evaluate(baseContext);
    expect(result.verdict).toBe('ALLOW');
    expect(result.triggeredRules).toHaveLength(0);
  });

  it('blocks purchases containing banned categories like gift cards', () => {
    const attackCtx: PolicyContext = {
      ...baseContext,
      cart: {
        total: 100.0,
        merchantId: 'mer_known_store',
        items: [{ category: 'gift_cards', name: '$100 Amazon Card', unitAmount: 100.0, qty: 1 }]
      }
    };
    const result = engine.evaluate(attackCtx);
    expect(result.verdict).toBe('BLOCK');
    expect(result.triggeredRules[0]?.id).toBe('never-gift-cards');
  });

  it('holds purchases exceeding velocity limits (> 3/hr)', () => {
    const velocityCtx: PolicyContext = {
      ...baseContext,
      agent: { ...baseContext.agent, txnsLastHour: 4 }
    };
    const result = engine.evaluate(velocityCtx);
    expect(result.verdict).toBe('HOLD');
    expect(result.triggeredRules[0]?.id).toBe('velocity-limit');
  });
});
