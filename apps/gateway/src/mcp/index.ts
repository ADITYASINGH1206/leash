import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import { PaymentRequestSchema, type PaymentRequest } from "@leash/mandates";
import {
  type DecisionTrace,
  LEDGER_EVENT_KINDS,
  verifyLedgerChain,
  logger,
} from "@leash/shared";
import { PolicyEngine } from "@leash/policy";
import { ProvenanceScanner } from "@leash/provenance";
import { PayPalClient } from "@leash/paypal";
import { getInMemoryMandate, seedInMemoryMandate } from "../db/budget-mutex.js";
import { GatewayRepository } from "../db/repository.js";
import { DecisionArbiter, type ArbiterOptions } from "../arbiter/index.js";
import { dispatchWebPushAlert } from "../push.js";

export interface MCPPaymentResult {
  status: "AUTHORIZED" | "HELD" | "BLOCKED";
  orderId?: string;
  authorizationId?: string;
  holdReason?: string;
  remainingBudget?: string;
  trace: DecisionTrace;
}

export const policyEngine = new PolicyEngine();
export const provenanceScanner = new ProvenanceScanner();
export const decisionArbiter = new DecisionArbiter(policyEngine, provenanceScanner);
export const paypalClient = new PayPalClient({
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
    itemTerms: [
      "case",
      "cable",
      "charger",
      "tee",
      "hoodie",
      "coffee",
      "beans",
    ],
  },
});

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
  options?: ArbiterOptions,
): Promise<MCPPaymentResult> {
  const decision = await decisionArbiter.evaluate(req, options);

  // If ALLOW: Execute PayPal Orders v2 with intent: AUTHORIZE (Architectural Invariant 1)
  if (decision.status === "AUTHORIZED") {
    try {
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
        customId: decision.decisionId,
        idempotencyKey,
        items: req.cart.items.map((item) => ({
          name: item.name,
          unitAmount: item.unitAmount,
          quantity: item.qty,
          sku:
            item.sku || `SKU-${item.name.replace(/\s+/g, "-").toUpperCase()}`,
          category: item.category,
        })),
      });

      const orderId = paypalOrder.id;
      // Never invent an authorization id: if PayPal did not return one, the
      // catch block below holds the payment for the human (fail closed).
      if (!paypalOrder.authorizationId) {
        throw new Error(
          `PayPal order ${orderId} returned status ${paypalOrder.status} without an authorization`,
        );
      }
      const authorizationId = paypalOrder.authorizationId;

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

      await GatewayRepository.saveTransaction({
        id: decision.decisionId,
        mandateId: req.mandateId,
        merchantId: req.cart.merchantId,
        amount: req.cart.total,
        currency: req.cart.currency,
        verdict: "ALLOW",
        status: "AUTHORIZED",
        paypalOrderId: orderId,
        paypalAuthId: authorizationId,
      });

      return {
        status: "AUTHORIZED",
        orderId,
        authorizationId,
        remainingBudget: decision.remainingBudget,
        trace: decision.trace,
      };
    } catch (err) {
      // Downstream failure in PayPal authorization must fail-closed to HELD
      logger.error("PayPal authorization order execution failed", {
        error: String(err),
      });
      const holdReason = `PayPal authorization failed: ${err instanceof Error ? err.message : String(err)}`;

      await GatewayRepository.saveTransaction({
        id: decision.decisionId,
        mandateId: req.mandateId,
        merchantId: req.cart.merchantId,
        amount: req.cart.total,
        currency: req.cart.currency,
        verdict: "HOLD",
        status: "HELD",
        holdReason,
      });

      return {
        status: "HELD",
        holdReason,
        remainingBudget: decision.remainingBudget,
        trace: {
          ...decision.trace,
          verdict: "HOLD",
          reasons: [
            ...decision.trace.reasons,
            {
              layer: "mandate",
              verdict: "HOLD",
              code: "PAYPAL_AUTH_FAILED",
              message: holdReason,
            },
          ],
        },
      };
    }
  }

  if (decision.status === "HELD") {
    dispatchWebPushAlert({
      title: "Payment Approval Required (HELD)",
      body: `Agent request for $${req.cart.total} at ${req.cart.merchantId} is held: ${decision.holdReason || "Step-up confirmation required"}`,
      data: {
        transactionId: decision.decisionId,
        amount: req.cart.total,
        merchantId: req.cart.merchantId,
        reason: decision.holdReason,
        url: `/approvals?id=${decision.decisionId}`,
      },
    });
  }

  return {
    status: decision.status,
    holdReason: decision.holdReason,
    remainingBudget: decision.remainingBudget,
    trace: decision.trace,
  };
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
                  error:
                    err instanceof Error
                      ? err.message
                      : "Failed to parse PaymentRequest payload",
                  holdReason:
                    "Validation error: PaymentRequest payload does not match schema",
                }),
              },
            ],
            isError: true,
          };
        }
      }

      if (name === "check_mandate_budget") {
        const { mandateId } = (args ?? {}) as { mandateId?: string };
        if (!mandateId) {
          return {
            content: [{ type: "text", text: "Missing required mandateId" }],
            isError: true,
          };
        }

        const mandate = getInMemoryMandate(mandateId);
        if (!mandate) {
          return {
            content: [
              { type: "text", text: `Mandate '${mandateId}' not found` },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  id: mandate.id,
                  maxAmount: mandate.maxAmount,
                  spentAmount: mandate.spentAmount,
                  remainingBudget: (
                    mandate.maxAmount - mandate.spentAmount
                  ).toFixed(2),
                  status: mandate.status,
                  validUntil: mandate.validUntil.toISOString(),
                },
                null,
                2,
              ),
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
              text: JSON.stringify(
                {
                  valid: verification.valid,
                  totalEvents: rows.length,
                  brokenSeq: verification.brokenSeq,
                  reason: verification.reason,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `Tool '${name}' not implemented`,
          },
        ],
        isError: true,
      };
    },
  );

  return server;
}
