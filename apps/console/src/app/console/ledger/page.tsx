'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { AgGridReact } from 'ag-grid-react';
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type ColDef,
  type RowClickedEvent,
} from 'ag-grid-community';
import { PageHeader } from '../../../components/console/ConsoleShell';
import { SourceNotice } from '../../../components/ui/SourceNotice';
import { Button } from '../../../components/ui/Button';
import { useLedgerData } from '../../../hooks/useLedgerData';
import { usePrefersReducedMotion } from '../../../hooks/useReducedMotion';
import { computeLedgerHashBrowser, GENESIS_HASH } from '../../../lib/crypto';
import type { LedgerEventRow } from '../../../lib/api';
import type { LinkState } from '../../../components/three/ChainScene';

ModuleRegistry.registerModules([AllCommunityModule]);

const ChainScene = dynamic(() => import('../../../components/three/ChainScene'), { ssr: false });

const gridTheme = themeQuartz.withParams({
  backgroundColor: '#F5F6F1',
  foregroundColor: '#142039',
  headerBackgroundColor: '#E8EBE3',
  headerTextColor: '#4A5670',
  borderColor: 'rgba(20, 32, 57, 0.14)',
  rowHoverColor: 'rgba(36, 64, 184, 0.06)',
  selectedRowBackgroundColor: 'rgba(36, 64, 184, 0.1)',
  oddRowBackgroundColor: '#F0F2EB',
  accentColor: '#2440B8',
  fontFamily: '"Schibsted Grotesk Variable", system-ui, sans-serif',
  fontSize: 13,
  headerFontWeight: 600,
  wrapperBorderRadius: 10,
});

const KIND_LABEL: Record<string, string> = {
  MANDATE_SIGNED: 'Mandate signed',
  PAYMENT_REQUESTED: 'Payment requested',
  LAYER_POLICY_EVALUATED: 'Policy rules',
  LAYER_PROVENANCE_SCANNED: 'Provenance scan',
  LAYER_INTENT_EVALUATED: 'Intent judge',
  LAYER_RISK_SCORED: 'Risk score',
  DECISION_VERDICT: 'Decision',
  PAYPAL_AUTH_HELD: 'PayPal hold placed',
  USER_APPROVAL: 'Approved by you',
  USER_DENIAL: 'Denied by you',
  PAYPAL_CAPTURED: 'Captured',
  PAYPAL_VOIDED: 'Hold voided',
  PAYPAL_RECONCILED: 'Reconciled with PayPal',
  RECONCILIATION_DISCREPANCY: 'Reconciliation mismatch',
};

const SHOWN_LINKS = 16;

export default function LedgerPage() {
  const { rows, source, error } = useLedgerData(5000);
  const reduced = usePrefersReducedMotion();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<LedgerEventRow | null>(null);
  const [linkStates, setLinkStates] = useState<Record<number, LinkState>>({});
  const [active, setActive] = useState(-1);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [verifying, setVerifying] = useState(false);
  const grid = useRef<AgGridReact<LedgerEventRow>>(null);

  const tail = rows.slice(-SHOWN_LINKS);
  const states = tail.map((r) => linkStates[r.seq] ?? 'idle');

  /** Recomputes every hash in order, the same check the gateway runs. */
  const verify = useCallback(async () => {
    setVerifying(true);
    setResult(null);
    setLinkStates({});
    let prev = GENESIS_HASH;
    // Only the links drawn in the chain are animated; earlier entries verify at full speed
    const firstShown = rows.length - tail.length;
    const step = reduced ? 0 : 90;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      const recomputed = await computeLedgerHashBrowser(r.prevHash, r.payload);
      const ok = r.seq === i + 1 && r.prevHash === prev && recomputed === r.hash;
      if (i >= firstShown || !ok) {
        setActive(i - firstShown);
        setLinkStates((s) => ({ ...s, [r.seq]: ok ? 'ok' : 'bad' }));
      }
      if (!ok) {
        setResult({ ok: false, text: `Entry #${r.seq} does not match its hash. Everything after it is untrusted.` });
        setVerifying(false);
        setActive(-1);
        return;
      }
      prev = r.hash;
      if (step && i >= firstShown) await new Promise((res) => setTimeout(res, step));
    }
    setActive(-1);
    setResult({ ok: true, text: `All ${rows.length} entries verified in your browser. Latest hash ${prev.slice(0, 12)}…` });
    setVerifying(false);
  }, [rows, reduced, tail.length]);

  const columns = useMemo<ColDef<LedgerEventRow>[]>(
    () => [
      { headerName: '#', field: 'seq', width: 76, sort: 'desc' },
      {
        headerName: 'Time',
        field: 'ts',
        width: 108,
        valueFormatter: (p) => (p.value ? new Date(p.value).toLocaleTimeString() : ''),
      },
      {
        headerName: 'Event',
        field: 'kind',
        width: 170,
        valueFormatter: (p) => KIND_LABEL[p.value as string] ?? p.value,
        filter: true,
      },
      {
        headerName: 'Verdict',
        width: 96,
        valueGetter: (p) => (p.data?.payload?.verdict as string) ?? '',
        cellClass: (p) =>
          p.value === 'BLOCK' ? 'text-block font-semibold' : p.value === 'HOLD' ? 'text-hold font-semibold' : p.value ? 'text-allow font-semibold' : '',
      },
      { headerName: 'Reference', field: 'refId', flex: 1, minWidth: 140, cellClass: 'font-mono text-[12px]' },
      {
        headerName: 'Hash',
        field: 'hash',
        width: 132,
        cellClass: 'font-mono text-[12px] text-ink-soft',
        valueFormatter: (p) => (p.value ? `${String(p.value).slice(0, 10)}…` : ''),
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Ledger"
        lede="Every event in order. Each entry's hash covers the entry before it, so changing any past row breaks every row after it."
        actions={
          <>
            <Button variant="primary" onClick={verify} disabled={verifying || rows.length === 0}>
              {verifying ? 'Verifying…' : 'Verify the chain'}
            </Button>
            <Button
              onClick={() => grid.current?.api.exportDataAsCsv({ fileName: `leash-ledger-${Date.now()}.csv` })}
              disabled={rows.length === 0}
            >
              Export CSV
            </Button>
          </>
        }
      />
      <div className="space-y-6">
        <SourceNotice source={source} error={error} />

        <figure className="relative overflow-hidden rounded-sheet border border-rule bg-paper-raised/60">
          <div className="h-44 sm:h-56">{tail.length > 0 && <ChainScene states={states} active={active} still={reduced} />}</div>
          <figcaption className="flex flex-wrap items-center justify-between gap-2 border-t border-rule px-5 py-3 text-step--1">
            <span className="text-ink-soft">
              The latest {tail.length} of {rows.length} entries
            </span>
            <span role="status" className={result ? (result.ok ? 'text-allow' : 'text-block') : 'text-ink-faint'}>
              {result?.text ?? 'Not verified yet'}
            </span>
          </figcaption>
        </figure>

        <label className="block max-w-sm text-step--1 text-ink-soft">
          Search the ledger
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="A mandate, decision id, merchant…"
            className="mt-1 block w-full rounded-note border border-rule-strong bg-paper-raised px-3 py-2 text-step-0 text-ink placeholder:text-ink-faint"
          />
        </label>

        <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
          <div className="h-[34rem]">
            <AgGridReact<LedgerEventRow>
              ref={grid}
              theme={gridTheme}
              rowData={rows}
              columnDefs={columns}
              quickFilterText={query}
              rowSelection={{ mode: 'singleRow', checkboxes: false, enableClickSelection: true }}
              onRowClicked={(e: RowClickedEvent<LedgerEventRow>) => setSelected(e.data ?? null)}
              getRowId={(p) => String(p.data.seq)}
              animateRows
            />
          </div>
          <aside className="rounded-sheet border border-rule bg-paper-raised p-5" aria-live="polite">
            {selected ? (
              <>
                <p className="text-step--1 text-ink-faint">Entry #{selected.seq}</p>
                <h2 className="mt-1 text-step-1 font-semibold text-ink">{KIND_LABEL[selected.kind] ?? selected.kind}</h2>
                <dl className="mt-4 space-y-2 text-[0.75rem]">
                  <div>
                    <dt className="text-ink-faint">Previous hash</dt>
                    <dd className="break-all font-mono text-ink-soft">{selected.prevHash}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-faint">Hash</dt>
                    <dd className="break-all font-mono text-ink-soft">{selected.hash}</dd>
                  </div>
                </dl>
                <pre className="mt-4 max-h-80 overflow-auto rounded-note bg-ink p-3 font-mono text-[0.72rem] leading-relaxed text-paper-raised">
                  {JSON.stringify(selected.payload, null, 2)}
                </pre>
              </>
            ) : (
              <p className="text-step--1 text-ink-soft">Select a row to see its full payload and hashes.</p>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}
