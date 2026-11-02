import type { PolicyRule } from './types.js';

export const BANNED_CATEGORIES = ['gift_cards', 'crypto', 'money_transfer', 'lottery'];

export const defaultPolicyRules: PolicyRule[] = [
  {
    id: 'never-gift-cards',
    description: 'Block all high-risk items like gift cards, crypto, and money transfers',
    action: 'BLOCK',
    evaluate: (ctx) => ctx.cart.items.some(item => BANNED_CATEGORIES.includes(item.category.toLowerCase()))
  },
  {
    id: 'new-merchant-step-up',
    description: 'Hold transactions over $10 at novel unvetted merchants for human confirmation',
    action: 'HOLD',
    evaluate: (ctx) => !ctx.agent.knownMerchants.includes(ctx.cart.merchantId) && ctx.cart.total > 10.0
  },
  {
    id: 'velocity-limit',
    description: 'Hold if agent initiates 3 or more transactions within one hour',
    action: 'HOLD',
    evaluate: (ctx) => ctx.agent.txnsLastHour >= 3
  },
  {
    id: 'quiet-hours',
    description: 'Hold purchases made during late night hours (12 AM to 6 AM)',
    action: 'HOLD',
    evaluate: (ctx) => ctx.time.hourLocal >= 0 && ctx.time.hourLocal < 6
  }
];
