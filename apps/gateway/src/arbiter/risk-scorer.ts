import type { DecisionVerdict } from "@leash/shared";
import { logger } from "@leash/shared";

export interface RiskScoreInput {
  amount: number;
  txnsLastHour?: number;
  noveltyScore?: number;
  mlServiceUrl?: string;
}

export interface RiskScoreOutput {
  riskScore: number;
  reasons: string[];
  verdict: DecisionVerdict;
}

/**
 * Deterministic local fallback anomaly scoring model
 * Mirroring the Isolation Forest heuristic in services/ml/models/isolation_forest.py
 */
export function scoreRiskLocally(
  amount: number,
  txnsLastHour = 0,
  noveltyScore = 0.0,
): RiskScoreOutput {
  const reasons: string[] = [];
  const meanAmount = 25.0;
  let score = 10;

  // 1. Amount deviation
  if (amount > meanAmount * 3) {
    score += 35;
    reasons.push("Spend significantly higher than historical average");
  }

  // 2. Velocity anomaly
  if (txnsLastHour >= 3) {
    score += 30;
    reasons.push("High transaction frequency in trailing hour");
  }

  // 3. Merchant novelty
  if (noveltyScore > 0.8) {
    score += 20;
    reasons.push("First-time merchant interaction");
  }

  score = Math.min(100, score);

  let verdict: DecisionVerdict = "ALLOW";
  if (score > 70) {
    verdict = "BLOCK";
  } else if (score >= 40) {
    verdict = "HOLD";
  }

  return {
    riskScore: score,
    reasons: reasons.slice(0, 3),
    verdict,
  };
}

/**
 * Layer 4: Evaluates Risk Anomaly Score via Python ML service or local fallback
 */
export async function evaluateRiskLayer(
  input: RiskScoreInput,
): Promise<RiskScoreOutput> {
  const {
    amount,
    txnsLastHour = 0,
    noveltyScore = 0.0,
    mlServiceUrl = process.env.ML_SERVICE_URL || "http://localhost:8000",
  } = input;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 400); // 400ms strict timeout for ML call

  try {
    const res = await fetch(`${mlServiceUrl}/risk/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount,
        txns_last_hour: txnsLastHour,
        novelty_score: noveltyScore,
      }),
      signal: controller.signal,
    });

    if (res.ok) {
      const data = (await res.json()) as {
        risk_score: number;
        top_factors: string[];
        verdict_suggestion: "ALLOW" | "HOLD" | "BLOCK";
      };

      const score = data.risk_score;
      let verdict: DecisionVerdict = "ALLOW";
      if (score > 70) {
        verdict = "BLOCK";
      } else if (score >= 40) {
        verdict = "HOLD";
      }

      return {
        riskScore: score,
        reasons: data.top_factors,
        verdict,
      };
    }
  } catch (_err) {
    // If ML service is unavailable or timed out, fall back to local heuristic model
    logger.debug(
      "Layer 4 ML service unreachable or timed out; falling back to local risk model",
    );
  } finally {
    clearTimeout(timeoutId);
  }

  return scoreRiskLocally(amount, txnsLastHour, noveltyScore);
}

