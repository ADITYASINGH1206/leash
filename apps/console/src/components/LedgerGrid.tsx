'use client';

import React, { useState, useMemo, useRef, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, ICellRendererParams, ValueFormatterParams } from 'ag-grid-community';
import {
  ShieldCheck,
  ShieldAlert,
  Download,
  Search,
  ExternalLink,
  CheckCircle2,
  Copy,
  RefreshCw,
  Eye,
  FileCheck2,
} from 'lucide-react';
import { verifyLedgerChainBrowser } from '../lib/crypto';
import type { LedgerEventRow } from '../lib/api';

interface LedgerGridProps {
  initialRows: LedgerEventRow[];
  onRefresh?: () => void;
}

export function LedgerGrid({ initialRows, onRefresh }: LedgerGridProps) {
  const gridRef = useRef<AgGridReact<LedgerEventRow>>(null);
  const [quickFilterText, setQuickFilterText] = useState('');
  const [selectedRow, setSelectedRow] = useState<LedgerEventRow | null>(null);
  const [verificationResult, setVerificationResult] = useState<{
    tested: boolean;
    valid: boolean;
    verifiedCount: number;
    reason?: string;
    verifying: boolean;
  }>({
    tested: false,
    valid: true,
    verifiedCount: 0,
    verifying: false,
  });

  // Client-Side Cryptographic Chain Verifier
  const handleVerifyChain = useCallback(async () => {
    setVerificationResult((prev) => ({ ...prev, verifying: true }));
    try {
      const res = await verifyLedgerChainBrowser(initialRows);
      setVerificationResult({
        tested: true,
        valid: res.valid,
        verifiedCount: res.verifiedCount,
        reason: res.reason,
        verifying: false,
      });
    } catch (err) {
      setVerificationResult({
        tested: true,
        valid: false,
        verifiedCount: 0,
        reason: String(err),
        verifying: false,
      });
    }
  }, [initialRows]);

  // Export to CSV via AG Grid native API
  const handleExportCsv = useCallback(() => {
    if (gridRef.current?.api) {
      gridRef.current.api.exportDataAsCsv({
        fileName: `leash-ledger-chain-${Date.now()}.csv`,
      });
    }
  }, []);

  // AG Grid Column Definitions
  const columnDefs = useMemo<ColDef<LedgerEventRow>[]>(() => [
    {
      headerName: 'Seq',
      field: 'seq',
      width: 85,
      pinned: 'left',
      sortable: true,
      filter: 'agNumberColumnFilter',
      cellRenderer: (params: ICellRendererParams<LedgerEventRow, number>) => (
        <span className="font-mono text-xs font-semibold text-techblue-light">
          #{params.value}
        </span>
      ),
    },
    {
      headerName: 'Timestamp (UTC)',
      field: 'ts',
      width: 170,
      sortable: true,
      filter: 'agDateColumnFilter',
      valueFormatter: (params: ValueFormatterParams<LedgerEventRow, string>) => {
        if (!params.value) return '';
        try {
          const d = new Date(params.value);
          return d.toISOString().replace('T', ' ').substring(0, 19);
        } catch {
          return params.value;
        }
      },
    },
    {
      headerName: 'Event Kind',
      field: 'kind',
      width: 220,
      sortable: true,
      filter: 'agTextColumnFilter',
      cellRenderer: (params: ICellRendererParams<LedgerEventRow, string>) => {
        const kind = params.value || '';
        let colorClass = 'bg-zinc-800 text-zinc-300 border-zinc-700';
        if (kind.includes('VERDICT')) {
          colorClass = 'bg-emerald-dark/30 text-emerald-light border-emerald/40 font-semibold';
        } else if (kind.includes('PROVENANCE') || kind.includes('INJECTION')) {
          colorClass = 'bg-rose-950/40 text-rose-300 border-rose-800/50';
        } else if (kind.includes('INTENT')) {
          colorClass = 'bg-purple-950/40 text-purple-300 border-purple-800/50';
        } else if (kind.includes('PAYPAL')) {
          colorClass = 'bg-blue-950/40 text-blue-300 border-blue-800/50';
        } else if (kind.includes('DISCREPANCY')) {
          colorClass = 'bg-amber-950/40 text-amber-300 border-amber-700/50';
        }

        return (
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono border ${colorClass}`}>
            {kind}
          </span>
        );
      },
    },
    {
      headerName: 'Reference ID',
      field: 'refId',
      width: 200,
      sortable: true,
      filter: 'agTextColumnFilter',
      cellRenderer: (params: ICellRendererParams<LedgerEventRow, string>) => (
        <span className="font-mono text-xs text-zinc-300 truncate" title={params.value ?? undefined}>
          {params.value}
        </span>
      ),
    },
    {
      headerName: 'Payload Summary',
      field: 'payload',
      flex: 1,
      minWidth: 260,
      valueGetter: (params) => {
        const p = params.data?.payload;
        if (!p) return '';
        if (p.verdict) return `Verdict: ${p.verdict} · Risk: ${p.riskScore ?? 'N/A'}`;
        if (p.amount) return `${p.amount} ${p.currency || 'USD'} · Ref: ${p.transactionId || params.data?.refId}`;
        if (p.intent) return String(p.intent).substring(0, 50) + '...';
        return JSON.stringify(p).substring(0, 60) + '...';
      },
      cellRenderer: (params: ICellRendererParams<LedgerEventRow>) => (
        <span className="text-xs text-zinc-400 font-mono truncate block">
          {params.value}
        </span>
      ),
    },
    {
      headerName: 'Hash Pointer',
      field: 'hash',
      width: 140,
      cellRenderer: (params: ICellRendererParams<LedgerEventRow, string>) => {
        const hash = params.value || '';
        return (
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-zinc-400">
            <span className="text-zinc-500">{hash.substring(0, 6)}...{hash.substring(hash.length - 4)}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(hash);
              }}
              className="text-zinc-600 hover:text-zinc-300 transition-colors"
              title="Copy full SHA-256 hash"
            >
              <Copy className="w-3 h-3" />
            </button>
          </div>
        );
      },
    },
    {
      headerName: 'Actions',
      width: 90,
      pinned: 'right',
      cellRenderer: (params: ICellRendererParams<LedgerEventRow>) => (
        <button
          onClick={() => setSelectedRow(params.data || null)}
          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
        >
          <Eye className="w-3 h-3 text-techblue-light" />
          <span>View</span>
        </button>
      ),
    },
  ], []);

  const defaultColDef = useMemo<ColDef>(() => ({
    resizable: true,
    filter: true,
  }), []);

  return (
    <div className="space-y-4">
      {/* AG Grid Action Toolbar & Cryptographic Verifier Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-surface border border-border p-3.5 rounded-lg">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search ledger chain..."
              value={quickFilterText}
              onChange={(e) => setQuickFilterText(e.target.value)}
              className="bg-background border border-border rounded pl-9 pr-3 py-1.5 text-xs text-foreground placeholder:text-zinc-500 focus:outline-none focus:border-techblue-light w-64 font-mono"
            />
          </div>

          <button
            onClick={handleVerifyChain}
            disabled={verificationResult.verifying}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-emerald-light/10 text-emerald-light border border-emerald-light/30 hover:bg-emerald-light/20 transition-all glow-emerald"
          >
            {verificationResult.verifying ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5" />
            )}
            <span>Verify Chain (SHA-256)</span>
          </button>

          {onRefresh && (
            <button
              onClick={onRefresh}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-zinc-300 border border-border hover:bg-surface-elevated transition-colors"
              title="Refresh ledger from Gateway"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="text-xs text-zinc-400 font-mono mr-2">
            Chain Height: <span className="text-foreground font-semibold">#{initialRows.length}</span>
          </div>

          <button
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-zinc-200 bg-surface-elevated border border-border hover:border-zinc-500 transition-colors"
            title="Download full tamper-evident ledger as CSV via AG Grid"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Verification Status Banner */}
      {verificationResult.tested && (
        <div
          className={`p-3 rounded-lg border text-xs flex items-center justify-between ${
            verificationResult.valid
              ? 'bg-emerald-dark/15 border-emerald/40 text-emerald-light'
              : 'bg-rose-950/40 border-rose-800 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {verificationResult.valid ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-light" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-rose-400" />
            )}
            <div>
              <span className="font-semibold">
                {verificationResult.valid
                  ? 'Cryptographic Hash-Chain Integrity Verified'
                  : 'Tampering Detected in Ledger Chain'}
              </span>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                {verificationResult.valid
                  ? `All ${verificationResult.verifiedCount} sequential blocks verified client-side using RFC 8785 canonical JSON and SHA-256.`
                  : `Chain validation failed: ${verificationResult.reason}`}
              </p>
            </div>
          </div>

          <div className="text-[11px] font-mono text-zinc-400">
            Genesis Hash: <span className="text-zinc-300">00000000...</span>
          </div>
        </div>
      )}

      {/* AG Grid Component */}
      <div className="ag-theme-quartz-dark w-full h-[520px] rounded-lg overflow-hidden border border-border shadow-2xl">
        <AgGridReact<LedgerEventRow>
          ref={gridRef}
          rowData={initialRows}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          quickFilterText={quickFilterText}
          pagination={true}
          paginationPageSize={20}
          paginationPageSizeSelector={[10, 20, 50, 100]}
          animateRows={true}
          rowSelection="single"
          onRowClicked={(event) => setSelectedRow(event.data || null)}
        />
      </div>

      {/* Event Details Drawer Modal */}
      {selectedRow && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="p-4 border-b border-border flex items-center justify-between bg-surface-elevated">
              <div className="flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-emerald-light" />
                <h3 className="text-sm font-semibold text-foreground">
                  Ledger Event #{selectedRow.seq} · {selectedRow.kind}
                </h3>
              </div>
              <button
                onClick={() => setSelectedRow(null)}
                className="text-zinc-400 hover:text-zinc-200 text-sm font-mono"
              >
                ✕ Close
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1 font-mono text-xs">
              <div className="grid grid-cols-2 gap-3 text-zinc-400">
                <div>
                  <span className="text-zinc-500 block">Reference ID</span>
                  <span className="text-foreground">{selectedRow.refId}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block">Timestamp</span>
                  <span className="text-foreground">{selectedRow.ts}</span>
                </div>
              </div>

              <div>
                <span className="text-zinc-500 block mb-1">Previous Hash (Parent Pointer)</span>
                <div className="bg-background p-2 rounded border border-border text-zinc-300 break-all select-all">
                  {selectedRow.prevHash}
                </div>
              </div>

              <div>
                <span className="text-zinc-500 block mb-1">Current Block Hash: SHA-256(prev_hash + canonical_json(payload))</span>
                <div className="bg-background p-2 rounded border border-border text-emerald-light break-all select-all font-semibold">
                  {selectedRow.hash}
                </div>
              </div>

              <div>
                <span className="text-zinc-500 block mb-1">Canonical RFC 8785 JSON Payload</span>
                <pre className="bg-background p-3 rounded border border-border text-zinc-200 overflow-x-auto text-[11px] max-h-60">
                  {JSON.stringify(selectedRow.payload, null, 2)}
                </pre>
              </div>
            </div>

            <div className="p-3 border-t border-border bg-surface-elevated flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(selectedRow, null, 2));
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Event JSON</span>
              </button>
              <button
                onClick={() => setSelectedRow(null)}
                className="px-4 py-1.5 rounded text-xs font-semibold bg-emerald-light/20 text-emerald-light border border-emerald/30 hover:bg-emerald-light/30 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
