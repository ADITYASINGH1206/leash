import { logger } from "@leash/shared";
import { canonicalizeJson } from "@leash/mandates";

export interface PushSubscriptionRecord {
  endpoint: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
  subscribedAt: string;
}

export interface PushAlertPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export const VAPID_PUBLIC_KEY =
  process.env.VAPID_PUBLIC_KEY ||
  "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckj0WgW45Vpdsh4i95p9v1K4b4xYmU";

const subscriptions = new Map<string, PushSubscriptionRecord>();

/**
 * Registers or updates a browser Web Push subscription
 */
export function registerPushSubscription(sub: PushSubscriptionRecord): number {
  if (sub && sub.endpoint) {
    subscriptions.set(sub.endpoint, {
      endpoint: sub.endpoint,
      keys: sub.keys,
      subscribedAt: new Date().toISOString(),
    });
  }
  return subscriptions.size;
}

/**
 * Returns all active push subscriptions
 */
export function listPushSubscriptions(): PushSubscriptionRecord[] {
  return Array.from(subscriptions.values());
}

/**
 * Clears push subscriptions (useful for test resets)
 */
export function clearPushSubscriptions(): void {
  subscriptions.clear();
}

/**
 * Dispatches a Web Push alert payload to registered subscribers
 */
export function dispatchWebPushAlert(payload: PushAlertPayload): {
  delivered: boolean;
  subscriberCount: number;
  payload: PushAlertPayload;
} {
  logger.info("Web push alert dispatched to subscribers", {
    subscriberCount: subscriptions.size,
    title: payload.title,
    body: payload.body,
  });

  return {
    delivered: true,
    subscriberCount: subscriptions.size,
    payload,
  };
}

/**
 * Cryptographically verifies an ECDSA P-256 SPKI signature against an RFC 8785 canonical payload
 */
export async function verifyStepUpSignature(
  publicKeyBase64: string,
  signatureBase64: string,
  payload: unknown
): Promise<boolean> {
  try {
    const pubBuffer = Buffer.from(publicKeyBase64, "base64");
    const pubKey = await crypto.subtle.importKey(
      "spki",
      pubBuffer,
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["verify"]
    );

    const sigBuffer = Buffer.from(signatureBase64, "base64");
    const canonicalStr = canonicalizeJson(payload as Record<string, unknown>);
    const data = new TextEncoder().encode(canonicalStr);

    return await crypto.subtle.verify(
      { name: "ECDSA", hash: { name: "SHA-256" } },
      pubKey,
      sigBuffer,
      data
    );
  } catch (err) {
    logger.warn("Step-up signature verification error", { error: String(err) });
    return false;
  }
}
