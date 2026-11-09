/**
 * Where the gateway keeps its state.
 *
 * - "postgres" (default when DATABASE_URL is set): rows go to PostgreSQL, and
 *   in production any database error fails closed.
 * - "memory": set LEASH_STORAGE=memory. Mandates, transactions and the ledger
 *   live in process memory and are lost on restart. This exists so a hosted
 *   demo can run without a database; it is an explicit opt-in because it is
 *   not durable.
 */
export type StorageMode = "memory" | "postgres";

export function memoryStorageRequested(): boolean {
  return process.env.LEASH_STORAGE === "memory";
}

/** True when a database error or a missing database must stop the request. */
export function failClosedOnDbError(): boolean {
  return process.env.NODE_ENV === "production" && !memoryStorageRequested();
}

export function storageMode(): StorageMode {
  return !memoryStorageRequested() && process.env.DATABASE_URL
    ? "postgres"
    : "memory";
}
