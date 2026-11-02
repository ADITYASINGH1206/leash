import * as jose from 'jose';
import { canonicalJson } from '@leash/shared';

export interface KeyPairResult {
  publicKeyJwk: jose.JWK;
  privateKey: jose.KeyLike | Uint8Array;
}

/**
 * Generates an ECDSA P-256 keypair for signing mandates
 */
export async function generateMandateKeyPair(kid: string): Promise<{
  publicKey: jose.JWK;
  privateKey: jose.KeyLike;
}> {
  const { publicKey, privateKey } = await jose.generateKeyPair('ES256', { extractable: true });
  const publicJwk = await jose.exportJWK(publicKey);
  publicJwk.kid = kid;
  publicJwk.alg = 'ES256';
  return { publicKey: publicJwk, privateKey };
}

/**
 * Signs a canonical mandate payload with ES256
 */
export async function signMandatePayload(
  payload: Record<string, unknown>,
  privateKey: jose.KeyLike,
  kid: string
): Promise<string> {
  const canonicalStr = canonicalJson(payload);
  const jws = await new jose.CompactSign(new TextEncoder().encode(canonicalStr))
    .setProtectedHeader({ alg: 'ES256', kid })
    .sign(privateKey);
  return jws;
}

/**
 * Verifies an ES256 JWS signature against an RFC 8785 canonical payload
 */
export async function verifyMandatePayload(
  payload: Record<string, unknown>,
  jws: string,
  publicKeyJwk: jose.JWK
): Promise<boolean> {
  try {
    const key = await jose.importJWK(publicKeyJwk, 'ES256');
    const { payload: verifiedBytes } = await jose.compactVerify(jws, key);
    const verifiedStr = new TextDecoder().decode(verifiedBytes);
    return verifiedStr === canonicalJson(payload);
  } catch {
    return false;
  }
}
