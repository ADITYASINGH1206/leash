import { z } from "zod";
import type { DecisionVerdict } from "@leash/shared";

/**
 * Strict schema for Layer 3 Intent Judge LLM evaluation verdict.
 * The Intent Judge compares human intent playback with verified merchant cart.
 */
export const IntentJudgeVerdictSchema = z.object({
  verdict: z.enum(["consistent", "unsure", "inconsistent"], {
    description: "Alignment verdict between human intent and the items in cart",
  }),
  score: z
    .number()
    .min(0)
    .max(1, "Anomaly/misalignment score between 0.0 and 1.0"),
  violated: z.array(z.string()).default([]),
  reason: z.string().max(300, "Brief rationale limited to 2 sentences"),
});

export type IntentJudgeVerdict = z.infer<typeof IntentJudgeVerdictSchema>;

/**
 * Calibrates an Intent Judge verdict into the firewall's fail-closed DecisionVerdict.
 * Invariant: Any inconsistent verdict with score >= 0.8 triggers hard BLOCK;
 * any unsure verdict or borderline score triggers HOLD.
 */
export function calibrateJudgeVerdict(judgement: IntentJudgeVerdict): {
  decision: DecisionVerdict;
  actionCode: string;
} {
  if (judgement.verdict === "inconsistent" || judgement.score >= 0.8) {
    return {
      decision: "BLOCK",
      actionCode: "INTENT_MISALIGNMENT_BLOCKED",
    };
  }

  if (judgement.verdict === "unsure" || judgement.score >= 0.4) {
    return {
      decision: "HOLD",
      actionCode: "INTENT_AMBIGUITY_HELD",
    };
  }

  return {
    decision: "ALLOW",
    actionCode: "INTENT_VERIFIED",
  };
}
