/**
 * Replay Attack Protection: Nonce Tracking & Expiry Store
 * Invariant: Every signed human mandate has a unique cryptographic nonce.
 * Re-spending or submitting an already-consumed nonce MUST fail closed.
 */

export interface NonceRecord {
  nonce: string;
  consumedAt: number;
  expiresAt?: number;
}

export interface INonceStore {
  consume(nonce: string, expiresAt?: string | Date): boolean | Promise<boolean>;
  isConsumed(nonce: string): boolean | Promise<boolean>;
  prune(now?: Date): number;
  clear(): void;
}

/**
 * In-memory Nonce Store with automatic TTL eviction for expired nonces.
 */
export class MemoryNonceStore implements INonceStore {
  private records = new Map<string, NonceRecord>();

  /**
   * Consumes a nonce atomically.
   * Returns true if nonce was fresh and is now consumed.
   * Returns false if the nonce was already consumed (Replay Attack).
   */
  consume(nonce: string, expiresAt?: string | Date): boolean {
    if (!nonce || nonce.length < 16) {
      return false;
    }

    if (this.records.has(nonce)) {
      return false; // Already consumed!
    }

    const expMs = expiresAt
      ? typeof expiresAt === "string"
        ? new Date(expiresAt).getTime()
        : expiresAt.getTime()
      : undefined;

    this.records.set(nonce, {
      nonce,
      consumedAt: Date.now(),
      expiresAt: expMs,
    });

    return true;
  }

  isConsumed(nonce: string): boolean {
    return this.records.has(nonce);
  }

  /**
   * Prunes nonces whose mandate expiration timestamp is older than now.
   * Keeps memory bounded while ensuring nonces remain non-reusable during mandate lifetime.
   */
  prune(now: Date = new Date()): number {
    const currentMs = now.getTime();
    let prunedCount = 0;

    for (const [nonce, record] of this.records.entries()) {
      if (record.expiresAt && record.expiresAt < currentMs) {
        this.records.delete(nonce);
        prunedCount++;
      }
    }

    return prunedCount;
  }

  clear(): void {
    this.records.clear();
  }

  get size(): number {
    return this.records.size;
  }
}

// Global default memory nonce store for gateway & local sessions
export const defaultNonceStore = new MemoryNonceStore();
