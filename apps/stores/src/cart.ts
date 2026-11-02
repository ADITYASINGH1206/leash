import { randomUUID } from "node:crypto";
import {
  type CartItem,
  type SignedCartMandate,
  SignedCartMandateSchema,
  calculateCartTotal,
  signMandatePayload,
  verifyCartMandate,
  type VerifyMandateResult,
} from "@leash/mandates";
import {
  getMerchantByStoreId,
  getMerchantByMerchantId,
  type StoreId,
} from "./registry.js";
import { getProductBySku } from "./catalog.js";

export interface CartItemInput {
  sku: string;
  qty: number;
}

export interface CreateCartMandateOptions {
  storeId: StoreId;
  items: CartItemInput[];
  shipping?: string;
  currency?: string;
  expiresInSeconds?: number;
  customCartId?: string;
}

/**
 * Creates and cryptographically signs an AP2-compliant Cart Mandate
 * on behalf of a demo store using its registered ECDSA P-256 private key.
 */
export async function createSignedCartMandate(
  options: CreateCartMandateOptions,
): Promise<SignedCartMandate> {
  const {
    storeId,
    items,
    shipping = "0.00",
    currency = "USD",
    expiresInSeconds = 3600,
    customCartId,
  } = options;

  const merchant = await getMerchantByStoreId(storeId);
  if (!merchant) {
    throw new Error(`Merchant not found for store ID: '${storeId}'`);
  }

  if (!items || items.length === 0) {
    throw new Error("Cannot create a Cart Mandate with zero items");
  }

  const resolvedCartItems: CartItem[] = [];

  for (const itemInput of items) {
    if (itemInput.qty <= 0 || !Number.isInteger(itemInput.qty) || itemInput.qty > 999) {
      throw new Error(
        `Item quantity must be a positive integer <= 999 for SKU: '${itemInput.sku}'`,
      );
    }

    const product = getProductBySku(itemInput.sku);
    if (!product) {
      throw new Error(`Product not found with SKU: '${itemInput.sku}'`);
    }

    if (product.storeId !== storeId) {
      throw new Error(
        `Product SKU '${itemInput.sku}' belongs to '${product.storeId}', not '${storeId}'`,
      );
    }

    resolvedCartItems.push({
      sku: product.sku,
      name: product.name,
      category: product.category,
      qty: itemInput.qty,
      unitAmount: product.price,
    });
  }

  const calculatedTotal = calculateCartTotal(resolvedCartItems, shipping);
  const cartId =
    customCartId || `cart_${randomUUID().replace(/-/g, "").substring(0, 16)}`;
  const expiresAt = new Date(
    Date.now() + expiresInSeconds * 1000,
  ).toISOString();

  // Canonical payload to sign (without sig)
  const canonicalCartPayload = {
    id: cartId,
    merchantId: merchant.merchantId,
    items: resolvedCartItems,
    shipping,
    total: calculatedTotal,
    currency,
    expiresAt,
  };

  const kid = `kid_${merchant.merchantId}`;
  const jws = await signMandatePayload(
    canonicalCartPayload,
    merchant.keyPair.privateKey,
    kid,
  );

  const signedCart: SignedCartMandate = {
    ...canonicalCartPayload,
    sig: {
      alg: "ES256",
      kid,
      jws,
    },
  };

  // Validate output against Zod schema to guarantee contract integrity
  SignedCartMandateSchema.parse(signedCart);

  return signedCart;
}

/**
 * Cryptographically verifies a SignedCartMandate against the merchant's registered public key.
 */
export async function verifyStoreCartMandate(
  cart: SignedCartMandate,
): Promise<VerifyMandateResult> {
  const merchant = await getMerchantByMerchantId(cart.merchantId);

  if (!merchant) {
    return {
      valid: false,
      code: "VERIFICATION_ERROR",
      error: `Unknown merchant identifier in cart: '${cart.merchantId}'`,
    };
  }

  return verifyCartMandate(cart, merchant.keyPair.publicKey);
}
