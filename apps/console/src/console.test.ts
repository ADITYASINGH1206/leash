import { describe, it, expect } from 'vitest';
import {
  canonicalJson,
  verifyLedgerChainBrowser,
  computeLedgerHashBrowser,
  GENESIS_HASH,
} from './lib/crypto';
import { getFallbackLedgerFixture } from './lib/api';
import {
  getOrCreateDeviceKey,
  getDevicePublicKeyBase64,
  getDeviceKeyFingerprint,
  signApprovalPayload,
  verifyDeviceSignature,
} from './lib/device-wallet';

describe('Leash Console: Cryptographic Verification & Audit Rails (Issue #17)', () => {
  it('canonicalJson deterministically sorts keys per RFC 8785', () => {
    const objA = { z: 1, a: 2, m: { y: 3, x: 4 } };
    const objB = { a: 2, m: { x: 4, y: 3 }, z: 1 };

    const strA = canonicalJson(objA);
    const strB = canonicalJson(objB);

    expect(strA).toBe(strB);
    expect(strA).toBe('{"a":2,"m":{"x":4,"y":3},"z":1}');
  });

  it('computes ledger hash deterministically with browser WebCrypto SHA-256', async () => {
    const payload = { amount: '45.00', merchant: 'gadgethub' };
    const hash = await computeLedgerHashBrowser(GENESIS_HASH, payload);

    expect(typeof hash).toBe('string');
    expect(hash).toHaveLength(64);

    // Verify idempotency
    const hash2 = await computeLedgerHashBrowser(GENESIS_HASH, payload);
    expect(hash).toBe(hash2);
  });

  it('validates a pristine sequential ledger chain client-side', async () => {
    const payload1 = { event: 'MANDATE_CREATED', id: 'm1' };
    const hash1 = await computeLedgerHashBrowser(GENESIS_HASH, payload1);

    const payload2 = { event: 'PAYMENT_REQUESTED', amount: '50.00' };
    const hash2 = await computeLedgerHashBrowser(hash1, payload2);

    const chain = [
      { seq: 1, kind: 'MANDATE_CREATED', refId: 'm1', payload: payload1, prevHash: GENESIS_HASH, hash: hash1 },
      { seq: 2, kind: 'PAYMENT_REQUESTED', refId: 'tx1', payload: payload2, prevHash: hash1, hash: hash2 },
    ];

    const result = await verifyLedgerChainBrowser(chain);
    expect(result.valid).toBe(true);
    expect(result.verifiedCount).toBe(2);
  });

  it('detects tampering when a payload inside the chain is altered', async () => {
    const payload1 = { event: 'MANDATE_CREATED', maxAmount: '100.00' };
    const hash1 = await computeLedgerHashBrowser(GENESIS_HASH, payload1);

    const chain = [
      {
        seq: 1,
        kind: 'MANDATE_CREATED',
        refId: 'm1',
        payload: { event: 'MANDATE_CREATED', maxAmount: '99999.00' }, // Tampered amount!
        prevHash: GENESIS_HASH,
        hash: hash1,
      },
    ];

    const result = await verifyLedgerChainBrowser(chain);
    expect(result.valid).toBe(false);
    expect(result.brokenSeq).toBe(1);
    expect(result.reason).toContain('Tampered payload hash');
  });

  it('detects sequence gap in ledger rows', async () => {
    const p1 = { a: 1 };
    const h1 = await computeLedgerHashBrowser(GENESIS_HASH, p1);

    const chain = [
      { seq: 1, kind: 'E1', refId: 'r1', payload: p1, prevHash: GENESIS_HASH, hash: h1 },
      { seq: 3, kind: 'E2', refId: 'r2', payload: {}, prevHash: h1, hash: 'h2' }, // Gap: expected #2, found #3
    ];

    const result = await verifyLedgerChainBrowser(chain);
    expect(result.valid).toBe(false);
    expect(result.brokenSeq).toBe(3);
    expect(result.reason).toContain('Sequence index gap');
  });

  it('fixture data contains valid sequential rows from genesis hash', () => {
    const fixture = getFallbackLedgerFixture();
    expect(fixture.length).toBeGreaterThan(0);
    expect(fixture[0]?.seq).toBe(1);
    expect(fixture[0]?.prevHash).toBe(GENESIS_HASH);

    for (let i = 1; i < fixture.length; i++) {
      expect(fixture[i]?.seq).toBe(i + 1);
      expect(fixture[i]?.prevHash).toBe(fixture[i - 1]?.hash);
    }
  });
});

describe('Mobile Approvals PWA: Device Wallet & WebCrypto Step-Up Re-Signing (Issue #14)', () => {
  it('generates an ECDSA P-256 key pair and exports valid SPKI base64 public key', async () => {
    const keyPair = await getOrCreateDeviceKey();
    expect(keyPair).toBeDefined();
    expect(keyPair.privateKey).toBeDefined();
    expect(keyPair.publicKey).toBeDefined();
    expect(keyPair.publicKey.algorithm.name).toBe('ECDSA');

    const pubKeyBase64 = await getDevicePublicKeyBase64(keyPair);
    expect(typeof pubKeyBase64).toBe('string');
    expect(pubKeyBase64.length).toBeGreaterThan(50);
  });

  it('computes human-friendly device key fingerprint', async () => {
    const keyPair = await getOrCreateDeviceKey();
    const fingerprint = await getDeviceKeyFingerprint(keyPair);

    expect(fingerprint).toMatch(/^key_[a-f0-9]{6}\.\.\.[a-f0-9]{4}$/);
  });

  it('signs canonical approval payload and verifies valid WebCrypto ECDSA signature', async () => {
    const reSigned = await signApprovalPayload({
      transactionId: 'tx_hold_stepup_123',
      mandateId: 'mandate_default_demo',
      approvedAmount: '45.00',
      currency: 'USD',
      nonce: 'nonce_test_abc123',
      timestamp: '2026-11-02T16:30:00.000Z',
    });

    expect(reSigned.signature).toBeDefined();
    expect(reSigned.publicKey).toBeDefined();
    expect(reSigned.signedPayload.transactionId).toBe('tx_hold_stepup_123');
    expect(reSigned.signedPayload.approvedAmount).toBe('45.00');

    // Verify valid signature
    const isValid = await verifyDeviceSignature(
      reSigned.publicKey,
      reSigned.signature,
      reSigned.signedPayload
    );
    expect(isValid).toBe(true);
  });

  it('rejects tampered approval payload during signature verification (Fail-Closed)', async () => {
    const reSigned = await signApprovalPayload({
      transactionId: 'tx_hold_stepup_tamper',
      mandateId: 'mandate_default_demo',
      approvedAmount: '45.00',
      currency: 'USD',
    });

    // Adversary tampers with the approved amount
    const tamperedPayload = {
      ...reSigned.signedPayload,
      approvedAmount: '500.00',
    };

    const isValid = await verifyDeviceSignature(
      reSigned.publicKey,
      reSigned.signature,
      tamperedPayload
    );
    expect(isValid).toBe(false);
  });
});
