import { describe, it, expect } from "vitest";
import {
  generateMandateKeyPair,
  signMandatePayload,
  verifyMandatePayload,
  signIntentMandate,
  verifyIntentMandate,
  signCartMandate,
  verifyCartMandate,
} from "./crypto.js";
import {
  IntentMandateSchema,
  CartMandateSchema,
  MemoryNonceStore,
  type IntentMandate,
  type CartMandate,
} from "./schemas.js";

describe("Mandate Cryptography, AP2 Schema & Replay Protection (Issue #4)", () => {
  const futureExpiry = new Date(Date.now() + 86400 * 1000).toISOString();
  const pastExpiry = new Date(Date.now() - 3600 * 1000).toISOString();

  const sampleIntentMandate: Omit<IntentMandate, "sig"> = {
    id: "mdt_01JB7890XYZ",
    userId: "usr_buyer_alice",
    agentId: "agt_shopper_bob",
    intentText: "Buy USB-C phone case under $20",
    playback: "1 phone case for USB-C phone, at most $20.00 USD",
    constraints: {
      currency: "USD",
      maxTotal: "20.00",
      maxPerTxn: "20.00",
      maxTxnCount: 1,
      categories: ["phone_accessories"],
      itemTerms: ["phone case"],
      merchantAllow: ["mer_gadgethub"],
      merchantBlock: [],
      expiresAt: futureExpiry,
    },
    nonce: "nonce_random_string_12345678",
  };

  const sampleCartMandate: Omit<CartMandate, "sig"> = {
    id: "cart_01JB999XYZ",
    merchantId: "mer_gadgethub",
    items: [
      {
        sku: "GH-USBC-CASE",
        name: "Slim Matte USB-C Phone Case",
        category: "phone_accessories",
        qty: 1,
        unitAmount: "14.99",
      },
    ],
    shipping: "0.00",
    total: "14.99",
    currency: "USD",
    expiresAt: futureExpiry,
  };

  describe("Zod Schema Conformance", () => {
    it("validates a well-formed IntentMandate", () => {
      const parsed = IntentMandateSchema.safeParse(sampleIntentMandate);
      expect(parsed.success).toBe(true);
    });

    it("validates a well-formed CartMandate", () => {
      const parsed = CartMandateSchema.safeParse(sampleCartMandate);
      expect(parsed.success).toBe(true);
    });
  });

  describe("Low-Level ES256 Payload Signing & Verification", () => {
    it("signs and verifies an RFC 8785 canonical payload with ECDSA P-256", async () => {
      const { publicKey, privateKey } =
        await generateMandateKeyPair("key-test-1");
      const payload = { b: "sample", a: 100, nonce: "nonce-1234567890abcdef" };

      const jws = await signMandatePayload(payload, privateKey, "key-test-1");
      expect(typeof jws).toBe("string");
      expect(jws.split(".").length).toBe(3); // Compact JWS format

      const isValid = await verifyMandatePayload(payload, jws, publicKey);
      expect(isValid).toBe(true);

      // Tampered payload fails verification
      const tampered = { ...payload, a: 101 };
      const isTamperedValid = await verifyMandatePayload(
        tampered,
        jws,
        publicKey,
      );
      expect(isTamperedValid).toBe(false);
    });

    it("rejects signature verified with mismatched public key", async () => {
      const keyPairA = await generateMandateKeyPair("key-a");
      const keyPairB = await generateMandateKeyPair("key-b");

      const payload = { mandateId: "mdt_123", amount: "50.00" };
      const jws = await signMandatePayload(
        payload,
        keyPairA.privateKey,
        "key-a",
      );

      // Verifying with Key B's public key must fail
      const isValid = await verifyMandatePayload(
        payload,
        jws,
        keyPairB.publicKey,
      );
      expect(isValid).toBe(false);
    });
  });

  describe("AP2 Intent Mandate Lifecycle", () => {
    it("signs and verifies a valid Intent Mandate", async () => {
      const { publicKey, privateKey } =
        await generateMandateKeyPair("user-key-alice");
      const nonceStore = new MemoryNonceStore();

      const signedMandate = await signIntentMandate(
        sampleIntentMandate,
        privateKey,
        "user-key-alice",
      );
      expect(signedMandate.sig).toBeDefined();
      expect(signedMandate.sig.alg).toBe("ES256");
      expect(signedMandate.sig.kid).toBe("user-key-alice");

      const result = await verifyIntentMandate(signedMandate, publicKey, {
        nonceStore,
      });
      expect(result.valid).toBe(true);
      expect(result.code).toBe("VALID");
    });

    it("detects tampering with intent text or budget and fails verification", async () => {
      const { publicKey, privateKey } =
        await generateMandateKeyPair("user-key-alice");
      const signedMandate = await signIntentMandate(
        sampleIntentMandate,
        privateKey,
        "user-key-alice",
      );

      // Tamper with intentText
      const tamperedText = {
        ...signedMandate,
        intentText: "Buy $1000 jewelry instead",
      };
      const resultA = await verifyIntentMandate(tamperedText, publicKey);
      expect(resultA.valid).toBe(false);
      expect(resultA.code).toBe("INVALID_SIGNATURE");

      // Tamper with maxTotal
      const tamperedBudget = {
        ...signedMandate,
        constraints: { ...signedMandate.constraints, maxTotal: "999.00" },
      };
      const resultB = await verifyIntentMandate(tamperedBudget, publicKey);
      expect(resultB.valid).toBe(false);
      expect(resultB.code).toBe("INVALID_SIGNATURE");
    });

    it("enforces mandate expiration", async () => {
      const { publicKey, privateKey } =
        await generateMandateKeyPair("user-key-alice");
      const expiredMandateInput = {
        ...sampleIntentMandate,
        constraints: {
          ...sampleIntentMandate.constraints,
          expiresAt: pastExpiry,
        },
      };

      const signedExpired = await signIntentMandate(
        expiredMandateInput,
        privateKey,
        "user-key-alice",
      );
      const result = await verifyIntentMandate(signedExpired, publicKey);

      expect(result.valid).toBe(false);
      expect(result.code).toBe("MANDATE_EXPIRED");
    });

    it("detects and blocks replay attacks via NonceStore", async () => {
      const { publicKey, privateKey } =
        await generateMandateKeyPair("user-key-alice");
      const nonceStore = new MemoryNonceStore();

      const signedMandate = await signIntentMandate(
        sampleIntentMandate,
        privateKey,
        "user-key-alice",
      );

      // First verification: fresh nonce -> PASS
      const first = await verifyIntentMandate(signedMandate, publicKey, {
        nonceStore,
      });
      expect(first.valid).toBe(true);

      // Second verification (Replay attempt with same nonce) -> FAIL
      const second = await verifyIntentMandate(signedMandate, publicKey, {
        nonceStore,
      });
      expect(second.valid).toBe(false);
      expect(second.code).toBe("NONCE_REPLAYED");
    });
  });

  describe("Merchant Cart Mandate Lifecycle", () => {
    it("signs and verifies a valid Merchant Cart Mandate", async () => {
      const { publicKey, privateKey } = await generateMandateKeyPair(
        "merchant-key-gadgethub",
      );

      const signedCart = await signCartMandate(
        sampleCartMandate,
        privateKey,
        "merchant-key-gadgethub",
      );
      expect(signedCart.sig).toBeDefined();
      expect(signedCart.sig.alg).toBe("ES256");

      const result = await verifyCartMandate(signedCart, publicKey);
      expect(result.valid).toBe(true);
      expect(result.code).toBe("VALID");
    });

    it("rejects tampered item price or quantity in Cart Mandate", async () => {
      const { publicKey, privateKey } = await generateMandateKeyPair(
        "merchant-key-gadgethub",
      );
      const signedCart = await signCartMandate(
        sampleCartMandate,
        privateKey,
        "merchant-key-gadgethub",
      );

      // Tamper item price without updating total (fails schema & total arithmetic)
      const tamperedPrice = {
        ...signedCart,
        items: [{ ...signedCart.items[0]!, unitAmount: "29.99" }],
      };
      const resultPrice = await verifyCartMandate(tamperedPrice, publicKey);
      expect(resultPrice.valid).toBe(false);

      // Tamper both item price AND total (bypasses total check, but fails crypto signature)
      const tamperedTotal = {
        ...signedCart,
        items: [{ ...signedCart.items[0]!, unitAmount: "29.99" }],
        total: "29.99",
      };
      const resultSig = await verifyCartMandate(tamperedTotal, publicKey);
      expect(resultSig.valid).toBe(false);
      expect(resultSig.code).toBe("INVALID_SIGNATURE");
    });

    it("enforces Cart Mandate expiration", async () => {
      const { publicKey, privateKey } = await generateMandateKeyPair(
        "merchant-key-gadgethub",
      );
      const expiredCartInput = { ...sampleCartMandate, expiresAt: pastExpiry };

      const signedExpired = await signCartMandate(
        expiredCartInput,
        privateKey,
        "merchant-key-gadgethub",
      );
      const result = await verifyCartMandate(signedExpired, publicKey);

      expect(result.valid).toBe(false);
      expect(result.code).toBe("MANDATE_EXPIRED");
    });
  });

  describe("NonceStore Expiry & Pruning", () => {
    it("prunes expired nonces after mandate validity window", () => {
      const store = new MemoryNonceStore();
      const pastTime = new Date(Date.now() - 10000);
      const futureTime = new Date(Date.now() + 60000);

      store.consume("nonce_expired_test_01", pastTime);
      store.consume("nonce_expired_test_02", pastTime);
      store.consume("nonce_active_test_01", futureTime);

      expect(store.size).toBe(3);

      const pruned = store.prune(new Date());
      expect(pruned).toBe(2);
      expect(store.size).toBe(1);
      expect(store.isConsumed("nonce_active_test_01")).toBe(true);
      expect(store.isConsumed("nonce_expired_test_01")).toBe(false);
    });
  });
});
