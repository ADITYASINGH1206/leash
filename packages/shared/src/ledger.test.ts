import { describe, it, expect } from 'vitest';
import { canonicalJson, computeLedgerHash, verifyLedgerChain } from './ledger.js';
import type { LedgerRow } from './types.js';

describe('Tamper-Evident Ledger Hashing', () => {
  it('produces identical canonical JSON regardless of key insertion order', () => {
    const objA = { b: 2, a: 1, c: { y: 'test', x: 10 } };
    const objB = { a: 1, c: { x: 10, y: 'test' }, b: 2 };
    expect(canonicalJson(objA)).toBe(canonicalJson(objB));
    expect(canonicalJson(objA)).toBe('{"a":1,"b":2,"c":{"x":10,"y":"test"}}');
  });

  it('verifies a valid hash chain from genesis', () => {
    const genesisPrev = '0'.repeat(64);
    const row1Payload = { event: 'MANDATE_CREATED', amount: 50 };
    const hash1 = computeLedgerHash(genesisPrev, row1Payload);
    const row1: LedgerRow = {
      seq: 1,
      ts: new Date().toISOString(),
      kind: 'MANDATE_CREATED',
      refId: 'mdt_1',
      payload: row1Payload,
      prevHash: genesisPrev,
      hash: hash1
    };

    const row2Payload = { event: 'PAYMENT_AUTHORIZED', orderId: 'ord_123' };
    const hash2 = computeLedgerHash(hash1, row2Payload);
    const row2: LedgerRow = {
      seq: 2,
      ts: new Date().toISOString(),
      kind: 'PAYPAL_AUTHORIZED',
      refId: 'ord_123',
      payload: row2Payload,
      prevHash: hash1,
      hash: hash2
    };

    const result = verifyLedgerChain([row1, row2]);
    expect(result.valid).toBe(true);
  });

  it('detects tampering when an internal row payload is modified', () => {
    const genesisPrev = '0'.repeat(64);
    const row1Payload = { event: 'MANDATE_CREATED', amount: 50 };
    const hash1 = computeLedgerHash(genesisPrev, row1Payload);
    const row1: LedgerRow = {
      seq: 1,
      ts: new Date().toISOString(),
      kind: 'MANDATE_CREATED',
      refId: 'mdt_1',
      payload: row1Payload,
      prevHash: genesisPrev,
      hash: hash1
    };

    const tamperedPayload = { event: 'MANDATE_CREATED', amount: 500 }; // Attacker tampered 50 -> 500
    const tamperedRow1 = { ...row1, payload: tamperedPayload };

    const result = verifyLedgerChain([tamperedRow1]);
    expect(result.valid).toBe(false);
    expect(result.brokenSeq).toBe(1);
  });
});
