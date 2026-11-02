'use client';

import React, { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Clock,
  ExternalLink,
  CheckCircle,
  XCircle,
  AlertOctagon,
  Cpu,
  Brain,
  Lock,
  Search,
  Check,
  X,
} from 'lucide-react';
import { submitHumanAction, type DecisionRecord } from '../lib/api';

const INITIAL_DECISIONS: DecisionRecord[] = [
  {
    id: 'tx_hold_stepup_981',
    mandateId: 'mandate_default_demo',
    merchantId: 'retro-keyboards-tokyo',
    amount: '129.00',
    currency: 'USD',
    verdict: 'HOLD',
    status: 'HELD',
    holdReason: 'First-time merchant with transaction amount > $10.00 requires human operator step-up',
    createdAt: 'Just now',
    layers: {
      layer0Budget: { ok: true, remainingBudget: '121.00' },
      layer1Policy: { verdict: 'HOLD', rulesTriggered: ['new-merchant-stepup-above-10'] },
      layer2Provenance: { verdict: 'ALLOW', confidence: 0.96, injectionDetected: false },
      layer3Intent: { verdict: 'ALLOW', confidence: 0.88, category: 'electronics' },
      layer4Risk: { score: 28, model: 'isolation_forest' },
    },
  },
  {
    id: 'tx_block_injection_842',
    mandateId: 'mandate_default_demo',
    merchantId: 'gadgethub-san-jose',
    amount: '100.00',
    currency: 'USD',
    verdict: 'BLOCK',
    status: 'BLOCKED',
    holdReason: 'Hostile DOM prompt injection on evidence page matches unapproved cart item',
    createdAt: '2 mins ago',
    layers: {
      layer0Budget: { ok: true, remainingBudget: '250.00' },
      layer1Policy: { verdict: 'ALLOW', rulesTriggered: [] },
      layer2Provenance: { verdict: 'BLOCK', confidence: 0.99, injectionDetected: true },
      layer3Intent: { verdict: 'ALLOW', confidence: 0.75, category: 'hardware' },
      layer4Risk: { score: 85, model: 'isolation_forest' },
    },
  },
  {
    id: 'tx_allow_authorized_712',
    mandateId: 'mandate_default_demo',
    merchantId: 'freshcart-palo-alto',
    amount: '45.00',
    currency: 'USD',
    verdict: 'ALLOW',
    status: 'AUTHORIZED',
    paypalOrderId: '8AA4829104829501B',
    paypalAuthId: 'AUTH_8AA4829104829501B',
    createdAt: '5 mins ago',
    layers: {
      layer0Budget: { ok: true, remainingBudget: '205.00' },
      layer1Policy: { verdict: 'ALLOW', rulesTriggered: [] },
      layer2Provenance: { verdict: 'ALLOW', confidence: 0.98, injectionDetected: false },
      layer3Intent: { verdict: 'ALLOW', confidence: 0.95, category: 'groceries' },
      layer4Risk: { score: 6, model: 'isolation_forest' },
    },
  },
];

export function LiveDecisionFeed() {
  const [decisions, setDecisions] = useState<DecisionRecord[]>(INITIAL_DECISIONS);
  const [actingId, setActingId] = useState<string | null>(null);

  const handleAction = async (id: string, action: 'APPROVE' | 'DENY') => {
    setActingId(id);
    try {
      const res = await submitHumanAction(id, action, action === 'APPROVE' ? 'Approved in Console' : 'Denied in Console');
      setDecisions((prev) =>
        prev.map((d) =>
          d.id === id
            ? {
                ...d,
                status: action === 'APPROVE' ? 'AUTHORIZED' : 'BLOCKED',
                verdict: action === 'APPROVE' ? 'ALLOW' : 'BLOCK',
                holdReason: action === 'APPROVE' ? 'Approved by human operator' : 'Denied by human operator; budget released',
              }
            : d
        )
      );
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between bg-surface border border-border p-4 rounded-xl">
        <div>
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Cpu className="w-4 h-4 text-emerald-light" />
            <span>5-Layer Autonomous Inspection Pipeline</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Every payment request is evaluated concurrently across deterministic and AI defenses before funds can be reserved on PayPal.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono bg-emerald-light/10 text-emerald-light border border-emerald/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-light animate-pulse" />
            <span>Fail-Closed Arbiter: Active (&lt; 2.4s)</span>
          </span>
        </div>
      </div>

      {/* Decision Cards List */}
      <div className="space-y-3">
        {decisions.map((tx) => (
          <div
            key={tx.id}
            className={`bg-surface border rounded-xl p-4 transition-all ${
              tx.verdict === 'ALLOW'
                ? 'border-emerald/40 hover:border-emerald-light/60'
                : tx.verdict === 'HOLD'
                  ? 'border-saffron/40 hover:border-saffron-light/60'
                  : 'border-rose-800/40 hover:border-rose-600/60'
            }`}
          >
            {/* Header Row */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-3 border-b border-border">
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono font-bold border ${
                    tx.verdict === 'ALLOW'
                      ? 'bg-emerald-dark/20 text-emerald-light border-emerald/40'
                      : tx.verdict === 'HOLD'
                        ? 'bg-saffron-dark/20 text-saffron-light border-saffron/40'
                        : 'bg-rose-950/40 text-rose-300 border-rose-800'
                  }`}
                >
                  {tx.verdict === 'ALLOW' && <CheckCircle className="w-3.5 h-3.5" />}
                  {tx.verdict === 'HOLD' && <Clock className="w-3.5 h-3.5" />}
                  {tx.verdict === 'BLOCK' && <AlertOctagon className="w-3.5 h-3.5" />}
                  <span>{tx.verdict} · {tx.status}</span>
                </span>

                <span className="text-xs font-mono font-semibold text-foreground">
                  {tx.amount} {tx.currency}
                </span>

                <span className="text-xs text-zinc-400 font-mono">
                  @ {tx.merchantId}
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs font-mono text-zinc-500">
                <span>{tx.id}</span>
                <span>·</span>
                <span>{tx.createdAt}</span>
              </div>
            </div>

            {/* 5 Layer Pipeline Breakdown */}
            {tx.layers && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 my-3 font-mono text-[11px]">
                {/* L0 */}
                <div className="p-2 rounded bg-background border border-border">
                  <div className="text-zinc-500 flex items-center gap-1">
                    <Lock className="w-3 h-3 text-techblue-light" />
                    <span>L0 Budget</span>
                  </div>
                  <div className="text-foreground font-semibold mt-0.5">
                    {tx.layers.layer0Budget?.ok ? 'RESERVED' : 'EXCEEDED'}
                  </div>
                </div>

                {/* L1 */}
                <div className="p-2 rounded bg-background border border-border">
                  <div className="text-zinc-500 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-emerald-light" />
                    <span>L1 Policy CEL</span>
                  </div>
                  <div
                    className={`font-semibold mt-0.5 ${
                      tx.layers.layer1Policy?.verdict === 'ALLOW'
                        ? 'text-emerald-light'
                        : 'text-saffron-light'
                    }`}
                  >
                    {tx.layers.layer1Policy?.verdict}
                  </div>
                </div>

                {/* L2 */}
                <div className="p-2 rounded bg-background border border-border">
                  <div className="text-zinc-500 flex items-center gap-1">
                    <Search className="w-3 h-3 text-purple-400" />
                    <span>L2 Provenance</span>
                  </div>
                  <div
                    className={`font-semibold mt-0.5 ${
                      tx.layers.layer2Provenance?.verdict === 'ALLOW'
                        ? 'text-emerald-light'
                        : 'text-rose-400'
                    }`}
                  >
                    {tx.layers.layer2Provenance?.verdict}
                  </div>
                </div>

                {/* L3 */}
                <div className="p-2 rounded bg-background border border-border">
                  <div className="text-zinc-500 flex items-center gap-1">
                    <Brain className="w-3 h-3 text-pink-400" />
                    <span>L3 Intent</span>
                  </div>
                  <div className="text-foreground font-semibold mt-0.5">
                    {tx.layers.layer3Intent?.verdict} ({Math.round((tx.layers.layer3Intent?.confidence || 0) * 100)}%)
                  </div>
                </div>

                {/* L4 */}
                <div className="p-2 rounded bg-background border border-border">
                  <div className="text-zinc-500 flex items-center gap-1">
                    <Cpu className="w-3 h-3 text-amber-400" />
                    <span>L4 Risk Score</span>
                  </div>
                  <div
                    className={`font-semibold mt-0.5 ${
                      (tx.layers.layer4Risk?.score || 0) > 70
                        ? 'text-rose-400'
                        : 'text-emerald-light'
                    }`}
                  >
                    {tx.layers.layer4Risk?.score}/100
                  </div>
                </div>
              </div>
            )}

            {/* Hold Reason / Rationale / PayPal Links */}
            <div className="pt-2 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
              <div className="text-zinc-400 font-mono text-[11px]">
                {tx.holdReason ? (
                  <span className="text-saffron-light">Reason: {tx.holdReason}</span>
                ) : tx.paypalAuthId ? (
                  <span className="text-emerald-light">
                    PayPal Hold Active: <span className="text-zinc-200">{tx.paypalAuthId}</span> (Intent: AUTHORIZE)
                  </span>
                ) : null}
              </div>

              {/* Step-Up Human Action Buttons */}
              {tx.status === 'HELD' && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleAction(tx.id, 'APPROVE')}
                    disabled={actingId === tx.id}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded text-xs font-semibold bg-emerald-light/20 text-emerald-light border border-emerald/40 hover:bg-emerald-light/30 transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Approve</span>
                  </button>
                  <button
                    onClick={() => handleAction(tx.id, 'DENY')}
                    disabled={actingId === tx.id}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded text-xs font-semibold bg-rose-950/40 text-rose-300 border border-rose-800 hover:bg-rose-900/50 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Deny & Release</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
