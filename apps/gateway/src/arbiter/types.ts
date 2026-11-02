import type {
  DecisionReason,
  DecisionTrace,
  DecisionVerdict,
} from "@leash/shared";

export interface ArbiterOptions {
  /**
   * Optional custom LLM execution function for Intent Judge (Layer 3).
   * If omitted, falls back to deterministic baseline intent evaluator.
   */
  llmInvoker?: (systemPrompt: string, userPrompt: string) => Promise<string>;

  /**
   * Known merchant catalogue SKUs for checking hallucinations.
   */
  validStoreSkus?: string[];

  /**
   * Base URL for Layer 4 Risk ML microservice (default: process.env.ML_SERVICE_URL || 'http://localhost:8000').
   */
  mlServiceUrl?: string;

  /**
   * Known merchant IDs for policy and novelty evaluation.
   */
  knownMerchants?: string[];

  /**
   * Override local hour for testing quiet-hours policy (0..23).
   */
  hourLocal?: number;

  /**
   * Transaction velocity in trailing hour for policy and risk anomaly scoring.
   */
  txnsLastHour?: number;

  /**
   * Novelty score for merchant interaction (0.0 = known, 1.0 = completely novel).
   */
  noveltyScore?: number;

  /**
   * Threshold above which transactions are placed on HOLD for human confirmation.
   * Defaults to mandate constraints or $100.00.
   */
  approvalAbove?: number;

  /**
   * Timeout in ms for overall decision arbiter execution (default: 2400ms, strictly < 2.5s).
   */
  timeoutMs?: number;
}

export interface LayerEvaluationResult {
  layer: "mandate" | "policy" | "provenance" | "intent" | "risk";
  verdict: DecisionVerdict;
  code: string;
  message: string;
  durationMs: number;
  raw?: unknown;
}

export interface ArbiterDecision {
  decisionId: string;
  mandateId: string;
  cartId: string;
  verdict: DecisionVerdict;
  status: "AUTHORIZED" | "HELD" | "BLOCKED";
  holdReason?: string;
  reasons: DecisionReason[];
  riskScore: number;
  durationMs: number;
  layerTiming: Record<string, number>;
  remainingBudget?: string;
  trace: DecisionTrace;
}
