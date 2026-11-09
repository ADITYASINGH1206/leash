import { getDb } from './connection.js';
import {
  ledger as ledgerTable,
  transactions as transactionsTable,
  mandates as mandatesTable,
  type TransactionRow,
  type MandateRow,
} from './schema.js';
import { LedgerService, type LedgerRow, computeLedgerHash, GENESIS_HASH } from '@leash/shared';
import { eq, desc, and, lte } from 'drizzle-orm';
import { logger } from '@leash/shared';
import { failClosedOnDbError } from "./storage-mode.js";

// Global shared ledger service instance (tracks ledger state in test/dev mode)
const inMemoryLedgerService = new LedgerService();

// In-memory repositories for test/dev
const inMemoryTransactions = new Map<string, TransactionRow>();
const inMemoryMandates = new Map<string, MandateRow>();

export class GatewayRepository {
  /**
   * Retrieves full hash-chained ledger rows
   */
  static async getLedgerRows(): Promise<readonly LedgerRow[]> {
    const db = getDb();
    if (db) {
      try {
        const rows = await db.select().from(ledgerTable).orderBy(ledgerTable.seq);
        return rows.map((r) => ({
          seq: r.seq,
          ts: r.ts.toISOString(),
          kind: r.kind,
          refId: r.refId,
          payload: r.payload as Record<string, unknown>,
          prevHash: r.prevHash,
          hash: r.hash,
        }));
      } catch (err) {
        logger.error('Failed to read ledger from database', { error: String(err) });
        if (failClosedOnDbError()) {
          throw new Error('Database unavailable for ledger query in production (Fail-Closed)');
        }
      }
    } else if (failClosedOnDbError()) {
      throw new Error('Database unavailable for ledger query in production (Fail-Closed)');
    }

    return inMemoryLedgerService.getRows();
  }

  /**
   * Appends an event to the tamper-evident ledger
   */
  static async appendLedgerEvent(
    kind: string,
    refId: string,
    payload: Record<string, unknown>
  ): Promise<LedgerRow> {
    const db = getDb();
    if (db) {
      try {
        // Read latest row to get prev_hash
        const latest = await db.select().from(ledgerTable).orderBy(desc(ledgerTable.seq)).limit(1);
        const prevHash = latest[0]?.hash || GENESIS_HASH;
        const hash = computeLedgerHash(prevHash, payload);

        const inserted = await db
          .insert(ledgerTable)
          .values({
            kind,
            refId,
            payload,
            prevHash,
            hash,
          })
          .returning();

        const row = inserted[0];
        if (row) {
          return {
            seq: row.seq,
            ts: row.ts.toISOString(),
            kind: row.kind,
            refId: row.refId,
            payload: row.payload as Record<string, unknown>,
            prevHash: row.prevHash,
            hash: row.hash,
          };
        }
      } catch (err) {
        logger.error('Database ledger insert failed', { error: String(err) });
        if (failClosedOnDbError()) {
          throw new Error('Database unavailable for ledger append in production (Fail-Closed)');
        }
      }
    } else if (failClosedOnDbError()) {
      throw new Error('Database unavailable for ledger append in production (Fail-Closed)');
    }

    return inMemoryLedgerService.append(kind, refId, payload);
  }

  /**
   * Saves or updates a transaction record
   */
  static async saveTransaction(txData: {
    id: string;
    mandateId: string;
    merchantId: string;
    amount: string;
    currency: string;
    verdict: string;
    status: string;
    paypalOrderId?: string;
    paypalAuthId?: string;
    paypalCaptureId?: string;
    holdReason?: string;
  }): Promise<void> {
    const db = getDb();
    if (db) {
      try {
        await db
          .insert(transactionsTable)
          .values({
            id: txData.id,
            mandateId: txData.mandateId,
            merchantId: txData.merchantId,
            amount: txData.amount,
            currency: txData.currency,
            verdict: txData.verdict,
            status: txData.status,
            paypalOrderId: txData.paypalOrderId,
            paypalAuthId: txData.paypalAuthId,
            paypalCaptureId: txData.paypalCaptureId,
            holdReason: txData.holdReason,
          })
          .onConflictDoUpdate({
            target: transactionsTable.id,
            set: {
              status: txData.status,
              verdict: txData.verdict,
              paypalOrderId: txData.paypalOrderId,
              paypalAuthId: txData.paypalAuthId,
              paypalCaptureId: txData.paypalCaptureId,
              holdReason: txData.holdReason,
              updatedAt: new Date(),
            },
          });
        return;
      } catch (err) {
        logger.error('Failed to save transaction to database', { error: String(err) });
        if (failClosedOnDbError()) {
          throw new Error('Database unavailable for transaction saving in production (Fail-Closed)');
        }
      }
    } else if (failClosedOnDbError()) {
      throw new Error('Database unavailable for transaction saving in production (Fail-Closed)');
    }

    // In-memory fallback for test/dev
    const now = new Date();
    inMemoryTransactions.set(txData.id, {
      id: txData.id,
      mandateId: txData.mandateId,
      merchantId: txData.merchantId,
      amount: txData.amount,
      currency: txData.currency,
      verdict: txData.verdict,
      status: txData.status,
      paypalOrderId: txData.paypalOrderId ?? null,
      paypalAuthId: txData.paypalAuthId ?? null,
      paypalCaptureId: txData.paypalCaptureId ?? null,
      holdReason: txData.holdReason ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * Retrieves transaction by ID
   */
  static async getTransaction(id: string): Promise<TransactionRow | null> {
    const db = getDb();
    if (db) {
      try {
        const rows = await db.select().from(transactionsTable).where(eq(transactionsTable.id, id));
        const first = rows[0];
        if (first) {
          return first;
        }
      } catch (err) {
        logger.error('Database getTransaction failed', { error: String(err) });
        if (failClosedOnDbError()) {
          throw new Error('Database unavailable for transaction retrieval in production');
        }
      }
    } else if (failClosedOnDbError()) {
      throw new Error('Database unavailable for transaction retrieval in production');
    }

    return inMemoryTransactions.get(id) || null;
  }

  /**
   * Retrieves mandate by ID
   */
  static async getMandate(id: string): Promise<MandateRow | null> {
    const db = getDb();
    if (db) {
      try {
        const rows = await db.select().from(mandatesTable).where(eq(mandatesTable.id, id));
        const first = rows[0];
        if (first) {
          return first;
        }
      } catch (err) {
        logger.error('Database getMandate failed', { error: String(err) });
        if (failClosedOnDbError()) {
          throw new Error('Database unavailable for mandate retrieval in production');
        }
      }
    } else if (failClosedOnDbError()) {
      throw new Error('Database unavailable for mandate retrieval in production');
    }

    return inMemoryMandates.get(id) || null;
  }

  /**
   * Retrieves all transactions (optionally filtered by status or creation age)
   */
  static async listTransactions(filter?: {
    status?: string;
    olderThan?: Date;
  }): Promise<TransactionRow[]> {
    const db = getDb();
    if (db) {
      try {
        let query = db.select().from(transactionsTable);
        const conditions = [];
        if (filter?.status) {
          conditions.push(eq(transactionsTable.status, filter.status));
        }
        if (filter?.olderThan) {
          conditions.push(lte(transactionsTable.createdAt, filter.olderThan));
        }
        if (conditions.length > 0) {
          query = query.where(and(...conditions)) as typeof query;
        }
        return await query.orderBy(desc(transactionsTable.createdAt));
      } catch (err) {
        logger.error('Database listTransactions failed', { error: String(err) });
        if (failClosedOnDbError()) {
          throw new Error('Database unavailable for listTransactions in production');
        }
      }
    } else if (failClosedOnDbError()) {
      throw new Error('Database unavailable for listTransactions in production');
    }

    // In-memory fallback for test/dev
    const list = Array.from(inMemoryTransactions.values());
    return list.filter((t) => {
      if (filter?.status && t.status !== filter.status) return false;
      if (filter?.olderThan && t.createdAt > filter.olderThan) return false;
      return true;
    });
  }
}
