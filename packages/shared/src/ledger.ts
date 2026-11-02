import { createHash } from 'node:crypto';
import type { LedgerRow, LedgerEventKind } from './types.js';

export const GENESIS_HASH = '0'.repeat(64);

export const LEDGER_EVENT_KINDS = {
  MANDATE_CREATED: 'MANDATE_CREATED',
  MANDATE_SIGNED: 'MANDATE_SIGNED',
  PAYMENT_REQUESTED: 'PAYMENT_REQUESTED',
  LAYER_POLICY_EVALUATED: 'LAYER_POLICY_EVALUATED',
  LAYER_PROVENANCE_SCANNED: 'LAYER_PROVENANCE_SCANNED',
  LAYER_INTENT_EVALUATED: 'LAYER_INTENT_EVALUATED',
  LAYER_RISK_SCORED: 'LAYER_RISK_SCORED',
  DECISION_EVALUATED: 'DECISION_EVALUATED',
  DECISION_VERDICT: 'DECISION_VERDICT',
  USER_APPROVAL: 'USER_APPROVAL',
  USER_DENIAL: 'USER_DENIAL',
  PAYMENT_HELD: 'PAYMENT_HELD',
  PAYPAL_ORDER_CREATED: 'PAYPAL_ORDER_CREATED',
  PAYPAL_AUTH_HELD: 'PAYPAL_AUTH_HELD',
  PAYPAL_AUTHORIZED: 'PAYPAL_AUTHORIZED',
  PAYPAL_CAPTURED: 'PAYPAL_CAPTURED',
  PAYPAL_VOIDED: 'PAYPAL_VOIDED',
  PAYPAL_REFUNDED: 'PAYPAL_REFUNDED',
  PAYPAL_RECONCILED: 'PAYPAL_RECONCILED',
  RECONCILIATION_DISCREPANCY: 'RECONCILIATION_DISCREPANCY',
  WEBHOOK_RECEIVED: 'WEBHOOK_RECEIVED',
} as const;

/**
 * Deterministically sorts object keys for canonical JSON serialization
 * per RFC 8785 principles.
 */
export function canonicalJson(data: unknown): string {
  if (data === null || typeof data !== 'object') {
    return JSON.stringify(data);
  }
  if (Array.isArray(data)) {
    return '[' + data.map(canonicalJson).join(',') + ']';
  }
  const obj = data as Record<string, unknown>;
  const validKeys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined && typeof obj[k] !== 'function' && typeof obj[k] !== 'symbol')
    .sort();
  const pairs = validKeys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`);
  return '{' + pairs.join(',') + '}';
}

/**
 * Computes SHA-256 hash chaining: SHA-256(prev_hash + canonical_json(payload))
 */
export function computeLedgerHash(prevHash: string, payload: unknown): string {
  const serialized = canonicalJson(payload);
  return createHash('sha256')
    .update(prevHash + serialized)
    .digest('hex');
}

/**
 * Validates the cryptographic integrity of an append-only ledger chain
 */
export function verifyLedgerChain(chain: LedgerRow[]): { valid: boolean; brokenSeq?: number; reason?: string } {
  if (chain.length === 0) return { valid: true };

  let expectedPrevHash = GENESIS_HASH;

  for (let i = 0; i < chain.length; i++) {
    const row = chain[i]!;
    if (row.seq !== i + 1) {
      return { valid: false, brokenSeq: row.seq, reason: `Sequence gap or non-monotonic index at row ${i + 1}` };
    }
    if (row.prevHash !== expectedPrevHash) {
      return { valid: false, brokenSeq: row.seq, reason: `Previous hash mismatch at seq ${row.seq}` };
    }
    const computedHash = computeLedgerHash(row.prevHash, row.payload);
    if (computedHash !== row.hash) {
      return { valid: false, brokenSeq: row.seq, reason: `Tampered payload hash at seq ${row.seq}` };
    }
    expectedPrevHash = row.hash;
  }

  return { valid: true };
}

/**
 * In-memory or database-backed append-only ledger engine
 */
export class LedgerService {
  private rows: LedgerRow[] = [];

  constructor(initialRows: LedgerRow[] = []) {
    this.rows = [...initialRows];
  }

  get latestHash(): string {
    if (this.rows.length === 0) {
      return GENESIS_HASH;
    }
    return this.rows[this.rows.length - 1]!.hash;
  }

  get rowCount(): number {
    return this.rows.length;
  }

  getRows(): readonly LedgerRow[] {
    return this.rows;
  }

  append(kind: LedgerEventKind, refId: string, payload: Record<string, unknown>): LedgerRow {
    const prevHash = this.latestHash;
    const seq = this.rows.length + 1;
    const ts = new Date().toISOString();
    const hash = computeLedgerHash(prevHash, payload);

    const row: LedgerRow = {
      seq,
      ts,
      kind,
      refId,
      payload,
      prevHash,
      hash,
    };

    this.rows.push(row);
    return row;
  }

  verify(): { valid: boolean; brokenSeq?: number; reason?: string } {
    return verifyLedgerChain(this.rows);
  }
}
