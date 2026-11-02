import type { DecisionVerdict } from "@leash/shared";

export interface PolicyContext {
  cart: {
    total: number;
    merchantId: string;
    items: Array<{
      category: string;
      name: string;
      unitAmount: number;
      qty: number;
    }>;
  };
  agent: {
    knownMerchants: string[];
    txnsLastHour: number;
  };
  time: {
    hourLocal: number;
  };
}

export interface CelRuleDefinition {
  id: string;
  description: string;
  expression: string;
  action: DecisionVerdict;
}

export interface PolicyRule {
  id: string;
  description: string;
  action: DecisionVerdict;
  expression?: string;
  evaluate: (ctx: PolicyContext) => boolean;
}

export interface PolicyEvaluationResult {
  verdict: DecisionVerdict;
  triggeredRules: Array<{
    id: string;
    action: DecisionVerdict;
    description: string;
    expression?: string;
  }>;
}
