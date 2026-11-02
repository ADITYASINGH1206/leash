import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  executeAutoVoidJob,
  executeReconciliationJob,
  JobRunner,
  DEFAULT_AUTO_VOID_THRESHOLD_MS,
} from './jobs/index.js';
import { GatewayRepository } from './db/repository.js';
import {
  seedInMemoryMandate,
  getInMemoryMandate,
  lockAndReserveBudget,
} from './db/budget-mutex.js';
import { verifyLedgerChain, LEDGER_EVENT_KINDS } from '@leash/shared';
import { PayPalClient } from '@leash/paypal';
import { createServer } from './index.js';
import type { FastifyInstance } from 'fastify';

describe('Background Jobs: 72-Hour Auto-Void & Hourly Reconciliation (Issue #15)', () => {
  let app: FastifyInstance;
  const mockPayPal = new PayPalClient({
    clientId: 'sandbox_client_id_placeholder',
    clientSecret: 'sandbox_client_secret_placeholder',
    environment: 'sandbox',
    mockMode: true,
  });

  beforeEach(async () => {
    app = await createServer();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('72-Hour Auto-Void Job', () => {
    it('auto-voids stale authorizations older than 72 hours, releases mandate budget, and appends to ledger', async () => {
      const mandateId = `mandate_void_test_${Date.now()}`;
      seedInMemoryMandate({
        id: mandateId,
        maxAmount: 200.0,
        spentAmount: 0.0,
        intentText: 'Office equipment',
      });

      // Reserve $75 on this mandate
      const lockRes = await lockAndReserveBudget(mandateId, 75.0);
      expect(lockRes.success).toBe(true);

      const staleTxId = `tx_stale_${Date.now()}`;
      const staleAuthId = `auth_stale_123`;

      // Save an authorized transaction created 73 hours ago
      await GatewayRepository.saveTransaction({
        id: staleTxId,
        mandateId,
        merchantId: 'merch_gadgets',
        amount: '75.00',
        currency: 'USD',
        verdict: 'ALLOW',
        status: 'AUTHORIZED',
        paypalOrderId: 'order_stale_123',
        paypalAuthId: staleAuthId,
      });

      // Backdate the createdAt timestamp in memory to 73 hours ago
      const staleTx = await GatewayRepository.getTransaction(staleTxId);
      expect(staleTx).not.toBeNull();
      if (staleTx) {
        staleTx.createdAt = new Date(Date.now() - 73 * 60 * 60 * 1000);
      }

      // Also create a fresh authorization created just 1 hour ago
      const freshTxId = `tx_fresh_${Date.now()}`;
      seedInMemoryMandate({
        id: `mandate_fresh_${Date.now()}`,
        maxAmount: 200.0,
        spentAmount: 50.0,
        intentText: 'Fresh purchase',
      });
      await GatewayRepository.saveTransaction({
        id: freshTxId,
        mandateId: `mandate_fresh_${Date.now()}`,
        merchantId: 'merch_gadgets',
        amount: '50.00',
        currency: 'USD',
        verdict: 'ALLOW',
        status: 'AUTHORIZED',
        paypalOrderId: 'order_fresh_123',
        paypalAuthId: 'auth_fresh_123',
      });

      // Spy on PayPal client voidAuthorization
      const voidSpy = vi.spyOn(mockPayPal, 'voidAuthorization');

      // Execute auto-void job
      const result = await executeAutoVoidJob({
        olderThanMs: DEFAULT_AUTO_VOID_THRESHOLD_MS,
        paypalClient: mockPayPal,
      });

      expect(result.processedCount).toBeGreaterThanOrEqual(1);
      expect(result.voidedIds).toContain(staleTxId);
      expect(result.voidedIds).not.toContain(freshTxId);
      expect(Number(result.releasedAmountTotal)).toBeGreaterThanOrEqual(75.0);
      expect(voidSpy).toHaveBeenCalledWith(staleAuthId);

      // Verify the stale transaction is now marked VOIDED
      const updatedTx = await GatewayRepository.getTransaction(staleTxId);
      expect(updatedTx?.status).toBe('VOIDED');
      expect(updatedTx?.holdReason).toContain('Auto-voided');

      // Verify the fresh transaction is untouched
      const untouchedTx = await GatewayRepository.getTransaction(freshTxId);
      expect(untouchedTx?.status).toBe('AUTHORIZED');

      // Verify budget was refunded to mandate
      const mandate = getInMemoryMandate(mandateId);
      expect(mandate?.spentAmount).toBe(0.0);

      // Verify tamper-evident ledger has the PAYPAL_VOIDED event and hash chain remains valid
      const ledgerRows = await GatewayRepository.getLedgerRows();
      const voidEvent = ledgerRows.find(
        (r) => r.kind === LEDGER_EVENT_KINDS.PAYPAL_VOIDED && r.refId === staleTxId
      );
      expect(voidEvent).toBeDefined();
      expect((voidEvent?.payload as Record<string, unknown>).reason).toBe('72_HOUR_TIMEOUT_EXPIRED');

      const chainValidation = verifyLedgerChain([...ledgerRows]);
      expect(chainValidation.valid).toBe(true);
    });

    it('handles gracefully when PayPal void call fails without corrupting budget release', async () => {
      const mandateId = `mandate_fail_test_${Date.now()}`;
      seedInMemoryMandate({
        id: mandateId,
        maxAmount: 100.0,
        spentAmount: 30.0,
        intentText: 'Coffee beans',
      });

      const txId = `tx_err_${Date.now()}`;
      await GatewayRepository.saveTransaction({
        id: txId,
        mandateId,
        merchantId: 'merch_coffee',
        amount: '30.00',
        currency: 'USD',
        verdict: 'ALLOW',
        status: 'AUTHORIZED',
        paypalAuthId: 'auth_error_id',
      });

      const tx = await GatewayRepository.getTransaction(txId);
      if (tx) {
        tx.createdAt = new Date(Date.now() - 80 * 60 * 60 * 1000);
      }

      // Mock PayPal throwing a network or permission error
      const mockFailingPayPal = new PayPalClient({
        clientId: 'test',
        clientSecret: 'test',
        environment: 'sandbox',
        mockMode: true,
      });
      vi.spyOn(mockFailingPayPal, 'voidAuthorization').mockRejectedValueOnce(
        new Error('PayPal API 500: Internal Server Error')
      );

      const result = await executeAutoVoidJob({
        olderThanMs: DEFAULT_AUTO_VOID_THRESHOLD_MS,
        paypalClient: mockFailingPayPal,
      });

      expect(result.voidedIds).toContain(txId);
      const updatedTx = await GatewayRepository.getTransaction(txId);
      expect(updatedTx?.status).toBe('VOIDED');
      // Budget should still be safely recovered
      const mandate = getInMemoryMandate(mandateId);
      expect(mandate?.spentAmount).toBe(0.0);
    });
  });

  describe('Hourly Ledger Reconciliation Job', () => {
    it('matches clean authorizations and logs PAYPAL_RECONCILED ledger event', async () => {
      const txId = `tx_recon_clean_${Date.now()}`;
      const authId = `auth_clean_${Date.now()}`;

      await GatewayRepository.saveTransaction({
        id: txId,
        mandateId: 'mandate_clean',
        merchantId: 'merch_clean',
        amount: '45.00',
        currency: 'USD',
        verdict: 'ALLOW',
        status: 'AUTHORIZED',
        paypalAuthId: authId,
      });

      vi.spyOn(mockPayPal, 'getAuthorization').mockImplementation(async (id: string) => {
        const tx = (await GatewayRepository.listTransactions()).find((t) => t.paypalAuthId === id);
        return {
          id,
          status: 'CREATED',
          amount: { currency_code: 'USD', value: tx?.amount ?? '45.00' },
        };
      });

      const result = await executeReconciliationJob({
        paypalClient: mockPayPal,
        limit: 10,
      });

      expect(result.scannedCount).toBeGreaterThanOrEqual(1);
      expect(result.matchedCount).toBeGreaterThanOrEqual(1);
      expect(result.discrepancies.filter((d) => d.transactionId === txId)).toHaveLength(0);

      // Verify batch summary appended to ledger
      const ledgerRows = await GatewayRepository.getLedgerRows();
      const reconEvent = ledgerRows.find((r) => r.kind === LEDGER_EVENT_KINDS.PAYPAL_RECONCILED);
      expect(reconEvent).toBeDefined();

      const chainValidation = verifyLedgerChain([...ledgerRows]);
      expect(chainValidation.valid).toBe(true);
    });

    it('detects external authorization void on PayPal and auto-heals ledger drift', async () => {
      const mandateId = `mandate_drift_${Date.now()}`;
      seedInMemoryMandate({
        id: mandateId,
        maxAmount: 150.0,
        spentAmount: 60.0,
        intentText: 'Test drift',
      });

      const txId = `tx_drift_${Date.now()}`;
      const authId = `auth_drift_${Date.now()}`;

      await GatewayRepository.saveTransaction({
        id: txId,
        mandateId,
        merchantId: 'merch_drift',
        amount: '60.00',
        currency: 'USD',
        verdict: 'ALLOW',
        status: 'AUTHORIZED',
        paypalAuthId: authId,
      });

      // PayPal reports VOIDED externally (e.g. buyer cancelled on paypal.com or expired)
      vi.spyOn(mockPayPal, 'getAuthorization').mockImplementation(async (id: string) => {
        if (id === authId) {
          return {
            id: authId,
            status: 'VOIDED',
            amount: { currency_code: 'USD', value: '60.00' },
          };
        }
        const otherTx = (await GatewayRepository.listTransactions()).find((t) => t.paypalAuthId === id);
        return {
          id,
          status: 'CREATED',
          amount: { currency_code: 'USD', value: otherTx?.amount ?? '45.00' },
        };
      });

      const result = await executeReconciliationJob({
        paypalClient: mockPayPal,
        limit: 10,
      });

      const discrepancy = result.discrepancies.find((d) => d.transactionId === txId);
      expect(discrepancy).toBeDefined();
      expect(discrepancy?.reconciledStatus).toBe('VOIDED');

      // Auto-heal should update transaction to VOIDED and release budget
      const tx = await GatewayRepository.getTransaction(txId);
      expect(tx?.status).toBe('VOIDED');
      const mandate = getInMemoryMandate(mandateId);
      expect(mandate?.spentAmount).toBe(0.0);

      // RECONCILIATION_DISCREPANCY should be logged in ledger
      const ledgerRows = await GatewayRepository.getLedgerRows();
      const discEvent = ledgerRows.find(
        (r) => r.kind === LEDGER_EVENT_KINDS.RECONCILIATION_DISCREPANCY && r.refId === txId
      );
      expect(discEvent).toBeDefined();
    });

    it('flags critical discrepancy when authorization is captured externally without signed notice', async () => {
      const txId = `tx_ext_cap_${Date.now()}`;
      const authId = `auth_ext_cap_${Date.now()}`;

      await GatewayRepository.saveTransaction({
        id: txId,
        mandateId: 'mandate_cap',
        merchantId: 'merch_cap',
        amount: '90.00',
        currency: 'USD',
        verdict: 'ALLOW',
        status: 'AUTHORIZED',
        paypalAuthId: authId,
      });

      // PayPal reports CAPTURED externally without Leash receiving a signed fulfillment notice
      vi.spyOn(mockPayPal, 'getAuthorization').mockImplementation(async (id: string) => {
        if (id === authId) {
          return {
            id: authId,
            status: 'CAPTURED',
            amount: { currency_code: 'USD', value: '90.00' },
          };
        }
        const otherTx = (await GatewayRepository.listTransactions()).find((t) => t.paypalAuthId === id);
        return {
          id,
          status: 'CREATED',
          amount: { currency_code: 'USD', value: otherTx?.amount ?? '45.00' },
        };
      });

      const result = await executeReconciliationJob({
        paypalClient: mockPayPal,
        limit: 10,
      });

      const discrepancy = result.discrepancies.find((d) => d.transactionId === txId);
      expect(discrepancy).toBeDefined();
      expect(discrepancy?.details).toContain('CRITICAL');
    });
  });

  describe('Job Runner & REST Endpoints', () => {
    it('reports status via GET /api/v1/jobs/status', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/jobs/status',
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('engine');
      expect(data).toHaveProperty('databaseConnected');
    });

    it('triggers manual auto-void via POST /api/v1/jobs/autovoid/trigger', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/jobs/autovoid/trigger',
        payload: {
          olderThanMs: 0, // Void all pending authorizations immediately for testing
        },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data).toHaveProperty('processedCount');
      expect(data).toHaveProperty('voidedCount');
      expect(data).toHaveProperty('releasedAmountTotal');
    });

    it('triggers manual reconciliation via POST /api/v1/jobs/reconcile/trigger', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/jobs/reconcile/trigger',
        payload: {
          limit: 25,
        },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data).toHaveProperty('scannedCount');
      expect(data).toHaveProperty('matchedCount');
      expect(data).toHaveProperty('discrepancyCount');
    });

    it('gracefully starts and stops JobRunner lifecycle', async () => {
      const customRunner = new JobRunner({
        enableTimers: false,
      });

      await customRunner.start();
      const status = customRunner.getStatus();
      expect(status.status).toBe('in-memory');

      await customRunner.stop();
      const stoppedStatus = customRunner.getStatus();
      expect(stoppedStatus.status).toBe('stopped');
    });
  });
});
