import { createHash } from 'node:crypto';
import type { LedgerRow } from './types.js';

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
  const sortedKeys = Object.keys(obj).sort();
  const pairs = sortedKeys.map(k => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`);
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
export function verifyLedgerChain(chain: LedgerRow[]): { valid: boolean; brokenSeq?: number } {
  if (chain.length === 0) return { valid: true };

  let expectedPrevHash = '0'.repeat(64); // Genesis hash

  for (let i = 0; i < chain.length; i++) {
    const row = chain[i]!;
    if (row.prevHash !== expectedPrevHash) {
      return { valid: false, brokenSeq: row.seq };
    }
    const computedHash = computeLedgerHash(row.prevHash, row.payload);
    if (computedHash !== row.hash) {
      return { valid: false, brokenSeq: row.seq };
    }
    expectedPrevHash = row.hash;
  }

  return { valid: true };
}
