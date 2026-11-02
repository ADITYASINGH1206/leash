import { randomUUID } from "node:crypto";
import * as jose from "jose";
import {
  type MandateSignature,
  signMandatePayload,
  canonicalizeJson,
} from "@leash/mandates";
import { getMerchantByStoreId, type StoreId } from "./registry.js";
import { getProductBySku } from "./catalog.js";

export type CarrierName = "UPS" | "FedEx" | "USPS" | "DHL";

export interface FulfilledItem {
  sku: string;
  name: string;
  qty: number;
}

export interface FulfilmentNoticePayload {
  fulfilmentId: string;
  orderId: string;
  authorizationId: string;
  merchantId: string;
  trackingNumber: string;
  carrier: CarrierName;
  items: FulfilledItem[];
  fulfilledAt: string;
  notes?: string;
}

export interface SignedFulfilmentNotice extends FulfilmentNoticePayload {
  sig: MandateSignature;
}

export interface CreateFulfilmentNoticeOptions {
  storeId: StoreId;
  orderId: string;
  authorizationId: string;
  trackingNumber?: string;
  carrier?: CarrierName;
  items?: Array<{ sku: string; qty: number }>;
  notes?: string;
  customFulfilmentId?: string;
}

/**
 * Generates carrier tracking numbers based on carrier type
 */
function generateTrackingNumber(carrier: CarrierName): string {
  const randNum = Math.floor(1000000000 + Math.random() * 9000000000);
  switch (carrier) {
    case "UPS":
      return `1Z999AA101${randNum.toString().substring(0, 8)}`;
    case "FedEx":
      return `7949${randNum}`;
    case "USPS":
      return `940011189956${randNum.toString().substring(0, 10)}`;
    case "DHL":
      return `447${randNum}`;
  }
}

/**
 * Creates and cryptographically signs a Fulfilment Notice on behalf of a merchant.
 * This notice attests that ordered goods are shipped with active carrier tracking,
 * serving as the required cryptographic trigger for PayPal Payments v2 capture.
 */
export async function createSignedFulfilmentNotice(
  options: CreateFulfilmentNoticeOptions,
): Promise<SignedFulfilmentNotice> {
  const {
    storeId,
    orderId,
    authorizationId,
    carrier = "UPS",
    items = [],
    notes,
    customFulfilmentId,
  } = options;

  const merchant = await getMerchantByStoreId(storeId);
  if (!merchant) {
    throw new Error(`Merchant not found for store ID: '${storeId}'`);
  }

  if (!orderId || !authorizationId) {
    throw new Error(
      "orderId and authorizationId are required to issue a Fulfilment Notice",
    );
  }

  const trackingNumber =
    options.trackingNumber || generateTrackingNumber(carrier);
  const fulfilmentId =
    customFulfilmentId ||
    `flf_${randomUUID().replace(/-/g, "").substring(0, 16)}`;
  const fulfilledAt = new Date().toISOString();

  // Resolve item names from catalog if items were specified
  const fulfilledItems: FulfilledItem[] = items.map((it) => {
    const p = getProductBySku(it.sku);
    return {
      sku: it.sku,
      name: p?.name || it.sku,
      qty: it.qty,
    };
  });

  const canonicalPayload: FulfilmentNoticePayload = {
    fulfilmentId,
    orderId,
    authorizationId,
    merchantId: merchant.merchantId,
    trackingNumber,
    carrier,
    items: fulfilledItems,
    fulfilledAt,
    ...(notes ? { notes } : {}),
  };

  const kid = `kid_${merchant.merchantId}`;
  const jws = await signMandatePayload(
    canonicalPayload as unknown as Record<string, unknown>,
    merchant.keyPair.privateKey,
    kid,
  );

  return {
    ...canonicalPayload,
    sig: {
      alg: "ES256",
      kid,
      jws,
    },
  };
}

/**
 * Cryptographically verifies a merchant's signed Fulfilment Notice
 * against the merchant's registered public key.
 */
export async function verifyFulfilmentNotice(
  notice: SignedFulfilmentNotice,
): Promise<{ valid: boolean; error?: string }> {
  try {
    if (!notice.sig || notice.sig.alg !== "ES256") {
      return {
        valid: false,
        error: "Missing or invalid ES256 signature block",
      };
    }

    const merchant = await getMerchantByStoreId(
      notice.merchantId.replace(/^mer_/, "") as StoreId,
    );

    if (!merchant) {
      return {
        valid: false,
        error: `Unknown merchant: '${notice.merchantId}'`,
      };
    }

    // Strip signature to verify canonical payload
    const signable = { ...notice } as Record<string, unknown>;
    delete signable.sig;

    const canonicalString = canonicalizeJson(signable);
    const publicKey = await jose.importJWK(merchant.keyPair.publicKey, "ES256");

    const { payload } = await jose.compactVerify(notice.sig.jws, publicKey);
    const recoveredString = new TextDecoder().decode(payload);

    if (recoveredString !== canonicalString) {
      return {
        valid: false,
        error:
          "Recovered signature payload does not match canonical fulfilment notice",
      };
    }

    return { valid: true };
  } catch (err) {
    return {
      valid: false,
      error: `Fulfilment signature verification failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
