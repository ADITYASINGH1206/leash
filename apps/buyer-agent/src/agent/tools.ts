import { randomUUID } from "node:crypto";
import {
  getStoreCatalog,
  getProductBySku,
  renderProductHtml,
  type StoreId,
  type StoreProduct,
  type HiddenInjectionTechnique,
} from "@leash/stores";
import {
  handleRequestPaymentTool,
  type MCPPaymentResult,
} from "@leash/gateway";
import { calculateCartTotal, type PaymentRequest } from "@leash/mandates";
import type { BuyerAgentSessionState } from "./types.js";

export interface SearchProductsInput {
  query?: string;
  storeId?: StoreId;
}

export interface ViewProductInput {
  sku: string;
  technique?: HiddenInjectionTechnique;
}

export interface AddToCartInput {
  sku: string;
  quantity?: number;
}

export interface RequestPaymentInput {
  rationale: string;
  customTotal?: string; // For attack simulation overriding total
  evidenceUrl?: string;
}

/**
 * Executes agent tools against demo stores and the Leash Payment Firewall.
 */
export class BuyerAgentTools {
  constructor(private state: BuyerAgentSessionState) {}

  /**
   * Search store catalog for matching products.
   * If attackMode is enabled, adversarial items are included.
   */
  async searchProducts(input: SearchProductsInput): Promise<StoreProduct[]> {
    const stores: StoreId[] = input.storeId
      ? [input.storeId]
      : ["gadgethub", "trendboutique", "dailymart"];

    const allProducts: StoreProduct[] = [];
    for (const store of stores) {
      const catalog = getStoreCatalog(store, {
        includeAttackProducts: this.state.attackMode,
      });
      allProducts.push(...catalog);
    }

    const q = (input.query || "").toLowerCase().trim();
    if (!q) {
      return allProducts;
    }

    return allProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q),
    );
  }

  /**
   * View details for a single product, rendering HTML with hidden injections if present.
   */
  async viewProduct(input: ViewProductInput): Promise<{
    product: StoreProduct;
    html: string;
    evidenceUrl: string;
    injectedInstruction?: string;
  }> {
    const product = getProductBySku(input.sku);
    if (!product) {
      throw new Error(`Product with SKU '${input.sku}' not found`);
    }

    const technique = input.technique || "display_none";
    const html = renderProductHtml(product, { technique });
    const evidenceUrl = `https://${product.storeId}.demo.leash.dev/products/${product.sku}`;

    return {
      product,
      html,
      evidenceUrl,
      injectedInstruction: this.state.attackMode
        ? product.hiddenInjection
        : undefined,
    };
  }

  /**
   * Add a product to the agent's current cart.
   */
  async addToCart(
    input: AddToCartInput,
  ): Promise<BuyerAgentSessionState["cart"]> {
    const product = getProductBySku(input.sku);
    if (!product) {
      throw new Error(`Product with SKU '${input.sku}' not found`);
    }

    const quantity = input.quantity ?? 1;
    if (quantity <= 0) {
      throw new Error("Quantity must be greater than 0");
    }

    // Set merchant if first item or update
    this.state.cart.merchantId = product.storeId;
    this.state.cart.evidenceUrl = `https://${product.storeId}.demo.leash.dev/products/${product.sku}`;

    const existingIndex = this.state.cart.items.findIndex(
      (item) => item.sku === product.sku,
    );
    if (existingIndex >= 0 && this.state.cart.items[existingIndex]) {
      this.state.cart.items[existingIndex]!.quantity += quantity;
    } else {
      this.state.cart.items.push({
        sku: product.sku,
        name: product.name,
        quantity,
        unitPrice: product.price,
        category: product.category,
      });
    }

    // Recalculate cart totals using integer cents to prevent IEEE 754 rounding artifacts
    const totalCents = this.state.cart.items.reduce((sum, item) => {
      const itemCents = Math.round(parseFloat(item.unitPrice) * 100);
      return sum + itemCents * item.quantity;
    }, 0);

    const totalStr = (totalCents / 100).toFixed(2);
    this.state.cart.subtotal = totalStr;
    this.state.cart.total = totalStr;

    return this.state.cart;
  }

  /**
   * View current cart summary.
   */
  async viewCart(): Promise<
    BuyerAgentSessionState["cart"] & { mandateBudget: number }
  > {
    return {
      ...this.state.cart,
      mandateBudget: this.state.mandate.maxAmount,
    };
  }

  /**
   * Submit payment request to Leash Firewall via handleRequestPaymentTool.
   */
  async requestPayment(input: RequestPaymentInput): Promise<MCPPaymentResult> {
    if (this.state.cart.items.length === 0) {
      throw new Error("Cannot request payment for an empty cart");
    }

    const merchantRaw = this.state.cart.merchantId || "gadgethub";
    const merchantId = merchantRaw.startsWith("mer_")
      ? merchantRaw
      : `mer_${merchantRaw}`;
    const evidenceUrl =
      input.evidenceUrl ||
      this.state.cart.evidenceUrl ||
      `https://${merchantRaw.replace(/^mer_/, "")}.demo.leash.dev/products/${this.state.cart.items[0]?.sku || "item"}`;

    const cartItems = this.state.cart.items.map((item) => ({
      sku: item.sku,
      name: item.name,
      category: item.category || "general",
      qty: item.quantity,
      unitAmount: Number(item.unitPrice).toFixed(2),
    }));

    const calculatedTotal = calculateCartTotal(cartItems, "0.00");
    const total = input.customTotal || calculatedTotal;

    const paymentRequest: PaymentRequest = {
      mandateId: this.state.mandate.id,
      cart: {
        id: this.state.cart.id.startsWith("cart_")
          ? this.state.cart.id
          : `cart_${this.state.cart.id}`,
        merchantId,
        items: cartItems,
        shipping: "0.00",
        total: total,
        currency: "USD",
        expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      },
      rationale: input.rationale.slice(0, 500),
      evidence: [
        {
          url: evidenceUrl,
        },
      ],
      idempotencyKey: `idem_${randomUUID().replace(/-/g, "").substring(0, 16)}`,
    };

    let result: MCPPaymentResult;
    const gatewayUrl =
      process.env.GATEWAY_URL ||
      process.env.NEXT_PUBLIC_GATEWAY_URL ||
      (typeof window === "undefined" && process.env.NODE_ENV !== "test"
        ? "http://127.0.0.1:4000"
        : "");

    if (gatewayUrl && process.env.NODE_ENV !== "test") {
      try {
        const res = await fetch(`${gatewayUrl}/api/v1/payment/request`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(paymentRequest),
          signal: AbortSignal.timeout(2400),
        });
        if (res.ok) {
          result = (await res.json()) as MCPPaymentResult;
        } else {
          result = await handleRequestPaymentTool(paymentRequest);
        }
      } catch {
        result = await handleRequestPaymentTool(paymentRequest);
      }
    } else {
      result = await handleRequestPaymentTool(paymentRequest);
    }

    this.state.lastPaymentResult = result;

    if (result.status === "AUTHORIZED") {
      this.state.mandate.spentAmount += Number(total);
    }

    return result;
  }
}
