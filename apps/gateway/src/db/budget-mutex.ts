import { sql } from "drizzle-orm";
import { getDb } from "./connection.js";
import { mandates } from "./schema.js";
import { logger } from "@leash/shared";

export interface BudgetReservationResult {
  success: boolean;
  mandateId: string;
  reservedAmount: string;
  remainingBudget: string;
  reason?: string;
}

export interface InMemoryMandateRecord {
  id: string;
  maxAmount: number;
  spentAmount: number;
  validUntil: Date;
  status: "ACTIVE" | "EXHAUSTED" | "REVOKED";
  intentText: string;
  playback: string;
  constraints: {
    maxTotal: string;
    maxPerTxn: string;
    currency: string;
    categories: string[];
    itemTerms?: string[];
  };
}

// In-memory mutex map for development, tests, or when PostgreSQL is not configured
const inMemoryMandates = new Map<string, InMemoryMandateRecord>();

// Per-mandate async mutex lock queue
const mandateLocks = new Map<string, Promise<void>>();

async function acquireMandateLock(mandateId: string): Promise<() => void> {
  while (mandateLocks.has(mandateId)) {
    await mandateLocks.get(mandateId);
  }
  let release: () => void = () => {};
  const lockPromise = new Promise<void>((resolve) => {
    release = () => {
      mandateLocks.delete(mandateId);
      resolve();
    };
  });
  mandateLocks.set(mandateId, lockPromise);
  return release;
}

/**
 * Seed or update in-memory mandate for testing and local harnesses
 */
export function seedInMemoryMandate(mandate: {
  id: string;
  maxAmount: number;
  spentAmount?: number;
  validUntil?: Date;
  status?: "ACTIVE" | "EXHAUSTED" | "REVOKED";
  intentText?: string;
  playback?: string;
  constraints?: {
    maxTotal: string;
    maxPerTxn: string;
    currency: string;
    categories: string[];
    itemTerms?: string[];
  };
}) {
  inMemoryMandates.set(mandate.id, {
    id: mandate.id,
    maxAmount: mandate.maxAmount,
    spentAmount: mandate.spentAmount ?? 0,
    validUntil:
      mandate.validUntil ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
    status: mandate.status ?? "ACTIVE",
    intentText:
      mandate.intentText ??
      "Authorized purchases within specified budget and category limits",
    playback: mandate.playback ?? "Approved human spending mandate",
    constraints: mandate.constraints ?? {
      maxTotal: String(mandate.maxAmount),
      maxPerTxn: String(mandate.maxAmount),
      currency: "USD",
      categories: [
        "phone_accessories",
        "cables",
        "chargers",
        "apparel",
        "grocery",
      ],
      itemTerms: [
        "case",
        "cable",
        "charger",
        "tee",
        "hoodie",
        "coffee",
        "beans",
      ],
    },
  });
}

export function getInMemoryMandate(
  mandateId: string,
): InMemoryMandateRecord | undefined {
  return inMemoryMandates.get(mandateId);
}

/**
 * Atomically locks mandate row and reserves budget.
 * Enforces Architectural Invariant 4:
 * Budget deduction must occur within an atomic database transaction using row-level mutex locking (SELECT ... FOR UPDATE).
 */
export async function lockAndReserveBudget(
  mandateId: string,
  amount: number,
): Promise<BudgetReservationResult> {
  const db = getDb();

  // If real Postgres connection exists, use row-level locking SELECT ... FOR UPDATE
  if (db) {
    try {
      return await db.transaction(async (tx) => {
        // Enforce SELECT ... FOR UPDATE row-level lock
        const rows = await tx.execute(
          sql`SELECT id, max_amount, spent_amount, valid_until, status 
              FROM ${mandates} 
              WHERE id = ${mandateId} 
              FOR UPDATE`,
        );

        const row = rows[0] as
          | {
              id: string;
              max_amount: string;
              spent_amount: string;
              valid_until: string;
              status: string;
            }
          | undefined;

        if (!row) {
          return {
            success: false,
            mandateId,
            reservedAmount: "0.00",
            remainingBudget: "0.00",
            reason: `Mandate '${mandateId}' not found`,
          };
        }

        if (row.status !== "ACTIVE") {
          return {
            success: false,
            mandateId,
            reservedAmount: "0.00",
            remainingBudget: "0.00",
            reason: `Mandate '${mandateId}' is ${row.status}`,
          };
        }

        const validUntil = new Date(row.valid_until);
        if (validUntil < new Date()) {
          return {
            success: false,
            mandateId,
            reservedAmount: "0.00",
            remainingBudget: "0.00",
            reason: `Mandate '${mandateId}' has expired`,
          };
        }

        const maxAmount = parseFloat(row.max_amount);
        const spentAmount = parseFloat(row.spent_amount);
        const remaining = maxAmount - spentAmount;

        if (amount > remaining) {
          return {
            success: false,
            mandateId,
            reservedAmount: "0.00",
            remainingBudget: remaining.toFixed(2),
            reason: `Requested amount $${amount.toFixed(2)} exceeds remaining mandate budget $${remaining.toFixed(2)}`,
          };
        }

        const newSpent = spentAmount + amount;
        await tx.execute(
          sql`UPDATE ${mandates} 
              SET spent_amount = ${newSpent.toFixed(2)}, 
                  status = ${newSpent >= maxAmount ? "EXHAUSTED" : "ACTIVE"} 
              WHERE id = ${mandateId}`,
        );

        return {
          success: true,
          mandateId,
          reservedAmount: amount.toFixed(2),
          remainingBudget: (maxAmount - newSpent).toFixed(2),
        };
      });
    } catch (err) {
      logger.error("Database budget reservation transaction failed", {
        error: String(err),
      });
      if (process.env.NODE_ENV === "production") {
        throw new Error(
          "Database transaction failure in production (Fail-Closed)",
        );
      }
      return {
        success: false,
        mandateId,
        reservedAmount: "0.00",
        remainingBudget: "0.00",
        reason: `Database transaction error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  } else if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Database connection required in production mode (Fail-Closed)",
    );
  }

  // Fallback to In-Memory Mutex Lock for dev / tests
  const releaseLock = await acquireMandateLock(mandateId);
  try {
    const mandate = inMemoryMandates.get(mandateId);
    if (!mandate) {
      // Auto-create default test mandate if missing in test mode
      const defaultLimit = 100.0;
      if (amount <= defaultLimit) {
        seedInMemoryMandate({
          id: mandateId,
          maxAmount: defaultLimit,
          spentAmount: amount,
        });
        return {
          success: true,
          mandateId,
          reservedAmount: amount.toFixed(2),
          remainingBudget: (defaultLimit - amount).toFixed(2),
        };
      }
      return {
        success: false,
        mandateId,
        reservedAmount: "0.00",
        remainingBudget: "0.00",
        reason: `Mandate '${mandateId}' not found`,
      };
    }

    if (mandate.status !== "ACTIVE") {
      return {
        success: false,
        mandateId,
        reservedAmount: "0.00",
        remainingBudget: "0.00",
        reason: `Mandate '${mandateId}' is ${mandate.status}`,
      };
    }

    if (mandate.validUntil < new Date()) {
      return {
        success: false,
        mandateId,
        reservedAmount: "0.00",
        remainingBudget: "0.00",
        reason: `Mandate '${mandateId}' has expired`,
      };
    }

    const remaining = mandate.maxAmount - mandate.spentAmount;
    if (amount > remaining) {
      return {
        success: false,
        mandateId,
        reservedAmount: "0.00",
        remainingBudget: remaining.toFixed(2),
        reason: `Requested amount $${amount.toFixed(2)} exceeds remaining mandate budget $${remaining.toFixed(2)}`,
      };
    }

    mandate.spentAmount += amount;
    if (mandate.spentAmount >= mandate.maxAmount) {
      mandate.status = "EXHAUSTED";
    }

    return {
      success: true,
      mandateId,
      reservedAmount: amount.toFixed(2),
      remainingBudget: (mandate.maxAmount - mandate.spentAmount).toFixed(2),
    };
  } finally {
    releaseLock();
  }
}

/**
 * Atomically releases reserved budget (e.g. on blocked attack, user denial, or void).
 */
export async function releaseReservedBudget(
  mandateId: string,
  amount: number,
): Promise<void> {
  const db = getDb();
  if (db) {
    try {
      await db.transaction(async (tx) => {
        await tx.execute(
          sql`UPDATE ${mandates}
              SET spent_amount = GREATEST(0, CAST(spent_amount AS numeric) - ${amount.toFixed(2)}),
                  status = 'ACTIVE'
              WHERE id = ${mandateId}`,
        );
      });
      return;
    } catch (err) {
      logger.error("Failed to release budget in database", {
        error: String(err),
      });
      if (process.env.NODE_ENV === "production") {
        throw new Error(
          "Database unavailable for budget release in production",
        );
      }
    }
  }

  const release = await acquireMandateLock(mandateId);
  try {
    const mandate = inMemoryMandates.get(mandateId);
    if (mandate) {
      mandate.spentAmount = Math.max(0, mandate.spentAmount - amount);
      if (
        mandate.status === "EXHAUSTED" &&
        mandate.spentAmount < mandate.maxAmount
      ) {
        mandate.status = "ACTIVE";
      }
    }
  } finally {
    release();
  }
}
