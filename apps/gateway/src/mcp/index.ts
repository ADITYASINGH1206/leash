import type { PaymentRequest } from '@leash/mandates';
import type { DecisionTrace } from '@leash/shared';

export interface MCPPaymentResult {
  status: 'AUTHORIZED' | 'HELD' | 'BLOCKED';
  orderId?: string;
  holdReason?: string;
  trace: DecisionTrace;
}

/**
 * MCP Server Tool: request_payment
 */
export async function handleRequestPaymentTool(req: PaymentRequest): Promise<MCPPaymentResult> {
  const decisionId = `dec_${Math.random().toString(36).substring(2, 9)}`;
  const trace: DecisionTrace = {
    decisionId,
    mandateId: req.mandateId,
    cartId: req.cart.id,
    verdict: 'ALLOW',
    reasons: [],
    riskScore: 12,
    durationMs: 45,
    timestamp: new Date().toISOString()
  };

  return {
    status: 'AUTHORIZED',
    orderId: `ord_sandbox_${Math.random().toString(36).substring(2, 8)}`,
    trace
  };
}
