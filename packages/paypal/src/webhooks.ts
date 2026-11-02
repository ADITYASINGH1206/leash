export interface WebhookVerificationParams {
  authAlgo: string;
  certUrl: string;
  transmissionId: string;
  transmissionSig: string;
  transmissionTime: string;
  webhookId: string;
  rawBody: string;
}

/**
 * Validates PayPal raw-body webhook signature parameters
 */
export function validateWebhookInput(params: WebhookVerificationParams): boolean {
  if (!params.rawBody || !params.transmissionSig || !params.webhookId) {
    return false;
  }
  // Basic validation that certUrl points to paypal.com domain
  try {
    const url = new URL(params.certUrl);
    return url.hostname.endsWith('.paypal.com');
  } catch {
    return false;
  }
}
