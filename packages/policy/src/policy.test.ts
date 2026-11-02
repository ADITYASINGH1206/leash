import { describe, it, expect } from "vitest";
import {
  PolicyEngine,
  compileCel,
  CelError,
  type PolicyContext,
  type CelRuleDefinition,
} from "./index.js";

describe("Issue #9: Layer 1 Policy Engine with CEL Rules (@leash/policy)", () => {
  // Helper to create a baseline clean context
  function createCleanContext(
    overrides?: Partial<PolicyContext>,
  ): PolicyContext {
    return {
      cart: {
        total: 19.99,
        merchantId: "mer_gadgethub",
        items: [
          {
            category: "electronics",
            name: "USB-C Cable",
            unitAmount: 19.99,
            qty: 1,
          },
        ],
      },
      agent: {
        knownMerchants: ["mer_gadgethub", "mer_dailymart"],
        txnsLastHour: 1,
      },
      time: {
        hourLocal: 14, // 2 PM
      },
      ...overrides,
    };
  }

  // =========================================================================
  // 1. CEL Compiler & Evaluator Unit Tests
  // =========================================================================
  describe("CEL Compiler & AST Evaluator", () => {
    it("evaluates relational and comparison operators", () => {
      expect(compileCel("10 > 5")({})).toBe(true);
      expect(compileCel("5 >= 5")({})).toBe(true);
      expect(compileCel("3 < 2")({})).toBe(false);
      expect(compileCel("4 <= 5")({})).toBe(true);
      expect(compileCel("'abc' == 'abc'")({})).toBe(true);
      expect(compileCel("'abc' != 'xyz'")({})).toBe(true);
    });

    it("evaluates logical operators and short-circuiting", () => {
      expect(compileCel("true && true")({})).toBe(true);
      expect(compileCel("true && false")({})).toBe(false);
      expect(compileCel("false || true")({})).toBe(true);
      expect(compileCel("!false")({})).toBe(true);
      expect(compileCel("!(10 > 20)")({})).toBe(true);
      expect(compileCel("(true || false) && !(5 == 6)")({})).toBe(true);
    });

    it("evaluates nested member navigation", () => {
      const fn = compileCel("user.profile.age >= 18");
      expect(fn({ user: { profile: { age: 21 } } })).toBe(true);
      expect(fn({ user: { profile: { age: 16 } } })).toBe(false);
      expect(fn({ user: null })).toBe(false);
    });

    it("evaluates list membership with 'in' operator", () => {
      const fn = compileCel("item.category in ['electronics', 'apparel']");
      expect(fn({ item: { category: "electronics" } })).toBe(true);
      expect(fn({ item: { category: "ELECTRONICS" } })).toBe(true); // case-insensitive
      expect(fn({ item: { category: "crypto" } })).toBe(false);
    });

    it("evaluates list macros: .exists() and .all()", () => {
      const existsFn = compileCel("items.exists(i, i.price > 100)");
      expect(
        existsFn({
          items: [{ price: 20 }, { price: 150 }],
        }),
      ).toBe(true);
      expect(
        existsFn({
          items: [{ price: 20 }, { price: 40 }],
        }),
      ).toBe(false);

      const allFn = compileCel("items.all(i, i.inStock == true)");
      expect(
        allFn({
          items: [{ inStock: true }, { inStock: true }],
        }),
      ).toBe(true);
      expect(
        allFn({
          items: [{ inStock: true }, { inStock: false }],
        }),
      ).toBe(false);
    });

    it("evaluates string and list methods: .size() and .contains()", () => {
      expect(compileCel("items.size() == 2")({ items: [1, 2] })).toBe(true);
      expect(
        compileCel("name.contains('phone')")({ name: "smart phone case" }),
      ).toBe(true);
    });

    it("throws descriptive CelError on malformed syntax", () => {
      expect(() => compileCel("cart.total >")).toThrow(CelError);
      expect(() => compileCel("cart.items.exists(")).toThrow(CelError);
      expect(() => compileCel("'unterminated string")).toThrow(CelError);
    });
  });

  // =========================================================================
  // 2. Default Enterprise Ruleset
  // =========================================================================
  describe("Default Enterprise Ruleset", () => {
    const engine = new PolicyEngine();

    it("passes clean transactions with ALLOW verdict", () => {
      const ctx = createCleanContext();
      const res = engine.evaluate(ctx);
      expect(res.verdict).toBe("ALLOW");
      expect(res.triggeredRules).toHaveLength(0);
    });

    it("BLOCKS high-risk categories via 'never-gift-cards' rule", () => {
      const giftCardCtx = createCleanContext({
        cart: {
          total: 50.0,
          merchantId: "mer_gadgethub",
          items: [
            {
              category: "gift_cards",
              name: "$50 Amazon Gift Card",
              unitAmount: 50.0,
              qty: 1,
            },
          ],
        },
      });

      const res = engine.evaluate(giftCardCtx);
      expect(res.verdict).toBe("BLOCK");
      expect(res.triggeredRules.some((r) => r.id === "never-gift-cards")).toBe(
        true,
      );
      expect(res.triggeredRules[0]?.action).toBe("BLOCK");
    });

    it("BLOCKS cryptocurrency category variants", () => {
      const cryptoCtx = createCleanContext({
        cart: {
          total: 100.0,
          merchantId: "mer_gadgethub",
          items: [
            {
              category: "Crypto",
              name: "Bitcoin Voucher",
              unitAmount: 100.0,
              qty: 1,
            },
          ],
        },
      });

      const res = engine.evaluate(cryptoCtx);
      expect(res.verdict).toBe("BLOCK");
    });

    it("HOLDS transactions over $10 at novel merchants via 'new-merchant-step-up'", () => {
      // 1. Novel merchant over $10 -> HOLD
      const novelOverCtx = createCleanContext({
        cart: {
          total: 25.0,
          merchantId: "mer_unknown_store",
          items: [
            { category: "apparel", name: "Shirt", unitAmount: 25.0, qty: 1 },
          ],
        },
        agent: {
          knownMerchants: ["mer_gadgethub"],
          txnsLastHour: 1,
        },
      });

      const holdRes = engine.evaluate(novelOverCtx);
      expect(holdRes.verdict).toBe("HOLD");
      expect(
        holdRes.triggeredRules.some((r) => r.id === "new-merchant-step-up"),
      ).toBe(true);

      // 2. Novel merchant under $10 -> ALLOW
      const novelUnderCtx = createCleanContext({
        cart: {
          total: 8.5,
          merchantId: "mer_unknown_store",
          items: [
            { category: "apparel", name: "Sticker", unitAmount: 8.5, qty: 1 },
          ],
        },
        agent: {
          knownMerchants: ["mer_gadgethub"],
          txnsLastHour: 1,
        },
      });

      const allowRes = engine.evaluate(novelUnderCtx);
      expect(allowRes.verdict).toBe("ALLOW");

      // 3. Known merchant over $10 -> ALLOW
      const knownOverCtx = createCleanContext({
        cart: {
          total: 75.0,
          merchantId: "mer_gadgethub",
          items: [
            {
              category: "electronics",
              name: "Speaker",
              unitAmount: 75.0,
              qty: 1,
            },
          ],
        },
        agent: {
          knownMerchants: ["mer_gadgethub"],
          txnsLastHour: 1,
        },
      });

      expect(engine.evaluate(knownOverCtx).verdict).toBe("ALLOW");
    });

    it("HOLDS when velocity limit exceeds threshold via 'velocity-limit'", () => {
      const highVelocityCtx = createCleanContext({
        agent: {
          knownMerchants: ["mer_gadgethub"],
          txnsLastHour: 3, // >= 3
        },
      });

      const res = engine.evaluate(highVelocityCtx);
      expect(res.verdict).toBe("HOLD");
      expect(res.triggeredRules.some((r) => r.id === "velocity-limit")).toBe(
        true,
      );
    });

    it("HOLDS purchases during off-hours via 'quiet-hours'", () => {
      // 3 AM -> HOLD
      const lateNightCtx = createCleanContext({
        time: { hourLocal: 3 },
      });
      const nightRes = engine.evaluate(lateNightCtx);
      expect(nightRes.verdict).toBe("HOLD");
      expect(nightRes.triggeredRules.some((r) => r.id === "quiet-hours")).toBe(
        true,
      );

      // 2 PM -> ALLOW
      const dayCtx = createCleanContext({
        time: { hourLocal: 14 },
      });
      expect(engine.evaluate(dayCtx).verdict).toBe("ALLOW");
    });
  });

  // =========================================================================
  // 3. Custom CEL Rule Injection & Management
  // =========================================================================
  describe("Custom Rule Injection", () => {
    it("supports injecting declarative custom CEL rules", () => {
      const customRule: CelRuleDefinition = {
        id: "high-value-cart-cap",
        description: "Hold any cart over $200 for enterprise security review",
        action: "HOLD",
        expression: "cart.total > 200.0",
      };

      const engine = new PolicyEngine();
      engine.addCelRule(customRule);

      const highValueCtx = createCleanContext({
        cart: {
          total: 250.0,
          merchantId: "mer_gadgethub",
          items: [
            { category: "tech", name: "Monitor", unitAmount: 250.0, qty: 1 },
          ],
        },
      });

      const res = engine.evaluate(highValueCtx);
      expect(res.verdict).toBe("HOLD");
      expect(
        res.triggeredRules.some((r) => r.id === "high-value-cart-cap"),
      ).toBe(true);
      expect(
        res.triggeredRules.find((r) => r.id === "high-value-cart-cap")
          ?.expression,
      ).toBe("cart.total > 200.0");
    });

    it("allows removing rules by ID", () => {
      const engine = new PolicyEngine();
      expect(engine.getRules().length).toBe(4);

      const removed = engine.removeRule("quiet-hours");
      expect(removed).toBe(true);
      expect(engine.getRules().length).toBe(3);

      // Now 3 AM does not trigger quiet-hours
      const lateNightCtx = createCleanContext({ time: { hourLocal: 3 } });
      expect(engine.evaluate(lateNightCtx).verdict).toBe("ALLOW");
    });
  });

  // =========================================================================
  // 4. Fail-Closed Error Handling & Verdict Priority
  // =========================================================================
  describe("Fail-Closed Invariants", () => {
    it("guarantees BLOCK priority over HOLD", () => {
      // Both quiet-hours (HOLD) and never-gift-cards (BLOCK) triggered
      const engine = new PolicyEngine();
      const dualCtx = createCleanContext({
        cart: {
          total: 50.0,
          merchantId: "mer_gadgethub",
          items: [
            { category: "gift_cards", name: "Card", unitAmount: 50.0, qty: 1 },
          ],
        },
        time: { hourLocal: 2 },
      });

      const res = engine.evaluate(dualCtx);
      expect(res.verdict).toBe("BLOCK");
      expect(res.triggeredRules.length).toBe(2);
    });

    it("triggers HOLD if a rule throws an exception during evaluation", () => {
      const brokenRule = {
        id: "broken-rule",
        description: "Rule with unhandled exception",
        action: "ALLOW" as const,
        evaluate: () => {
          throw new Error("Simulated unexpected failure");
        },
      };

      const engine = new PolicyEngine([brokenRule]);
      const res = engine.evaluate(createCleanContext());

      // Must fail-closed to HOLD, never ALLOW
      expect(res.verdict).toBe("HOLD");
      expect(res.triggeredRules[0]?.id).toBe("broken-rule-error");
      expect(res.triggeredRules[0]?.description).toContain(
        "Simulated unexpected failure",
      );
    });
  });
});
