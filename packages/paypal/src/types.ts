export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  environment: 'sandbox' | 'production';
}

export interface AuthorizeOrderRequest {
  vaultId: string;
  merchantPayeeId: string;
  amount: {
    currency: string;
    total: string;
    breakdown?: {
      itemTotal?: string;
      shipping?: string;
    };
  };
  customId: string; // Decision ID
  idempotencyKey: string;
  items: Array<{
    name: string;
    unitAmount: string;
    quantity: number;
    sku: string;
  }>;
}

export interface AuthorizeOrderResponse {
  id: string; // Order ID
  status: 'CREATED' | 'SAVED' | 'APPROVED' | 'VOIDED' | 'COMPLETED';
  intent: 'AUTHORIZE';
  authorizationId?: string;
}

export interface CapturePaymentResponse {
  id: string; // Capture ID
  status: 'COMPLETED' | 'DECLINED' | 'PARTIALLY_REFUNDED' | 'PENDING' | 'REFUNDED';
  amount: {
    value: string;
    currency_code: string;
  };
}
