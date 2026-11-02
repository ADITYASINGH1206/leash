export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  environment: 'sandbox' | 'production';
  /**
   * If true, enables offline mock responses for CI / unit test environments
   * when live sandbox credentials are not populated.
   */
  mockMode?: boolean;
}

export interface OAuthTokenResponse {
  scope: string;
  access_token: string;
  token_type: string;
  app_id: string;
  expires_in: number;
  nonce?: string;
}

export interface VaultSetupTokenRequest {
  payment_source: {
    paypal: {
      usage_type: 'MERCHANT' | 'PLATFORM';
      experience_context?: {
        brand_name?: string;
        locale?: string;
        return_url: string;
        cancel_url: string;
        user_action?: 'CONTINUE' | 'PAY_NOW';
      };
    };
  };
}

export interface VaultSetupTokenResponse {
  id: string;
  status: 'CREATED' | 'APPROVED';
  links: Array<{
    href: string;
    rel: 'approve' | 'self';
    method: 'GET' | 'POST';
  }>;
}

export interface VaultPaymentTokenRequest {
  payment_source: {
    token: {
      id: string;
      type: 'SETUP_TOKEN';
    };
  };
}

export interface VaultPaymentTokenResponse {
  id: string; // vault_id
  customer?: {
    id?: string;
  };
  payment_source: {
    paypal?: {
      email_address?: string;
      account_id?: string;
      name?: { given_name?: string; surname?: string };
    };
  };
}

export interface AuthorizeOrderRequest {
  vaultId: string;
  merchantPayeeEmail?: string;
  merchantPayeeId?: string;
  amount: {
    currency: string;
    total: string;
    breakdown?: {
      itemTotal?: string;
      shipping?: string;
      taxTotal?: string;
    };
  };
  customId: string; // Decision ID
  idempotencyKey: string;
  items: Array<{
    name: string;
    unitAmount: string;
    quantity: number;
    sku: string;
    category?: string;
  }>;
}

export interface AuthorizeOrderResponse {
  id: string; // Order ID
  status: 'CREATED' | 'SAVED' | 'APPROVED' | 'VOIDED' | 'COMPLETED';
  intent: 'AUTHORIZE';
  authorizationId?: string;
  links?: Array<{ href: string; rel: string; method: string }>;
  raw?: Record<string, unknown>;
}

export interface OrderDetailsResponse {
  id: string;
  status: string;
  intent: string;
  purchase_units: Array<{
    reference_id?: string;
    custom_id?: string;
    amount: {
      currency_code: string;
      value: string;
    };
    payee?: {
      email_address?: string;
      merchant_id?: string;
    };
    payments?: {
      authorizations?: Array<{
        id: string;
        status: string;
        amount: {
          currency_code: string;
          value: string;
        };
      }>;
      captures?: Array<{
        id: string;
        status: string;
        amount: {
          currency_code: string;
          value: string;
        };
      }>;
    };
  }>;
}

export interface CapturePaymentResponse {
  id: string; // Capture ID
  status: 'COMPLETED' | 'DECLINED' | 'PARTIALLY_REFUNDED' | 'PENDING' | 'REFUNDED';
  amount: {
    value: string;
    currency_code: string;
  };
  raw?: Record<string, unknown>;
}

export interface VoidPaymentResponse {
  id: string;
  status: 'VOIDED';
}

export interface RefundPaymentResponse {
  id: string;
  status: 'COMPLETED' | 'PENDING' | 'CANCELLED';
  amount: {
    value: string;
    currency_code: string;
  };
}

export interface WebhookVerifyRequest {
  auth_algo: string;
  cert_url: string;
  transmission_id: string;
  transmission_sig: string;
  transmission_time: string;
  webhook_id: string;
  webhook_event: Record<string, unknown>;
}

export interface WebhookVerifyResponse {
  verification_status: 'SUCCESS' | 'FAILURE';
}
