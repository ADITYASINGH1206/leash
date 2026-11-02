import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import {
  PaymentRequestSchema,
  type PaymentRequest,
  evaluateIntentAlignment,
  calibrateJudgeVerdict,
  type BuildJudgePromptParams,
} from "@leash/mandates";
import {
  type DecisionTrace,
  type DecisionVerdict,
  LEDGER_EVENT_KINDS,
  verifyLedgerChain,
} from "@leash/shared";
import { PolicyEngine } from "@leash/policy";
import { ProvenanceScanner } from "@leash/provenance";
import { PayPalClient } from "@leash/paypal";
import {
  lockAndReserveBudget,
  getInMemoryMandate,
  seedInMemoryMandate,
} from "../db/budget-mutex.js";
import { GatewayRepository } from "../db/repository.js";

export interface MCPPaymentResult {
  status: "AUTHORIZED" | "HELD" | "BLOCKED";
  orderId?: string;
  authorizationId?: string;
  holdReason?: string;
  remainingBudget?: string;
  trace: DecisionTrace;
}

const policyEngine = new PolicyEngine();
const provenanceScanner = new ProvenanceScanner();
const paypalClient = new PayPalClient({
  clientId: process.env.PAYPAL_CLIENT_ID || "sandbox_client_id_placeholder",
  clientSecret:
    process.env.PAYPAL_CLIENT_SECRET || "sandbox_client_secret_placeholder",
  environment:
    (process.env.PAYPAL_ENVIRONMENT as "sandbox" | "production") || "sandbox",
  mockMode:
    !process.env.PAYPAL_CLIENT_ID ||
    process.env.PAYPAL_CLIENT_ID.startsWith("your-"),
});

// Seed default demo mandate if in test/demo mode
seedInMemoryMandate({
  id: "mandate_default_demo",
  maxAmount: 250.0,
  spentAmount: 0.0,
  intentText: "Buy accessories, apparel, groceries, or essentials under budget",
  playback: "Authorized spending for daily items under $250",
  constraints: {
    maxTotal: "250.00",
    maxPerTxn: "250.00",
    currency: "USD",
    categories: [
      "phone_accessories",
      "cables",
      "chargers",
      "apparel",
      "grocery",
    ],
    itemTerms: ["case", "cable", "charger", "tee", "hoodie", "coffee", "beans"],
  },
});

/**
 * Executes a function with a strict timeout (Fail-Closed Principle).
 * If the function does not resolve within timeoutMs, it throws a TimeoutError.
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
          `Operation timed out after ${timeoutMs}ms (Fail-Closed timeout)`,
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

/**
 * MCP Server Tool: request_payment
 * Enforces:
 * 1. Authorize-Then-Capture invariant (intent: AUTHORIZE only)
 * 2. Fail-Closed Principle (defaults to HOLD on any error or timeout > 2.5s)
 * 3. Quarantined Intent Context (rationale capped at 500 chars)
 * 4. Row-level Budget Mutex Locking (SELECT ... FOR UPDATE)
 * 5. Tamper-Evident Ledger Recording
 */
export async function handleRequestPaymentTool(
  req: PaymentRequest,
): Promise<MCPPaymentResult> {
  const decisionId = `dec_${randomUUID()}`;
  const startTime = Date.now();
  const totalAmount = Number(req.cart.total);

  try {
    // Wrap entire decision flow in fail-closed 2.4s timeout (< 2.5s invariant limit)
    return await withTimeout(
      (async () => {
        // 1. Record initial request to tamper-evident ledger
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

        // 2. Enforce Row-Level Budget Mutex Locking (Rule 4)
        const budgetResult = await lockAndReserveBudget(
          req.mandateId,
          totalAmount,
        );
        if (!budgetResult.success) {
          const durationMs = Date.now() - startTime;
          const blockedTrace: DecisionTrace = {
            decisionId,
            mandateId: req.mandateId,
            cartId: req.cart.id,
            verdict: "BLOCK",
            reasons: [
              {
                layer: "mandate",
                verdict: "BLOCK",
                code: "BUDGET_EXCEEDED_OR_INVALID",
                message:
                  budgetResult.reason ||
                  "Mandate budget limit exceeded or mandate invalid",
              },
            ],
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
              reason: budgetResult.reason,
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
            holdReason: budgetResult.reason,
          });

          return {
            status: "BLOCKED",
            holdReason: budgetResult.reason,
            remainingBudget: budgetResult.remainingBudget,
            trace: blockedTrace,
          };
        }

        // 3. Evaluate Layer 1: Deterministic Policy Engine (CEL)
        const policyResult = policyEngine.evaluate({
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
            knownMerchants: [
              "mer_known_store",
              "mer_gadgethub",
              "mer_trendboutique",
              "mer_dailymart",
            ],
            txnsLastHour: 1,
          },
          time: {
            hourLocal: new Date().getHours(),
          },
        });

        await GatewayRepository.appendLedgerEvent(
          LEDGER_EVENT_KINDS.LAYER_POLICY_EVALUATED,
          decisionId,
          {
            verdict: policyResult.verdict,
            triggeredRules: policyResult.triggeredRules,
          },
        );

        // 4. Evaluate Layer 2: DOM Provenance Scanner
        const provenanceResult = await provenanceScanner.scanEvidence(
          req.evidence,
          req.cart,
        );

        await GatewayRepository.appendLedgerEvent(
          LEDGER_EVENT_KINDS.LAYER_PROVENANCE_SCANNED,
          decisionId,
          {
            verdict: provenanceResult.verdict,
            code: provenanceResult.code,
            message: provenanceResult.message,
            evidenceUrls: provenanceResult.evidenceUrls,
            matchedCartItems: provenanceResult.matchedCartItems,
          },
        );

        // 5. Evaluate Layer 3: Quarantined Intent Judge (Isolated Evaluator)
        const inMemoryRecord = getInMemoryMandate(req.mandateId);
        const intentText =
          inMemoryRecord?.intentText ??
          "Authorized purchases within specified budget and category limits";
        const playback =
          inMemoryRecord?.playback ?? "Approved human spending mandate";
        const constraints = inMemoryRecord?.constraints ?? {
          maxTotal: inMemoryRecord
            ? String(inMemoryRecord.maxAmount)
            : req.cart.total,
          maxPerTxn: inMemoryRecord
            ? String(inMemoryRecord.maxAmount)
            : req.cart.total,
          currency: req.cart.currency,
          categories: [
            "phone_accessories",
            "cables",
            "chargers",
            "apparel",
            "grocery",
          ],
          itemTerms: [
            "case",
            "cable",
            "charger",
            "tee",
            "hoodie",
            "coffee",
            "beans",
          ],
        };

        const judgeParams: BuildJudgePromptParams = {
          mandate: {
            intentText,
            playback,
            constraints,
          },
          cart: req.cart,
          rawRationale: req.rationale,
          toolCallSummary: req.evidence.map((e) => `CRAWL_EVIDENCE: ${e.url}`),
        };

        const judgeVerdict = await evaluateIntentAlignment(judgeParams);
        const calibratedIntent = calibrateJudgeVerdict(judgeVerdict);

        await GatewayRepository.appendLedgerEvent(
          LEDGER_EVENT_KINDS.LAYER_INTENT_EVALUATED,
          decisionId,
          {
            verdict: judgeVerdict.verdict,
            score: judgeVerdict.score,
            violated: judgeVerdict.violated,
            reason: judgeVerdict.reason,
            calibratedDecision: calibratedIntent.decision,
          },
        );

        // 6. Strict Fail-Closed Verdict Arbiter across all layers
        let verdict: DecisionVerdict = "HOLD";
        let status: MCPPaymentResult["status"] = "HELD";
        const holdReasons: string[] = [];

        // Check for any hard BLOCK
        if (policyResult.verdict === "BLOCK") {
          holdReasons.push(
            ...policyResult.triggeredRules.map((r) => r.description),
          );
        }
        if (provenanceResult.verdict === "BLOCK") {
          holdReasons.push(provenanceResult.message);
        }
        if (calibratedIntent.decision === "BLOCK") {
          holdReasons.push(`Intent Judge Block: ${judgeVerdict.reason}`);
        }

        if (
          policyResult.verdict === "BLOCK" ||
          provenanceResult.verdict === "BLOCK" ||
          calibratedIntent.decision === "BLOCK"
        ) {
          verdict = "BLOCK";
          status = "BLOCKED";
        } else if (
          policyResult.verdict === "HOLD" ||
          provenanceResult.verdict === "HOLD" ||
          calibratedIntent.decision === "HOLD"
        ) {
          verdict = "HOLD";
          status = "HELD";
          if (policyResult.verdict === "HOLD") {
            holdReasons.push(
              ...policyResult.triggeredRules.map((r) => r.description),
            );
          }
          if (provenanceResult.verdict === "HOLD") {
            holdReasons.push(provenanceResult.message);
          }
          if (calibratedIntent.decision === "HOLD") {
            holdReasons.push(`Intent Judge Hold: ${judgeVerdict.reason}`);
          }
        } else {
          verdict = "ALLOW";
          status = "AUTHORIZED";
        }

        const holdReason =
          holdReasons.length > 0 ? holdReasons.join("; ") : undefined;

        let orderId: string | undefined;
        let authorizationId: string | undefined;

        // 7. If ALLOW: Execute PayPal Orders v2 with intent: AUTHORIZE
        if (status === "AUTHORIZED") {
          const mandate = await GatewayRepository.getMandate(req.mandateId);
          const vaultId =
            process.env.PAYPAL_VAULT_ID ||
            (mandate ? `vault_${mandate.userId}` : "vault_sandbox_token");
          const idempotencyKey = randomUUID();
          const paypalOrder = await paypalClient.createAuthorizeOrder({
            vaultId,
            merchantPayeeEmail: `${req.cart.merchantId}@sandbox.paypal.com`,
            amount: {
              currency: req.cart.currency,
              total: req.cart.total,
              breakdown: { itemTotal: req.cart.total },
            },
            customId: decisionId,
            idempotencyKey,
            items: req.cart.items.map((item) => ({
              name: item.name,
              unitAmount: item.unitAmount,
              quantity: item.qty,
              sku:
                item.sku ||
                `SKU-${item.name.replace(/\s+/g, "-").toUpperCase()}`,
              category: item.category,
            })),
          });

          orderId = paypalOrder.id;
          authorizationId =
            paypalOrder.authorizationId ||
            `auth_${randomUUID().substring(0, 8)}`;

          await GatewayRepository.appendLedgerEvent(
            LEDGER_EVENT_KINDS.PAYPAL_AUTH_HELD,
            authorizationId,
            {
              orderId,
              authorizationId,
              amount: req.cart.total,
              currency: req.cart.currency,
              intent: "AUTHORIZE",
            },
          );
        }

        const durationMs = Date.now() - startTime;
        const trace: DecisionTrace = {
          decisionId,
          mandateId: req.mandateId,
          cartId: req.cart.id,
          verdict,
          reasons: [
            ...policyResult.triggeredRules.map((r) => ({
              layer: "policy" as const,
              verdict: r.action,
              code: r.id,
              message: r.description,
            })),
            {
              layer: "provenance" as const,
              verdict: provenanceResult.verdict,
              code: provenanceResult.code,
              message: provenanceResult.message,
            },
            {
              layer: "intent" as const,
              verdict: calibratedIntent.decision,
              code: calibratedIntent.actionCode,
              message: judgeVerdict.reason,
            },
          ],
          riskScore:
            verdict === "BLOCK"
              ? 95
              : verdict === "HOLD"
                ? Math.max(55, Math.round(judgeVerdict.score * 100))
                : Math.max(12, Math.round(judgeVerdict.score * 100)),
          durationMs,
          timestamp: new Date().toISOString(),
        };

        // 8. Record final verdict to ledger and save transaction
        await GatewayRepository.appendLedgerEvent(
          LEDGER_EVENT_KINDS.DECISION_VERDICT,
          decisionId,
          {
            verdict,
            status,
            orderId,
            authorizationId,
            holdReason,
            durationMs,
          },
        );

        await GatewayRepository.saveTransaction({
          id: decisionId,
          mandateId: req.mandateId,
          merchantId: req.cart.merchantId,
          amount: req.cart.total,
          currency: req.cart.currency,
          verdict,
          status,
          paypalOrderId: orderId,
          paypalAuthId: authorizationId,
          holdReason,
        });

        return {
          status,
          orderId,
          authorizationId,
          holdReason,
          remainingBudget: budgetResult.remainingBudget,
          trace,
        };
      })(),
      2400,
    );
  } catch (error) {
    // Fail-Closed Fallback: Any unexpected exception or timeout must HOLD payment
    const durationMs = Date.now() - startTime;
    const isTimeout = String(error).includes("timed out");
    const errorCode = isTimeout
      ? "TIMEOUT_FAIL_CLOSED"
      : "FAIL_CLOSED_SYSTEM_ERROR";
    const errorMsg = isTimeout
      ? "Transaction processing timed out (> 2.4s). Placed on HOLD per Fail-Closed policy."
      : `System exception during firewall evaluation: ${error instanceof Error ? error.message : String(error)}`;

    const fallbackTrace: DecisionTrace = {
      decisionId,
      mandateId: req.mandateId,
      cartId: req.cart.id,
      verdict: "HOLD",
      reasons: [
        {
          layer: "mandate",
          verdict: "HOLD",
          code: errorCode,
          message: errorMsg,
        },
      ],
      riskScore: 65,
      durationMs,
      timestamp: new Date().toISOString(),
    };

    await GatewayRepository.appendLedgerEvent(
      LEDGER_EVENT_KINDS.DECISION_VERDICT,
      decisionId,
      {
        verdict: "HOLD",
        status: "HELD",
        errorCode,
        error: String(error),
        durationMs,
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
      status: "HELD",
      holdReason: errorMsg,
      trace: fallbackTrace,
    };
  }
}

/**
 * Creates and configures the Model Context Protocol (MCP) Server instance
 */
export function createMcpServer(): Server {
  const server = new Server(
    {
      name: "leash-payment-firewall",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "request_payment",
          description:
            "Authorize a payment order through the Leash 5-layer payment firewall. Funds are authorized (held) and never captured until fulfillment notice is confirmed.",
          inputSchema: {
            type: "object",
            properties: {
              mandateId: {
                type: "string",
                description: "ID of the pre-authorized spending mandate",
              },
              cart: {
                type: "object",
                description:
                  "Cart payload containing merchant, items, and total amount",
                properties: {
                  id: { type: "string" },
                  merchantId: { type: "string" },
                  total: { type: "string" },
                  currency: { type: "string" },
                  items: { type: "array" },
                },
                required: ["id", "merchantId", "total", "currency", "items"],
              },
              rationale: {
                type: "string",
                maxLength: 500,
                description:
                  "Agent rationale for the purchase (quarantined context, max 500 chars)",
              },
              signature: { type: "string" },
              timestamp: { type: "string" },
              nonce: { type: "string" },
            },
            required: [
              "mandateId",
              "cart",
              "rationale",
              "signature",
              "timestamp",
              "nonce",
            ],
          },
        },
        {
          name: "check_mandate_budget",
          description:
            "Check remaining budget and active status for an authorized spending mandate.",
          inputSchema: {
            type: "object",
            properties: {
              mandateId: {
                type: "string",
                description: "ID of the spending mandate to inspect",
              },
            },
            required: ["mandateId"],
          },
        },
        {
          name: "verify_ledger_integrity",
          description:
            "Verifies the cryptographic integrity of the SHA-256 hash-chained event ledger.",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
      ],
    };
  });

  server.setRequestHandler(
    CallToolRequestSchema,
    async (request): Promise<CallToolResult> => {
      const { name, arguments: args } = request.params;

      if (name === "request_payment") {
        try {
          const parsed = PaymentRequestSchema.parse(args);
          const result = await handleRequestPaymentTool(parsed);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (err) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  status: "HELD",
                  holdReason: `Schema validation error: ${err instanceof Error ? err.message : String(err)}`,
                }),
              },
            ],
            isError: true,
          };
        }
      }

      if (name === "check_mandate_budget") {
        const mandateId = (args as { mandateId?: string })?.mandateId || "";
        const mandate = getInMemoryMandate(mandateId);
        if (!mandate) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: `Mandate '${mandateId}' not found`,
                }),
              },
            ],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                id: mandate.id,
                maxAmount: mandate.maxAmount,
                spentAmount: mandate.spentAmount,
                remainingBudget: (
                  mandate.maxAmount - mandate.spentAmount
                ).toFixed(2),
                status: mandate.status,
                validUntil: mandate.validUntil.toISOString(),
              }),
            },
          ],
        };
      }

      if (name === "verify_ledger_integrity") {
        const rows = await GatewayRepository.getLedgerRows();
        const verification = verifyLedgerChain([...rows]);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                valid: verification.valid,
                totalEvents: rows.length,
                brokenSeq: verification.brokenSeq,
                reason: verification.reason,
              }),
            },
          ],
        };
      }

      throw new Error(`Unknown tool: ${name}`);
    },
  );

  return server;
}
