'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  Bell,
  BellRing,
  RefreshCw,
  Fingerprint,
  Lock,
  ArrowLeft,
  CheckCircle2,
  Sparkles,
  Smartphone,
  ExternalLink,
} from 'lucide-react';
import {
  fetchHeldTransactions,
  type HeldTransactionDetail,
} from '../../lib/api';
import {
  getOrCreateDeviceKey,
  getDeviceKeyFingerprint,
} from '../../lib/device-wallet';
import {
  registerServiceWorker,
  getPushStatus,
  subscribeToWebPush,
  type PushStatus,
} from '../../lib/push';
import { HeldPaymentCard } from '../../components/HeldPaymentCard';

export default function ApprovalsPage() {
  const [heldList, setHeldList] = useState<HeldTransactionDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fingerprint, setFingerprint] = useState<string>('key_init...');
  const [pushStatus, setPushStatus] = useState<PushStatus>({
    supported: false,
    permission: 'default',
    subscribed: false,
  });
  const [pushSubscribing, setPushSubscribing] = useState(false);

  const loadInitialData = async () => {
    try {
      // 1. Initialize device WebCrypto key in IndexedDB
      const kp = await getOrCreateDeviceKey();
      const fp = await getDeviceKeyFingerprint(kp);
      setFingerprint(fp);

      // 2. Register Service Worker & check Push
      await registerServiceWorker();
      const pStatus = await getPushStatus();
      setPushStatus(pStatus);

      // 3. Fetch held transactions
      const txs = await fetchHeldTransactions();
      setHeldList(txs);
    } catch (err) {
      console.warn('Initialization error:', err);
    } finally {
      setLoading(false);
    }
  };

  const refreshHeld = async () => {
    setRefreshing(true);
    try {
      const txs = await fetchHeldTransactions();
      setHeldList(txs);
    } finally {
      setRefreshing(false);
    }
  };

  const handleEnablePush = async () => {
    setPushSubscribing(true);
    try {
      const res = await subscribeToWebPush();
      if (res.success) {
        const updated = await getPushStatus();
        setPushStatus(updated);
      }
    } finally {
      setPushSubscribing(false);
    }
  };

  const handleCardResolved = (
    txId: string,
    status: 'AUTHORIZED' | 'BLOCKED',
    paypalAuthId?: string
  ) => {
    // Keep in list briefly for visual feedback
    setTimeout(() => {
      setHeldList((prev) => prev.filter((t) => t.id !== txId));
    }, 2500);
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-start p-4 sm:p-6 blueprint-grid">
      <div className="w-full max-w-md space-y-4">
        {/* Navigation & Device Header */}
        <header className="flex items-center justify-between pb-2 border-b border-border">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-emerald-light transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Console</span>
          </Link>

          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-light animate-pulse" />
            <span className="text-[11px] font-mono text-zinc-300">
              Live Gateway :4000
            </span>
          </div>
        </header>

        {/* PWA App Banner */}
        <div className="bg-surface border border-border rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-sm font-bold tracking-tight text-foreground flex items-center gap-1.5">
                  <span>LEASH APPROVALS</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800">
                    PWA
                  </span>
                </h1>
                <p className="text-[11px] text-zinc-400">
                  Step-Up Re-Signing for AI Shopping Agents
                </p>
              </div>
            </div>

            <button
              onClick={refreshHeld}
              disabled={refreshing}
              className="p-2 rounded-lg bg-background border border-border text-zinc-400 hover:text-zinc-100 transition-colors"
              title="Refresh Queue"
            >
              <RefreshCw
                className={`w-4 h-4 ${refreshing ? 'animate-spin text-emerald-light' : ''}`}
              />
            </button>
          </div>

          {/* Device Key & Status Bar */}
          <div className="pt-2 border-t border-border/80 flex items-center justify-between text-[11px] font-mono text-zinc-400">
            <div className="flex items-center gap-1.5">
              <Fingerprint className="w-3.5 h-3.5 text-techblue-light" />
              <span>Vault:</span>
              <span className="text-zinc-200 font-semibold">{fingerprint}</span>
            </div>

            <div className="flex items-center gap-1 text-emerald-400">
              <Lock className="w-3 h-3" />
              <span>WebCrypto P-256</span>
            </div>
          </div>
        </div>

        {/* Web Push Notification Toggle Card */}
        {pushStatus.supported && (
          <div className="bg-surface/80 border border-border rounded-xl p-3 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              {pushStatus.subscribed ? (
                <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <BellRing className="w-4 h-4" />
                </div>
              ) : (
                <div className="w-7 h-7 rounded-lg bg-zinc-800 text-zinc-400 flex items-center justify-center">
                  <Bell className="w-4 h-4" />
                </div>
              )}
              <div>
                <div className="font-semibold text-zinc-200">
                  {pushStatus.subscribed
                    ? 'Push Alerts Active'
                    : 'Enable Push Notifications'}
                </div>
                <div className="text-[10px] text-zinc-400">
                  {pushStatus.subscribed
                    ? 'Receiving instant alerts for held payments'
                    : 'Get notified immediately on anomalous agent purchases'}
                </div>
              </div>
            </div>

            {!pushStatus.subscribed && (
              <button
                onClick={handleEnablePush}
                disabled={pushSubscribing}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 transition-colors whitespace-nowrap"
              >
                {pushSubscribing ? 'Enabling...' : 'Enable'}
              </button>
            )}
          </div>
        )}

        {/* Section Header */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-zinc-200">
              Pending Step-Up Queue
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-saffron-500/20 text-saffron-300 border border-saffron-500/40 font-bold">
              {heldList.length}
            </span>
          </div>

          <span className="text-[11px] font-mono text-zinc-500">
            Fail-Closed Mode
          </span>
        </div>

        {/* Pending Held Cards */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-48 rounded-2xl bg-surface/50 border border-border animate-pulse"
              />
            ))}
          </div>
        ) : heldList.length > 0 ? (
          <div className="space-y-3">
            {heldList.map((tx) => (
              <HeldPaymentCard
                key={tx.id}
                tx={tx}
                deviceFingerprint={fingerprint}
                onResolved={handleCardResolved}
              />
            ))}
          </div>
        ) : (
          /* Empty State */
          <div className="bg-surface border border-border rounded-2xl p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-zinc-100">
                Queue Clear A No Held Payments
              </h3>
              <p className="text-xs text-zinc-400 mt-1 max-w-xs mx-auto">
                All autonomous agent shopping transactions are either authorized under mandate bounds or blocked by firewall rules.
              </p>
            </div>

            <div className="pt-2">
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-xs font-mono text-emerald-light hover:underline"
              >
                <span>View Full Tamper-Evident Ledger</span>
                <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
          </div>
        )}

        {/* Invariant Guarantees Footer */}
        <footer className="pt-4 pb-8 text-center space-y-1.5 border-t border-border/60">
          <div className="flex items-center justify-center gap-3 text-[11px] font-mono text-zinc-400">
            <span className="text-emerald-light">1. Authorize-Then-Capture</span>
            <span>A</span>
            <span className="text-techblue-light">2. Fail-Closed</span>
          </div>
          <p className="text-[10px] text-zinc-500 font-mono">
            PayPal AI Hackathon 2026 A Institutional Payment Firewall
          </p>
        </footer>
      </div>
    </div>
  );
}
