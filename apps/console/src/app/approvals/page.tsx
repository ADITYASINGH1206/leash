'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { LogoMark } from '../../components/brand/Logo';
import { Button } from '../../components/ui/Button';
import { Stamp } from '../../components/ui/Stamp';
import { LayerPips, LAYER_NAME, LAYER_ORDER, merchantName, timeAgo } from '../../components/console/DecisionRow';
import { useLedgerData } from '../../hooks/useLedgerData';
import { gateway, type DecisionView } from '../../lib/api';
import { getDeviceKeyFingerprint, getOrCreateDeviceKey, signApprovalPayload } from '../../lib/device-wallet';
import { getPushStatus, registerServiceWorker, subscribeToWebPush, type PushStatus } from '../../lib/push';

function HeldCard({ d, readOnly, onDone }: { d: DecisionView; readOnly: boolean; onDone: () => void }) {
  const [busy, setBusy] = useState<'approve' | 'deny' | null>(null);
  const [result, setResult] = useState<'AUTHORIZED' | 'BLOCKED' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const flagged = LAYER_ORDER.filter((l) => d.layers[l] && d.layers[l]!.verdict !== 'ALLOW');

  const act = async (kind: 'approve' | 'deny') => {
    setBusy(kind);
    setError(null);
    try {
      if (kind === 'approve') {
        const tx = await gateway.transaction(d.id);
        const signed = await signApprovalPayload({
          transactionId: tx.id,
          mandateId: tx.mandateId,
          approvedAmount: Number(tx.amount).toFixed(2),
          currency: tx.currency,
        });
        const res = await gateway.approve(d.id, signed, 'Approved on the Leash Approvals app');
        setResult(res.status === 'AUTHORIZED' ? 'AUTHORIZED' : 'BLOCKED');
      } else {
        await gateway.deny(d.id, 'Denied on the Leash Approvals app');
        setResult('BLOCKED');
      }
      setTimeout(onDone, 1600);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 40 }}
      className="relative overflow-hidden rounded-[18px] border border-rule bg-paper-raised p-5 shadow-sheet"
    >
      {result && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-paper-raised/85">
          <Stamp value={result === 'AUTHORIZED' ? 'APPROVED' : 'BLOCKED'} size="lg" animate />
        </div>
      )}
      <p className="text-step--1 text-ink-soft">
        Your agent wants to pay <span className="text-ink">{merchantName(d.merchantId)}</span>
      </p>
      <p className="mt-1 font-display text-step-6 leading-none tabular text-ink">${d.amount}</p>
      <p className="mt-3 text-step--1 text-ink">
        <span className="font-medium">Held because </span>
        {d.reason ?? 'a check asked for your confirmation'}
      </p>
      <div className="mt-4 flex items-center justify-between">
        <LayerPips d={d} />
        <span className="text-[0.75rem] text-ink-faint">{timeAgo(d.ts)}</span>
      </div>
      {flagged.length > 0 && (
        <ul className="mt-3 space-y-1 text-[0.75rem] text-ink-soft">
          {flagged.map((l) => (
            <li key={l}>
              <span className="font-medium text-ink">{LAYER_NAME[l]}:</span> {d.layers[l]!.message ?? d.layers[l]!.verdict}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button variant="danger" onClick={() => act('deny')} disabled={readOnly || busy !== null} className="py-3 text-step-0">
          {busy === 'deny' ? 'Denying…' : 'Deny'}
        </Button>
        <Button variant="primary" onClick={() => act('approve')} disabled={readOnly || busy !== null} className="py-3 text-step-0">
          {busy === 'approve' ? 'Signing…' : 'Sign and approve'}
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-step--1 text-block">
          {error}
        </p>
      )}
    </motion.li>
  );
}

export default function ApprovalsPage() {
  const { decisions, source, refresh } = useLedgerData(3000);
  const [fingerprint, setFingerprint] = useState('');
  const [push, setPush] = useState<PushStatus>({ supported: false, permission: 'default', subscribed: false });
  const [pushBusy, setPushBusy] = useState(false);
  const held = decisions.filter((d) => d.status === 'HELD');

  useEffect(() => {
    (async () => {
      try {
        const kp = await getOrCreateDeviceKey();
        setFingerprint(await getDeviceKeyFingerprint(kp));
        await registerServiceWorker();
        setPush(await getPushStatus());
      } catch {
        /* device key or push unavailable: the page still works for approvals */
      }
    })();
  }, []);

  return (
    <div className="mx-auto min-h-screen max-w-md px-4 pb-16 pt-5">
      <header className="flex items-center justify-between">
        <Link href="/console" className="flex items-center gap-2 text-ink">
          <LogoMark className="h-6 w-6 text-intaglio" />
          <span className="font-display text-step-1">Approvals</span>
        </Link>
        <span className="flex items-center gap-1.5 text-[0.75rem] text-ink-soft" role="status">
          <span className={`h-1.5 w-1.5 rounded-full ${source === 'live' ? 'bg-allow animate-pulse-dot' : 'bg-block'}`} />
          {source === 'live' ? 'Live' : source === 'sample' ? 'Offline sample' : 'Connecting'}
        </span>
      </header>

      <section className="mt-6">
        <h1 className="font-display text-step-4 leading-tight text-ink">
          {held.length === 0 ? 'Nothing needs you.' : held.length === 1 ? 'One payment needs you.' : `${held.length} payments need you.`}
        </h1>
        <p className="mt-2 text-step--1 text-ink-soft">
          Approving signs the exact amount with a key that never leaves this phone. Leash asks PayPal for the money only after
          that.
        </p>
      </section>

      {source === 'sample' && (
        <p className="mt-4 rounded-sheet border border-hold/40 bg-hold-wash/60 px-4 py-3 text-step--1 text-ink">
          The gateway is offline. These are recorded examples and the buttons are off.
        </p>
      )}

      <ul className="mt-6 space-y-4">
        <AnimatePresence initial={false}>
          {held.map((d) => (
            <HeldCard key={d.id} d={d} readOnly={source !== 'live'} onDone={refresh} />
          ))}
        </AnimatePresence>
      </ul>

      {held.length === 0 && source !== 'loading' && (
        <div className="mt-6 rounded-[18px] border border-dashed border-rule-strong p-6 text-center">
          <p className="text-step-0 text-ink">You&apos;re all caught up.</p>
          <p className="mt-1 text-step--1 text-ink-soft">
            Held payments appear here within a few seconds. <Link className="text-intaglio underline" href="/console/feed">See every decision</Link>
          </p>
        </div>
      )}

      <section className="mt-10 space-y-3 border-t border-rule pt-6 text-step--1">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-medium text-ink">Notifications</p>
            <p className="text-ink-soft">
              {!push.supported
                ? 'This browser cannot receive push notifications.'
                : push.subscribed
                  ? 'On. You will be alerted when a payment is held.'
                  : 'Off. Turn on to hear about held payments right away.'}
            </p>
          </div>
          {push.supported && !push.subscribed && (
            <Button
              onClick={async () => {
                setPushBusy(true);
                try {
                  await subscribeToWebPush();
                  setPush(await getPushStatus());
                } finally {
                  setPushBusy(false);
                }
              }}
              disabled={pushBusy}
            >
              {pushBusy ? 'Turning on…' : 'Turn on'}
            </Button>
          )}
        </div>
        <p className="text-ink-faint">
          Device key <span className="font-mono">{fingerprint || 'creating…'}</span>, stored in this browser and not exportable.
        </p>
      </section>
    </div>
  );
}
