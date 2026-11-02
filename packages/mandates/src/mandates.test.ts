import { describe, it, expect } from "vitest";
import {
  generateMandateKeyPair,
  signMandatePayload,
  verifyMandatePayload,
} from "./crypto.js";
import {
  IntentMandateSchema,
  CartMandateSchema,
  NonceStore,
} from "./schemas.js";

describe("Mandate Cryptography & Schema Validation", () => {
  it("validates a schema-compliant intent mandate", () => {
    const valid = IntentMandateSchema.safeParse({
      id: "mdt_01JB789",
      userId: "usr_42",
      agentId: "agt_shopper",
      intentText: "Buy USB-C phone case under $20",
      playback: "1 phone case for USB-C phone, at most $20.00 USD",
      constraints: {
        currency: "USD",
        maxTotal: "20.00",
        maxPerTxn: "20.00",
        maxTxnCount: 1,
        categories: ["phone_accessories"],
        itemTerms: ["phone case"],
        merchantAllow: [],
        merchantBlock: [],
        expiresAt: "2026-11-12T00:00:00Z",
      },
      nonce: "random-nonce-12345678",
    });
    expect(valid.success).toBe(true);
  });

  it("validates cart total matching item sum plus shipping and rejects mismatch", () => {
    const validCart = {
      id: "cart_9876",
      merchantId: "mer_gadgethub",
      items: [
        {
          sku: "GH-USBC-CASE",
          name: "Slim Matte USB-C Phone Case",
          category: "phone_accessories",
          qty: 2,
          unitAmount: "14.99",
        },
      ],
      shipping: "5.00",
      total: "34.98", // (14.99 * 2) + 5.00 = 34.98
      currency: "USD",
      expiresAt: "2026-11-12T00:00:00Z",
    };

    expect(CartMandateSchema.safeParse(validCart).success).toBe(true);

    // Mismatched total (e.g. attempting to charge more or less than item sum)
    const invalidTotalCart = { ...validCart, total: "30.00" };
    const invalidResult = CartMandateSchema.safeParse(invalidTotalCart);
    expect(invalidResult.success).toBe(false);
  });

  it("enforces nonce consumption and prevents replay attacks", () => {
    const store = new NonceStore();
    const nonce = "unique-nonce-abc-123456";

    expect(store.isConsumed(nonce)).toBe(false);
    expect(store.consume(nonce)).toBe(true);
    expect(store.isConsumed(nonce)).toBe(true);

    // Replay attempt fails
    expect(store.consume(nonce)).toBe(false);
  });

  it("signs and cryptographically verifies an RFC 8785 canonical mandate", async () => {
    const { publicKey, privateKey } =
      await generateMandateKeyPair("test-kid-1");
    const payload = {
      id: "mdt_123",
      maxTotal: "25.00",
      nonce: "nonce-abcdef-987654",
    };

    const jws = await signMandatePayload(payload, privateKey, "test-kid-1");
    expect(jws).toBeTypeOf("string");

    const isValid = await verifyMandatePayload(payload, jws, publicKey);
    expect(isValid).toBe(true);

    // Tampered payload fails verification
    const tampered = { ...payload, maxTotal: "100.00" };
    const isTamperedValid = await verifyMandatePayload(
      tampered,
      jws,
      publicKey,
    );
    expect(isTamperedValid).toBe(false);
  });
});
