import { describe, it, expect } from 'vitest';
import {
  canonicalJson,
  computeLedgerHash,
  verifyLedgerChain,
  LedgerService,
  LEDGER_EVENT_KINDS,
  GENESIS_HASH,
} from './ledger.js';
import type { LedgerRow } from './types.js';

describe('Tamper-Evident Ledger Hashing', () => {
  it('produces identical canonical JSON regardless of key insertion order', () => {
    const objA = { b: 2, a: 1, c: { y: 'test', x: 10 } };
    const objB = { a: 1, c: { x: 10, y: 'test' }, b: 2 };
    expect(canonicalJson(objA)).toBe(canonicalJson(objB));
    expect(canonicalJson(objA)).toBe('{"a":1,"b":2,"c":{"x":10,"y":"test"}}');
  });

  it('verifies a valid hash chain from genesis', () => {
    const genesisPrev = GENESIS_HASH;
    const row1Payload = { event: 'MANDATE_CREATED', amount: 50 };
    const hash1 = computeLedgerHash(genesisPrev, row1Payload);
    const row1: LedgerRow = {
      seq: 1,
      ts: new Date().toISOString(),
      kind: 'MANDATE_CREATED',
      refId: 'mdt_1',
      payload: row1Payload,
      prevHash: genesisPrev,
      hash: hash1,
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
      hash: hash2,
    };

    const result = verifyLedgerChain([row1, row2]);
    expect(result.valid).toBe(true);
  });

  it('detects tampering when an internal row payload is modified', () => {
    const genesisPrev = GENESIS_HASH;
    const row1Payload = { event: 'MANDATE_CREATED', amount: 50 };
    const hash1 = computeLedgerHash(genesisPrev, row1Payload);
    const row1: LedgerRow = {
      seq: 1,
      ts: new Date().toISOString(),
      kind: 'MANDATE_CREATED',
      refId: 'mdt_1',
      payload: row1Payload,
      prevHash: genesisPrev,
      hash: hash1,
    };

    const tamperedPayload = { event: 'MANDATE_CREATED', amount: 500 }; // Attacker tampered 50 -> 500
    const tamperedRow1 = { ...row1, payload: tamperedPayload };

    const result = verifyLedgerChain([tamperedRow1]);
    expect(result.valid).toBe(false);
    expect(result.brokenSeq).toBe(1);
  });

  it('detects broken previous hash linkage', () => {
    const service = new LedgerService();
    service.append(LEDGER_EVENT_KINDS.MANDATE_SIGNED, 'mdt_1', { maxAmount: 100 });
    service.append(LEDGER_EVENT_KINDS.PAYMENT_REQUESTED, 'tx_1', { amount: 25 });

    const rows = [...service.getRows()];
    // Alter prevHash of second row
    const corruptedRows: LedgerRow[] = [
      rows[0]!,
      { ...rows[1]!, prevHash: 'a'.repeat(64) },
    ];

    const result = verifyLedgerChain(corruptedRows);
    expect(result.valid).toBe(false);
    expect(result.brokenSeq).toBe(2);
    expect(result.reason).toContain('Previous hash mismatch');
  });

  it('operates LedgerService append and verify seamlessly', () => {
    const service = new LedgerService();
    expect(service.latestHash).toBe(GENESIS_HASH);

    const row1 = service.append(LEDGER_EVENT_KINDS.MANDATE_SIGNED, 'mdt_100', {
      intent: 'Buy office supplies',
      limit: 150,
    });
    expect(row1.seq).toBe(1);
    expect(row1.prevHash).toBe(GENESIS_HASH);
    expect(service.latestHash).toBe(row1.hash);

    const row2 = service.append(LEDGER_EVENT_KINDS.PAYPAL_AUTH_HELD, 'auth_999', {
      orderId: 'ord_123',
      amount: '45.00',
    });
    expect(row2.seq).toBe(2);
    expect(row2.prevHash).toBe(row1.hash);

    const verify = service.verify();
    expect(verify.valid).toBe(true);
    expect(service.rowCount).toBe(2);
  });
});
