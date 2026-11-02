import type { CelRuleDefinition, PolicyRule } from "./types.js";
import { compileCel } from "./cel.js";

export const BANNED_CATEGORIES = [
  "gift_cards",
  "crypto",
  "money_transfer",
  "lottery",
];

export const defaultCelRuleDefinitions: CelRuleDefinition[] = [
  {
    id: "never-gift-cards",
    description:
      "Block all high-risk items like gift cards, crypto, and money transfers",
    action: "BLOCK",
    expression:
      "cart.items.exists(i, i.category in ['gift_cards', 'crypto', 'money_transfer', 'lottery'])",
  },
  {
    id: "new-merchant-step-up",
    description:
      "Hold transactions over $10 at novel unvetted merchants for human confirmation",
    action: "HOLD",
    expression:
      "!(cart.merchantId in agent.knownMerchants) && cart.total > 10.0",
  },
  {
    id: "velocity-limit",
    description:
      "Hold if agent initiates 3 or more transactions within one hour",
    action: "HOLD",
    expression: "agent.txnsLastHour >= 3",
  },
  {
    id: "quiet-hours",
    description: "Hold purchases made during late night hours (12 AM to 6 AM)",
    action: "HOLD",
    expression: "time.hourLocal >= 0 && time.hourLocal < 6",
  },
];

/**
 * Standard compiled policy rules ready for execution by the PolicyEngine.
 */
export const defaultPolicyRules: PolicyRule[] = defaultCelRuleDefinitions.map(
  (def) => {
    const fn = compileCel(def.expression);
    return {
      id: def.id,
      description: def.description,
      action: def.action,
      expression: def.expression,
      evaluate: (ctx) => fn(ctx as unknown as Record<string, unknown>),
    };
  },
);
