export type DecisionVerdict = 'ALLOW' | 'HOLD' | 'BLOCK';

export interface DecisionReason {
  layer: 'policy' | 'provenance' | 'intent' | 'risk' | 'mandate';
  verdict: DecisionVerdict;
  code: string;
  message: string;
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
  | 'MANDATE_SIGNED'
  | 'PAYMENT_REQUESTED'
  | 'LAYER_POLICY_EVALUATED'
  | 'LAYER_PROVENANCE_SCANNED'
  | 'LAYER_INTENT_EVALUATED'
  | 'LAYER_RISK_SCORED'
  | 'DECISION_EVALUATED'
  | 'DECISION_VERDICT'
  | 'USER_APPROVAL'
  | 'USER_DENIAL'
  | 'PAYMENT_HELD'
  | 'PAYPAL_ORDER_CREATED'
  | 'PAYPAL_AUTH_HELD'
  | 'PAYPAL_AUTHORIZED'
  | 'PAYPAL_CAPTURED'
  | 'PAYPAL_VOIDED'
  | 'PAYPAL_REFUNDED'
  | 'WEBHOOK_RECEIVED'
  | (string & {});

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
}
