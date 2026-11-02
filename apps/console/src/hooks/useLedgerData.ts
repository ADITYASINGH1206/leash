'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildDecisions,
  gateway,
  getFallbackLedgerFixture,
  getSampleTransactions,
  type LedgerEventRow,
  type TransactionRecord,
} from '../lib/api';

export type DataSource = 'loading' | 'live' | 'sample';

/**
 * Live ledger + transactions, polled. When the gateway is unreachable the hook
 * switches to the recorded sample and says so via `source: 'sample'`, so pages
 * can label it and disable actions.
 */
export function useLedgerData(pollMs = 3000) {
  const [rows, setRows] = useState<LedgerEventRow[]>([]);
  const [txs, setTxs] = useState<TransactionRecord[]>([]);
  const [source, setSource] = useState<DataSource>('loading');
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const sourceRef = useRef<DataSource>('loading');

  const refresh = useCallback(async () => {
    try {
      const [ledger, transactions] = await Promise.all([gateway.ledger(), gateway.transactions()]);
      if (!alive.current) return;
      setRows(ledger);
      setTxs(transactions);
      sourceRef.current = 'live';
      setSource('live');
      setError(null);
    } catch (err) {
      if (!alive.current) return;
      setError(err instanceof Error ? err.message : String(err));
      // Keep the last live data on a transient error; otherwise use the sample
      if (sourceRef.current !== 'live') {
        sourceRef.current = 'sample';
        setRows(getFallbackLedgerFixture());
        setTxs(getSampleTransactions());
        setSource('sample');
      }
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    refresh();
    const id = setInterval(refresh, pollMs);
    return () => {
      alive.current = false;
      clearInterval(id);
    };
  }, [refresh, pollMs]);

  const decisions = useMemo(() => buildDecisions(rows, txs), [rows, txs]);
  return { rows, txs, decisions, source, error, refresh };
}
