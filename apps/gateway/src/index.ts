import Fastify from "fastify";
import { config } from "./config.js";
import { logger } from "@leash/shared";
import { handleRequestPaymentTool, createMcpServer } from "./mcp/index.js";
import { PaymentRequestSchema } from "@leash/mandates";
import { GatewayRepository } from "./db/repository.js";
import { verifyLedgerChain, LEDGER_EVENT_KINDS } from "@leash/shared";
import { seedInMemoryMandate, getInMemoryMandate, releaseReservedBudget } from "./db/budget-mutex.js";
import { closeDb } from "./db/connection.js";
import { jobRunner } from "./jobs/index.js";

export * from "./arbiter/index.js";
export * from "./jobs/index.js";
export * from "./db/budget-mutex.js";
export * from "./db/repository.js";

export async function createServer() {
  const app = Fastify({ logger: false });
  const mcpServer = createMcpServer();

  app.addHook("onClose", async () => {
    await jobRunner.stop();
    await mcpServer.close();
    await closeDb();
  });

  // Basic Health Endpoint
  app.get("/health", async () => {
    const rows = await GatewayRepository.getLedgerRows();
    return {
      status: "ok",
      service: "leash-gateway",
      ledgerHeight: rows.length,
      timestamp: new Date().toISOString(),
    };
  });

  // REST API: Payment Request
  app.post("/api/v1/payment/request", async (req, reply) => {
    try {
      const parsed = PaymentRequestSchema.parse(req.body);
      const result = await handleRequestPaymentTool(parsed);
      return result;
    } catch (err) {
      reply.status(400);
      return {
        error: "Invalid payment request",
        details: err instanceof Error ? err.message : String(err),
      };
    }
  });

  // REST API: Get Full Ledger Chain
  app.get("/api/v1/ledger", async () => {
    const rows = await GatewayRepository.getLedgerRows();
    return {
      total: rows.length,
      chain: rows,
    };
  });

  // REST API: Cryptographic Ledger Chain Verification
  app.get("/api/v1/ledger/verify", async () => {
    const rows = await GatewayRepository.getLedgerRows();
    const result = verifyLedgerChain([...rows]);
    return {
      valid: result.valid,
      totalEvents: rows.length,
      brokenSeq: result.brokenSeq,
      reason: result.reason,
    };
  });

  // REST API: Create / Seed Spending Mandate
  app.post("/api/v1/mandates", async (req, reply) => {
    const body = req.body as {
      id?: string;
      maxAmount: number;
      intentText?: string;
      validUntil?: string;
    };
    if (!body || typeof body.maxAmount !== "number" || body.maxAmount <= 0) {
      reply.status(400);
      return {
        error: "Invalid mandate payload: maxAmount must be a positive number",
      };
    }

    const mandateId =
      body.id || `mdt_${Math.random().toString(36).substring(2, 10)}`;
    const validUntil = body.validUntil
      ? new Date(body.validUntil)
      : new Date(Date.now() + 7 * 86400000);

    seedInMemoryMandate({
      id: mandateId,
      maxAmount: body.maxAmount,
      spentAmount: 0,
      validUntil,
    });

    await GatewayRepository.appendLedgerEvent(
      LEDGER_EVENT_KINDS.MANDATE_SIGNED,
      mandateId,
      {
        mandateId,
        maxAmount: body.maxAmount,
        intentText: body.intentText || "Authorized spending mandate",
        validUntil: validUntil.toISOString(),
      },
    );

    return {
      id: mandateId,
      maxAmount: body.maxAmount,
      spentAmount: 0,
      status: "ACTIVE",
      validUntil: validUntil.toISOString(),
    };
  });

  // REST API: Get Mandate Details
  app.get("/api/v1/mandates/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const mandate = getInMemoryMandate(id);
    if (!mandate) {
      reply.status(404);
      return { error: `Mandate '${id}' not found` };
    }
    return {
      id: mandate.id,
      maxAmount: mandate.maxAmount,
      spentAmount: mandate.spentAmount,
      remainingBudget: (mandate.maxAmount - mandate.spentAmount).toFixed(2),
      status: mandate.status,
      validUntil: mandate.validUntil.toISOString(),
    };
  });

  // REST API: Human Action (Approve / Deny) for Held Transactions
  app.post("/api/v1/transactions/:id/action", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { action: "APPROVE" | "DENY"; reason?: string };

    if (!body || (body.action !== "APPROVE" && body.action !== "DENY")) {
      reply.status(400);
      return { error: "Action must be 'APPROVE' or 'DENY'" };
    }

    const tx = await GatewayRepository.getTransaction(id);
    if (!tx) {
      reply.status(404);
      return { error: `Transaction '${id}' not found` };
    }

    const eventKind =
      body.action === "APPROVE"
        ? LEDGER_EVENT_KINDS.USER_APPROVAL
        : LEDGER_EVENT_KINDS.USER_DENIAL;


    if (body.action === "DENY" && tx.mandateId) {
      await releaseReservedBudget(tx.mandateId, Number(tx.amount));
    }

    await GatewayRepository.appendLedgerEvent(eventKind, id, {
      transactionId: id,
      action: body.action,
      reason: body.reason,
      timestamp: new Date().toISOString(),
    });

    const newStatus = body.action === "APPROVE" ? "AUTHORIZED" : "BLOCKED";
    await GatewayRepository.saveTransaction({
      id: tx.id,
      mandateId: tx.mandateId,
      merchantId: tx.merchantId,
      amount: String(tx.amount),
      currency: tx.currency,
      verdict: body.action === "APPROVE" ? "ALLOW" : "BLOCK",
      status: newStatus,
      paypalOrderId: tx.paypalOrderId ?? undefined,
      paypalAuthId: tx.paypalAuthId ?? undefined,
      holdReason:
        body.reason ??
        (body.action === "DENY" ? "Manually denied by user" : undefined),
    });

    return {
      id: tx.id,
      action: body.action,
      status: newStatus,
    };
  });

  // Background Jobs: Status Endpoint
  app.get("/api/v1/jobs/status", async () => {
    return jobRunner.getStatus();
  });

  // Background Jobs: Manual / Webhook Auto-Void Trigger
  app.post("/api/v1/jobs/autovoid/trigger", async (req) => {
    const body = (req.body as { olderThanMs?: number }) || {};
    return jobRunner.runAutoVoidNow(body);
  });

  // Background Jobs: Manual / Scheduled Reconciliation Trigger
  app.post("/api/v1/jobs/reconcile/trigger", async (req) => {
    const body = (req.body as { limit?: number }) || {};
    return jobRunner.runReconciliationNow(body);
  });

  // MCP JSON-RPC 2.0 Dispatch Endpoint
  app.post("/mcp", async (req, reply) => {
    const rpcReq = req.body as {
      jsonrpc: string;
      id: string | number;
      method: string;
      params?: Record<string, unknown>;
    };

    if (!rpcReq || rpcReq.jsonrpc !== "2.0") {
      reply.status(400);
      return {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32600,
          message: "Invalid Request: jsonrpc must be 2.0",
        },
      };
    }

    if (rpcReq.method === "tools/list") {
      return {
        jsonrpc: "2.0",
        id: rpcReq.id,
        result: {
          tools: [
            {
              name: "request_payment",
              description:
                "Authorize a payment through the Leash 5-layer payment firewall.",
            },
            {
              name: "check_mandate_budget",
              description:
                "Check remaining budget and validity for an authorized mandate.",
            },
            {
              name: "verify_ledger_integrity",
              description:
                "Verifies the cryptographic integrity of the append-only event ledger.",
            },
          ],
        },
      };
    }

    if (rpcReq.method === "tools/call") {
      const toolName = (rpcReq.params as { name?: string })?.name;
      const toolArgs = (rpcReq.params as { arguments?: unknown })?.arguments;

      if (toolName === "request_payment") {
        try {
          const parsed = PaymentRequestSchema.parse(toolArgs);
          const result = await handleRequestPaymentTool(parsed);
          return {
            jsonrpc: "2.0",
            id: rpcReq.id,
            result: {
              content: [
                { type: "text", text: JSON.stringify(result, null, 2) },
              ],
            },
          };
        } catch (err) {
          return {
            jsonrpc: "2.0",
            id: rpcReq.id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    status: "HELD",
                    holdReason: `Validation failed: ${err instanceof Error ? err.message : String(err)}`,
                  }),
                },
              ],
              isError: true,
            },
          };
        }
      }

      if (toolName === "check_mandate_budget") {
        const mandateId = (toolArgs as { mandateId?: string })?.mandateId || "";
        const mandate = getInMemoryMandate(mandateId);
        if (!mandate) {
          return {
            jsonrpc: "2.0",
            id: rpcReq.id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    error: `Mandate '${mandateId}' not found`,
                  }),
                },
              ],
              isError: true,
            },
          };
        }
        return {
          jsonrpc: "2.0",
          id: rpcReq.id,
          result: {
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
                }),
              },
            ],
          },
        };
      }

      if (toolName === "verify_ledger_integrity") {
        const rows = await GatewayRepository.getLedgerRows();
        const verification = verifyLedgerChain([...rows]);
        return {
          jsonrpc: "2.0",
          id: rpcReq.id,
          result: {
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
          },
        };
      }
    }

    reply.status(404);
    return {
      jsonrpc: "2.0",
      id: rpcReq.id,
      error: { code: -32601, message: `Method '${rpcReq.method}' not found` },
    };
  });

  return app;
}

export {
  handleRequestPaymentTool,
  createMcpServer,
  type MCPPaymentResult,
} from "./mcp/index.js";

export {
  seedInMemoryMandate,
  getInMemoryMandate,
  type InMemoryMandateRecord,
} from "./db/budget-mutex.js";
if (process.env.NODE_ENV !== "test") {
  const app = await createServer();
  app.listen({ port: config.port, host: "0.0.0.0" }, (err, address) => {
    if (err) {
      logger.error("Gateway startup error", { error: String(err) });
      process.exit(1);
    }
    logger.info(`Leash Gateway running on ${address}`);
  });
}
