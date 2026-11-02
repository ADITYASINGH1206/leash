import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import { logger } from "@leash/shared";
import { handleRequestPaymentTool, createMcpServer, paypalClient } from "./mcp/index.js";
import { PaymentRequestSchema } from "@leash/mandates";
import { GatewayRepository } from "./db/repository.js";
import { verifyLedgerChain, LEDGER_EVENT_KINDS } from "@leash/shared";
import { seedInMemoryMandate, getInMemoryMandate, releaseReservedBudget } from "./db/budget-mutex.js";
import { closeDb } from "./db/connection.js";
import { jobRunner } from "./jobs/index.js";
import type { TransactionRow } from "./db/schema.js";
import {
  getMerchantByMerchantId,
  verifyFulfilmentNotice,
  type SignedFulfilmentNotice,
} from "@leash/stores";

export const registeredDeviceKeys = new Set<string>();

export function registerDevicePublicKey(publicKey: string): void {
  registeredDeviceKeys.add(publicKey);
}

export function isDeviceKeyRegistered(publicKey: string): boolean {
  return registeredDeviceKeys.has(publicKey);
}

import {
  registerPushSubscription,
  listPushSubscriptions,
  dispatchWebPushAlert,
  verifyStepUpSignature,
  VAPID_PUBLIC_KEY,
  type PushSubscriptionRecord,
} from "./push.js";

export * from "./arbiter/index.js";
export * from "./jobs/index.js";
export * from "./db/budget-mutex.js";
export * from "./db/repository.js";
export * from "./push.js";

export async function createServer() {
  const app = Fastify({ logger: false });
  const mcpServer = createMcpServer();

  // CORS: the console and approvals PWA run on a different origin than the
  // gateway, so browsers need explicit permission to read responses.
  // CORS_ORIGINS is a comma-separated allowlist ("*" allows any origin).
  const allowedOrigins = (
    process.env.CORS_ORIGINS || "http://localhost:3000,http://127.0.0.1:3000"
  )
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);
  app.addHook("onRequest", async (req, reply) => {
    const origin = req.headers.origin;
    if (!origin) return;
    const allowed =
      allowedOrigins.includes("*") || allowedOrigins.includes(origin);
    if (!allowed) return;
    reply.header("Access-Control-Allow-Origin", origin);
    reply.header("Vary", "Origin");
    reply.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type, Accept");
    reply.header("Access-Control-Max-Age", "600");
    if (req.method === "OPTIONS") {
      reply.status(204).send();
    }
  });
  app.options("/*", async (_req, reply) => {
    reply.status(204);
    return "";
  });

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
      // "mock" means PayPal ids are generated locally (no sandbox credentials)
      paypalMode: paypalClient.isMockMode() ? "mock" : "sandbox",
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
      playback?: string;
      validUntil?: string;
      constraints?: {
        maxTotal?: string;
        maxPerTxn?: string;
        currency?: string;
        categories?: string[];
        itemTerms?: string[];
      };
      // Optional device signature over `signedMandate` (canonical JSON, ES256 / P-256 SPKI key)
      signature?: string;
      publicKey?: string;
      signedMandate?: Record<string, unknown>;
    };
    if (!body || typeof body.maxAmount !== "number" || body.maxAmount <= 0) {
      reply.status(400);
      return {
        error: "Invalid mandate payload: maxAmount must be a positive number",
      };
    }
    if (body.id !== undefined && !/^mdt_[A-Za-z0-9_-]{3,64}$/.test(body.id)) {
      reply.status(400);
      return { error: "Mandate id must look like mdt_<letters, digits, _ or ->" };
    }

    // If the client signed the mandate, the signature must verify. A bad
    // signature is rejected outright rather than silently stored as unsigned.
    let signatureVerified = false;
    if (body.signature || body.publicKey) {
      if (!body.signature || !body.publicKey || !body.signedMandate) {
        reply.status(400);
        return {
          error: "A signed mandate needs signature, publicKey and signedMandate together",
        };
      }
      signatureVerified = await verifyStepUpSignature(
        body.publicKey,
        body.signature,
        body.signedMandate,
      );
      if (!signatureVerified) {
        reply.status(400);
        return { error: "Mandate signature did not verify (Fail-Closed)" };
      }
    }

    const mandateId =
      body.id || `mdt_${Math.random().toString(36).substring(2, 10)}`;
    const validUntil = body.validUntil
      ? new Date(body.validUntil)
      : new Date(Date.now() + 7 * 86400000);
    if (Number.isNaN(validUntil.getTime())) {
      reply.status(400);
      return { error: "validUntil must be an ISO-8601 date" };
    }

    const constraints = body.constraints
      ? {
          maxTotal: body.constraints.maxTotal ?? body.maxAmount.toFixed(2),
          maxPerTxn: body.constraints.maxPerTxn ?? body.maxAmount.toFixed(2),
          currency: body.constraints.currency ?? "USD",
          categories: (body.constraints.categories ?? []).map(String),
          itemTerms: (body.constraints.itemTerms ?? []).map(String),
        }
      : undefined;

    seedInMemoryMandate({
      id: mandateId,
      maxAmount: body.maxAmount,
      spentAmount: 0,
      validUntil,
      intentText: body.intentText,
      playback: body.playback,
      constraints,
    });

    await GatewayRepository.appendLedgerEvent(
      LEDGER_EVENT_KINDS.MANDATE_SIGNED,
      mandateId,
      {
        mandateId,
        maxAmount: body.maxAmount,
        intentText: body.intentText || "Authorized spending mandate",
        validUntil: validUntil.toISOString(),
        constraints,
        signatureVerified,
        publicKey: signatureVerified ? body.publicKey : undefined,
      },
    );

    return {
      id: mandateId,
      maxAmount: body.maxAmount,
      spentAmount: 0,
      status: "ACTIVE",
      validUntil: validUntil.toISOString(),
      signatureVerified,
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

  // REST API: Recent transactions (newest first) for the console's live feed
  app.get("/api/v1/transactions", async (req) => {
    const { limit } = req.query as { limit?: string };
    const max = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const all = await GatewayRepository.listTransactions();
    const sorted = [...all].sort(
      (a, b) =>
        new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
    );
    return { count: all.length, transactions: sorted.slice(0, max) };
  });

  // REST API: Get All Held Transactions (for Approvals PWA)
  app.get("/api/v1/transactions/held", async () => {
    const held = await GatewayRepository.listTransactions({ status: "HELD" });
    return {
      count: held.length,
      transactions: held,
    };
  });

  // REST API: Get Single Transaction
  app.get("/api/v1/transactions/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const tx = await GatewayRepository.getTransaction(id);
    if (!tx) {
      reply.status(404);
      return { error: `Transaction '${id}' not found` };
    }
    return tx;
  });

  // REST API: Web Push VAPID Public Key
  app.get("/api/v1/push/public-key", async () => {
    return { publicKey: VAPID_PUBLIC_KEY };
  });

  // REST API: Register Push Subscription
  app.post("/api/v1/push/subscribe", async (req) => {
    const sub = req.body as PushSubscriptionRecord;
    const total = registerPushSubscription(sub);
    return { success: true, totalSubscribers: total };
  });

  // REST API: Broadcast Push Alert
  app.post("/api/v1/push/send", async (req) => {
    const payload = req.body as { title: string; body: string; data?: Record<string, unknown> };
    return dispatchWebPushAlert(payload);
  });

  // REST API: List Push Subscriptions
  app.get("/api/v1/push/subscriptions", async () => {
    const subs = listPushSubscriptions();
    return { count: subs.length, subscriptions: subs };
  });

  // REST API: Register Device Public Key for Pinning
  app.post("/api/v1/devices/register", async (req, reply) => {
    const { publicKey, deviceName } = (req.body || {}) as {
      publicKey?: string;
      deviceName?: string;
    };
    if (!publicKey) {
      reply.status(400);
      return { error: "Missing 'publicKey' in request body" };
    }
    registerDevicePublicKey(publicKey);
    return {
      success: true,
      registered: true,
      deviceName: deviceName || "Unknown Device",
      totalDevices: registeredDeviceKeys.size,
    };
  });

  // REST API: AI-Powered Mandate Compiler with rule-based fallback
  app.post("/api/v1/mandates/compile", async (req, reply) => {
    const { prompt } = (req.body || {}) as { prompt?: string };
    if (!prompt) {
      reply.status(400);
      return { error: "Missing 'prompt' in request body" };
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
      try {
        const systemPrompt = `You are a financial mandate compiler for autonomous AI shopping agents.
Extract spending constraints from user requests into JSON matching:
{
  "maxAmount": number (total spending limit),
  "maxPerTxn": number (per-transaction cap <= maxAmount),
  "categories": string[] (allowed categories e.g. ["phone_accessories", "cables", "groceries", "electronics"]),
  "itemTerms": string[] (specific keywords),
  "days": number (expiry in days, default 7),
  "playback": string (plain-language summary),
  "warnings": string[] (any ambiguity notes)
}
Return ONLY valid JSON.`;

        const userPrompt = `Compile spending mandate from: "${prompt}"`;
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: systemPrompt }] },
              contents: [{ role: "user", parts: [{ text: userPrompt }] }],
              generationConfig: {
                response_mime_type: "application/json",
                temperature: 0.1,
              },
            }),
          },
        );

        if (res.ok) {
          const data = (await res.json()) as any;
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
            const parsed = JSON.parse(cleaned);
            const validUntil = new Date(
              Date.now() + (parsed.days || 7) * 86400_000,
            ).toISOString();
            return {
              ...parsed,
              validUntil,
              aiCompiled: true,
            };
          }
        }
      } catch (err) {
        logger.warn(
          "Gemini mandate compilation error, falling back to rule engine",
          {
            error: String(err),
          },
        );
      }
    }

    return {
      maxAmount: 50,
      maxPerTxn: 25,
      categories: ["phone_accessories", "cables"],
      itemTerms: [],
      days: 7,
      validUntil: new Date(Date.now() + 7 * 86400_000).toISOString(),
      playback: "At most $50.00 in total and $25.00 per purchase; until 7 days.",
      warnings: ["Rule-based fallback compiler used."],
      aiCompiled: false,
    };
  });

  // REST API: Human Action (Approve / Deny) for Held Transactions with Step-Up Re-Signing Flow
  app.post("/api/v1/transactions/:id/action", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      action: "APPROVE" | "DENY";
      reason?: string;
      signature?: string;
      publicKey?: string;
      signedPayload?: unknown;
    };

    if (!body || (body.action !== "APPROVE" && body.action !== "DENY")) {
      reply.status(400);
      return { error: "Action must be 'APPROVE' or 'DENY'" };
    }

    const tx = await GatewayRepository.getTransaction(id);
    if (!tx) {
      reply.status(404);
      return { error: `Transaction '${id}' not found` };
    }

    // Only payments that are actually waiting for a human can be decided by a
    // human. Without this check a BLOCKED (e.g. prompt-injected) payment could
    // be "approved" straight into a PayPal authorization.
    if (tx.status !== "HELD") {
      reply.status(409);
      return {
        error: `Transaction '${id}' is ${tx.status}; only HELD transactions accept APPROVE or DENY`,
      };
    }

    // Step-up re-signing (Invariant 4 & Fail-Closed Invariant 2).
    // The payload is rebuilt from the stored transaction, never taken from the
    // client, so a signature always commits to the real amount and payee.
    if (body.action === "APPROVE") {
      if (!body.signature || !body.publicKey) {
        reply.status(401);
        return {
          error:
            "Approval requires a device signature (signature + publicKey). Fail-Closed: unsigned approvals are rejected.",
        };
      }
      const expectedPayload = {
        transactionId: id,
        mandateId: tx.mandateId,
        approvedAmount: Number(tx.amount).toFixed(2),
        currency: tx.currency,
        action: "APPROVE",
      };
      // The device may add a nonce and timestamp to what it signs, but every
      // field that decides where money goes must equal the stored transaction.
      let payloadToVerify: Record<string, unknown> = expectedPayload;
      if (body.signedPayload !== undefined) {
        const sp = body.signedPayload as Record<string, unknown>;
        const bindsToTx =
          sp !== null &&
          typeof sp === "object" &&
          sp.transactionId === expectedPayload.transactionId &&
          sp.mandateId === expectedPayload.mandateId &&
          Number(sp.approvedAmount).toFixed(2) === expectedPayload.approvedAmount &&
          sp.currency === expectedPayload.currency &&
          sp.action === "APPROVE";
        const ts = typeof sp?.timestamp === "string" ? Date.parse(sp.timestamp) : NaN;
        const fresh =
          sp?.timestamp === undefined ||
          (Number.isFinite(ts) && Math.abs(Date.now() - ts) < 10 * 60 * 1000);
        if (!bindsToTx || !fresh) {
          reply.status(400);
          return {
            error: !bindsToTx
              ? "Signed payload does not match the held transaction (amount, currency or mandate differ). Fail-Closed: rejection required."
              : "Signed approval is older than 10 minutes. Fail-Closed: sign again.",
          };
        }
        payloadToVerify = sp;
      }
      const validSig = await verifyStepUpSignature(
        body.publicKey,
        body.signature,
        payloadToVerify,
      );
      if (!validSig) {
        reply.status(400);
        return {
          error:
            "Cryptographic WebCrypto signature verification failed (Fail-Closed principle: rejection required)",
        };
      }
    }

    const eventKind =
      body.action === "APPROVE"
        ? LEDGER_EVENT_KINDS.USER_APPROVAL
        : LEDGER_EVENT_KINDS.USER_DENIAL;

    let orderId = tx.paypalOrderId ?? undefined;
    let authId = tx.paypalAuthId ?? undefined;

    if (body.action === "APPROVE") {
      // Invariant 1: Authorize-Then-Capture (intent: AUTHORIZE only)
      if (!authId) {
        try {
          const mandate = tx.mandateId
            ? await GatewayRepository.getMandate(tx.mandateId)
            : null;
          const vaultId =
            process.env.PAYPAL_VAULT_ID ||
            (mandate ? `vault_${mandate.userId}` : "vault_sandbox_token");
          const idempotencyKey = randomUUID();

          const merchant = await getMerchantByMerchantId(tx.merchantId);
          const merchantPayeeEmail = merchant?.payeeEmail || `${tx.merchantId}@sandbox.paypal.com`;

          const paypalOrder = await paypalClient.createAuthorizeOrder({
            vaultId,
            merchantPayeeEmail,
            merchantPayeeId: merchant?.payeeMerchantId,
            amount: {
              currency: tx.currency,
              total: String(tx.amount),
              breakdown: { itemTotal: String(tx.amount) },
            },
            customId: tx.id,
            idempotencyKey,
            items: [
              {
                name: `Approved Order for ${tx.merchantId}`,
                unitAmount: String(tx.amount),
                quantity: 1,
                sku: `SKU-${tx.id}`,
                category: "GENERAL",
              },
            ],
          });

          orderId = paypalOrder.id;
          if (!paypalOrder.authorizationId) {
            throw new Error(`Order ${paypalOrder.id} returned no authorization id`);
          }
          authId = paypalOrder.authorizationId;

          await GatewayRepository.appendLedgerEvent(
            LEDGER_EVENT_KINDS.PAYPAL_AUTH_HELD,
            authId,
            {
              orderId,
              authorizationId: authId,
              amount: String(tx.amount),
              currency: tx.currency,
              intent: "AUTHORIZE",
              source: "HUMAN_STEPUP_APPROVAL",
            }
          );
        } catch (err) {
          // Fail closed: never record an authorization PayPal did not issue.
          // The payment stays HELD so the user can retry the approval.
          logger.warn("PayPal authorization order creation during step-up approval failed", {
            error: String(err),
          });
          reply.status(502);
          return {
            id: tx.id,
            status: "HELD",
            error:
              "PayPal did not return an authorization. The payment is still held; retry the approval.",
          };
        }
      }
    } else if (body.action === "DENY" && tx.mandateId) {
      // Release locked budget in mutex upon denial
      await releaseReservedBudget(tx.mandateId, Number(tx.amount));
    }

    await GatewayRepository.appendLedgerEvent(eventKind, id, {
      transactionId: id,
      action: body.action,
      reason: body.reason,
      signature: body.signature,
      publicKey: body.publicKey,
      authorizationId: authId,
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
      paypalOrderId: orderId,
      paypalAuthId: authId,
      holdReason:
        body.reason ??
        (body.action === "DENY" ? "Manually denied by user" : undefined),
    });

    return {
      id: tx.id,
      action: body.action,
      status: newStatus,
      paypalOrderId: orderId,
      paypalAuthId: authId,
    };
  });

  // REST API: Merchant Fulfillment Notice Submission -> Capture Execution (Architectural Invariant 1)
  app.post("/api/v1/fulfillment/submit", async (req, reply) => {
    const body = req.body as {
      transactionId?: string;
      authorizationId?: string;
      merchantId: string;
      fulfillmentNotice: {
        trackingNumber: string;
        carrier: string;
        shippedItems: Array<{ sku: string; quantity: number }>;
        signature?: string;
      };
    };

    if (!body || (!body.transactionId && !body.authorizationId)) {
      reply.status(400);
      return { error: "Missing transactionId or authorizationId" };
    }

    let tx: TransactionRow | null = null;
    if (body.transactionId) {
      tx = await GatewayRepository.getTransaction(body.transactionId);
    }
    if (!tx && body.authorizationId) {
      const allTxs = await GatewayRepository.listTransactions();
      tx = allTxs.find((t) => t.paypalAuthId === body.authorizationId) || null;
    }

    if (!tx) {
      reply.status(404);
      return { error: "Transaction not found for fulfillment notice" };
    }

    if (tx.status !== "AUTHORIZED") {
      reply.status(400);
      return {
        error: `Cannot capture transaction in status '${tx.status}'. Must be 'AUTHORIZED'.`,
      };
    }

    const authId = tx.paypalAuthId;
    if (!authId) {
      reply.status(400);
      return { error: "Transaction has no PayPal authorization ID" };
    }

    // Re-verify authorization status against PayPal before executing capture
    try {
      const authDetails = await paypalClient.getAuthorization(authId);
      if (
        authDetails.status !== "CREATED" &&
        authDetails.status !== "PENDING" &&
        authDetails.status !== "CAPTURED"
      ) {
        reply.status(409);
        return {
          error: `PayPal authorization status is '${authDetails.status}', cannot be captured`,
        };
      }
    } catch (err) {
      logger.warn(
        "Could not query PayPal authorization state directly; proceeding to capture",
        {
          authId,
          error: String(err),
        },
      );
    }

    // Verify merchant cryptographic signature on fulfilment notice (if signed)
    if ((body.fulfillmentNotice as any)?.sig) {
      const verifyRes = await verifyFulfilmentNotice(
        body.fulfillmentNotice as unknown as SignedFulfilmentNotice,
      );
      if (!verifyRes.valid) {
        reply.status(401);
        return {
          error: `Invalid merchant fulfilment signature: ${verifyRes.error}`,
        };
      }
    }

    // Execute capture via PayPal client under Invariant 1
    const captureRes = await paypalClient.captureAuthorization(
      authId,
      tx.amount,
      tx.currency,
    );

    // Record cryptographic capture event in tamper-evident ledger
    await GatewayRepository.appendLedgerEvent(
      LEDGER_EVENT_KINDS.PAYPAL_CAPTURED,
      captureRes.id,
      {
        transactionId: tx.id,
        mandateId: tx.mandateId,
        orderId: tx.paypalOrderId,
        authorizationId: authId,
        captureId: captureRes.id,
        amount: tx.amount,
        currency: tx.currency,
        merchantId: body.merchantId,
        fulfillmentNotice: body.fulfillmentNotice,
        timestamp: new Date().toISOString(),
      },
    );

    // Update transaction to CAPTURED
    await GatewayRepository.saveTransaction({
      id: tx.id,
      mandateId: tx.mandateId,
      merchantId: tx.merchantId,
      amount: tx.amount,
      currency: tx.currency,
      verdict: "ALLOW",
      status: "CAPTURED",
      paypalOrderId: tx.paypalOrderId ?? undefined,
      paypalAuthId: authId,
      paypalCaptureId: captureRes.id,
    });

    return {
      status: "CAPTURED",
      transactionId: tx.id,
      authorizationId: authId,
      captureId: captureRes.id,
      amount: tx.amount,
      currency: tx.currency,
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
