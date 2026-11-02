import type { PolicyContext, PolicyEvaluationResult, PolicyRule } from './types.js';
import { defaultPolicyRules } from './default-rules.js';

export class PolicyEngine {
  private rules: PolicyRule[];

  constructor(customRules?: PolicyRule[]) {
    this.rules = customRules ?? defaultPolicyRules;
  }

  evaluate(ctx: PolicyContext): PolicyEvaluationResult {
    const triggered: PolicyEvaluationResult['triggeredRules'] = [];

    for (const rule of this.rules) {
      try {
        if (rule.evaluate(ctx)) {
          triggered.push({
            id: rule.id,
            action: rule.action,
            description: rule.description
          });
        }
      } catch (err) {
        // Fail-closed invariant: rule error triggers HOLD
        triggered.push({
          id: `${rule.id}-error`,
          action: 'HOLD',
          description: `Rule evaluation failed: ${err instanceof Error ? err.message : String(err)}`
        });
      }
    }

    // Combine: Any BLOCK wins; else any HOLD triggers HOLD; else ALLOW
    let verdict: PolicyEvaluationResult['verdict'] = 'ALLOW';
    if (triggered.some(r => r.action === 'BLOCK')) {
      verdict = 'BLOCK';
    } else if (triggered.some(r => r.action === 'HOLD')) {
      verdict = 'HOLD';
    }

    return { verdict, triggeredRules: triggered };
  }
}
