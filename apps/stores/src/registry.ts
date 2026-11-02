import * as jose from "jose";
import { generateMandateKeyPair, type KeyPairResult } from "@leash/mandates";
import type { StoreId } from "./fixtures/products.js";

export type { StoreId };

export interface MerchantInfo {
  storeId: StoreId;
  merchantId: string;
  name: string;
  description: string;
  domain: string;
  payeeEmail: string;
  payeeMerchantId: string;
  brandColor: string;
  accentColor: string;
  keyPair: KeyPairResult;
}

export interface PublicMerchantInfo {
  storeId: StoreId;
  merchantId: string;
  name: string;
  description: string;
  domain: string;
  payeeEmail: string;
  payeeMerchantId: string;
  brandColor: string;
  accentColor: string;
  publicKey: jose.JWK;
}

// In-memory registry cache holding merchant keypairs
let merchantRegistryCache: Record<StoreId, MerchantInfo> | null = null;

/**
 * Initializes the merchant registry with ECDSA P-256 (ES256) signing keypairs
 * and PayPal payee identifiers for all 3 demo storefronts.
 */
export async function initMerchantRegistry(): Promise<
  Record<StoreId, MerchantInfo>
> {
  if (merchantRegistryCache) {
    return merchantRegistryCache;
  }

  const [gadgetHubKeys, trendBoutiqueKeys, dailyMartKeys] = await Promise.all([
    generateMandateKeyPair("kid_mer_gadgethub"),
    generateMandateKeyPair("kid_mer_trendboutique"),
    generateMandateKeyPair("kid_mer_dailymart"),
  ]);

  merchantRegistryCache = {
    gadgethub: {
      storeId: "gadgethub",
      merchantId: "mer_gadgethub",
      name: "GadgetHub Official Store",
      description:
        "Cutting-edge electronics, USB-C chargers, and smartphone accessories.",
      domain: "gadgethub.demo.leash.dev",
      payeeEmail: "merchant-gadgethub@sandbox.paypal.com",
      payeeMerchantId: "MERC_GH_SANDBOX_01",
      brandColor: "#0070ba",
      accentColor: "#38bdf8",
      keyPair: gadgetHubKeys,
    },
    trendboutique: {
      storeId: "trendboutique",
      merchantId: "mer_trendboutique",
      name: "TrendBoutique Apparel",
      description:
        "Minimalist streetwear, premium merino wool apparel, and everyday accessories.",
      domain: "trendboutique.demo.leash.dev",
      payeeEmail: "merchant-trendboutique@sandbox.paypal.com",
      payeeMerchantId: "MERC_TB_SANDBOX_02",
      brandColor: "#d946ef",
      accentColor: "#f472b6",
      keyPair: trendBoutiqueKeys,
    },
    dailymart: {
      storeId: "dailymart",
      merchantId: "mer_dailymart",
      name: "DailyMart Essentials",
      description:
        "Organic groceries, daily household staples, and quick convenience goods.",
      domain: "dailymart.demo.leash.dev",
      payeeEmail: "merchant-dailymart@sandbox.paypal.com",
      payeeMerchantId: "MERC_DM_SANDBOX_03",
      brandColor: "#10b981",
      accentColor: "#34d399",
      keyPair: dailyMartKeys,
    },
  };

  return merchantRegistryCache;
}

/**
 * Synchronous getter returning the active merchant registry.
 * Automatically initializes if not already cached.
 */
export async function getMerchantRegistry(): Promise<
  Record<StoreId, MerchantInfo>
> {
  if (!merchantRegistryCache) {
    await initMerchantRegistry();
  }
  return merchantRegistryCache!;
}

/**
 * Retrieves merchant information for a specific store ID.
 */
export async function getMerchantByStoreId(
  storeId: StoreId,
): Promise<MerchantInfo | undefined> {
  const registry = await getMerchantRegistry();
  return registry[storeId];
}

/**
 * Looks up merchant info by merchantId (e.g. 'mer_gadgethub' or 'gadgethub').
 */
export async function getMerchantByMerchantId(
  merchantId: string,
): Promise<MerchantInfo | undefined> {
  const registry = await getMerchantRegistry();
  const cleanId = merchantId.replace(/^mer_/, "").toLowerCase() as StoreId;
  return registry[cleanId];
}

/**
 * Returns public merchant profiles (excluding private signing keys).
 */
export async function getPublicMerchantRegistry(): Promise<
  Record<StoreId, PublicMerchantInfo>
> {
  const registry = await getMerchantRegistry();
  const publicRegistry: Partial<Record<StoreId, PublicMerchantInfo>> = {};

  for (const [storeId, merchant] of Object.entries(registry) as Array<
    [StoreId, MerchantInfo]
  >) {
    publicRegistry[storeId] = {
      storeId: merchant.storeId,
      merchantId: merchant.merchantId,
      name: merchant.name,
      description: merchant.description,
      domain: merchant.domain,
      payeeEmail: merchant.payeeEmail,
      payeeMerchantId: merchant.payeeMerchantId,
      brandColor: merchant.brandColor,
      accentColor: merchant.accentColor,
      publicKey: merchant.keyPair.publicKey,
    };
  }

  return publicRegistry as Record<StoreId, PublicMerchantInfo>;
}
