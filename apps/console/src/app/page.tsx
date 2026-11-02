'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Table,
  Radio,
  FileSignature,
  BarChart3,
  Bot,
  ExternalLink,
  Lock,
  Layers,
  Cpu,
} from 'lucide-react';
import { LedgerGrid } from '../components/LedgerGrid';
import { LiveDecisionFeed } from '../components/LiveDecisionFeed';
import { MandateStudio } from '../components/MandateStudio';
import { BenchmarkDashboard } from '../components/BenchmarkDashboard';
import { LedgerCopilot } from '../components/LedgerCopilot';
import {
  fetchLedgerEvents,
  fetchGatewayHealth,
  type LedgerEventRow,
} from '../lib/api';

type TabType = 'ledger' | 'feed' | 'mandates' | 'benchmarks' | 'copilot';

export default function ConsolePage() {
  const [activeTab, setActiveTab] = useState<TabType>('ledger');
  const [ledgerRows, setLedgerRows] = useState<LedgerEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [gatewayStatus, setGatewayStatus] = useState<{
    status: string;
    service: string;
    ledgerHeight: number;
  }>({
    status: 'connecting',
    service: 'leash-gateway',
    ledgerHeight: 0,
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [rows, health] = await Promise.all([
        fetchLedgerEvents(),
        fetchGatewayHealth(),
      ]);
      setLedgerRows(rows);
      setGatewayStatus(health);
    } catch {
      // Handled in api.ts fallbacks
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Navigation Bar */}
      <header className="border-b border-border bg-surface/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-dark/20 border border-emerald/40 flex items-center justify-center text-emerald-light shadow-sm">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm tracking-tight text-foreground font-mono">
                  LEASH
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                  FIREWALL v0.1
                </span>
              </div>
              <p className="text-[10px] text-zinc-400 font-mono hidden sm:block">
                Institutional Payment Firewall for AI Agents · PayPal AI Hackathon
              </p>
            </div>
          </div>

          {/* Center Tabs */}
          <nav className="flex items-center gap-1 bg-background/80 p-1 rounded-lg border border-border">
            <button
              onClick={() => setActiveTab('ledger')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono transition-colors ${
                activeTab === 'ledger'
                  ? 'bg-surface-elevated text-emerald-light font-semibold shadow-sm border border-emerald/30'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Table className="w-3.5 h-3.5" />
              <span>AG Grid Ledger</span>
            </button>

            <button
              onClick={() => setActiveTab('feed')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono transition-colors ${
                activeTab === 'feed'
                  ? 'bg-surface-elevated text-emerald-light font-semibold shadow-sm border border-emerald/30'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Live Feed</span>
            </button>

            <button
              onClick={() => setActiveTab('mandates')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono transition-colors ${
                activeTab === 'mandates'
                  ? 'bg-surface-elevated text-emerald-light font-semibold shadow-sm border border-emerald/30'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <FileSignature className="w-3.5 h-3.5" />
              <span>Mandate Studio</span>
            </button>

            <button
              onClick={() => setActiveTab('benchmarks')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono transition-colors ${
                activeTab === 'benchmarks'
                  ? 'bg-surface-elevated text-emerald-light font-semibold shadow-sm border border-emerald/30'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>AgentPay-Bench</span>
            </button>

            <button
              onClick={() => setActiveTab('copilot')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono transition-colors ${
                activeTab === 'copilot'
                  ? 'bg-surface-elevated text-techblue-light font-semibold shadow-sm border border-techblue/30'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              <span>Copilot</span>
            </button>
          </nav>

          {/* Status Badges */}
          <div className="flex items-center gap-3">
            <div className="hidden lg:flex items-center gap-1.5 text-[11px] font-mono text-zinc-400 bg-background px-2.5 py-1 rounded border border-border">
              <span className="w-2 h-2 rounded-full bg-emerald-light animate-pulse" />
              <span>PayPal Sandbox</span>
            </div>

            <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-400 bg-background px-2.5 py-1 rounded border border-border">
              <span className="w-2 h-2 rounded-full bg-techblue-light" />
              <span>Gateway :4000</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'ledger' && (
          <div className="space-y-4">
            <div className="bg-surface border border-border p-4 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h1 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Table className="w-4 h-4 text-emerald-light" />
                  <span>AG Grid Tamper-Evident Ledger</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-dark/20 text-emerald-light border border-emerald/30">
                    AG Grid Community v33
                  </span>
                </h1>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Append-only cryptographic transaction ledger. Every row is SHA-256 chained to its predecessor. Click &ldquo;Verify Chain&rdquo; to re-calculate all hashes client-side in your browser.
                </p>
              </div>

              <div className="flex items-center gap-3 font-mono text-xs">
                <span className="text-zinc-500">Invariants:</span>
                <span className="text-emerald-light flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  <span>Authorize-Then-Capture</span>
                </span>
                <span className="text-zinc-600">·</span>
                <span className="text-techblue-light">Fail-Closed (&lt; 2.4s)</span>
              </div>
            </div>

            <LedgerGrid initialRows={ledgerRows} onRefresh={loadData} />
          </div>
        )}

        {activeTab === 'feed' && <LiveDecisionFeed />}
        {activeTab === 'mandates' && <MandateStudio />}
        {activeTab === 'benchmarks' && <BenchmarkDashboard />}
        {activeTab === 'copilot' && <LedgerCopilot />}
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-surface/40 py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs font-mono text-zinc-500 gap-2">
          <div className="flex items-center gap-2">
            <span>Leash: Payment Firewall for Autonomous AI Agents</span>
            <span>·</span>
            <span>PayPal AI Hackathon 2026</span>
          </div>

          <div className="flex items-center gap-4 text-zinc-400">
            <a
              href="https://github.com/ADITYASINGH1206/leash"
              target="_blank"
              rel="noreferrer"
              className="hover:text-emerald-light transition-colors flex items-center gap-1"
            >
              <span>GitHub Repo</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

