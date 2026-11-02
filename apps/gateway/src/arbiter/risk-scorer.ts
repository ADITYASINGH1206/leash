import type { DecisionVerdict } from "@leash/shared";
import { logger } from "@leash/shared";

export interface RiskScoreInput {
  amount: number;
  historicalMean?: number;
  txnsLastHour?: number;
  noveltyScore?: number;
  categoryDrift?: number;
  budgetConsumedRatio?: number;
  thresholdProximity?: number;
  recentFailedAttempts?: number;
  mlServiceUrl?: string;
}

export interface RiskScoreOutput {
  riskScore: number;
  reasons: string[];
  verdict: DecisionVerdict;
}

/**
 * Deterministic local fallback anomaly scoring model
 * Mirroring the 7-feature Isolation Forest heuristic in services/ml/models/isolation_forest.py
 */
export function scoreRiskLocally(
  amount: number,
  txnsLastHour = 0,
  noveltyScore = 0.0,
  historicalMean = 25.0,
  categoryDrift = 0.0,
  budgetConsumedRatio = 0.0,
  thresholdProximity = 0.0,
  recentFailedAttempts = 0,
): RiskScoreOutput {
  const reasons: string[] = [];
  const meanAmount = Math.max(historicalMean, 1.0);
  let score = 10;

  // 1. Amount deviation relative to historical mean
  if (amount > meanAmount * 3) {
    score += 25;
    reasons.push(
      `Spend significantly higher than historical average (${(amount / meanAmount).toFixed(1)}x mean)`,
    );
  } else if (amount > meanAmount * 2) {
    score += 12;
    reasons.push(
      `Spend moderately elevated above historical average (${(amount / meanAmount).toFixed(1)}x mean)`,
    );
  }

  // 2. Velocity anomaly in trailing 60 min
  if (txnsLastHour >= 4) {
    score += 30;
    reasons.push(
      `High transaction frequency in trailing hour (${txnsLastHour} txns)`,
    );
  } else if (txnsLastHour >= 3) {
    score += 20;
    reasons.push(
      `Elevated transaction frequency in trailing hour (${txnsLastHour} txns)`,
    );
  }

  // 3. Merchant novelty
  if (noveltyScore >= 0.8) {
    score += 20;
    reasons.push(
      `First-time merchant interaction (novelty: ${noveltyScore.toFixed(2)})`,
    );
  } else if (noveltyScore >= 0.5) {
    score += 10;
    reasons.push(
      `Relatively novel merchant interaction (novelty: ${noveltyScore.toFixed(2)})`,
    );
  }

  // 4. Category drift
  if (categoryDrift >= 0.5) {
    score += 20;
    reasons.push(
      `High category drift from authorized mandate scope (${categoryDrift.toFixed(2)})`,
    );
  } else if (categoryDrift >= 0.25) {
    score += 10;
    reasons.push(
      `Noticeable category drift from authorized scope (${categoryDrift.toFixed(2)})`,
    );
  }

  // 5. Mandate budget consumed ratio
  if (budgetConsumedRatio >= 0.85) {
    score += 20;
    reasons.push(
      `High mandate budget consumption ratio (${Math.round(budgetConsumedRatio * 100)}%)`,
    );
  } else if (budgetConsumedRatio >= 0.7) {
    score += 10;
    reasons.push(
      `Mandate budget nearing depletion (${Math.round(budgetConsumedRatio * 100)}%)`,
    );
  }

  // 6. Proximity to human approval threshold (catches split-transaction micro-purchases staying just under threshold)
  if (thresholdProximity >= 0.85 && thresholdProximity < 1.0) {
    score += 20;
    reasons.push(
      "Suspicious micro-purchase proximity to approval threshold (split-transaction indicator)",
    );
  }

  // 7. Recent failed attempts
  if (recentFailedAttempts >= 3) {
    score += 30;
    reasons.push(
      `Multiple recent failed payment attempts detected (${recentFailedAttempts} attempts)`,
    );
  } else if (recentFailedAttempts >= 2) {
    score += 18;
    reasons.push(
      `Repeated failed attempts detected (${recentFailedAttempts} attempts)`,
    );
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
    historicalMean = 25.0,
    txnsLastHour = 0,
    noveltyScore = 0.0,
    categoryDrift = 0.0,
    budgetConsumedRatio = 0.0,
    thresholdProximity = 0.0,
    recentFailedAttempts = 0,
    mlServiceUrl = process.env.ML_SERVICE_URL || "http://localhost:8000",
  } = input;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 400); // 400ms strict timeout for ML call

  try {
    // Render's fromService host/hostport values have no scheme; add one.
    const baseUrl = /^https?:\/\//.test(mlServiceUrl)
      ? mlServiceUrl.replace(/\/$/, "")
      : `http://${mlServiceUrl.replace(/\/$/, "")}`;
    const res = await fetch(`${baseUrl}/risk/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount,
        historical_mean: historicalMean,
        txns_last_hour: txnsLastHour,
        novelty_score: noveltyScore,
        category_drift: categoryDrift,
        budget_consumed_ratio: budgetConsumedRatio,
        threshold_proximity: thresholdProximity,
        recent_failed_attempts: recentFailedAttempts,
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

  return scoreRiskLocally(
    amount,
    txnsLastHour,
    noveltyScore,
    historicalMean,
    categoryDrift,
    budgetConsumedRatio,
    thresholdProximity,
    recentFailedAttempts,
  );
}
