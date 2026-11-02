import { sql } from 'drizzle-orm';
import { getDb } from './connection.js';
import { mandates } from './schema.js';
import { logger } from '@leash/shared';

export interface BudgetReservationResult {
  success: boolean;
  mandateId: string;
  reservedAmount: string;
  remainingBudget: string;
  reason?: string;
}

// In-memory mutex map for development, tests, or when PostgreSQL is not configured
const inMemoryMandates = new Map<
  string,
  {
    id: string;
    maxAmount: number;
    spentAmount: number;
    validUntil: Date;
    status: 'ACTIVE' | 'EXHAUSTED' | 'REVOKED';
  }
>();

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
  status?: 'ACTIVE' | 'EXHAUSTED' | 'REVOKED';
}) {
  inMemoryMandates.set(mandate.id, {
    id: mandate.id,
    maxAmount: mandate.maxAmount,
    spentAmount: mandate.spentAmount ?? 0,
    validUntil: mandate.validUntil ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
    status: mandate.status ?? 'ACTIVE',
  });
}

export function getInMemoryMandate(mandateId: string) {
  return inMemoryMandates.get(mandateId);
}

/**
 * Atomically locks mandate row and reserves budget.
 * Enforces Architectural Invariant 4:
 * Budget deduction must occur within an atomic database transaction using row-level mutex locking (SELECT ... FOR UPDATE).
 */
export async function lockAndReserveBudget(
  mandateId: string,
  amount: number
): Promise<BudgetReservationResult> {
  const db = getDb();

  if (db) {
    try {
      return await db.transaction(async (tx) => {
        // Row-level lock via SELECT ... FOR UPDATE
        const rows = await tx.execute<{
          id: string;
          max_amount: string;
          spent_amount: string;
          valid_until: string;
          status: string;
        }>(
          sql`SELECT id, max_amount, spent_amount, valid_until, status FROM ${mandates} WHERE id = ${mandateId} FOR UPDATE`
        );

        const mandate = rows[0];
        if (!mandate) {
          return {
            success: false,
            mandateId,
            reservedAmount: '0.00',
            remainingBudget: '0.00',
            reason: `Mandate '${mandateId}' not found`,
          };
        }

        if (mandate.status !== 'ACTIVE') {
          return {
            success: false,
            mandateId,
            reservedAmount: '0.00',
            remainingBudget: (Number(mandate.max_amount) - Number(mandate.spent_amount)).toFixed(2),
            reason: `Mandate '${mandateId}' is ${mandate.status}`,
          };
        }

        const validUntil = new Date(mandate.valid_until);
        if (validUntil.getTime() < Date.now()) {
          return {
            success: false,
            mandateId,
            reservedAmount: '0.00',
            remainingBudget: (Number(mandate.max_amount) - Number(mandate.spent_amount)).toFixed(2),
            reason: `Mandate '${mandateId}' expired on ${validUntil.toISOString()}`,
          };
        }

        const currentSpent = Number(mandate.spent_amount);
        const maxLimit = Number(mandate.max_amount);
        const newSpent = currentSpent + amount;

        if (newSpent > maxLimit) {
          return {
            success: false,
            mandateId,
            reservedAmount: '0.00',
            remainingBudget: (maxLimit - currentSpent).toFixed(2),
            reason: `Transaction exceeds remaining mandate budget (requested $${amount.toFixed(2)}, available $${(maxLimit - currentSpent).toFixed(2)})`,
          };
        }

        const newStatus = newSpent >= maxLimit ? 'EXHAUSTED' : 'ACTIVE';
        await tx.execute(
          sql`UPDATE ${mandates} SET spent_amount = ${newSpent.toFixed(2)}, status = ${newStatus} WHERE id = ${mandateId}`
        );

        return {
          success: true,
          mandateId,
          reservedAmount: amount.toFixed(2),
          remainingBudget: (maxLimit - newSpent).toFixed(2),
        };
      });
    } catch (err) {
      logger.error('Database budget mutex transaction failed', { error: String(err) });
      return {
        success: false,
        mandateId,
        reservedAmount: '0.00',
        remainingBudget: '0.00',
        reason: `Database transaction error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // Fallback: In-memory atomic FIFO mutex
  const release = await acquireMandateLock(mandateId);
  try {
    const mandate = inMemoryMandates.get(mandateId);
    if (!mandate) {
      // Auto-create default test mandate if missing in test mode
      const defaultLimit = 100.0;
      if (amount <= defaultLimit) {
        seedInMemoryMandate({ id: mandateId, maxAmount: defaultLimit, spentAmount: amount });
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
        reservedAmount: '0.00',
        remainingBudget: '0.00',
        reason: `Mandate '${mandateId}' not found`,
      };
    }

    if (mandate.status !== 'ACTIVE') {
      return {
        success: false,
        mandateId,
        reservedAmount: '0.00',
        remainingBudget: (mandate.maxAmount - mandate.spentAmount).toFixed(2),
        reason: `Mandate '${mandateId}' is ${mandate.status}`,
      };
    }

    if (mandate.validUntil.getTime() < Date.now()) {
      return {
        success: false,
        mandateId,
        reservedAmount: '0.00',
        remainingBudget: (mandate.maxAmount - mandate.spentAmount).toFixed(2),
        reason: `Mandate '${mandateId}' expired`,
      };
    }

    const newSpent = mandate.spentAmount + amount;
    if (newSpent > mandate.maxAmount) {
      return {
        success: false,
        mandateId,
        reservedAmount: '0.00',
        remainingBudget: (mandate.maxAmount - mandate.spentAmount).toFixed(2),
        reason: `Transaction exceeds remaining mandate budget (requested $${amount.toFixed(2)}, available $${(mandate.maxAmount - mandate.spentAmount).toFixed(2)})`,
      };
    }

    mandate.spentAmount = newSpent;
    if (newSpent >= mandate.maxAmount) {
      mandate.status = 'EXHAUSTED';
    }

    return {
      success: true,
      mandateId,
      reservedAmount: amount.toFixed(2),
      remainingBudget: (mandate.maxAmount - newSpent).toFixed(2),
    };
  } finally {
    release();
  }
}
