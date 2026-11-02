import { getStoreCatalog, type StoreId, type StoreProduct } from "./catalog.js";
import { createSignedCartMandate, type CartItemInput } from "./cart.js";
import {
  createSignedFulfilmentNotice,
  type CarrierName,
} from "./fulfilment.js";
import { getMerchantByStoreId } from "./registry.js";

export interface CatalogQueryInput {
  storeId: StoreId;
  query?: string;
  category?: string;
  maxPrice?: number;
  includeAttackProducts?: boolean;
}

export interface SignCartInput {
  storeId: StoreId;
  items: CartItemInput[];
  shipping?: string;
}

export interface FulfillOrderInput {
  storeId: StoreId;
  orderId: string;
  authorizationId: string;
  carrier?: CarrierName;
  items?: Array<{ sku: string; qty: number }>;
  notes?: string;
}

export interface RefundOrderInput {
  storeId: StoreId;
  captureId: string;
  amount: string;
  reason?: string;
}

export interface DisputeOrderInput {
  storeId: StoreId;
  orderId: string;
  reason: string;
}

/**
 * PayPal Agent Toolkit for Autonomous Merchant Agents.
 * Provides autonomous merchant tools for catalog discovery, cart signing,
 * order fulfilment attestation, refund authorization, and dispute management.
 */
export class PayPalMerchantAgentToolkit {
  /**
   * Tool: Query Store Catalog
   */
  async queryCatalog(input: CatalogQueryInput): Promise<{
    storeId: StoreId;
    storeName: string;
    total: number;
    products: StoreProduct[];
  }> {
    const merchant = await getMerchantByStoreId(input.storeId);
    if (!merchant) {
      throw new Error(`Unknown storeId: '${input.storeId}'`);
    }

    let products = getStoreCatalog(input.storeId, {
      includeAttackProducts: input.includeAttackProducts ?? false,
    });

    if (input.query) {
      const q = input.query.toLowerCase().trim();
      products = products.filter(
        (p: StoreProduct) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q),
      );
    }

    if (input.category) {
      const cat = input.category.toLowerCase().trim();
      products = products.filter(
        (p: StoreProduct) => p.category.toLowerCase() === cat,
      );
    }

    if (input.maxPrice !== undefined && input.maxPrice > 0) {
      products = products.filter(
        (p: StoreProduct) => parseFloat(p.price) <= input.maxPrice!,
      );
    }

    return {
      storeId: input.storeId,
      storeName: merchant.name,
      total: products.length,
      products,
    };
  }

  /**
   * Tool: Formulate and Sign Cart Mandate
   */
  async signCart(input: SignCartInput) {
    return createSignedCartMandate({
      storeId: input.storeId,
      items: input.items,
      shipping: input.shipping || "0.00",
    });
  }

  /**
   * Tool: Issue Signed Fulfilment Notice
   */
  async fulfillOrder(input: FulfillOrderInput) {
    return createSignedFulfilmentNotice({
      storeId: input.storeId,
      orderId: input.orderId,
      authorizationId: input.authorizationId,
      carrier: input.carrier || "UPS",
      items: input.items,
      notes: input.notes,
    });
  }

  /**
   * Tool: Process Merchant Refund
   */
  async refundOrder(input: RefundOrderInput) {
    const merchant = await getMerchantByStoreId(input.storeId);
    if (!merchant) {
      throw new Error(`Unknown storeId: '${input.storeId}'`);
    }

    return {
      status: "COMPLETED",
      refundId: `ref_${Math.random().toString(36).substring(2, 10)}`,
      captureId: input.captureId,
      merchantId: merchant.merchantId,
      amount: input.amount,
      currency: "USD",
      reason: input.reason || "Customer requested refund",
      refundedAt: new Date().toISOString(),
    };
  }

  /**
   * Tool: Dispute Handling & Resolution
   */
  async disputeOrder(input: DisputeOrderInput) {
    const merchant = await getMerchantByStoreId(input.storeId);
    if (!merchant) {
      throw new Error(`Unknown storeId: '${input.storeId}'`);
    }

    return {
      disputeId: `dsp_${Math.random().toString(36).substring(2, 10)}`,
      orderId: input.orderId,
      merchantId: merchant.merchantId,
      status: "UNDER_REVIEW",
      reason: input.reason,
      openedAt: new Date().toISOString(),
      actionRequired: "MERCHANT_EVIDENCE_REQUESTED",
    };
  }

  /**
   * Returns schema descriptions for AI agent tool calling frameworks.
   */
  getToolDefinitions() {
    return [
      {
        name: "merchant_query_catalog",
        description: "Search and filter products in the merchant catalog.",
        parameters: {
          type: "object",
          properties: {
            storeId: {
              type: "string",
              enum: ["gadgethub", "trendboutique", "dailymart"],
            },
            query: { type: "string", description: "Search query string" },
            category: { type: "string", description: "Product category" },
            maxPrice: { type: "number", description: "Maximum price filter" },
          },
          required: ["storeId"],
        },
      },
      {
        name: "merchant_sign_cart",
        description:
          "Calculate official totals and issue an AP2 cryptographically signed Cart Mandate.",
        parameters: {
          type: "object",
          properties: {
            storeId: {
              type: "string",
              enum: ["gadgethub", "trendboutique", "dailymart"],
            },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  sku: { type: "string" },
                  qty: { type: "integer", minimum: 1 },
                },
                required: ["sku", "qty"],
              },
            },
            shipping: { type: "string" },
          },
          required: ["storeId", "items"],
        },
      },
      {
        name: "merchant_fulfill_order",
        description:
          "Attest delivery and issue a cryptographically signed Fulfilment Notice with carrier tracking to trigger PayPal payment capture.",
        parameters: {
          type: "object",
          properties: {
            storeId: {
              type: "string",
              enum: ["gadgethub", "trendboutique", "dailymart"],
            },
            orderId: { type: "string", description: "PayPal Order ID" },
            authorizationId: {
              type: "string",
              description: "PayPal Authorization ID",
            },
            carrier: { type: "string", enum: ["UPS", "FedEx", "USPS", "DHL"] },
          },
          required: ["storeId", "orderId", "authorizationId"],
        },
      },
      {
        name: "merchant_refund_order",
        description: "Issue a merchant refund on a captured transaction.",
        parameters: {
          type: "object",
          properties: {
            storeId: {
              type: "string",
              enum: ["gadgethub", "trendboutique", "dailymart"],
            },
            captureId: { type: "string" },
            amount: { type: "string" },
            reason: { type: "string" },
          },
          required: ["storeId", "captureId", "amount"],
        },
      },
    ];
  }
}

export const merchantToolkit = new PayPalMerchantAgentToolkit();
