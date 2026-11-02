import type { WebhookVerifyRequest } from './types.js';

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
 * Validates PayPal raw-body webhook signature parameters and cert security
 */
export function validateWebhookInput(params: WebhookVerificationParams): boolean {
  if (
    !params.rawBody ||
    !params.transmissionSig ||
    !params.webhookId ||
    !params.authAlgo ||
    !params.transmissionId ||
    !params.transmissionTime
  ) {
    return false;
  }

  // Cert URL must be HTTPS and strictly hosted on a PayPal domain
  try {
    const url = new URL(params.certUrl);
    if (url.protocol !== 'https:') {
      return false;
    }
    const hostname = url.hostname.toLowerCase();
    const isPayPal = hostname === 'paypal.com' || hostname.endsWith('.paypal.com');
    if (!isPayPal) {
      return false;
    }
  } catch {
    return false;
  }

  return true;
}

/**
 * Validates transmission freshness against replay attacks (default 5 minute window)
 */
export function isRecentWebhookTransmission(
  transmissionTime: string,
  toleranceSeconds = 300
): boolean {
  const timestamp = Date.parse(transmissionTime);
  if (Number.isNaN(timestamp)) {
    return false;
  }
  const deltaMs = Math.abs(Date.now() - timestamp);
  return deltaMs <= toleranceSeconds * 1000;
}

/**
 * Builds the canonical request object for PayPal's verify-webhook-signature endpoint
 */
export function buildWebhookVerifyPayload(
  params: WebhookVerificationParams
): WebhookVerifyRequest {
  let webhookEvent: Record<string, unknown>;
  try {
    webhookEvent = JSON.parse(params.rawBody);
  } catch {
    throw new Error('Malformed webhook body: cannot parse JSON');
  }

  return {
    auth_algo: params.authAlgo,
    cert_url: params.certUrl,
    transmission_id: params.transmissionId,
    transmission_sig: params.transmissionSig,
    transmission_time: params.transmissionTime,
    webhook_id: params.webhookId,
    webhook_event: webhookEvent,
  };
}
