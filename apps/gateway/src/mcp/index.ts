import { randomUUID } from 'node:crypto';
import type { PaymentRequest } from '@leash/mandates';
import {
  type DecisionTrace,
  type DecisionVerdict,
  type LedgerRow,
  computeLedgerHash
} from '@leash/shared';
import { PolicyEngine } from '@leash/policy';

export interface MCPPaymentResult {
  status: 'AUTHORIZED' | 'HELD' | 'BLOCKED';
  orderId?: string;
  holdReason?: string;
  trace: DecisionTrace;
}

const policyEngine = new PolicyEngine();

// In-memory genesis hash chain for gateway events
let lastLedgerHash = '0'.repeat(64);
let ledgerSeq = 1;
const inMemoryLedger: LedgerRow[] = [];

export function getInMemoryLedger(): readonly LedgerRow[] {
  return inMemoryLedger;
}

function recordLedgerEvent(kind: LedgerRow['kind'], refId: string, payload: unknown): LedgerRow {
  const hash = computeLedgerHash(lastLedgerHash, payload);
  const row: LedgerRow = {
    seq: ledgerSeq++,
    ts: new Date().toISOString(),
    kind,
    refId,
    payload,
    prevHash: lastLedgerHash,
    hash
  };
  lastLedgerHash = hash;
  inMemoryLedger.push(row);
  return row;
}

/**
 * MCP Server Tool: request_payment
 * Enforces Fail-Closed Principle: defaults to HOLD on any unexpected error or unverified condition.
 */
export async function handleRequestPaymentTool(req: PaymentRequest): Promise<MCPPaymentResult> {
  const decisionId = `dec_${randomUUID()}`;
  const startTime = Date.now();

  try {
    // Record initial request to ledger
    recordLedgerEvent('PAYMENT_REQUESTED', req.mandateId, {
      decisionId,
      cartId: req.cart.id,
      total: req.cart.total,
      currency: req.cart.currency
    });

    // Evaluate Layer 1: Policy Engine
    const policyResult = policyEngine.evaluate({
      cart: {
        total: Number(req.cart.total),
        merchantId: req.cart.merchantId,
        items: req.cart.items.map(item => ({
          category: item.category,
          name: item.name,
          unitAmount: Number(item.unitAmount),
          qty: item.qty
        }))
      },
      agent: {
        knownMerchants: ['mer_known_store', 'mer_gadgethub'],
        txnsLastHour: 1
      },
      time: {
        hourLocal: new Date().getHours()
      }
    });

    // Strict Fail-Closed Verdict Resolution
    let verdict: DecisionVerdict = 'HOLD';
    let status: MCPPaymentResult['status'] = 'HELD';
    let holdReason: string | undefined = undefined;

    if (policyResult.verdict === 'BLOCK') {
      verdict = 'BLOCK';
      status = 'BLOCKED';
      holdReason = policyResult.triggeredRules.map(r => r.description).join('; ');
    } else if (policyResult.verdict === 'HOLD') {
      verdict = 'HOLD';
      status = 'HELD';
      holdReason = policyResult.triggeredRules.map(r => r.description).join('; ');
    } else {
      verdict = 'ALLOW';
      status = 'AUTHORIZED';
    }

    const durationMs = Date.now() - startTime;
    const trace: DecisionTrace = {
      decisionId,
      mandateId: req.mandateId,
      cartId: req.cart.id,
      verdict,
      reasons: policyResult.triggeredRules.map(r => ({
        layer: 'policy',
        verdict: r.action,
        code: r.id,
        message: r.description
      })),
      riskScore: verdict === 'BLOCK' ? 95 : verdict === 'HOLD' ? 55 : 12,
      durationMs,
      timestamp: new Date().toISOString()
    };

    const orderId = status === 'AUTHORIZED' ? `ord_sandbox_${randomUUID().substring(0, 8)}` : undefined;

    // Record decision evaluation to ledger
    recordLedgerEvent('DECISION_EVALUATED', decisionId, {
      verdict,
      status,
      orderId,
      holdReason,
      durationMs
    });

    return {
      status,
      orderId,
      holdReason,
      trace
    };
  } catch (error) {
    // Fail-Closed Fallback: System exceptions must HOLD payment, never ALLOW
    const durationMs = Date.now() - startTime;
    const fallbackTrace: DecisionTrace = {
      decisionId,
      mandateId: req.mandateId,
      cartId: req.cart.id,
      verdict: 'HOLD',
      reasons: [{
        layer: 'mandate',
        verdict: 'HOLD',
        code: 'FAIL_CLOSED_SYSTEM_ERROR',
        message: `System error during evaluation: ${error instanceof Error ? error.message : String(error)}`
      }],
      riskScore: 60,
      durationMs,
      timestamp: new Date().toISOString()
    };

    recordLedgerEvent('PAYMENT_HELD', decisionId, {
      reason: 'FAIL_CLOSED_SYSTEM_ERROR',
      error: String(error)
    });

    return {
      status: 'HELD',
      holdReason: 'System held transaction due to unexpected internal error (Fail-Closed)',
      trace: fallbackTrace
    };
  }
}
