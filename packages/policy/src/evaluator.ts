import type {
  PolicyContext,
  PolicyEvaluationResult,
  PolicyRule,
  CelRuleDefinition,
} from "./types.js";
import { defaultPolicyRules } from "./default-rules.js";
import { compileCel } from "./cel.js";

export class PolicyEngine {
  private rules: PolicyRule[];

  constructor(customRules?: Array<PolicyRule | CelRuleDefinition>) {
    if (!customRules) {
      this.rules = [...defaultPolicyRules];
    } else {
      this.rules = customRules.map((r) => {
        if (
          "expression" in r &&
          typeof (r as CelRuleDefinition).expression === "string" &&
          !("evaluate" in r)
        ) {
          return this.compileCelRule(r as CelRuleDefinition);
        }
        return r as PolicyRule;
      });
    }
  }

  /**
   * Compiles a declarative CEL rule definition into an executable PolicyRule.
   */
  compileCelRule(def: CelRuleDefinition): PolicyRule {
    const fn = compileCel(def.expression);
    return {
      id: def.id,
      description: def.description,
      action: def.action,
      expression: def.expression,
      evaluate: (ctx) => fn(ctx as unknown as Record<string, unknown>),
    };
  }

  /**
   * Registers a new CEL rule dynamically into the policy engine.
   */
  addCelRule(def: CelRuleDefinition): void {
    const compiled = this.compileCelRule(def);
    this.addRule(compiled);
  }

  /**
   * Registers an executable PolicyRule.
   */
  addRule(rule: PolicyRule): void {
    // Replace if id already exists, otherwise append
    const existingIdx = this.rules.findIndex((r) => r.id === rule.id);
    if (existingIdx >= 0) {
      this.rules[existingIdx] = rule;
    } else {
      this.rules.push(rule);
    }
  }

  /**
   * Removes a rule by its identifier.
   */
  removeRule(ruleId: string): boolean {
    const prevLen = this.rules.length;
    this.rules = this.rules.filter((r) => r.id !== ruleId);
    return this.rules.length < prevLen;
  }

  /**
   * Returns current active rules.
   */
  getRules(): PolicyRule[] {
    return [...this.rules];
  }

  /**
   * Evaluates incoming transaction context against all active policies.
   * Guarantees fail-closed error handling: any evaluation error defaults to HOLD.
   */
  evaluate(ctx: PolicyContext): PolicyEvaluationResult {
    const triggered: PolicyEvaluationResult["triggeredRules"] = [];

    for (const rule of this.rules) {
      try {
        if (rule.evaluate(ctx)) {
          triggered.push({
            id: rule.id,
            action: rule.action,
            description: rule.description,
            expression: rule.expression,
          });
        }
      } catch (err) {
        // Fail-closed invariant: evaluation failure or unhandled exception strictly triggers HOLD
        triggered.push({
          id: `${rule.id}-error`,
          action: "HOLD",
          description: `Rule evaluation failed: ${err instanceof Error ? err.message : String(err)}`,
          expression: rule.expression,
        });
      }
    }

    // Combine verdicts: Any BLOCK wins; else any HOLD triggers HOLD; else ALLOW
    let verdict: PolicyEvaluationResult["verdict"] = "ALLOW";
    if (triggered.some((r) => r.action === "BLOCK")) {
      verdict = "BLOCK";
    } else if (triggered.some((r) => r.action === "HOLD")) {
      verdict = "HOLD";
    }

    return { verdict, triggeredRules: triggered };
  }
}
