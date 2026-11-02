export type DecisionVerdict = 'ALLOW' | 'HOLD' | 'BLOCK';

export interface DecisionReason {
  layer: 'mandate' | 'policy' | 'provenance' | 'intent_judge' | 'risk_anomaly';
  verdict: DecisionVerdict;
  code: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface DecisionTrace {
  decisionId: string;
  mandateId: string;
  cartId: string;
  verdict: DecisionVerdict;
  reasons: DecisionReason[];
  riskScore: number;
  durationMs: number;
  timestamp: string;
}

export type LedgerEventKind =
  | 'MANDATE_CREATED'
  | 'PAYMENT_REQUESTED'
  | 'DECISION_EVALUATED'
  | 'PAYMENT_HELD'
  | 'USER_APPROVED'
  | 'USER_DENIED'
  | 'PAYPAL_ORDER_CREATED'
  | 'PAYPAL_AUTHORIZED'
  | 'PAYPAL_CAPTURED'
  | 'PAYPAL_VOIDED'
  | 'PAYPAL_REFUNDED'
  | 'WEBHOOK_RECEIVED';

export interface LedgerRow<T = unknown> {
  seq: number;
  ts: string;
  kind: LedgerEventKind;
  refId: string;
  payload: T;
  prevHash: string;
  hash: string;
}

export interface CartItem {
  sku: string;
  name: string;
  category: string;
  qty: number;
  unitAmount: string;
}

export interface CartPayload {
  id: string;
  merchantId: string;
  items: CartItem[];
  shipping: string;
  total: string;
  currency: string;
  expiresAt: string;
  sig?: {
    alg: string;
    kid: string;
    jws: string;
  };
}
