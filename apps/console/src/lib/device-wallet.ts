import { canonicalJson } from './crypto';

const DB_NAME = 'leash_device_vault';
const STORE_NAME = 'keys';
const KEY_NAME = 'device_p256_key';

export interface ApprovalPayload {
  transactionId: string;
  mandateId: string;
  approvedAmount: string;
  currency: string;
  action: 'APPROVE';
  timestamp: string;
  nonce: string;
}

export interface ReSignedApproval {
  signature: string;
  publicKey: string;
  signedPayload: ApprovalPayload;
}

// In-memory key store fallback (for SSR, testing, or browsers without IndexedDB)
let memoryKeyPair: CryptoKeyPair | null = null;

/**
 * Opens or initializes the device's IndexedDB vault
 */
function openVaultDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this environment'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Retrieves or creates an ECDSA P-256 device key pair stored in IndexedDB
 */
export async function getOrCreateDeviceKey(): Promise<CryptoKeyPair> {
  // If in Node/test environment without indexedDB, use in-memory store
  if (typeof indexedDB === 'undefined') {
    if (!memoryKeyPair) {
      memoryKeyPair = await crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        false, // private key can sign but never be exported
        ['sign', 'verify']
      );
    }
    return memoryKeyPair;
  }

  try {
    const db = await openVaultDB();
    return await new Promise<CryptoKeyPair>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(KEY_NAME);

      req.onsuccess = async () => {
        if (req.result && req.result.privateKey && req.result.publicKey) {
          resolve(req.result as CryptoKeyPair);
        } else {
          try {
            // Generate new ECDSA P-256 key pair
            const newKey = await crypto.subtle.generateKey(
              { name: 'ECDSA', namedCurve: 'P-256' },
              false, // private key can sign but never be exported
              ['sign', 'verify']
            );

            const writeTx = db.transaction(STORE_NAME, 'readwrite');
            const writeStore = writeTx.objectStore(STORE_NAME);
            writeStore.put(newKey, KEY_NAME);

            writeTx.oncomplete = () => resolve(newKey);
            writeTx.onerror = () => reject(writeTx.error);
          } catch (err) {
            reject(err);
          }
        }
      };

      req.onerror = () => reject(req.error);
    });
  } catch {
    // If IndexedDB access fails, fallback to in-memory keypair
    if (!memoryKeyPair) {
      memoryKeyPair = await crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        false, // private key can sign but never be exported
        ['sign', 'verify']
      );
    }
    return memoryKeyPair;
  }
}

/**
 * Exports the device public key to base64 SPKI format
 */
export async function getDevicePublicKeyBase64(keyPair?: CryptoKeyPair): Promise<string> {
  const kp = keyPair || (await getOrCreateDeviceKey());
  const exported = await crypto.subtle.exportKey('spki', kp.publicKey);
  const bytes = new Uint8Array(exported);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

/**
 * Computes a human-friendly fingerprint for the device's public key (e.g. key_a7f1...39b2)
 */
export async function getDeviceKeyFingerprint(keyPair?: CryptoKeyPair): Promise<string> {
  const pubBase64 = await getDevicePublicKeyBase64(keyPair);
  const encoder = new TextEncoder();
  const hashBuf = await crypto.subtle.digest('SHA-256', encoder.encode(pubBase64));
  const hashArr = Array.from(new Uint8Array(hashBuf));
  const hex = hashArr.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `key_${hex.slice(0, 6)}...${hex.slice(-4)}`;
}

/**
 * Re-signs a held transaction approval using the device WebCrypto private key
 */
export async function signApprovalPayload(params: {
  transactionId: string;
  mandateId: string;
  approvedAmount: string;
  currency: string;
  nonce?: string;
  timestamp?: string;
}): Promise<ReSignedApproval> {
  const keyPair = await getOrCreateDeviceKey();
  const publicKey = await getDevicePublicKeyBase64(keyPair);

  const payload: ApprovalPayload = {
    transactionId: params.transactionId,
    mandateId: params.mandateId,
    approvedAmount: params.approvedAmount,
    currency: params.currency,
    action: 'APPROVE',
    timestamp: params.timestamp || new Date().toISOString(),
    nonce: params.nonce || `stepup_${Math.random().toString(36).substring(2, 12)}`,
  };

  const canonicalStr = canonicalJson(payload);
  const encoder = new TextEncoder();
  const data = encoder.encode(canonicalStr);

  const signatureBuf = await crypto.subtle.sign(
    {
      name: 'ECDSA',
      hash: { name: 'SHA-256' },
    },
    keyPair.privateKey,
    data
  );

  const sigBytes = new Uint8Array(signatureBuf);
  let sigBinary = '';
  for (let i = 0; i < sigBytes.byteLength; i++) {
    sigBinary += String.fromCharCode(sigBytes[i]!);
  }
  const signature = btoa(sigBinary);

  return {
    signature,
    publicKey,
    signedPayload: payload,
  };
}

/**
 * Verifies a device signature against the given SPKI public key and payload
 */
export async function verifyDeviceSignature(
  publicKeyBase64: string,
  signatureBase64: string,
  payload: unknown
): Promise<boolean> {
  try {
    const pubBinary = atob(publicKeyBase64);
    const pubBytes = new Uint8Array(pubBinary.length);
    for (let i = 0; i < pubBinary.length; i++) {
      pubBytes[i] = pubBinary.charCodeAt(i);
    }

    const pubKey = await crypto.subtle.importKey(
      'spki',
      pubBytes.buffer,
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['verify']
    );

    const sigBinary = atob(signatureBase64);
    const sigBytes = new Uint8Array(sigBinary.length);
    for (let i = 0; i < sigBinary.length; i++) {
      sigBytes[i] = sigBinary.charCodeAt(i);
    }

    const canonicalStr = canonicalJson(payload);
    const encoder = new TextEncoder();
    const data = encoder.encode(canonicalStr);

    return await crypto.subtle.verify(
      {
        name: 'ECDSA',
        hash: { name: 'SHA-256' },
      },
      pubKey,
      sigBytes.buffer,
      data
    );
  } catch {
    return false;
  }
}
