import type { PayPalClient } from '@leash/paypal';

export const JOB_NAMES = {
  AUTO_VOID: 'leash:auto-void-stale-authorizations',
  RECONCILE: 'leash:hourly-ledger-reconciliation',
} as const;

export interface AutoVoidOptions {
  /**
   * Age threshold in milliseconds. Authorizations older than this threshold are voided.
   * Default is 72 hours (259,200,000 ms) matching PayPal's 3-day guarantee.
   */
  olderThanMs?: number;
  paypalClient?: PayPalClient;
}

export interface AutoVoidResult {
  processedCount: number;
  voidedCount: number;
  releasedAmountTotal: string;
  voidedIds: string[];
  errors: Array<{ transactionId: string; error: string }>;
  durationMs: number;
  timestamp: string;
}

export interface ReconciliationDiscrepancy {
  transactionId: string;
  mandateId: string;
  paypalAuthId: string;
  internalStatus: string;
  paypalStatus: string;
  reconciledStatus?: string;
  details: string;
}

export interface ReconcileOptions {
  paypalClient?: PayPalClient;
  limit?: number;
}

export interface ReconcileResult {
  scannedCount: number;
  matchedCount: number;
  discrepancyCount: number;
  discrepancies: ReconciliationDiscrepancy[];
  durationMs: number;
  timestamp: string;
}

export interface JobRunnerStatus {
  status: 'running' | 'stopped' | 'in-memory';
  engine: 'pg-boss' | 'in-memory-timer' | 'manual';
  databaseConnected: boolean;
  lastAutoVoidRun?: string;
  lastAutoVoidResult?: AutoVoidResult;
  lastReconcileRun?: string;
  lastReconcileResult?: ReconcileResult;
}
