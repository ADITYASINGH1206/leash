import { describe, it, expect } from 'vitest';
import { PayPalClient } from './client.js';
import {
  validateWebhookInput,
  isRecentWebhookTransmission,
  buildWebhookVerifyPayload,
} from './webhooks.js';

describe('PayPal Rails Client & Webhooks', () => {
  const client = new PayPalClient({
    clientId: 'sandbox_client_id',
    clientSecret: 'sandbox_secret',
    environment: 'sandbox',
    mockMode: true,
  });

  it('initializes sandbox and production URLs correctly', () => {
    expect(client.baseUrl).toBe('https://api-m.sandbox.paypal.com');

    const prodClient = new PayPalClient({
      clientId: 'id',
      clientSecret: 'secret',
      environment: 'production',
      mockMode: true,
    });
    expect(prodClient.baseUrl).toBe('https://api-m.paypal.com');
  });

  it('fetches OAuth access token', async () => {
    const token = await client.getAccessToken();
    expect(token).toBe('mock_access_token_sandbox_valid');
  });

  it('handles Vault v3 setup token creation', async () => {
    const setup = await client.createVaultSetupToken({
      payment_source: {
        paypal: {
          usage_type: 'MERCHANT',
          experience_context: {
            return_url: 'https://leashfirewall.io/vault/return',
            cancel_url: 'https://leashfirewall.io/vault/cancel',
          },
        },
      },
    });

    expect(setup.id).toMatch(/^setup_token_/);
    expect(setup.status).toBe('CREATED');
    expect(setup.links.length).toBeGreaterThan(0);
    const approveLink = setup.links.find((l) => l.rel === 'approve');
    expect(approveLink?.href).toContain('sandbox.paypal.com');
  });

  it('exchanges setup token for vault payment token', async () => {
    const paymentToken = await client.createPaymentToken('setup_token_abc');
    expect(paymentToken.id).toMatch(/^vault_token_/);
    expect(paymentToken.payment_source.paypal?.email_address).toBeDefined();
  });

  it('generates an authorization order response with intent AUTHORIZE', async () => {
    const res = await client.createAuthorizeOrder({
      vaultId: 'vault_123',
      merchantPayeeEmail: 'merchant@gadgethub.example',
      amount: {
        currency: 'USD',
        total: '19.99',
        breakdown: { itemTotal: '19.99' },
      },
      customId: 'dec_abc',
      idempotencyKey: 'idem_12345',
      items: [{ name: 'USB-C Cable', unitAmount: '19.99', quantity: 1, sku: 'CABLE-01' }],
    });

    expect(res.intent).toBe('AUTHORIZE');
    expect(res.id).toMatch(/^ord_/);
    expect(res.authorizationId).toMatch(/^auth_/);
    expect(res.status).toBe('APPROVED');
  });

  it('retrieves ground-truth order status via getOrder', async () => {
    const order = await client.getOrder('ord_test_123');
    expect(order.id).toBe('ord_test_123');
    expect(order.status).toBe('APPROVED');
    expect(order.purchase_units[0]?.payee?.email_address).toBe('merchant@gadgethub.example');
  });

  it('captures an authorization hold upon merchant fulfillment', async () => {
    const capture = await client.captureAuthorization('auth_hold_123', '19.99', 'USD');
    expect(capture.id).toMatch(/^cap_/);
    expect(capture.status).toBe('COMPLETED');
    expect(capture.amount.value).toBe('19.99');
  });

  it('voids an unfulfilled authorization (72h timeout)', async () => {
    const res = await client.voidAuthorization('auth_hold_123');
    expect(res.status).toBe('VOIDED');
  });

  it('refunds a settled capture', async () => {
    const refund = await client.refundCapture('cap_123', '19.99', 'USD');
    expect(refund.status).toBe('COMPLETED');
    expect(refund.id).toMatch(/^ref_/);
  });

  it('verifies webhook signature endpoint response', async () => {
    const res = await client.verifyWebhookSignature({
      auth_algo: 'SHA256withRSA',
      cert_url: 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-123',
      transmission_id: 'trans_123',
      transmission_sig: 'sig_123',
      transmission_time: new Date().toISOString(),
      webhook_id: 'wh_sandbox_123',
      webhook_event: { id: 'evt_1', event_type: 'PAYMENT.AUTHORIZATION.CREATED' },
    });
    expect(res.verification_status).toBe('SUCCESS');
  });

  describe('Webhook Security Verification Helpers', () => {
    it('accepts legitimate PayPal webhook certificate domains', () => {
      const valid = validateWebhookInput({
        authAlgo: 'SHA256withRSA',
        certUrl: 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-123',
        transmissionId: '123',
        transmissionSig: 'abc',
        transmissionTime: new Date().toISOString(),
        webhookId: 'wh_1',
        rawBody: '{"id":"evt_1"}',
      });
      expect(valid).toBe(true);
    });

    it('rejects untrusted webhook certificate URLs', () => {
      const invalid = validateWebhookInput({
        authAlgo: 'SHA256withRSA',
        certUrl: 'https://evil-site.com/cert.pem',
        transmissionId: '123',
        transmissionSig: 'abc',
        transmissionTime: '2026-11-02T12:00:00Z',
        webhookId: 'wh_1',
        rawBody: '{}',
      });
      expect(invalid).toBe(false);
    });

    it('rejects non-https cert URLs', () => {
      const invalid = validateWebhookInput({
        authAlgo: 'SHA256withRSA',
        certUrl: 'http://api.paypal.com/v1/notifications/certs/CERT-123',
        transmissionId: '123',
        transmissionSig: 'abc',
        transmissionTime: '2026-11-02T12:00:00Z',
        webhookId: 'wh_1',
        rawBody: '{}',
      });
      expect(invalid).toBe(false);
    });

    it('detects replay attack when transmission time is stale', () => {
      const oldTime = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 minutes ago
      expect(isRecentWebhookTransmission(oldTime, 300)).toBe(false);

      const recentTime = new Date(Date.now() - 30 * 1000).toISOString(); // 30 seconds ago
      expect(isRecentWebhookTransmission(recentTime, 300)).toBe(true);
    });

    it('builds canonical webhook verify payload from raw body and headers', () => {
      const payload = buildWebhookVerifyPayload({
        authAlgo: 'SHA256withRSA',
        certUrl: 'https://api.sandbox.paypal.com/cert',
        transmissionId: 'tid_1',
        transmissionSig: 'sig_1',
        transmissionTime: '2026-11-02T12:00:00Z',
        webhookId: 'wh_1',
        rawBody: '{"event_type":"PAYMENT.CAPTURE.COMPLETED","resource":{"id":"cap_1"}}',
      });

      expect(payload.auth_algo).toBe('SHA256withRSA');
      expect(payload.webhook_event).toEqual({
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        resource: { id: 'cap_1' },
      });
    });

    it('throws error when parsing corrupted rawBody', () => {
      expect(() =>
        buildWebhookVerifyPayload({
          authAlgo: 'SHA256withRSA',
          certUrl: 'https://api.sandbox.paypal.com/cert',
          transmissionId: 'tid_1',
          transmissionSig: 'sig_1',
          transmissionTime: '2026-11-02T12:00:00Z',
          webhookId: 'wh_1',
          rawBody: '{ bad json',
        })
      ).toThrow('Malformed webhook body');
    });
  });
});
