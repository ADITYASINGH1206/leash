import type {
  AuthorizeOrderRequest,
  AuthorizeOrderResponse,
  AuthorizationDetailsResponse,
  CapturePaymentResponse,
  OAuthTokenResponse,
  OrderDetailsResponse,
  PayPalConfig,
  RefundPaymentResponse,
  VaultPaymentTokenResponse,
  VaultSetupTokenRequest,
  VaultSetupTokenResponse,
  VoidPaymentResponse,
  WebhookVerifyRequest,
  WebhookVerifyResponse,
} from './types.js';

export class PayPalClient {
  private config: PayPalConfig;
  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(config: PayPalConfig) {
    this.config = config;
  }

  get baseUrl(): string {
    return this.config.environment === 'production'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';
  }

  /** True when no sandbox credentials are configured and ids are generated locally. */
  isMockMode(): boolean {
    return Boolean(this.config.mockMode);
  }

  /**
   * Fetches or reuses cached OAuth 2.0 bearer token
   */
  async getAccessToken(): Promise<string> {
    if (this.config.mockMode) {
      return 'mock_access_token_sandbox_valid';
    }

    const now = Date.now();
    if (this.cachedToken && this.tokenExpiresAt > now + 60_000) {
      return this.cachedToken;
    }

    const auth = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`
    ).toString('base64');

    const response = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`PayPal OAuth failed (HTTP ${response.status}): ${errText}`);
    }

    const data = (await response.json()) as OAuthTokenResponse;
    this.cachedToken = data.access_token;
    this.tokenExpiresAt = now + data.expires_in * 1000;
    return this.cachedToken;
  }

  /**
   * Step 1 of Vault v3: Create Setup Token for buyer authorization
   */
  async createVaultSetupToken(req: VaultSetupTokenRequest): Promise<VaultSetupTokenResponse> {
    if (this.config.mockMode) {
      return {
        id: `setup_token_${Math.random().toString(36).substring(2, 10)}`,
        status: 'CREATED',
        links: [
          {
            href: `https://www.sandbox.paypal.com/agreements/approve?ba_token=mock_ba_token`,
            rel: 'approve',
            method: 'GET',
          },
          {
            href: `${this.baseUrl}/v3/vault/setup-tokens/mock_setup_token`,
            rel: 'self',
            method: 'GET',
          },
        ],
      };
    }

    const token = await this.getAccessToken();
    const response = await fetch(`${this.baseUrl}/v3/vault/setup-tokens`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Failed to create Vault setup token (${response.status}): ${err}`);
    }

    return (await response.json()) as VaultSetupTokenResponse;
  }

  /**
   * Step 2 of Vault v3: Exchange approved setup token for permanent payment token (vault_id)
   */
  async createPaymentToken(setupTokenId: string): Promise<VaultPaymentTokenResponse> {
    if (this.config.mockMode) {
      return {
        id: `vault_token_${Math.random().toString(36).substring(2, 10)}`,
        customer: { id: `cust_sandbox_${Math.random().toString(36).substring(2, 8)}` },
        payment_source: {
          paypal: {
            email_address: 'buyer-sandbox@leashfirewall.io',
            account_id: 'SANDBOX_ACCT_123',
          },
        },
      };
    }

    const token = await this.getAccessToken();
    const response = await fetch(`${this.baseUrl}/v3/vault/payment-tokens`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        payment_source: {
          token: {
            id: setupTokenId,
            type: 'SETUP_TOKEN',
          },
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Failed to exchange payment token (${response.status}): ${err}`);
    }

    return (await response.json()) as VaultPaymentTokenResponse;
  }

  /**
   * Creates an AUTHORIZE order routing money to a third-party merchant payee
   * using a saved Vault token.
   */
  async createAuthorizeOrder(req: AuthorizeOrderRequest): Promise<AuthorizeOrderResponse> {
    if (this.config.mockMode) {
      const fakeOrderId = `ord_${Math.random().toString(36).substring(2, 10)}`;
      const fakeAuthId = `auth_${Math.random().toString(36).substring(2, 10)}`;
      return {
        id: fakeOrderId,
        status: 'APPROVED',
        intent: 'AUTHORIZE',
        authorizationId: fakeAuthId,
        links: [
          {
            href: `${this.baseUrl}/v2/checkout/orders/${fakeOrderId}`,
            rel: 'self',
            method: 'GET',
          },
        ],
        raw: {
          id: fakeOrderId,
          status: 'APPROVED',
          intent: 'AUTHORIZE',
          purchase_units: [
            {
              reference_id: 'default',
              custom_id: req.customId,
              amount: {
                currency_code: req.amount.currency,
                value: req.amount.total,
              },
              payee: req.merchantPayeeEmail
                ? { email_address: req.merchantPayeeEmail }
                : undefined,
              payments: {
                authorizations: [
                  {
                    id: fakeAuthId,
                    status: 'CREATED',
                    amount: {
                      currency_code: req.amount.currency,
                      value: req.amount.total,
                    },
                  },
                ],
              },
            },
          ],
        },
      };
    }

    const token = await this.getAccessToken();

    const payload = {
      intent: 'AUTHORIZE',
      purchase_units: [
        {
          reference_id: 'default',
          custom_id: req.customId,
          amount: {
            currency_code: req.amount.currency,
            value: req.amount.total,
            ...(req.amount.breakdown?.itemTotal
              ? {
                  breakdown: {
                    item_total: {
                      currency_code: req.amount.currency,
                      value: req.amount.breakdown.itemTotal,
                    },
                  },
                }
              : {}),
          },
          ...(req.merchantPayeeEmail && !req.merchantPayeeEmail.endsWith('@sandbox.paypal.com')
            ? { payee: { email_address: req.merchantPayeeEmail } }
            : req.merchantPayeeId && /^[A-Z0-9]{13}$/.test(req.merchantPayeeId)
              ? { payee: { merchant_id: req.merchantPayeeId } }
              : {}),
          items: req.items.map((item) => ({
            name: item.name,
            unit_amount: {
              currency_code: req.amount.currency,
              value: item.unitAmount,
            },
            quantity: String(item.quantity),
            sku: item.sku,
            category:
              item.category === 'DIGITAL_GOODS' || item.category === 'DONATION'
                ? item.category
                : 'PHYSICAL_GOODS',
          })),
        },
      ],
      ...(req.vaultId && req.vaultId !== 'vault_sandbox_token' && req.vaultId !== 'vault_placeholder' && !req.vaultId.startsWith('vault_mock')
        ? {
            payment_source: {
              paypal: {
                vault_id: req.vaultId,
              },
            },
          }
        : {}),
    };

    const response = await fetch(`${this.baseUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': req.idempotencyKey,
        Prefer: 'return=representation',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`PayPal createAuthorizeOrder failed (${response.status}): ${err}`);
    }

    const raw = (await response.json()) as Record<string, unknown>;
    const orderId = raw.id as string;
    const status = raw.status as AuthorizeOrderResponse['status'];

    // Extract authorization ID if directly present in purchase units
    let authorizationId: string | undefined;
    const purchaseUnits = (raw.purchase_units as Array<Record<string, unknown>>) || [];
    const firstUnit = purchaseUnits[0];
    if (firstUnit) {
      const payments = firstUnit.payments as Record<string, unknown> | undefined;
      const authorizations = (payments?.authorizations as Array<Record<string, unknown>>) || [];
      const firstAuth = authorizations[0];
      if (firstAuth) {
        authorizationId = firstAuth.id as string;
      }
    }

    if (!authorizationId && (status === 'APPROVED' || status === 'COMPLETED')) {
      try {
        const authData = await this.authorizeOrder(orderId);
        if (authData.authorizationId) {
          authorizationId = authData.authorizationId;
        }
      } catch (err) {
        console.warn('Failed to authorize approved order via /authorize endpoint', { orderId, error: String(err) });
      }
    }

    return {
      id: orderId,
      status,
      intent: 'AUTHORIZE',
      authorizationId,
      links: raw.links as Array<{ href: string; rel: string; method: string }>,
      raw,
    };
  }

  /**
   * Explicitly authorizes an approved PayPal order via POST /v2/checkout/orders/{id}/authorize
   */
  async authorizeOrder(orderId: string): Promise<{ authorizationId: string; status: string; raw?: unknown }> {
    if (this.config.mockMode) {
      return { authorizationId: `auth_mock_${orderId}`, status: 'COMPLETED' };
    }

    const token = await this.getAccessToken();
    const response = await fetch(`${this.baseUrl}/v2/checkout/orders/${orderId}/authorize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`PayPal authorizeOrder failed (${response.status}): ${err}`);
    }

    const raw = (await response.json()) as Record<string, unknown>;
    const purchaseUnits = (raw.purchase_units as Array<Record<string, unknown>>) || [];
    const firstUnit = purchaseUnits[0];
    const payments = firstUnit?.payments as Record<string, unknown> | undefined;
    const authorizations = (payments?.authorizations as Array<Record<string, unknown>>) || [];
    const auth = authorizations[0];

    return {
      authorizationId: (auth?.id as string) || '',
      status: (auth?.status as string) || (raw.status as string),
      raw,
    };
  }

  /**
   * Retrieves ground truth order state directly from PayPal before saving internal state.
   */
  async getOrder(orderId: string): Promise<OrderDetailsResponse> {
    if (this.config.mockMode) {
      return {
        id: orderId,
        status: 'APPROVED',
        intent: 'AUTHORIZE',
        purchase_units: [
          {
            reference_id: 'default',
            amount: { currency_code: 'USD', value: '45.00' },
            payee: { email_address: 'merchant@gadgethub.example' },
            payments: {
              authorizations: [
                {
                  id: `auth_${orderId}`,
                  status: 'CREATED',
                  amount: { currency_code: 'USD', value: '45.00' },
                },
              ],
            },
          },
        ],
      };
    }

    const token = await this.getAccessToken();
    const response = await fetch(`${this.baseUrl}/v2/checkout/orders/${orderId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Failed to get order ${orderId} (${response.status}): ${err}`);
    }

    return (await response.json()) as OrderDetailsResponse;
  }

  /**
   * Captures an authorized hold when merchant provides shipping tracking
   */
  async captureAuthorization(
    authId: string,
    amount: string,
    currency = 'USD'
  ): Promise<CapturePaymentResponse> {
    if (this.config.mockMode) {
      return {
        id: `cap_${Math.random().toString(36).substring(2, 10)}`,
        status: 'COMPLETED',
        amount: { value: amount, currency_code: currency },
        raw: { id: `cap_mock`, status: 'COMPLETED' },
      };
    }

    const token = await this.getAccessToken();
    const response = await fetch(`${this.baseUrl}/v2/payments/authorizations/${authId}/capture`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        amount: {
          value: amount,
          currency_code: currency,
        },
        final_capture: true,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Failed to capture authorization ${authId} (${response.status}): ${err}`);
    }

    const raw = (await response.json()) as Record<string, unknown>;
    return {
      id: raw.id as string,
      status: raw.status as CapturePaymentResponse['status'],
      amount: {
        value: ((raw.amount as Record<string, unknown>)?.value as string) || amount,
        currency_code: ((raw.amount as Record<string, unknown>)?.currency_code as string) || currency,
      },
      raw,
    };
  }

  /**
   * Voids an unfulfilled authorization (e.g. 72h timeout or order cancelled)
   */
  async voidAuthorization(authId: string): Promise<VoidPaymentResponse> {
    if (this.config.mockMode) {
      return {
        id: authId,
        status: 'VOIDED',
      };
    }

    const token = await this.getAccessToken();
    const response = await fetch(`${this.baseUrl}/v2/payments/authorizations/${authId}/void`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok && response.status !== 204) {
      const err = await response.text();
      throw new Error(`Failed to void authorization ${authId} (${response.status}): ${err}`);
    }

    return {
      id: authId,
      status: 'VOIDED',
    };
  }

  /**
   * Retrieves authorization details directly from PayPal: GET /v2/payments/authorizations/{authorization_id}
   */
  async getAuthorization(authId: string): Promise<AuthorizationDetailsResponse> {
    if (this.config.mockMode) {
      return {
        id: authId,
        status: 'CREATED',
        amount: {
          currency_code: 'USD',
          value: '45.00',
        },
      };
    }

    const token = await this.getAccessToken();
    const response = await fetch(`${this.baseUrl}/v2/payments/authorizations/${authId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Failed to get authorization ${authId} (${response.status}): ${err}`);
    }

    return (await response.json()) as AuthorizationDetailsResponse;
  }

  /**
   * Refunds a captured payment (e.g. return or merchant dispute)
   */
  async refundCapture(
    captureId: string,
    amount: string,
    currency = 'USD'
  ): Promise<RefundPaymentResponse> {
    if (this.config.mockMode) {
      return {
        id: `ref_${Math.random().toString(36).substring(2, 10)}`,
        status: 'COMPLETED',
        amount: { value: amount, currency_code: currency },
      };
    }

    const token = await this.getAccessToken();
    const response = await fetch(`${this.baseUrl}/v2/payments/captures/${captureId}/refund`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        amount: {
          value: amount,
          currency_code: currency,
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Failed to refund capture ${captureId} (${response.status}): ${err}`);
    }

    const raw = (await response.json()) as Record<string, unknown>;
    return {
      id: raw.id as string,
      status: raw.status as RefundPaymentResponse['status'],
      amount: {
        value: ((raw.amount as Record<string, unknown>)?.value as string) || amount,
        currency_code: ((raw.amount as Record<string, unknown>)?.currency_code as string) || currency,
      },
    };
  }

  /**
   * Verifies incoming webhook signature via PayPal's official verification API endpoint
   */
  async verifyWebhookSignature(req: WebhookVerifyRequest): Promise<WebhookVerifyResponse> {
    if (this.config.mockMode) {
      return { verification_status: 'SUCCESS' };
    }

    const token = await this.getAccessToken();
    const response = await fetch(
      `${this.baseUrl}/v1/notifications/verify-webhook-signature`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(req),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Webhook signature verification request failed (${response.status}): ${err}`);
    }

    const data = (await response.json()) as WebhookVerifyResponse;
    return data;
  }
}
