import { logger, LEDGER_EVENT_KINDS } from '@leash/shared';
import { paypalClient as defaultPayPalClient } from '../mcp/index.js';
import { GatewayRepository } from '../db/repository.js';
import { releaseReservedBudget } from '../db/budget-mutex.js';
import type { AutoVoidOptions, AutoVoidResult } from './types.js';

export const DEFAULT_AUTO_VOID_THRESHOLD_MS = 72 * 60 * 60 * 1000; // 72 hours

/**
 * Auto-voids stale unfulfilled authorizations older than 72 hours.
 * PayPal guarantees a 3-day honor window for authorizations.
 * If no signed fulfillment notice is received within 72h, Leash:
 * 1. Calls PayPal POST /v2/payments/authorizations/{id}/void
 * 2. Releases reserved budget back to the user's mandate
 * 3. Updates transaction status to VOIDED
 * 4. Appends a cryptographically chained event to the tamper-evident ledger
 */
export async function executeAutoVoidJob(
  options: AutoVoidOptions = {}
): Promise<AutoVoidResult> {
  const start = Date.now();
  const thresholdMs = options.olderThanMs ?? DEFAULT_AUTO_VOID_THRESHOLD_MS;
  const thresholdDate = new Date(Date.now() - thresholdMs);
  const client = options.paypalClient ?? defaultPayPalClient;

  logger.info('Executing 72-Hour Auto-Void job', {
    thresholdMs,
    thresholdCutoff: thresholdDate.toISOString(),
  });

  const staleTxs = await GatewayRepository.listTransactions({
    status: 'AUTHORIZED',
    olderThan: thresholdDate,
  });

  const voidedIds: string[] = [];
  const errors: Array<{ transactionId: string; error: string }> = [];
  let releasedSum = 0;

  for (const tx of staleTxs) {
    try {
      if (tx.paypalAuthId) {
        try {
          await client.voidAuthorization(tx.paypalAuthId);
        } catch (err) {
          logger.warn('PayPal void authorization API returned error', {
            transactionId: tx.id,
            paypalAuthId: tx.paypalAuthId,
            error: String(err),
          });
        }
      }

      // Atomically restore the reserved budget
      await releaseReservedBudget(tx.mandateId, Number(tx.amount));
      releasedSum += Number(tx.amount);

      // Transition transaction state to VOIDED
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
        holdReason: 'Auto-voided: 72-hour unfulfilled authorization timeout expired',
      });

      // Append immutable audit log to ledger
      await GatewayRepository.appendLedgerEvent(
        LEDGER_EVENT_KINDS.PAYPAL_VOIDED,
        tx.id,
        {
          transactionId: tx.id,
          mandateId: tx.mandateId,
          merchantId: tx.merchantId,
          paypalAuthId: tx.paypalAuthId,
          paypalOrderId: tx.paypalOrderId,
          amount: String(tx.amount),
          currency: tx.currency,
          reason: '72_HOUR_TIMEOUT_EXPIRED',
          releasedBudget: String(tx.amount),
          voidedAt: new Date().toISOString(),
        }
      );

      voidedIds.push(tx.id);
      logger.info('Stale authorization auto-voided and budget released', {
        transactionId: tx.id,
        mandateId: tx.mandateId,
        amount: tx.amount,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error('Failed to auto-void stale transaction', {
        transactionId: tx.id,
        error: errMsg,
      });
      errors.push({ transactionId: tx.id, error: errMsg });
    }
  }

  const durationMs = Date.now() - start;
  const result: AutoVoidResult = {
    processedCount: staleTxs.length,
    voidedCount: voidedIds.length,
    releasedAmountTotal: releasedSum.toFixed(2),
    voidedIds,
    errors,
    durationMs,
    timestamp: new Date().toISOString(),
  };

  logger.info('72-Hour Auto-Void job completed', {
    processed: result.processedCount,
    voided: result.voidedCount,
    releasedTotal: result.releasedAmountTotal,
    durationMs: result.durationMs,
  });

  return result;
}
