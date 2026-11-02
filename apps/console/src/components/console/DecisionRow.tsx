'use client';

import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { gateway, type DecisionView } from '../../lib/api';
import { signApprovalPayload } from '../../lib/device-wallet';
import { Stamp } from '../ui/Stamp';
import { Button } from '../ui/Button';

export const LAYER_ORDER = ['mandate', 'policy', 'provenance', 'intent', 'risk'] as const;
export const LAYER_NAME: Record<(typeof LAYER_ORDER)[number], string> = {
  mandate: 'Mandate check',
  policy: 'Policy rules',
  provenance: 'Provenance scan',
  intent: 'Intent judge',
  risk: 'Risk score',
};

const PIP: Record<string, string> = {
  ALLOW: 'bg-allow border-allow',
  HOLD: 'bg-hold border-hold',
  BLOCK: 'bg-block border-block',
};

export const merchantName = (id: string) =>
  id.replace(/^mer_/, '').replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export function timeAgo(ts: string) {
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(ts).toLocaleDateString();
}

/** The five checks as a row of pips: filled with the verdict, hollow if it never ran. */
export function LayerPips({ d }: { d: DecisionView }) {
  return (
    <ol className="flex items-center gap-1.5" aria-label="Check results">
      {LAYER_ORDER.map((l, i) => {
        const v = d.layers[l]?.verdict;
        return (
          <li key={l} title={`${i} ${LAYER_NAME[l]}: ${v ?? 'did not run'}`} className="flex items-center gap-1.5">
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full border text-[0.62rem] font-semibold ${
                v ? `${PIP[v]} text-paper-raised` : 'border-rule-strong text-ink-faint'
              }`}
            >
              {i}
            </span>
            <span className="sr-only">
              {LAYER_NAME[l]}: {v ?? 'did not run'}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function DecisionRow({
  d,
  readOnly,
  onChanged,
  defaultOpen = false,
}: {
  d: DecisionView;
  readOnly: boolean;
  onChanged?: () => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [busy, setBusy] = useState<'approve' | 'deny' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const approve = async () => {
    setBusy('approve');
    setError(null);
    try {
      const tx = await gateway.transaction(d.id);
      const signed = await signApprovalPayload({
        transactionId: tx.id,
        mandateId: tx.mandateId,
        approvedAmount: Number(tx.amount).toFixed(2),
        currency: tx.currency,
      });
      await gateway.approve(d.id, signed, 'Approved in the console with this device key');
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const deny = async () => {
    setBusy('deny');
    setError(null);
    try {
      await gateway.deny(d.id, 'Denied in the console');
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="rounded-sheet border border-rule bg-paper-raised shadow-sheet"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="grid w-full grid-cols-[1fr_auto] items-center gap-x-6 gap-y-3 px-5 py-4 text-left sm:grid-cols-[7.5rem_1fr_auto_auto]"
      >
        <span className="order-2 justify-self-end sm:order-none sm:justify-self-start">
          <Stamp value={d.status} size="sm" />
        </span>
        <span className="order-1 min-w-0 sm:order-none">
          <span className="block truncate text-step-0 font-semibold text-ink">
            ${d.amount} <span className="font-normal text-ink-soft">at {merchantName(d.merchantId)}</span>
          </span>
          <span className="block truncate text-step--1 text-ink-faint">{d.reason ?? 'Passed every check'}</span>
        </span>
        <span className="order-3 sm:order-none">
          <LayerPips d={d} />
        </span>
        <span className="order-4 justify-self-end text-step--1 text-ink-faint sm:order-none">{timeAgo(d.ts)}</span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="border-t border-rule px-5 py-5">
              <ol className="grid gap-3 md:grid-cols-5">
                {LAYER_ORDER.map((l, i) => {
                  const r = d.layers[l];
                  return (
                    <li key={l} className="rounded-note border border-rule bg-paper/60 p-3">
                      <p className="flex items-baseline justify-between gap-2 text-step--1">
                        <span className="font-medium text-ink">
                          <span className="font-display text-intaglio">{i}</span> {LAYER_NAME[l]}
                        </span>
                      </p>
                      <p
                        className={`mt-1 text-[0.75rem] font-semibold ${
                          r?.verdict === 'BLOCK' ? 'text-block' : r?.verdict === 'HOLD' ? 'text-hold' : r ? 'text-allow' : 'text-ink-faint'
                        }`}
                      >
                        {r ? r.verdict : 'Did not run'}
                        {l === 'risk' && d.riskScore !== undefined ? `, ${d.riskScore} of 100` : ''}
                      </p>
                      {r?.message && <p className="mt-1.5 text-[0.75rem] leading-snug text-ink-soft">{r.message}</p>}
                    </li>
                  );
                })}
              </ol>
              <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-1 text-[0.75rem] text-ink-soft">
                <div>
                  <dt className="inline text-ink-faint">Decision </dt>
                  <dd className="inline font-mono">{d.id}</dd>
                </div>
                <div>
                  <dt className="inline text-ink-faint">Mandate </dt>
                  <dd className="inline font-mono">{d.mandateId}</dd>
                </div>
                {d.paypalAuthId && (
                  <div>
                    <dt className="inline text-ink-faint">PayPal authorization </dt>
                    <dd className="inline font-mono">{d.paypalAuthId}</dd>
                  </div>
                )}
                {d.paypalCaptureId && (
                  <div>
                    <dt className="inline text-ink-faint">Capture </dt>
                    <dd className="inline font-mono">{d.paypalCaptureId}</dd>
                  </div>
                )}
              </dl>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {d.status === 'HELD' && (
        <div className="flex flex-wrap items-center gap-3 border-t border-rule bg-hold-wash/40 px-5 py-3">
          <p className="mr-auto text-step--1 text-ink">Waiting for you. Approving signs the held amount with this device&apos;s key.</p>
          <Button variant="primary" onClick={approve} disabled={readOnly || busy !== null}>
            {busy === 'approve' ? 'Signing…' : 'Sign and approve'}
          </Button>
          <Button variant="danger" onClick={deny} disabled={readOnly || busy !== null}>
            {busy === 'deny' ? 'Denying…' : 'Deny'}
          </Button>
          {error && (
            <p role="alert" className="w-full text-step--1 text-block">
              {error}
            </p>
          )}
        </div>
      )}
    </motion.li>
  );
}
