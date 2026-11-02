import { randomUUID } from "node:crypto";
import type { PaymentRequest, IntentMandate } from "@leash/mandates";
import { evaluateIntentAlignment } from "@leash/mandates";
import { PolicyEngine } from "@leash/policy";
import { ProvenanceScanner } from "@leash/provenance";
import {
  type DecisionReason,
  type DecisionTrace,
  type DecisionVerdict,
  LEDGER_EVENT_KINDS,
  logger,
} from "@leash/shared";
import {
  lockAndReserveBudget,
  releaseReservedBudget,
  getInMemoryMandate,
} from "../db/budget-mutex.js";
import { GatewayRepository } from "../db/repository.js";
import { evaluateRiskLayer } from "./risk-scorer.js";
import type {
  ArbiterDecision,
  ArbiterOptions,
  LayerEvaluationResult,
} from "./types.js";

/**
 * Strict fail-closed timeout wrapper.
 * Throws a TimeoutError if execution exceeds the specified threshold.
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs = 2400,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new Error(
          `Decision pipeline timed out after ${timeoutMs}ms (Fail-Closed timeout)`,
        ),
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export class DecisionArbiter {
  private policyEngine: PolicyEngine;
  private provenanceScanner: ProvenanceScanner;

  constructor(
    policyEngine?: PolicyEngine,
    provenanceScanner?: ProvenanceScanner,
  ) {
    this.policyEngine = policyEngine ?? new PolicyEngine();
    this.provenanceScanner = provenanceScanner ?? new ProvenanceScanner();
  }

  /**
   * Main Arbiter execution pipeline coordinating all 5 inspection layers.
   *
   * Architectural Invariants:
   * 1. Authorize-Then-Capture: Money never moves directly; evaluates verdict for downstream hold/authorization.
   * 2. Fail-Closed Principle: Any error or timeout (> 2.4s) results strictly in HOLD.
   * 3. Isolated Intent Context: Quarantined adversarial rationale capped at 500 characters.
   * 4. Atomic Budget Locking: Row-level mutex locking with release on blocked attack.
   * 5. Tamper-Evident Ledger: Full event trace logged to hash chain.
   */
  async evaluate(
    req: PaymentRequest,
    options: ArbiterOptions = {},
  ): Promise<ArbiterDecision> {
    const decisionId = `dec_${randomUUID()}`;
    const startTime = Date.now();
    const timeoutMs = options.timeoutMs ?? 2400;

    try {
      return await withTimeout(
        this.runPipeline(decisionId, req, startTime, options),
        timeoutMs,
      );
    } catch (error) {
      // Fail-Closed Fallback: System exceptions or timeouts degrade strictly to HOLD
      const durationMs = Date.now() - startTime;
      const isTimeout = String(error).includes("timed out");
      const errorCode = isTimeout
        ? "TIMEOUT_FAIL_CLOSED"
        : "FAIL_CLOSED_SYSTEM_ERROR";
      const errorMsg = isTimeout
        ? `Decision pipeline timed out (> ${timeoutMs}ms). Placed on HOLD per Fail-Closed policy.`
        : `System exception during firewall evaluation: ${error instanceof Error ? error.message : String(error)}`;

      logger.warn("Decision arbiter fail-closed fallback triggered", {
        decisionId,
        errorCode,
        error: errorMsg,
      });

      const fallbackReason: DecisionReason = {
        layer: "mandate",
        verdict: "HOLD",
        code: errorCode,
        message: errorMsg,
      };

      const fallbackTrace: DecisionTrace = {
        decisionId,
        mandateId: req.mandateId,
        cartId: req.cart.id,
        verdict: "HOLD",
        reasons: [fallbackReason],
        riskScore: 60,
        durationMs,
        timestamp: new Date().toISOString(),
      };

      await GatewayRepository.appendLedgerEvent(
        LEDGER_EVENT_KINDS.DECISION_VERDICT,
        decisionId,
        {
          verdict: "HOLD",
          status: "HELD",
          holdReason: errorMsg,
          durationMs,
          failClosed: true,
        },
      );

      await GatewayRepository.saveTransaction({
        id: decisionId,
        mandateId: req.mandateId,
        merchantId: req.cart.merchantId,
        amount: req.cart.total,
        currency: req.cart.currency,
        verdict: "HOLD",
        status: "HELD",
        holdReason: errorMsg,
      });

      return {
        decisionId,
        mandateId: req.mandateId,
        cartId: req.cart.id,
        verdict: "HOLD",
        status: "HELD",
        holdReason: errorMsg,
        reasons: [fallbackReason],
        riskScore: 60,
        durationMs,
        layerTiming: { total: durationMs },
        trace: fallbackTrace,
      };
    }
  }

  private async runPipeline(
    decisionId: string,
    req: PaymentRequest,
    startTime: number,
    options: ArbiterOptions,
  ): Promise<ArbiterDecision> {
    const totalAmount = Number(req.cart.total);
    const layerTiming: Record<string, number> = {};
    const reasons: DecisionReason[] = [];

    // 0. Append initial PAYMENT_REQUESTED event to immutable ledger
    await GatewayRepository.appendLedgerEvent(
      LEDGER_EVENT_KINDS.PAYMENT_REQUESTED,
      req.mandateId,
      {
        decisionId,
        cartId: req.cart.id,
        total: req.cart.total,
        currency: req.cart.currency,
        merchantId: req.cart.merchantId,
      },
    );

    // =========================================================================
    // LAYER 0: Mandate Verification & Budget Mutex Locking (Cheapest & Deterministic)
    // =========================================================================
    const l0Start = Date.now();
    const budgetResult = await lockAndReserveBudget(req.mandateId, totalAmount);
    layerTiming.layer0_mandate = Date.now() - l0Start;

    if (!budgetResult.success) {
      const durationMs = Date.now() - startTime;
      const budgetReason: DecisionReason = {
        layer: "mandate",
        verdict: "BLOCK",
        code: "BUDGET_EXCEEDED_OR_INVALID",
        message:
          budgetResult.reason ||
          "Mandate budget limit exceeded or mandate invalid",
      };
      reasons.push(budgetReason);

      const blockedTrace: DecisionTrace = {
        decisionId,
        mandateId: req.mandateId,
        cartId: req.cart.id,
        verdict: "BLOCK",
        reasons,
        riskScore: 90,
        durationMs,
        timestamp: new Date().toISOString(),
      };

      await GatewayRepository.appendLedgerEvent(
        LEDGER_EVENT_KINDS.DECISION_VERDICT,
        decisionId,
        {
          verdict: "BLOCK",
          status: "BLOCKED",
          reason: budgetReason.message,
          layerTiming,
        },
      );

      await GatewayRepository.saveTransaction({
        id: decisionId,
        mandateId: req.mandateId,
        merchantId: req.cart.merchantId,
        amount: req.cart.total,
        currency: req.cart.currency,
        verdict: "BLOCK",
        status: "BLOCKED",
        holdReason: budgetReason.message,
      });

      return {
        decisionId,
        mandateId: req.mandateId,
        cartId: req.cart.id,
        verdict: "BLOCK",
        status: "BLOCKED",
        holdReason: budgetReason.message,
        reasons,
        riskScore: 90,
        durationMs,
        layerTiming,
        remainingBudget: budgetResult.remainingBudget,
        trace: blockedTrace,
      };
    }

    // =========================================================================
    // LAYER 1: Deterministic Policy Engine (CEL Rules)
    // =========================================================================
    const l1Start = Date.now();
    const knownMerchants = options.knownMerchants ?? [
      "mer_known_store",
      "mer_gadgethub",
      "mer_trendboutique",
      "mer_dailymart",
    ];
    const hourLocal =
      options.hourLocal !== undefined
        ? options.hourLocal
        : new Date().getHours();
    const txnsLastHour = options.txnsLastHour ?? 1;

    const policyResult = this.policyEngine.evaluate({
      cart: {
        total: totalAmount,
        merchantId: req.cart.merchantId,
        items: req.cart.items.map((item) => ({
          category: item.category,
          name: item.name,
          unitAmount: Number(item.unitAmount),
          qty: item.qty,
        })),
      },
      agent: {
        knownMerchants,
        txnsLastHour,
      },
      time: {
        hourLocal,
      },
    });
    layerTiming.layer1_policy = Date.now() - l1Start;

    await GatewayRepository.appendLedgerEvent(
      LEDGER_EVENT_KINDS.LAYER_POLICY_EVALUATED,
      decisionId,
      {
        verdict: policyResult.verdict,
        triggeredRules: policyResult.triggeredRules,
        durationMs: layerTiming.layer1_policy,
      },
    );

    for (const rule of policyResult.triggeredRules) {
      reasons.push({
        layer: "policy",
        verdict: rule.action,
        code: rule.id,
        message: rule.description,
      });
    }

    // =========================================================================
    // PARALLEL EXECUTION: Layer 2 (Provenance), Layer 3 (Intent Judge), Layer 4 (Risk Model)
    // =========================================================================
    const parallelStart = Date.now();

    // Prepare Layer 3 Mandate Context
    const dbMandate = await GatewayRepository.getMandate(req.mandateId);
    const memMandate = getInMemoryMandate(req.mandateId);
    const intentText =
      dbMandate?.intentText ||
      (memMandate as unknown as { intentText?: string })?.intentText ||
      "Authorized shopping purchase";
    const maxTotalStr = dbMandate?.maxAmount
      ? String(dbMandate.maxAmount)
      : memMandate
        ? String(memMandate.maxAmount)
        : "250.00";

    const mandateForJudge: IntentMandate = {
      id: req.mandateId,
      userId: dbMandate?.userId || "usr_default",
      agentId: "agt_shopping",
      intentText,
      playback: `User authorized shopping for ${intentText} with budget $${maxTotalStr}`,
      constraints: {
        currency: req.cart.currency,
        maxTotal: maxTotalStr,
        maxPerTxn: maxTotalStr,
        maxTxnCount: 10,
        categories: [],
        itemTerms: [],
        merchantAllow: [],
        merchantBlock: [],
        approvalAbove: undefined,
        expiresAt: (
          dbMandate?.validUntil ||
          memMandate?.validUntil ||
          new Date(Date.now() + 86400000)
        ).toISOString(),
      },
      nonce: `nonce_${randomUUID().replace(/-/g, "")}`,
    };

    const isNovelMerchant = !knownMerchants.includes(req.cart.merchantId);
    const noveltyScore = options.noveltyScore ?? (isNovelMerchant ? 0.9 : 0.1);

    // Concurrently trigger Layer 2, Layer 3, and Layer 4 with fail-safe wrappers
    const [provSettled, judgeSettled, riskSettled] = await Promise.allSettled([
      // Layer 2: DOM Provenance Scanner
      (async (): Promise<LayerEvaluationResult> => {
        const pStart = Date.now();
        const res = await this.provenanceScanner.scanEvidence(
          req.evidence,
          req.cart,
        );
        const pDuration = Date.now() - pStart;
        return {
          layer: "provenance",
          verdict: res.verdict,
          code: res.code,
          message: res.message,
          durationMs: pDuration,
          raw: res,
        };
      })(),

      // Layer 3: Intent Judge LLM
      (async (): Promise<LayerEvaluationResult> => {
        const jStart = Date.now();
        const res = await evaluateIntentAlignment(
          {
            mandate: mandateForJudge,
            cart: req.cart,
            rawRationale: req.rationale,
          },
          {
            llmInvoker: options.llmInvoker,
            validStoreSkus: options.validStoreSkus,
          },
        );
        const jDuration = Date.now() - jStart;

        // Judge Aggregation Matrix:
        // - inconsistent or score >= 0.8 -> BLOCK
        // - unsure or 0.4 <= score < 0.8 -> HOLD
        // - consistent and score < 0.4 -> ALLOW
        let verdict: DecisionVerdict = "ALLOW";
        if (res.verdict === "inconsistent" || res.score >= 0.8) {
          verdict = "BLOCK";
        } else if (res.verdict === "unsure" || res.score >= 0.4) {
          verdict = "HOLD";
        }

        return {
          layer: "intent",
          verdict,
          code:
            verdict === "BLOCK"
              ? "INTENT_INCONSISTENT"
              : verdict === "HOLD"
                ? "INTENT_UNSURE"
                : "INTENT_CONSISTENT",
          message: res.reason,
          durationMs: jDuration,
          raw: res,
        };
      })(),

      // Layer 4: Risk Model Anomaly Scoring
      (async (): Promise<LayerEvaluationResult> => {
        const rStart = Date.now();
        const res = await evaluateRiskLayer({
          amount: totalAmount,
          txnsLastHour,
          noveltyScore,
          mlServiceUrl: options.mlServiceUrl,
        });
        const rDuration = Date.now() - rStart;

        return {
          layer: "risk",
          verdict: res.verdict,
          code:
            res.verdict === "BLOCK"
              ? "RISK_ANOMALY_HIGH"
              : res.verdict === "HOLD"
                ? "RISK_ANOMALY_ELEVATED"
                : "RISK_NORMAL",
          message:
            res.reasons.length > 0
              ? res.reasons.join("; ")
              : `Risk score ${res.riskScore}/100 normal`,
          durationMs: rDuration,
          raw: res,
        };
      })(),
    ]);

    layerTiming.parallel_execution = Date.now() - parallelStart;

    // Handle Layer 2 results (Provenance)
    let provResult: LayerEvaluationResult;
    if (provSettled.status === "fulfilled") {
      provResult = provSettled.value;
    } else {
      // Fail-closed invariant: layer crash degrades to HOLD
      provResult = {
        layer: "provenance",
        verdict: "HOLD",
        code: "PROVENANCE_SCAN_FAILED",
        message: `Fail-closed: Provenance scanner failed: ${provSettled.reason instanceof Error ? provSettled.reason.message : String(provSettled.reason)}`,
        durationMs: 0,
      };
    }
    layerTiming.layer2_provenance = provResult.durationMs;
    reasons.push({
      layer: "provenance",
      verdict: provResult.verdict,
      code: provResult.code,
      message: provResult.message,
    });

    await GatewayRepository.appendLedgerEvent(
      LEDGER_EVENT_KINDS.LAYER_PROVENANCE_SCANNED,
      decisionId,
      {
        verdict: provResult.verdict,
        code: provResult.code,
        message: provResult.message,
        durationMs: provResult.durationMs,
      },
    );

    // Handle Layer 3 results (Intent Judge)
    let judgeResult: LayerEvaluationResult;
    if (judgeSettled.status === "fulfilled") {
      judgeResult = judgeSettled.value;
    } else {
      judgeResult = {
        layer: "intent",
        verdict: "HOLD",
        code: "INTENT_JUDGE_FAILED",
        message: `Fail-closed: Intent judge failed: ${judgeSettled.reason instanceof Error ? judgeSettled.reason.message : String(judgeSettled.reason)}`,
        durationMs: 0,
      };
    }
    layerTiming.layer3_intent = judgeResult.durationMs;
    reasons.push({
      layer: "intent",
      verdict: judgeResult.verdict,
      code: judgeResult.code,
      message: judgeResult.message,
    });

    await GatewayRepository.appendLedgerEvent(
      LEDGER_EVENT_KINDS.LAYER_INTENT_EVALUATED,
      decisionId,
      {
        verdict: judgeResult.verdict,
        code: judgeResult.code,
        message: judgeResult.message,
        durationMs: judgeResult.durationMs,
        raw: judgeResult.raw,
      },
    );

    // Handle Layer 4 results (Risk Model)
    let riskResult: LayerEvaluationResult;
    if (riskSettled.status === "fulfilled") {
      riskResult = riskSettled.value;
    } else {
      riskResult = {
        layer: "risk",
        verdict: "HOLD",
        code: "RISK_SCORING_FAILED",
        message: `Fail-closed: Risk scoring failed: ${riskSettled.reason instanceof Error ? riskSettled.reason.message : String(riskSettled.reason)}`,
        durationMs: 0,
      };
    }
    layerTiming.layer4_risk = riskResult.durationMs;
    reasons.push({
      layer: "risk",
      verdict: riskResult.verdict,
      code: riskResult.code,
      message: riskResult.message,
    });

    const calculatedRiskScore =
      (riskResult.raw as { riskScore?: number })?.riskScore ??
      (riskResult.verdict === "BLOCK" ? 85 : 30);

    await GatewayRepository.appendLedgerEvent(
      LEDGER_EVENT_KINDS.LAYER_RISK_SCORED,
      decisionId,
      {
        verdict: riskResult.verdict,
        code: riskResult.code,
        riskScore: calculatedRiskScore,
        reasons: riskResult.message,
        durationMs: riskResult.durationMs,
      },
    );

    // =========================================================================
    // AGGREGATION DECISION MATRIX
    // =========================================================================
    // Rules:
    // • Layer 0 or Policy BLOCK -> Block
    // • Provenance tainted with cart item match -> Block
    // • Intent Judge inconsistent (score >= 0.8) -> Block
    // • Risk model score > 70 -> Block
    // • Policy HOLD, Judge unsure, Risk 40..70, tainted page with no cart match, or over approval threshold -> Hold
    // • Layer error or timeout -> Hold (Fail-closed)
    // • All pass -> Allow

    let finalVerdict: DecisionVerdict = "ALLOW";
    const holdReasons: string[] = [];

    // 1. Check for any BLOCK condition
    if (
      policyResult.verdict === "BLOCK" ||
      provResult.verdict === "BLOCK" ||
      judgeResult.verdict === "BLOCK" ||
      riskResult.verdict === "BLOCK"
    ) {
      finalVerdict = "BLOCK";
      if (policyResult.verdict === "BLOCK") {
        holdReasons.push(
          ...policyResult.triggeredRules
            .filter((r) => r.action === "BLOCK")
            .map((r) => r.description),
        );
      }
      if (provResult.verdict === "BLOCK") {
        holdReasons.push(provResult.message);
      }
      if (judgeResult.verdict === "BLOCK") {
        holdReasons.push(judgeResult.message);
      }
      if (riskResult.verdict === "BLOCK") {
        holdReasons.push(riskResult.message);
      }
    }

    // 2. If not blocked, check for any HOLD condition
    if (finalVerdict !== "BLOCK") {
      if (policyResult.verdict === "HOLD") {
        finalVerdict = "HOLD";
        holdReasons.push(
          ...policyResult.triggeredRules.map((r) => r.description),
        );
      }

      if (provResult.verdict === "HOLD") {
        finalVerdict = "HOLD";
        holdReasons.push(provResult.message);
      }

      if (judgeResult.verdict === "HOLD") {
        finalVerdict = "HOLD";
        holdReasons.push(judgeResult.message);
      }

      if (riskResult.verdict === "HOLD") {
        finalVerdict = "HOLD";
        holdReasons.push(riskResult.message);
      }

      // 3. User Instant Approval Threshold check (e.g. $100.00)
      const instantApprovalThreshold = options.approvalAbove ?? 100.0;
      if (totalAmount > instantApprovalThreshold) {
        finalVerdict = "HOLD";
        const thresholdMsg = `Cart total ($${totalAmount.toFixed(2)}) exceeds instant auto-approval threshold ($${instantApprovalThreshold.toFixed(2)}); step-up confirmation required.`;
        holdReasons.push(thresholdMsg);
        reasons.push({
          layer: "mandate",
          verdict: "HOLD",
          code: "APPROVAL_THRESHOLD_EXCEEDED",
          message: thresholdMsg,
        });
      }
    }

    // If final verdict is BLOCK, release reserved budget so budget is preserved
    if (finalVerdict === "BLOCK") {
      await releaseReservedBudget(req.mandateId, totalAmount);
    }

    const durationMs = Date.now() - startTime;
    layerTiming.total = durationMs;

    const status: ArbiterDecision["status"] =
      finalVerdict === "ALLOW"
        ? "AUTHORIZED"
        : finalVerdict === "BLOCK"
          ? "BLOCKED"
          : "HELD";

    const holdReasonText =
      holdReasons.length > 0 ? holdReasons.join("; ") : undefined;

    // Overall Risk Score estimation for trace
    let traceRiskScore = calculatedRiskScore;
    if (finalVerdict === "BLOCK") {
      traceRiskScore = Math.max(85, calculatedRiskScore);
    } else if (finalVerdict === "HOLD") {
      traceRiskScore = Math.max(50, Math.min(75, calculatedRiskScore));
    } else {
      traceRiskScore = Math.min(35, calculatedRiskScore);
    }

    const trace: DecisionTrace = {
      decisionId,
      mandateId: req.mandateId,
      cartId: req.cart.id,
      verdict: finalVerdict,
      reasons,
      riskScore: traceRiskScore,
      durationMs,
      timestamp: new Date().toISOString(),
    };

    // Commit final DECISION_VERDICT to append-only tamper-evident ledger
    await GatewayRepository.appendLedgerEvent(
      LEDGER_EVENT_KINDS.DECISION_VERDICT,
      decisionId,
      {
        verdict: finalVerdict,
        status,
        holdReason: holdReasonText,
        riskScore: traceRiskScore,
        durationMs,
        layerTiming,
      },
    );

    await GatewayRepository.saveTransaction({
      id: decisionId,
      mandateId: req.mandateId,
      merchantId: req.cart.merchantId,
      amount: req.cart.total,
      currency: req.cart.currency,
      verdict: finalVerdict,
      status,
      holdReason: holdReasonText,
    });

    return {
      decisionId,
      mandateId: req.mandateId,
      cartId: req.cart.id,
      verdict: finalVerdict,
      status,
      holdReason: holdReasonText,
      reasons,
      riskScore: traceRiskScore,
      durationMs,
      layerTiming,
      remainingBudget: budgetResult.remainingBudget,
      trace,
    };
  }
}
