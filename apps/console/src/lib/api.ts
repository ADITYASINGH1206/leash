/**
 * Gateway API client.
 *
 * Rule for this file: a failed call is reported as a failure. Earlier versions
 * returned `success: true` with invented PayPal ids when the gateway was down,
 * which made the console claim payments were approved when nothing happened.
 * Pages that want sample data when offline ask for it explicitly and label it.
 */
import sampleLedger from '../data/sample-ledger.json';
import sampleTransactions from '../data/sample-transactions.json';

function normaliseBaseUrl(raw: string | undefined): string {
  const value = (raw || 'http://localhost:4000').trim().replace(/\/$/, '');
  // Render's fromService "host" values arrive without a scheme
  return /^https?:\/\//.test(value) ? value : `https://${value}`;
}

export const GATEWAY_BASE_URL = normaliseBaseUrl(process.env.NEXT_PUBLIC_GATEWAY_URL);

/** True when the console is pointed at a gateway on this machine. */
export const IS_LOCAL_GATEWAY = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/.test(GATEWAY_BASE_URL);

/**
 * Why a gateway call failed.
 * - unreachable: the request never got an answer (down, asleep, wrong host, or blocked by CORS)
 * - timeout:     no answer in time
 * - not-leash:   something answered, but it is not a Leash gateway (wrong URL)
 * - http:        a Leash gateway answered with an error
 */
export type GatewayErrorKind = 'unreachable' | 'timeout' | 'not-leash' | 'http';

export class GatewayError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly kind: GatewayErrorKind = 'http',
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

const WRONG_URL_HINT =
  'Set NEXT_PUBLIC_GATEWAY_URL to the public URL of your own gateway service and rebuild the console (see docs/DEPLOYMENT.md).';

async function call<T>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init?.timeoutMs ?? 6000);
  let res: Response;
  try {
    res = await fetch(`${GATEWAY_BASE_URL}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (err) {
    throw controller.signal.aborted
      ? new GatewayError(`The gateway at ${GATEWAY_BASE_URL} did not answer in time.`, undefined, 'timeout')
      : new GatewayError(
          `Could not reach the gateway at ${GATEWAY_BASE_URL}. It may be down or asleep, or it may not list this site in CORS_ORIGINS.`,
          undefined,
          'unreachable',
        );
  } finally {
    clearTimeout(timer);
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; details?: string };
  if (!res.ok) {
    // A Leash gateway always explains an error in an `error` field. A bare 404 with no
    // such field means the host is answering but is not serving the Leash API.
    if (res.status === 404 && !data.error) {
      throw new GatewayError(
        `Gateway returned 404 for ${path}. ${GATEWAY_BASE_URL} is not serving the Leash API. ${WRONG_URL_HINT}`,
        404,
        'not-leash',
      );
    }
    throw new GatewayError(data.error || data.details || `Gateway returned ${res.status}`, res.status);
  }
  return data;
}

/* ------------------------------------------------------------------ types */

export type Verdict = 'ALLOW' | 'HOLD' | 'BLOCK';
export type TxStatus = 'AUTHORIZED' | 'HELD' | 'BLOCKED' | 'CAPTURED' | 'VOIDED' | 'REFUNDED';

export interface LedgerEventRow {
  seq: number;
  ts: string;
  kind: string;
  refId: string;
  payload: Record<string, unknown>;
  prevHash: string;
  hash: string;
}

export interface TransactionRecord {
  id: string;
  mandateId: string;
  merchantId: string;
  amount: string;
  currency: string;
  verdict: Verdict;
  status: TxStatus;
  paypalOrderId?: string | null;
  paypalAuthId?: string | null;
  paypalCaptureId?: string | null;
  holdReason?: string | null;
  createdAt?: string;
}

export interface DecisionReason {
  layer: 'mandate' | 'policy' | 'provenance' | 'intent' | 'risk';
  verdict: Verdict;
  code: string;
  message: string;
}

export interface PaymentResult {
  status: 'AUTHORIZED' | 'HELD' | 'BLOCKED';
  orderId?: string;
  authorizationId?: string;
  holdReason?: string;
  remainingBudget?: string;
  trace?: {
    decisionId: string;
    verdict: Verdict;
    reasons: DecisionReason[];
    riskScore?: number;
    durationMs?: number;
  };
}

export interface CartItemInput {
  sku: string;
  name: string;
  category: string;
  qty: number;
  unitAmount: string;
}

export interface PaymentRequestInput {
  mandateId: string;
  cart: {
    id: string;
    merchantId: string;
    items: CartItemInput[];
    shipping: string;
    total: string;
    currency: string;
    expiresAt: string;
  };
  rationale: string;
  evidence: Array<{ url: string; contentHash?: string }>;
  idempotencyKey: string;
}

export interface MandateInput {
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
  signature?: string;
  publicKey?: string;
  signedMandate?: Record<string, unknown>;
}

/* --------------------------------------------------------------- endpoints */

export interface GatewayHealth {
  paypalMode?: "mock" | "sandbox";
  /** "memory" means state is not durable (demo mode) */
  storage?: "memory" | "postgres";
  status: string;
  service: string;
  ledgerHeight: number;
  timestamp: string;
}

/** True when a /health body identifies a Leash gateway. */
export function isLeashHealth(body: unknown): body is GatewayHealth {
  return typeof body === 'object' && body !== null && (body as { service?: unknown }).service === 'leash-gateway';
}

export const gateway = {
  health: async () => {
    const h = await call<GatewayHealth>('/health', { timeoutMs: 2500 });
    // Any service can answer GET /health with JSON; only a Leash gateway says who it is.
    if (!isLeashHealth(h)) {
      throw new GatewayError(
        `${GATEWAY_BASE_URL} answered /health, but it is not a Leash gateway (it returned ${JSON.stringify(h).slice(0, 80)}). ${WRONG_URL_HINT}`,
        undefined,
        'not-leash',
      );
    }
    return h;
  },
  ledger: async () => (await call<{ total: number; chain: LedgerEventRow[] }>('/api/v1/ledger')).chain,
  verifyLedger: () =>
    call<{ valid: boolean; totalEvents: number; brokenSeq?: number; reason?: string }>(
      '/api/v1/ledger/verify',
    ),
  transactions: async () =>
    (await call<{ transactions: TransactionRecord[] }>('/api/v1/transactions?limit=100')).transactions,
  heldTransactions: async () =>
    (await call<{ transactions: TransactionRecord[] }>('/api/v1/transactions/held')).transactions,
  transaction: (id: string) => call<TransactionRecord>(`/api/v1/transactions/${encodeURIComponent(id)}`),
  createMandate: (body: MandateInput) =>
    call<{ id: string; maxAmount: number; status: string; validUntil: string; signatureVerified: boolean }>(
      '/api/v1/mandates',
      { method: 'POST', body: JSON.stringify(body) },
    ),
  mandate: (id: string) =>
    call<{ id: string; maxAmount: number; spentAmount: number; remainingBudget: string; status: string; validUntil: string }>(
      `/api/v1/mandates/${encodeURIComponent(id)}`,
    ),
  requestPayment: (body: PaymentRequestInput) =>
    call<PaymentResult>('/api/v1/payment/request', { method: 'POST', body: JSON.stringify(body), timeoutMs: 10000 }),
  approve: (
    id: string,
    signed: { signature: string; publicKey: string; signedPayload: unknown },
    reason?: string,
  ) =>
    call<{ id: string; status: TxStatus; paypalOrderId?: string; paypalAuthId?: string }>(
      `/api/v1/transactions/${encodeURIComponent(id)}/action`,
      { method: 'POST', body: JSON.stringify({ action: 'APPROVE', reason, ...signed }), timeoutMs: 10000 },
    ),
  deny: (id: string, reason?: string) =>
    call<{ id: string; status: TxStatus }>(`/api/v1/transactions/${encodeURIComponent(id)}/action`, {
      method: 'POST',
      body: JSON.stringify({ action: 'DENY', reason }),
    }),
  fulfil: (body: {
    transactionId?: string;
    authorizationId?: string;
    merchantId: string;
    fulfillmentNotice: {
      trackingNumber: string;
      carrier: string;
      shippedItems: Array<{ sku: string; quantity: number }>;
      signature?: string;
    };
  }) =>
    call<{ status: 'CAPTURED'; transactionId: string; authorizationId: string; captureId: string; amount: string }>(
      '/api/v1/fulfillment/submit',
      { method: 'POST', body: JSON.stringify(body), timeoutMs: 10000 },
    ),
};

/* ------------------------------------------------------------ sample data */

/**
 * A real ledger recorded from the gateway running the judge walkthrough
 * (see scripts/record-sample.mjs). Used only when the gateway is offline, and
 * always shown with an "offline sample" label.
 */
export function getFallbackLedgerFixture(): LedgerEventRow[] {
  return sampleLedger as LedgerEventRow[];
}

export function getSampleTransactions(): TransactionRecord[] {
  return sampleTransactions as TransactionRecord[];
}

/* ------------------------------------------------------ derived decisions */

export interface DecisionView {
  id: string;
  mandateId: string;
  merchantId: string;
  amount: string;
  currency: string;
  status: TxStatus;
  verdict: Verdict;
  reason?: string;
  ts: string;
  layers: Partial<Record<DecisionReason['layer'], { verdict: Verdict; code?: string; message?: string; durationMs?: number }>>;
  riskScore?: number;
  paypalAuthId?: string | null;
  paypalCaptureId?: string | null;
}

const LAYER_EVENT: Record<string, DecisionReason['layer']> = {
  LAYER_POLICY_EVALUATED: 'policy',
  LAYER_PROVENANCE_SCANNED: 'provenance',
  LAYER_INTENT_EVALUATED: 'intent',
  LAYER_RISK_SCORED: 'risk',
};

function asVerdict(v: unknown): Verdict {
  return v === 'BLOCK' || v === 'HOLD' ? v : 'ALLOW';
}

/**
 * Joins ledger events (per-layer results) with transaction rows (current
 * status) into one record per decision, newest first.
 */
export function buildDecisions(rows: LedgerEventRow[], txs: TransactionRecord[]): DecisionView[] {
  const byId = new Map<string, DecisionView>();
  const txById = new Map(txs.map((t) => [t.id, t]));

  for (const row of rows) {
    const p = row.payload ?? {};
    if (row.kind === 'PAYMENT_REQUESTED' && typeof p.decisionId === 'string') {
      byId.set(p.decisionId, {
        id: p.decisionId,
        mandateId: row.refId,
        merchantId: String(p.merchantId ?? ''),
        amount: String(p.total ?? '0.00'),
        currency: String(p.currency ?? 'USD'),
        status: 'HELD',
        verdict: 'HOLD',
        ts: row.ts,
        layers: { mandate: { verdict: 'ALLOW', code: 'MANDATE_OK' } },
      });
      continue;
    }
    const d = byId.get(row.refId);
    if (!d) continue;
    const layer = LAYER_EVENT[row.kind];
    if (layer) {
      d.layers[layer] = {
        verdict: asVerdict(p.verdict),
        code: typeof p.code === 'string' ? p.code : undefined,
        message:
          typeof p.message === 'string'
            ? p.message
            : Array.isArray(p.triggeredRules) && p.triggeredRules.length
              ? (p.triggeredRules as Array<{ id?: string; description?: string }>)
                  .map((r) => r.description || r.id)
                  .join('; ')
              : undefined,
        durationMs: typeof p.durationMs === 'number' ? p.durationMs : undefined,
      };
      if (layer === 'risk' && typeof p.score === 'number') d.riskScore = p.score;
      if (layer === 'risk' && typeof p.riskScore === 'number') d.riskScore = p.riskScore;
    }
    if (row.kind === 'DECISION_VERDICT') {
      d.verdict = asVerdict(p.verdict);
      d.status = (p.status as TxStatus) || d.status;
      d.reason = (p.holdReason as string) || (p.reason as string) || d.reason;
      if (d.verdict === 'BLOCK' && !d.layers.policy && !d.layers.provenance) {
        d.layers.mandate = { verdict: 'BLOCK', message: d.reason };
      }
    }
  }

  for (const d of byId.values()) {
    const tx = txById.get(d.id);
    if (tx) {
      d.status = tx.status;
      d.paypalAuthId = tx.paypalAuthId;
      d.paypalCaptureId = tx.paypalCaptureId;
      if (tx.holdReason) d.reason = tx.holdReason;
    }
  }

  return [...byId.values()].sort((a, b) => b.ts.localeCompare(a.ts));
}
