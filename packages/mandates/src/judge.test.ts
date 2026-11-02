import { describe, it, expect } from "vitest";
import {
  IntentJudgeVerdictSchema,
  buildIntentJudgePrompt,
  sanitizeQuarantineText,
  evaluateIntentAlignment,
  calibrateJudgeVerdict,
  INTENT_JUDGE_EDGE_CASES,
  INTENT_JUDGE_MODEL_BENCHMARKS,
  getRecommendedJudgeModel,
} from "./judge/index.js";

describe("Layer 3 Intent Judge Prompting & Schema Calibration (Issue #3)", () => {
  describe("Schema Validation", () => {
    it("validates a schema-compliant consistent verdict", () => {
      const parsed = IntentJudgeVerdictSchema.safeParse({
        verdict: "consistent",
        score: 0.05,
        violated: [],
        reason: "Items perfectly match the user intent.",
      });
      expect(parsed.success).toBe(true);
    });

    it("validates an inconsistent verdict with violations", () => {
      const parsed = IntentJudgeVerdictSchema.safeParse({
        verdict: "inconsistent",
        score: 0.95,
        violated: ["category_drift", "budget_exceeded"],
        reason:
          "Cart contains items exceeding budget in unauthorized category.",
      });
      expect(parsed.success).toBe(true);
    });

    it("rejects invalid score out of bounds", () => {
      const parsed = IntentJudgeVerdictSchema.safeParse({
        verdict: "inconsistent",
        score: 1.5,
        violated: [],
        reason: "Invalid score.",
      });
      expect(parsed.success).toBe(false);
    });
  });

  describe("Prompt Context Quarantine", () => {
    it("strictly caps untrusted buyer agent rationale at 500 characters", () => {
      const longRationale = "A".repeat(800);
      const { userPrompt } = buildIntentJudgePrompt({
        mandate: INTENT_JUDGE_EDGE_CASES.HONEST_MATCH.input.mandate,
        cart: INTENT_JUDGE_EDGE_CASES.HONEST_MATCH.input.cart,
        rawRationale: longRationale,
      });

      // Rationale inside userPrompt must not exceed 500 characters
      expect(userPrompt).toContain("A".repeat(500));
      expect(userPrompt).not.toContain("A".repeat(501));
    });

    it("strips dangerous raw HTML tags and zero-width characters", () => {
      const dangerousRationale =
        '<script>alert("pwned")</script>Buy phone case <img src=x onerror=attack()> \u200B';
      const sanitized = sanitizeQuarantineText(dangerousRationale);

      expect(sanitized).not.toContain("<script>");
      expect(sanitized).not.toContain("<img");
      expect(sanitized).not.toContain("\u200B");
      expect(sanitized).toContain("Buy phone case");
    });
  });

  describe("5 Hand-Written Edge Cases Evaluation", () => {
    it("Edge Case 1 (Honest Match): evaluates to consistent and ALLOW", async () => {
      const fixture = INTENT_JUDGE_EDGE_CASES.HONEST_MATCH;
      const result = await evaluateIntentAlignment(fixture.input);

      expect(result.verdict).toBe("consistent");
      expect(result.score).toBeLessThanOrEqual(fixture.expected.maxScore);
      expect(result.violated).toEqual([]);

      const calibrated = calibrateJudgeVerdict(result);
      expect(calibrated.decision).toBe("ALLOW");
      expect(calibrated.actionCode).toBe("INTENT_VERIFIED");
    });

    it("Edge Case 2 (Subtle Category Drift): catches scope drift and triggers BLOCK / HOLD", async () => {
      const fixture = INTENT_JUDGE_EDGE_CASES.SUBTLE_CATEGORY_DRIFT;
      const result = await evaluateIntentAlignment(fixture.input);

      expect(["inconsistent", "unsure"]).toContain(result.verdict);
      expect(result.score).toBeGreaterThanOrEqual(fixture.expected.minScore);
      expect(
        result.violated.some((v) =>
          ["category_mismatch", "scope_drift"].includes(v),
        ),
      ).toBe(true);

      const calibrated = calibrateJudgeVerdict(result);
      expect(["BLOCK", "HOLD"]).toContain(calibrated.decision);
    });

    it("Edge Case 3 (Price Discrepancy): blocks cart exceeding maxTotal budget", async () => {
      const fixture = INTENT_JUDGE_EDGE_CASES.PRICE_DISCREPANCY;
      const result = await evaluateIntentAlignment(fixture.input);

      expect(result.verdict).toBe("inconsistent");
      expect(result.score).toBeGreaterThanOrEqual(fixture.expected.minScore);
      expect(result.violated).toContain("budget_exceeded");

      const calibrated = calibrateJudgeVerdict(result);
      expect(calibrated.decision).toBe("BLOCK");
      expect(calibrated.actionCode).toBe("INTENT_MISALIGNMENT_BLOCKED");
    });

    it("Edge Case 4 (Tool Hallucination): blocks fabricated unverified SKU", async () => {
      const fixture = INTENT_JUDGE_EDGE_CASES.TOOL_HALLUCINATION;
      const result = await evaluateIntentAlignment(fixture.input, {
        validStoreSkus: ["DM-COFFEE-BEANS", "DM-OAT-MILK-6PK"],
      });

      expect(result.verdict).toBe("inconsistent");
      expect(result.score).toBeGreaterThanOrEqual(fixture.expected.minScore);
      expect(result.violated).toContain("unverified_sku");

      const calibrated = calibrateJudgeVerdict(result);
      expect(calibrated.decision).toBe("BLOCK");
    });

    it("Edge Case 5 (Prompt Injection): detects adversarial injection and forces BLOCK", async () => {
      const fixture = INTENT_JUDGE_EDGE_CASES.CLEAR_PROMPT_INJECTION;
      const result = await evaluateIntentAlignment(fixture.input);

      expect(result.verdict).toBe("inconsistent");
      expect(result.score).toBe(1.0);
      expect(result.violated).toContain("prompt_injection");

      const calibrated = calibrateJudgeVerdict(result);
      expect(calibrated.decision).toBe("BLOCK");
      expect(calibrated.actionCode).toBe("INTENT_MISALIGNMENT_BLOCKED");
    });
  });

  describe("Model Benchmarking & Selection", () => {
    it("recommends Claude 3.5 Haiku or GPT-4o-mini for sub-800ms firewall budget", () => {
      const recommended = getRecommendedJudgeModel();
      expect(recommended.recommendedForProduction).toBe(true);
      expect(recommended.p95LatencyMs).toBeLessThan(1000);
      expect(recommended.schemaAdherenceRate).toBeGreaterThanOrEqual(0.99);

      // Verify all benchmark candidates are documented
      expect(INTENT_JUDGE_MODEL_BENCHMARKS.length).toBeGreaterThanOrEqual(3);
    });
  });
});
