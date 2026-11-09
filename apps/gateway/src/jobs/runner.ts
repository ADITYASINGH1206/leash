import { PgBoss } from 'pg-boss';
import { logger } from '@leash/shared';
import { executeAutoVoidJob } from './autovoid.js';
import { executeReconciliationJob } from './reconcile.js';
import { memoryStorageRequested } from '../db/storage-mode.js';
import {
  JOB_NAMES,
  type AutoVoidOptions,
  type AutoVoidResult,
  type ReconcileOptions,
  type ReconcileResult,
  type JobRunnerStatus,
} from './types.js';

export interface JobRunnerOptions {
  databaseUrl?: string;
  enableTimers?: boolean;
  autoVoidIntervalMs?: number;
  reconcileIntervalMs?: number;
}

export class JobRunner {
  private boss: PgBoss | null = null;
  private databaseConnected = false;
  private timers: NodeJS.Timeout[] = [];
  private isRunning = false;

  private lastAutoVoidRun?: string;
  private lastAutoVoidResult?: AutoVoidResult;
  private lastReconcileRun?: string;
  private lastReconcileResult?: ReconcileResult;

  constructor(private options: JobRunnerOptions = {}) {}

  /**
   * Starts the background job runner.
   * If DATABASE_URL is available and reachable, initializes pg-boss.
   * Otherwise falls back to in-memory mode so gateway continues running without crashing.
   */
  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    const dbUrl = memoryStorageRequested()
      ? undefined
      : this.options.databaseUrl || process.env.DATABASE_URL;

    if (dbUrl) {
      try {
        logger.info('Initializing pg-boss background queue with PostgreSQL', {
          dbUrl: dbUrl.replace(/:[^:@]+@/, ':***@'),
        });

        const boss = new PgBoss(dbUrl);
        await boss.start();
        this.boss = boss;
        this.databaseConnected = true;

        // Ensure queues exist
        await boss.createQueue(JOB_NAMES.AUTO_VOID);
        await boss.createQueue(JOB_NAMES.RECONCILE);

        // Register worker for 72-hour auto-void
        await boss.work(JOB_NAMES.AUTO_VOID, async () => {
          await this.runAutoVoidNow();
        });

        // Register worker for hourly reconciliation
        await boss.work(JOB_NAMES.RECONCILE, async () => {
          await this.runReconciliationNow();
        });

        // Register schedules (every 15 min for auto-void check, hourly for ledger reconciliation)
        await boss.schedule(JOB_NAMES.AUTO_VOID, '*/15 * * * *');
        await boss.schedule(JOB_NAMES.RECONCILE, '0 * * * *');

        logger.info('pg-boss background jobs successfully scheduled');
        return;
      } catch (err) {
        logger.warn('Failed to start pg-boss (falling back to in-memory mode)', {
          error: String(err),
        });
        this.boss = null;
        this.databaseConnected = false;
      }
    }

    // In-memory timer fallback
    if (this.options.enableTimers) {
      const autoVoidInterval = this.options.autoVoidIntervalMs ?? 15 * 60 * 1000;
      const reconInterval = this.options.reconcileIntervalMs ?? 60 * 60 * 1000;

      logger.info('Starting background jobs with in-memory intervals', {
        autoVoidIntervalMs: autoVoidInterval,
        reconcileIntervalMs: reconInterval,
      });

      const t1 = setInterval(() => {
        this.runAutoVoidNow().catch((err) =>
          logger.error('In-memory auto-void job failed', { error: String(err) })
        );
      }, autoVoidInterval);

      const t2 = setInterval(() => {
        this.runReconciliationNow().catch((err) =>
          logger.error('In-memory reconciliation job failed', { error: String(err) })
        );
      }, reconInterval);

      t1.unref?.();
      t2.unref?.();
      this.timers.push(t1, t2);
    }
  }

  /**
   * Manually or programmatically executes the 72-Hour Auto-Void job
   */
  async runAutoVoidNow(options?: AutoVoidOptions): Promise<AutoVoidResult> {
    const result = await executeAutoVoidJob(options);
    this.lastAutoVoidRun = result.timestamp;
    this.lastAutoVoidResult = result;
    return result;
  }

  /**
   * Manually or programmatically executes the Hourly Reconciliation job
   */
  async runReconciliationNow(options?: ReconcileOptions): Promise<ReconcileResult> {
    const result = await executeReconciliationJob(options);
    this.lastReconcileRun = result.timestamp;
    this.lastReconcileResult = result;
    return result;
  }

  /**
   * Returns current health and execution statistics
   */
  getStatus(): JobRunnerStatus {
    return {
      status: this.isRunning
        ? this.databaseConnected
          ? 'running'
          : 'in-memory'
        : 'stopped',
      engine: this.databaseConnected
        ? 'pg-boss'
        : this.timers.length > 0
          ? 'in-memory-timer'
          : 'manual',
      databaseConnected: this.databaseConnected,
      lastAutoVoidRun: this.lastAutoVoidRun,
      lastAutoVoidResult: this.lastAutoVoidResult,
      lastReconcileRun: this.lastReconcileRun,
      lastReconcileResult: this.lastReconcileResult,
    };
  }

  /**
   * Stops queues, workers, and active timer handles
   */
  async stop(): Promise<void> {
    this.isRunning = false;

    for (const t of this.timers) {
      clearInterval(t);
    }
    this.timers = [];

    if (this.boss) {
      try {
        await this.boss.stop({ graceful: true });
      } catch (err) {
        logger.warn('Error while stopping pg-boss', { error: String(err) });
      }
      this.boss = null;
    }

    this.databaseConnected = false;
    logger.info('Background job runner stopped');
  }
}

// Global default job runner instance
export const jobRunner = new JobRunner();
