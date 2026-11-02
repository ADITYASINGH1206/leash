import { describe, it, expect } from 'vitest';
import { generateMandateKeyPair, signMandatePayload, verifyMandatePayload } from './crypto.js';
import { IntentMandateSchema } from './schemas.js';

describe('Mandate Cryptography & Schema Validation', () => {
  it('validates a schema-compliant intent mandate', () => {
    const valid = IntentMandateSchema.safeParse({
      id: 'mdt_01JB789',
      userId: 'usr_42',
      agentId: 'agt_shopper',
      intentText: 'Buy USB-C phone case under $20',
      playback: '1 phone case for USB-C phone, at most $20.00 USD',
      constraints: {
        currency: 'USD',
        maxTotal: '20.00',
        maxPerTxn: '20.00',
        maxTxnCount: 1,
        categories: ['phone_accessories'],
        itemTerms: ['phone case'],
        merchantAllow: [],
        merchantBlock: [],
        expiresAt: '2026-11-12T00:00:00Z'
      },
      nonce: 'random-nonce-12345678'
    });
    expect(valid.success).toBe(true);
  });

  it('signs and cryptographically verifies an RFC 8785 canonical mandate', async () => {
    const { publicKey, privateKey } = await generateMandateKeyPair('test-kid-1');
    const payload = {
      id: 'mdt_123',
      maxTotal: '25.00',
      nonce: 'nonce-abcdef-987654'
    };

    const jws = await signMandatePayload(payload, privateKey, 'test-kid-1');
    expect(jws).toBeTypeOf('string');

    const isValid = await verifyMandatePayload(payload, jws, publicKey);
    expect(isValid).toBe(true);

    // Tampered payload fails verification
    const tampered = { ...payload, maxTotal: '100.00' };
    const isTamperedValid = await verifyMandatePayload(tampered, jws, publicKey);
    expect(isTamperedValid).toBe(false);
  });
});
