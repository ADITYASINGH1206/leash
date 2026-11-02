import { z } from "zod";

export const MandateConstraintsSchema = z.object({
  currency: z.string().length(3).default("USD"),
  maxTotal: z.string().regex(/^\d+(\.\d{2})?$/, "Must be monetary amount"),
  maxPerTxn: z.string().regex(/^\d+(\.\d{2})?$/, "Must be monetary amount"),
  maxTxnCount: z.number().int().positive().default(1),
  categories: z.array(z.string()).default([]),
  itemTerms: z.array(z.string()).default([]),
  merchantAllow: z.array(z.string()).default([]),
  merchantBlock: z.array(z.string()).default([]),
  approvalAbove: z
    .string()
    .regex(/^\d+(\.\d{2})?$/)
    .optional(),
  expiresAt: z.string().datetime(),
});

export const IntentMandateSchema = z.object({
  id: z.string().startsWith("mdt_"),
  userId: z.string().startsWith("usr_"),
  agentId: z.string().startsWith("agt_"),
  intentText: z.string().min(3).max(500),
  playback: z.string().min(5).max(1000),
  constraints: MandateConstraintsSchema,
  nonce: z.string().min(16),
  sig: z
    .object({
      alg: z.literal("ES256"),
      kid: z.string(),
      jws: z.string(),
    })
    .optional(),
});

export const CartItemSchema = z.object({
  sku: z.string(),
  name: z.string(),
  category: z.string(),
  qty: z.number().int().positive(),
  unitAmount: z.string().regex(/^\d+(\.\d{2})?$/),
});

/**
 * Calculates deterministic total for a cart (items + shipping) in dollars
 */
export function calculateCartTotal(
  items: Array<{ unitAmount: string; qty: number }>,
  shipping: string = "0.00",
): string {
  const itemsCents = items.reduce((sum, item) => {
    const unitCents = Math.round(parseFloat(item.unitAmount) * 100);
    return sum + unitCents * item.qty;
  }, 0);
  const shippingCents = Math.round(parseFloat(shipping) * 100);
  return ((itemsCents + shippingCents) / 100).toFixed(2);
}

export const CartMandateSchema = z
  .object({
    id: z.string().startsWith("cart_"),
    merchantId: z.string().startsWith("mer_"),
    items: z.array(CartItemSchema).min(1),
    shipping: z
      .string()
      .regex(/^\d+(\.\d{2})?$/)
      .default("0.00"),
    total: z.string().regex(/^\d+(\.\d{2})?$/),
    currency: z.string().length(3).default("USD"),
    expiresAt: z.string().datetime(),
    sig: z
      .object({
        alg: z.literal("ES256"),
        kid: z.string(),
        jws: z.string(),
      })
      .optional(),
  })
  .refine(
    (cart) => {
      const expected = calculateCartTotal(cart.items, cart.shipping);
      return cart.total === expected;
    },
    {
      message: "Cart total must match exact sum of items plus shipping",
    },
  );

export const PaymentRequestSchema = z.object({
  mandateId: z.string().startsWith("mdt_"),
  cart: CartMandateSchema,
  rationale: z
    .string()
    .max(500, "Agent rationale capped at 500 chars to quarantine"),
  evidence: z.array(
    z.object({
      url: z.string().url(),
      contentHash: z.string().optional(),
    }),
  ),
  idempotencyKey: z.string().min(8),
});

export type IntentMandate = z.infer<typeof IntentMandateSchema>;
export type CartMandate = z.infer<typeof CartMandateSchema>;
export type PaymentRequest = z.infer<typeof PaymentRequestSchema>;

/**
 * In-memory Nonce Store to protect against replay attacks.
 */
export class NonceStore {
  private consumed = new Set<string>();

  /**
   * Consumes a nonce. Returns true if nonce was fresh, false if already consumed.
   */
  consume(nonce: string): boolean {
    if (this.consumed.has(nonce)) {
      return false;
    }
    this.consumed.add(nonce);
    return true;
  }

  isConsumed(nonce: string): boolean {
    return this.consumed.has(nonce);
  }

  reset(): void {
    this.consumed.clear();
  }
}
