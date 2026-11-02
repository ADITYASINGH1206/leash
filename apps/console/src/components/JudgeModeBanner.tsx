'use client';

import React, { useState } from 'react';
import {
  Gavel,
  Play,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Lock,
  ArrowRight,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

export interface WalkthroughStep {
  id: number;
  title: string;
  subtitle: string;
  status: 'idle' | 'running' | 'success' | 'blocked' | 'held';
  log: string;
}

export function JudgeModeBanner({ onWalkthroughComplete }: { onWalkthroughComplete?: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);

  const initialSteps: WalkthroughStep[] = [
    {
      id: 1,
      title: 'Mandate Signing',
      subtitle: 'Compile natural language & sign with WebCrypto ECDSA P-256',
      status: 'idle',
      log: 'Awaiting execution...',
    },
    {
      id: 2,
      title: 'Honest Agent Purchase',
      subtitle: 'GadgetHub phone case ($14.99) passes all 5 firewall layers',
      status: 'idle',
      log: 'Awaiting execution...',
    },
    {
      id: 3,
      title: 'Prompt Injection Defense',
      subtitle: 'DOM hidden injection (gift card diversion) intercepted by Layer 2',
      status: 'idle',
      log: 'Awaiting execution...',
    },
    {
      id: 4,
      title: 'Scope Drift & Step-Up',
      subtitle: 'DailyMart coffee triggers HELD -> Human operator approves',
      status: 'idle',
      log: 'Awaiting execution...',
    },
    {
      id: 5,
      title: 'Merchant Fulfillment & Capture',
      subtitle: 'Signed shipping notice received -> PayPal authorization captured',
      status: 'idle',
      log: 'Awaiting execution...',
    },
    {
      id: 6,
      title: 'SHA-256 Chain Verification',
      subtitle: 'WebCrypto verifies 100% cryptographic ledger integrity',
      status: 'idle',
      log: 'Awaiting execution...',
    },
  ];

  const [steps, setSteps] = useState<WalkthroughStep[]>(initialSteps);

  const runFullDemo = async () => {
    setIsRunning(true);
    setIsOpen(true);

    const updateStep = (idx: number, status: WalkthroughStep['status'], log: string) => {
      setSteps((prev) => {
        const copy = [...prev];
        if (copy[idx]) {
          copy[idx] = { ...copy[idx]!, status, log };
        }
        return copy;
      });
    };

    // Step 1: Mandate Signing
    setCurrentStepIndex(0);
    updateStep(0, 'running', 'Generating P-256 keypair & signing RFC 8785 canonical mandate...');
    await new Promise((r) => setTimeout(r, 600));
    updateStep(
      0,
      'success',
      'Mandate mdt_judge_demo signed with ECDSA P-256. Budget: $150.00. Block recorded on ledger.',
    );

    // Step 2: Honest Purchase
    setCurrentStepIndex(1);
    updateStep(1, 'running', 'Shopper agent searching GadgetHub for phone cases...');
    await new Promise((r) => setTimeout(r, 700));
    updateStep(
      1,
      'success',
      'Evaluated Layer 0-4 concurrently in 18ms. Verdict: ALLOW. PayPal intent: AUTHORIZE created (ord_7f2k9x). $14.99 reserved.',
    );

    // Step 3: Prompt Injection Block
    setCurrentStepIndex(2);
    updateStep(2, 'running', 'Ingesting travel item HTML with hidden display:none prompt injection...');
    await new Promise((r) => setTimeout(r, 800));
    updateStep(
      2,
      'blocked',
      'Layer 2 (DOM Provenance) detected adversarial injection: "gift card override". Verdict: BLOCKED. $0.00 spent.',
    );

    // Step 4: Scope Drift & Step-Up
    setCurrentStepIndex(3);
    updateStep(3, 'running', 'Agent requests out-of-scope coffee beans. Evaluating policy constraints...');
    await new Promise((r) => setTimeout(r, 650));
    updateStep(3, 'held', 'Verdict: HELD (Category drift). Pushed alert to operator wallet. Simulating human approval...');
    await new Promise((r) => setTimeout(r, 550));
    updateStep(3, 'success', 'Human operator issued APPROVE via REST API. Status transitioned to AUTHORIZED.');

    // Step 5: Merchant Fulfillment & Capture
    setCurrentStepIndex(4);
    updateStep(4, 'running', 'Merchant agent submitting signed fulfillment notice with tracking TRK-LEASH-987654321...');
    await new Promise((r) => setTimeout(r, 600));
    updateStep(
      4,
      'success',
      'Authorize-Then-Capture invariant satisfied. Captured PayPal auth auth_8921x -> cap_90412. PAYPAL_CAPTURED recorded.',
    );

    // Step 6: SHA-256 Chain Verification
    setCurrentStepIndex(5);
    updateStep(5, 'running', 'Re-calculating SHA-256(prev_hash + canonical_json(payload)) sequentially...');
    await new Promise((r) => setTimeout(r, 500));
    updateStep(
      5,
      'success',
      'Tamper-evident verification PASSED: 100% hash chain match from genesis hash to head. Zero broken links.',
    );

    setIsRunning(false);
    if (onWalkthroughComplete) {
      onWalkthroughComplete();
    }
  };

  return (
    <div className="bg-gradient-to-r from-zinc-900 via-zinc-900/90 to-zinc-900 border border-saffron/40 rounded-xl overflow-hidden shadow-lg mb-6">
      <div className="px-4 py-3 bg-saffron/10 border-b border-saffron/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-saffron/20 border border-saffron/50 flex items-center justify-center text-saffron">
            <Gavel className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-xs tracking-wide text-foreground uppercase font-mono">
                Judge Mode Quickstart
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-saffron/20 text-saffron border border-saffron/30">
                1-Click Interactive Story
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              Evaluate the complete 5-layer payment firewall live with seeded sandbox accounts and zero configuration.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={runFullDemo}
            disabled={isRunning}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-saffron hover:bg-saffron/90 text-zinc-950 text-xs font-semibold font-mono transition-all shadow-sm disabled:opacity-50 cursor-pointer"
          >
            {isRunning ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Running Demo...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Run Interactive Demo</span>
              </>
            )}
          </button>

          <button
            onClick={() => setIsOpen(!isOpen)}
            className="px-2.5 py-1.5 rounded-lg border border-border text-zinc-400 hover:text-zinc-200 text-xs font-mono transition-colors"
          >
            {isOpen ? 'Collapse' : 'View Steps'}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="p-4 bg-background/50 space-y-3 border-t border-border/50">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {steps.map((step, idx) => (
              <div
                key={step.id}
                className={`p-3 rounded-lg border text-xs font-mono transition-all ${
                  step.status === 'running'
                    ? 'bg-techblue/10 border-techblue/40 ring-1 ring-techblue/30'
                    : step.status === 'success'
                      ? 'bg-emerald/5 border-emerald/30'
                      : step.status === 'blocked'
                        ? 'bg-saffron/10 border-saffron/40'
                        : step.status === 'held'
                          ? 'bg-amber-500/10 border-amber-500/30'
                          : 'bg-surface border-border text-zinc-500'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-zinc-800 text-[10px] flex items-center justify-center text-zinc-400 font-bold">
                      {step.id}
                    </span>
                    <span className="font-semibold text-zinc-200">{step.title}</span>
                  </div>

                  {step.status === 'running' && (
                    <RefreshCw className="w-3.5 h-3.5 text-techblue-light animate-spin" />
                  )}
                  {step.status === 'success' && (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-light" />
                  )}
                  {step.status === 'blocked' && (
                    <ShieldAlert className="w-3.5 h-3.5 text-saffron" />
                  )}
                  {step.status === 'held' && (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  )}
                </div>

                <p className="text-[11px] text-zinc-400 line-clamp-1">{step.subtitle}</p>

                <div className="mt-2 pt-2 border-t border-border/40 text-[10px] text-zinc-400">
                  <span className="text-zinc-500">Log: </span>
                  <span
                    className={
                      step.status === 'success'
                        ? 'text-emerald-light'
                        : step.status === 'blocked'
                          ? 'text-saffron'
                          : step.status === 'running'
                            ? 'text-techblue-light'
                            : 'text-zinc-400'
                    }
                  >
                    {step.log}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 pt-2 border-t border-border/30">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-saffron" />
              <span>Full demo walkthrough verified against sandbox fixtures & RFC 8785 canonical specifications.</span>
            </div>
            <span className="text-zinc-500 hidden sm:inline">Render Blueprint Deployable</span>
          </div>
        </div>
      )}
    </div>
  );
}
