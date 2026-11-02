import { describe, it, expect } from 'vitest';
import { PayPalClient } from './client.js';
import { validateWebhookInput } from './webhooks.js';

describe('PayPal Rails Client & Webhooks', () => {
  const client = new PayPalClient({
    clientId: 'sandbox_client_id',
    clientSecret: 'sandbox_secret',
    environment: 'sandbox'
  });

  it('initializes sandbox URL correctly', () => {
    expect(client.baseUrl).toBe('https://api-m.sandbox.paypal.com');
  });

  it('generates an authorization order response with intent AUTHORIZE', async () => {
    const res = await client.createAuthorizeOrder({
      vaultId: 'vault_123',
      merchantPayeeId: 'merchant_sandbox_acct',
      amount: { currency: 'USD', total: '19.99' },
      customId: 'dec_abc',
      idempotencyKey: 'idem_12345',
      items: [{ name: 'USB-C Cable', unitAmount: '19.99', quantity: 1, sku: 'CABLE-01' }]
    });

    expect(res.intent).toBe('AUTHORIZE');
    expect(res.id).toMatch(/^ord_/);
    expect(res.authorizationId).toMatch(/^auth_/);
  });

  it('rejects untrusted webhook certificate URLs', () => {
    const invalid = validateWebhookInput({
      authAlgo: 'SHA256withRSA',
      certUrl: 'https://evil-site.com/cert.pem',
      transmissionId: '123',
      transmissionSig: 'abc',
      transmissionTime: '2026-11-02T12:00:00Z',
      webhookId: 'wh_1',
      rawBody: '{}'
    });
    expect(invalid).toBe(false);
  });
});
