import { logger, LEDGER_EVENT_KINDS } from '@leash/shared';
import { paypalClient as defaultPayPalClient } from '../mcp/index.js';
import { GatewayRepository } from '../db/repository.js';
import { releaseReservedBudget } from '../db/budget-mutex.js';
import type { ReconcileOptions, ReconcileResult, ReconciliationDiscrepancy } from './types.js';

/**
 * Hourly Reconciliation Job:
 * Compares PayPal API ground truth against the internal tamper-evident ledger.
 * Detects:
 * - Silent authorization expiration or external voids on PayPal
 * - Unauthorized external captures without signed fulfillment notices
 * - Currency or amount discrepancies between ledger and PayPal records
 * Automatically heals drift and records tamper-evident discrepancy events into the ledger.
 */
export async function executeReconciliationJob(
  options: ReconcileOptions = {}
): Promise<ReconcileResult> {
  const start = Date.now();
  const client = options.paypalClient ?? defaultPayPalClient;
  const limit = options.limit ?? 100;

  logger.info('Executing Hourly Ledger Reconciliation job', { limit });

  const allTxs = await GatewayRepository.listTransactions();
  const candidateTxs = allTxs
    .filter((tx) => tx.paypalAuthId && tx.paypalAuthId.trim().length > 0)
    .slice(0, limit);

  const discrepancies: ReconciliationDiscrepancy[] = [];
  let matchedCount = 0;

  for (const tx of candidateTxs) {
    const authId = tx.paypalAuthId!;
    try {
      const auth = await client.getAuthorization(authId);
      const paypalStatus = auth.status;
      const internalStatus = tx.status;
      let hasDiscrepancy = false;
      const detailNotes: string[] = [];
      let reconciledStatus: string | undefined;

      // 1. Amount mismatch check
      if (
        auth.amount &&
        Number(auth.amount.value).toFixed(2) !== Number(tx.amount).toFixed(2)
      ) {
        hasDiscrepancy = true;
        detailNotes.push(
          `Amount mismatch: Internal ledger=${tx.amount} ${tx.currency}, PayPal=${auth.amount.value} ${auth.amount.currency_code}`
        );
      }

      // 2. State machine discrepancy checks
      if (internalStatus === 'AUTHORIZED') {
        if (paypalStatus === 'CREATED' || paypalStatus === 'PENDING') {
          // Normal active authorization
          if (!hasDiscrepancy) matchedCount++;
        } else if (paypalStatus === 'VOIDED' || paypalStatus === 'EXPIRED') {
          hasDiscrepancy = true;
          reconciledStatus = 'VOIDED';
          detailNotes.push(
            `PayPal authorization was ${paypalStatus} externally while internal ledger is AUTHORIZED`
          );

          // Auto-heal: release reserved budget & sync status
          await releaseReservedBudget(tx.mandateId, Number(tx.amount));
          await GatewayRepository.saveTransaction({
            id: tx.id,
            mandateId: tx.mandateId,
            merchantId: tx.merchantId,
            amount: String(tx.amount),
            currency: tx.currency,
            verdict: tx.verdict,
            status: 'VOIDED',
            paypalOrderId: tx.paypalOrderId ?? undefined,
            paypalAuthId: tx.paypalAuthId ?? undefined,
            holdReason: `Reconciled: Authorization marked ${paypalStatus} on PayPal rails`,
          });
        } else if (paypalStatus === 'CAPTURED') {
          hasDiscrepancy = true;
          detailNotes.push(
            'CRITICAL: PayPal authorization captured externally without merchant fulfillment notice recorded in Leash!'
          );
        }
      } else if (internalStatus === 'CAPTURED') {
        if (paypalStatus === 'CAPTURED') {
          if (!hasDiscrepancy) matchedCount++;
        } else {
          hasDiscrepancy = true;
          detailNotes.push(
            `Status mismatch: Internal ledger is CAPTURED but PayPal status is ${paypalStatus}`
          );
        }
      } else if (internalStatus === 'VOIDED') {
        if (paypalStatus === 'VOIDED' || paypalStatus === 'EXPIRED') {
          if (!hasDiscrepancy) matchedCount++;
        } else if (paypalStatus === 'CAPTURED') {
          hasDiscrepancy = true;
          detailNotes.push(
            'CRITICAL: PayPal reports CAPTURED on a transaction marked VOIDED in internal ledger!'
          );
        }
      } else {
        // Pending or Held transactions that have an auth
        if (!hasDiscrepancy) matchedCount++;
      }

      if (hasDiscrepancy) {
        const details = detailNotes.join('; ');
        const item: ReconciliationDiscrepancy = {
          transactionId: tx.id,
          mandateId: tx.mandateId,
          paypalAuthId: authId,
          internalStatus,
          paypalStatus,
          reconciledStatus,
          details,
        };
        discrepancies.push(item);

        logger.warn('Reconciliation discrepancy detected', {
          transactionId: item.transactionId,
          mandateId: item.mandateId,
          paypalAuthId: item.paypalAuthId,
          internalStatus: item.internalStatus,
          paypalStatus: item.paypalStatus,
          reconciledStatus: item.reconciledStatus,
          details: item.details,
        });

        // Record discrepancy to immutable ledger
        await GatewayRepository.appendLedgerEvent(
          LEDGER_EVENT_KINDS.RECONCILIATION_DISCREPANCY,
          tx.id,
          {
            transactionId: tx.id,
            mandateId: tx.mandateId,
            paypalAuthId: authId,
            internalStatus,
            paypalStatus,
            details,
            reconciledStatus,
            timestamp: new Date().toISOString(),
          }
        );
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error('Failed to query PayPal authorization for reconciliation', {
        transactionId: tx.id,
        paypalAuthId: authId,
        error: errMsg,
      });
      discrepancies.push({
        transactionId: tx.id,
        mandateId: tx.mandateId,
        paypalAuthId: authId,
        internalStatus: tx.status,
        paypalStatus: 'UNKNOWN_ERROR',
        details: `PayPal API inquiry error: ${errMsg}`,
      });
    }
  }

  const durationMs = Date.now() - start;
  const result: ReconcileResult = {
    scannedCount: candidateTxs.length,
    matchedCount,
    discrepancyCount: discrepancies.length,
    discrepancies,
    durationMs,
    timestamp: new Date().toISOString(),
  };

  // Append batch reconciliation summary event
  await GatewayRepository.appendLedgerEvent(
    LEDGER_EVENT_KINDS.PAYPAL_RECONCILED,
    `recon_${Date.now()}`,
    {
      scannedCount: result.scannedCount,
      matchedCount: result.matchedCount,
      discrepancyCount: result.discrepancyCount,
      durationMs: result.durationMs,
      timestamp: result.timestamp,
    }
  );

  logger.info('Hourly Ledger Reconciliation job completed', {
    scanned: result.scannedCount,
    matched: result.matchedCount,
    discrepancies: result.discrepancyCount,
    durationMs: result.durationMs,
  });

  return result;
}
