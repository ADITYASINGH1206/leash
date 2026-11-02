import type { DecisionVerdict } from '@leash/shared';

export interface PolicyRule {
  id: string;
  description: string;
  action: DecisionVerdict;
  evaluate: (ctx: PolicyContext) => boolean;
}

export interface PolicyContext {
  cart: {
    total: number;
    merchantId: string;
    items: Array<{ category: string; name: string; unitAmount: number; qty: number }>;
  };
  agent: {
    knownMerchants: string[];
    txnsLastHour: number;
  };
  time: {
    hourLocal: number;
  };
}

export interface PolicyEvaluationResult {
  verdict: DecisionVerdict;
  triggeredRules: Array<{
    id: string;
    action: DecisionVerdict;
    description: string;
  }>;
}
