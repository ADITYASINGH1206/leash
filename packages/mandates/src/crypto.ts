import * as jose from "jose";
import { canonicalizeJson } from "./canonical.js";
import {
  type IntentMandate,
  type SignedIntentMandate,
  type CartMandate,
  type SignedCartMandate,
  IntentMandateSchema,
  CartMandateSchema,
  extractSignablePayload,
} from "./schemas.js";
import type { INonceStore } from "./nonce.js";

export interface KeyPairResult {
  publicKey: jose.JWK;
  privateKey: jose.KeyLike;
}

export type MandateErrorCode =
  | "VALID"
  | "MISSING_SIGNATURE"
  | "INVALID_SIGNATURE"
  | "MANDATE_EXPIRED"
  | "NONCE_REPLAYED"
  | "INVALID_SCHEMA"
  | "VERIFICATION_ERROR";

export interface VerifyMandateResult {
  valid: boolean;
  code: MandateErrorCode;
  error?: string;
}

export interface VerifyMandateOptions {
  /**
   * Optional Nonce Store for replay attack detection
   */
  nonceStore?: INonceStore;
  /**
   * Current time for expiration verification (defaults to now)
   */
  now?: Date;
  /**
   * When true, skips expiration check
   */
  allowExpired?: boolean;
}

/**
 * Generates an ECDSA P-256 (ES256) keypair for signing AP2 mandates.
 */
export async function generateMandateKeyPair(
  kid: string,
): Promise<KeyPairResult> {
  const { publicKey, privateKey } = await jose.generateKeyPair("ES256", {
    extractable: true,
  });
  const publicJwk = await jose.exportJWK(publicKey);
  publicJwk.kid = kid;
  publicJwk.alg = "ES256";
  return { publicKey: publicJwk, privateKey };
}

/**
 * Signs any canonical mandate payload with ES256 using RFC 8785 canonicalization.
 */
export async function signMandatePayload(
  payload: Record<string, unknown>,
  privateKey: jose.KeyLike,
  kid: string,
): Promise<string> {
  const canonicalStr = canonicalizeJson(payload);
  const jws = await new jose.CompactSign(new TextEncoder().encode(canonicalStr))
    .setProtectedHeader({ alg: "ES256", kid })
    .sign(privateKey);
  return jws;
}

/**
 * Verifies an ES256 JWS signature against an RFC 8785 canonical payload.
 */
export async function verifyMandatePayload(
  payload: Record<string, unknown>,
  jws: string,
  publicKeyJwk: jose.JWK,
): Promise<boolean> {
  try {
    const key = await jose.importJWK(publicKeyJwk, "ES256");
    const { payload: verifiedBytes } = await jose.compactVerify(jws, key);
    const verifiedStr = new TextDecoder().decode(verifiedBytes);
    return verifiedStr === canonicalizeJson(payload);
  } catch {
    return false;
  }
}

/**
 * Signs a full Intent Mandate, returning a complete SignedIntentMandate.
 */
export async function signIntentMandate(
  mandate: Omit<IntentMandate, "sig">,
  privateKey: jose.KeyLike,
  kid: string,
): Promise<SignedIntentMandate> {
  const signable = extractSignablePayload(
    mandate as unknown as Record<string, unknown>,
  );
  const jws = await signMandatePayload(signable, privateKey, kid);
  return {
    ...mandate,
    sig: {
      alg: "ES256",
      kid,
      jws,
    },
  } as SignedIntentMandate;
}

/**
 * Verifies a Signed Intent Mandate against schema, signature, expiration, and nonce freshness.
 */
export async function verifyIntentMandate(
  mandate: IntentMandate,
  publicKeyJwk: jose.JWK,
  options: VerifyMandateOptions = {},
): Promise<VerifyMandateResult> {
  // 1. Schema check
  const parsed = IntentMandateSchema.safeParse(mandate);
  if (!parsed.success) {
    return {
      valid: false,
      code: "INVALID_SCHEMA",
      error: `Intent Mandate schema validation failed: ${parsed.error.message}`,
    };
  }

  // 2. Signature presence
  if (!mandate.sig) {
    return {
      valid: false,
      code: "MISSING_SIGNATURE",
      error: "Intent Mandate is unsigned (missing sig object)",
    };
  }

  // 3. Expiration enforcement
  const now = options.now ?? new Date();
  const expiresAt = new Date(mandate.constraints.expiresAt);
  if (!options.allowExpired && expiresAt.getTime() <= now.getTime()) {
    return {
      valid: false,
      code: "MANDATE_EXPIRED",
      error: `Intent Mandate expired at ${mandate.constraints.expiresAt} (current time: ${now.toISOString()})`,
    };
  }

  // 4. Nonce freshness & replay prevention
  if (options.nonceStore) {
    const consumed = options.nonceStore.consume(
      mandate.nonce,
      mandate.constraints.expiresAt,
    );
    if (!consumed) {
      return {
        valid: false,
        code: "NONCE_REPLAYED",
        error: `Mandate nonce "${mandate.nonce}" has already been consumed (Replay Attack blocked)`,
      };
    }
  }

  // 5. Cryptographic signature check
  const signablePayload = extractSignablePayload(
    mandate as unknown as Record<string, unknown>,
  );
  const isValidSig = await verifyMandatePayload(
    signablePayload,
    mandate.sig.jws,
    publicKeyJwk,
  );

  if (!isValidSig) {
    return {
      valid: false,
      code: "INVALID_SIGNATURE",
      error:
        "Cryptographic ES256 signature verification failed (payload tampered or mismatched key)",
    };
  }

  return {
    valid: true,
    code: "VALID",
  };
}

/**
 * Signs a full Cart Mandate, returning a complete SignedCartMandate.
 */
export async function signCartMandate(
  cart: Omit<CartMandate, "sig">,
  privateKey: jose.KeyLike,
  kid: string,
): Promise<SignedCartMandate> {
  const signable = extractSignablePayload(
    cart as unknown as Record<string, unknown>,
  );
  const jws = await signMandatePayload(signable, privateKey, kid);
  return {
    ...cart,
    sig: {
      alg: "ES256",
      kid,
      jws,
    },
  } as SignedCartMandate;
}

/**
 * Verifies a Signed Cart Mandate against schema, item totals, signature, and expiration.
 */
export async function verifyCartMandate(
  cart: CartMandate,
  publicKeyJwk: jose.JWK,
  options: VerifyMandateOptions = {},
): Promise<VerifyMandateResult> {
  // 1. Schema & arithmetic total check
  const parsed = CartMandateSchema.safeParse(cart);
  if (!parsed.success) {
    return {
      valid: false,
      code: "INVALID_SCHEMA",
      error: `Cart Mandate validation failed: ${parsed.error.message}`,
    };
  }

  // 2. Signature presence
  if (!cart.sig) {
    return {
      valid: false,
      code: "MISSING_SIGNATURE",
      error: "Cart Mandate is unsigned (missing merchant sig object)",
    };
  }

  // 3. Expiration enforcement
  const now = options.now ?? new Date();
  const expiresAt = new Date(cart.expiresAt);
  if (!options.allowExpired && expiresAt.getTime() <= now.getTime()) {
    return {
      valid: false,
      code: "MANDATE_EXPIRED",
      error: `Cart Mandate expired at ${cart.expiresAt} (current time: ${now.toISOString()})`,
    };
  }

  // 4. Cryptographic signature check
  const signablePayload = extractSignablePayload(
    cart as unknown as Record<string, unknown>,
  );
  const isValidSig = await verifyMandatePayload(
    signablePayload,
    cart.sig.jws,
    publicKeyJwk,
  );

  if (!isValidSig) {
    return {
      valid: false,
      code: "INVALID_SIGNATURE",
      error: "Merchant cart ES256 signature verification failed",
    };
  }

  return {
    valid: true,
    code: "VALID",
  };
}
