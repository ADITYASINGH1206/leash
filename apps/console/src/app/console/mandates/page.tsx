'use client';

import React, { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { AnimatePresence, motion } from 'framer-motion';
import { PageHeader } from '../../../components/console/ConsoleShell';
import { SourceNotice } from '../../../components/ui/SourceNotice';
import { Button } from '../../../components/ui/Button';
import { Stamp } from '../../../components/ui/Stamp';
import { useLedgerData } from '../../../hooks/useLedgerData';
import { usePrefersReducedMotion } from '../../../hooks/useReducedMotion';
import { compileMandate, type CompiledMandate } from '../../../lib/mandate-compiler';
import { gateway } from '../../../lib/api';
import { canonicalJson } from '../../../lib/crypto';
import { getDeviceKeyFingerprint, getDevicePublicKeyBase64, getOrCreateDeviceKey } from '../../../lib/device-wallet';

const SealScene = dynamic(() => import('../../../components/three/SealScene'), { ssr: false });

const EXAMPLES = [
  'Buy a USB-C phone case under $20 from any store this week',
  'Groceries and coffee, up to $60 total, at most $25 per order, for 3 days',
  'A hoodie or a t-shirt, under $90, this month',
];

export default function MandatesPage() {
  const { rows, source, error, refresh } = useLedgerData(5000);
  const reduced = usePrefersReducedMotion();
  const [text, setText] = useState(EXAMPLES[0]!);
  const [compiled, setCompiled] = useState<CompiledMandate | null>(null);
  const [state, setState] = useState<'draft' | 'signing' | 'signed' | 'failed'>('draft');
  const [message, setMessage] = useState<string | null>(null);
  const [registered, setRegistered] = useState<{ id: string; verified: boolean; key: string } | null>(null);

  const mandates = useMemo(
    () =>
      rows
        .filter((r) => r.kind === 'MANDATE_SIGNED')
        .map((r) => ({
          id: r.refId,
          ts: r.ts,
          max: Number(r.payload.maxAmount ?? 0),
          intent: String(r.payload.intentText ?? ''),
          verified: Boolean(r.payload.signatureVerified),
        }))
        .reverse(),
    [rows],
  );

  const readBack = () => {
    setCompiled(compileMandate(text));
    setState('draft');
    setMessage(null);
    setRegistered(null);
  };

  const sign = async () => {
    if (!compiled) return;
    setState('signing');
    setMessage(null);
    try {
      const id = `mdt_${Math.random().toString(36).slice(2, 10)}`;
      const signedMandate = {
        id,
        maxAmount: compiled.maxAmount,
        intentText: text,
        categories: compiled.categories,
        validUntil: compiled.validUntil,
      };
      const keyPair = await getOrCreateDeviceKey();
      const publicKey = await getDevicePublicKeyBase64(keyPair);
      const sig = await crypto.subtle.sign(
        { name: 'ECDSA', hash: { name: 'SHA-256' } },
        keyPair.privateKey,
        new TextEncoder().encode(canonicalJson(signedMandate)),
      );
      const signature = btoa(String.fromCharCode(...new Uint8Array(sig)));
      const res = await gateway.createMandate({
        id,
        maxAmount: compiled.maxAmount,
        intentText: text,
        playback: compiled.playback,
        validUntil: compiled.validUntil,
        constraints: {
          maxTotal: compiled.maxAmount.toFixed(2),
          maxPerTxn: compiled.maxPerTxn.toFixed(2),
          currency: 'USD',
          categories: compiled.categories,
          itemTerms: compiled.itemTerms,
        },
        signature,
        publicKey,
        signedMandate,
      });
      setRegistered({ id: res.id, verified: res.signatureVerified, key: await getDeviceKeyFingerprint(keyPair) });
      setState('signed');
      refresh();
    } catch (err) {
      setState('failed');
      setMessage(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <>
      <PageHeader
        title="Mandates"
        lede="Say what your agent may buy. Leash reads it back as limits; you check them and sign with this device. Every payment must point to a signed mandate."
      />
      <div className="space-y-10">
        <SourceNotice source={source} error={error} />

        <section className="grid gap-8 rounded-sheet border border-rule bg-paper-raised p-6 shadow-sheet md:grid-cols-[1fr_15rem] md:p-8">
          <div>
            <label htmlFor="intent" className="text-step-0 font-medium text-ink">
              What should your agent buy?
            </label>
            <textarea
              id="intent"
              rows={3}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setCompiled(null);
                setState('draft');
              }}
              className="mt-2 block w-full resize-y rounded-note border border-rule-strong bg-paper px-3 py-2.5 text-step-1 text-ink"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {EXAMPLES.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => {
                    setText(e);
                    setCompiled(null);
                    setState('draft');
                  }}
                  className="rounded-full border border-rule px-3 py-1 text-[0.75rem] text-ink-soft hover:border-ink hover:text-ink"
                >
                  {e}
                </button>
              ))}
            </div>
            <div className="mt-5">
              <Button variant="secondary" onClick={readBack} disabled={!text.trim()}>
                Read it back
              </Button>
            </div>

            <AnimatePresence>
              {compiled && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-6 border-t border-rule pt-6"
                >
                  <p className="text-step--1 text-ink-faint">Leash understood</p>
                  <p className="mt-1 font-display text-step-2 leading-snug text-ink">{compiled.playback}</p>
                  <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-step--1 sm:grid-cols-4">
                    <div>
                      <dt className="text-ink-faint">Budget</dt>
                      <dd className="tabular text-ink">${compiled.maxAmount.toFixed(2)}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-faint">Per purchase</dt>
                      <dd className="tabular text-ink">${compiled.maxPerTxn.toFixed(2)}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-faint">Categories</dt>
                      <dd className="text-ink">{compiled.categories.join(', ') || 'any'}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-faint">Expires</dt>
                      <dd className="text-ink">in {compiled.days} days</dd>
                    </div>
                  </dl>
                  {compiled.warnings.length > 0 && (
                    <ul className="mt-4 space-y-1 text-step--1 text-hold">
                      {compiled.warnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-4 text-[0.75rem] text-ink-faint">
                    Read back by a rule-based compiler in your browser. Check it before signing.
                  </p>
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <Button variant="primary" onClick={sign} disabled={state === 'signing' || state === 'signed' || source !== 'live'}>
                      {state === 'signing' ? 'Signing…' : state === 'signed' ? 'Signed' : 'Sign with this device'}
                    </Button>
                    {source !== 'live' && <span className="text-step--1 text-ink-soft">Signing needs the gateway.</span>}
                    {message && (
                      <span role="alert" className="text-step--1 text-block">
                        {message}
                      </span>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex flex-col items-center justify-start">
            <div className="h-56 w-56">
              <SealScene signed={state === 'signed'} still={reduced} />
            </div>
            <div className="mt-2 min-h-[4.5rem] text-center" role="status">
              {registered ? (
                <>
                  <Stamp value="SIGNED" animate />
                  <p className="mt-3 font-mono text-[0.72rem] text-ink-soft">{registered.id}</p>
                  <p className="text-[0.72rem] text-ink-faint">
                    {registered.verified ? `Gateway verified the signature from key ${registered.key}` : 'Stored without a signature'}
                  </p>
                </>
              ) : (
                <p className="text-step--1 text-ink-faint">Unsigned draft</p>
              )}
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-step-1 font-semibold text-ink">Mandates on the ledger</h2>
          {mandates.length === 0 ? (
            <p className="mt-4 text-step--1 text-ink-soft">None yet. Sign one above.</p>
          ) : (
            <ul className="mt-4 divide-y divide-rule border-y border-rule">
              {mandates.map((m) => (
                <li key={m.id + m.ts} className="grid gap-1 py-4 sm:grid-cols-[1fr_7rem_10rem] sm:items-baseline sm:gap-6">
                  <div className="min-w-0">
                    <p className="truncate text-step-0 text-ink">{m.intent}</p>
                    <p className="font-mono text-[0.72rem] text-ink-faint">{m.id}</p>
                  </div>
                  <p className="tabular text-step-0 text-ink">${m.max.toFixed(2)}</p>
                  <p className={`text-step--1 ${m.verified ? 'text-allow' : 'text-hold'}`}>
                    {m.verified ? 'Signature verified' : 'No signature'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
