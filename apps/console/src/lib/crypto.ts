/**
 * Client-Side Cryptographic Mandate & Hash Verification Engine
 * Runs standard WebCrypto APIs (P-256 ECDSA and SHA-256) natively in the browser.
 */

export const GENESIS_HASH = '0'.repeat(64);

/**
 * Deterministically sorts object keys for canonical JSON serialization per RFC 8785 principles.
 */
export function canonicalJson(data: unknown): string {
  if (data === null || typeof data !== 'object') {
    return JSON.stringify(data);
  }
  if (Array.isArray(data)) {
    return '[' + data.map(canonicalJson).join(',') + ']';
  }
  const obj = data as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const pairs = sortedKeys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`);
  return '{' + pairs.join(',') + '}';
}

/**
 * Calculates SHA-256 hash using browser native WebCrypto API
 */
export async function sha256Browser(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Calculates Ledger Row Hash: SHA-256(prev_hash + canonical_json(payload))
 */
export async function computeLedgerHashBrowser(prevHash: string, payload: unknown): Promise<string> {
  const serialized = canonicalJson(payload);
  return sha256Browser(prevHash + serialized);
}

/**
 * Interactively verifies the full cryptographic chain of ledger events client-side in the browser.
 */
export async function verifyLedgerChainBrowser(rows: Array<{
  seq: number;
  kind: string;
  refId: string;
  payload: unknown;
  prevHash: string;
  hash: string;
}>): Promise<{
  valid: boolean;
  brokenSeq?: number;
  reason?: string;
  verifiedCount: number;
}> {
  if (rows.length === 0) {
    return { valid: true, verifiedCount: 0 };
  }

  let expectedPrevHash = GENESIS_HASH;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;

    if (row.seq !== i + 1) {
      return {
        valid: false,
        brokenSeq: row.seq,
        reason: `Sequence index gap at position ${i + 1} (expected #${i + 1}, found #${row.seq})`,
        verifiedCount: i,
      };
    }

    if (row.prevHash !== expectedPrevHash) {
      return {
        valid: false,
        brokenSeq: row.seq,
        reason: `Previous hash pointer mismatch at seq #${row.seq}`,
        verifiedCount: i,
      };
    }

    const recomputedHash = await computeLedgerHashBrowser(row.prevHash, row.payload);
    if (recomputedHash !== row.hash) {
      return {
        valid: false,
        brokenSeq: row.seq,
        reason: `Tampered payload hash at seq #${row.seq}: expected ${row.hash}, computed ${recomputedHash}`,
        verifiedCount: i,
      };
    }

    expectedPrevHash = row.hash;
  }

  return { valid: true, verifiedCount: rows.length };
}

/**
 * Generates an ECDSA P-256 keypair in the browser for cryptographic mandate signing
 */
export async function generateClientSigningKeyPair(): Promise<{
  keyPair: CryptoKeyPair;
  publicKeyBase64: string;
}> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    true,
    ['sign', 'verify']
  );

  const exportedPublic = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  const publicKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(exportedPublic)));

  return { keyPair, publicKeyBase64 };
}

/**
 * Signs a canonical mandate payload with client-side WebCrypto ECDSA P-256
 */
export async function signMandateClient(
  privateKey: CryptoKey,
  payload: unknown
): Promise<string> {
  const canonicalStr = canonicalJson(payload);
  const encoder = new TextEncoder();
  const data = encoder.encode(canonicalStr);

  const signatureBuffer = await crypto.subtle.sign(
    {
      name: 'ECDSA',
      hash: { name: 'SHA-256' },
    },
    privateKey,
    data
  );

  return btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));
}
