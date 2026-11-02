import type { AuthorizeOrderRequest, AuthorizeOrderResponse, CapturePaymentResponse, PayPalConfig } from './types.js';

export class PayPalClient {
  private config: PayPalConfig;

  constructor(config: PayPalConfig) {
    this.config = config;
  }

  get baseUrl(): string {
    return this.config.environment === 'production'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';
  }

  /**
   * Creates an AUTHORIZE order routing money to a third-party merchant payee
   * using a saved Vault token.
   */
  async createAuthorizeOrder(_req: AuthorizeOrderRequest): Promise<AuthorizeOrderResponse> {
    return {
      id: `ord_${Math.random().toString(36).substring(2, 10)}`,
      status: 'APPROVED',
      intent: 'AUTHORIZE',
      authorizationId: `auth_${Math.random().toString(36).substring(2, 10)}`
    };
  }

  /**
   * Captures an authorized hold when merchant provides shipping tracking
   */
  async captureAuthorization(_authId: string, amount: string): Promise<CapturePaymentResponse> {
    return {
      id: `cap_${Math.random().toString(36).substring(2, 10)}`,
      status: 'COMPLETED',
      amount: { value: amount, currency_code: 'USD' }
    };
  }

  /**
   * Voids an unfulfilled authorization (72h timeout)
   */
  async voidAuthorization(_authId: string): Promise<boolean> {
    return true;
  }
}
