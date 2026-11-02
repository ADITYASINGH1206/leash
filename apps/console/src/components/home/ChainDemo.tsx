'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { getFallbackLedgerFixture, type LedgerEventRow } from '../../lib/api';
import { computeLedgerHashBrowser, GENESIS_HASH } from '../../lib/crypto';

/** Which payload field each demo entry lets you edit. */
const EDITABLE: Record<string, string> = {
  MANDATE_SIGNED: 'maxAmount',
  PAYMENT_REQUESTED: 'total',
  LAYER_POLICY_EVALUATED: 'verdict',
  LAYER_PROVENANCE_SCANNED: 'verdict',
  LAYER_INTENT_EVALUATED: 'verdict',
};

const LABEL: Record<string, string> = {
  MANDATE_SIGNED: 'Mandate signed',
  PAYMENT_REQUESTED: 'Payment requested',
  LAYER_POLICY_EVALUATED: 'Policy result',
  LAYER_PROVENANCE_SCANNED: 'Provenance result',
  LAYER_INTENT_EVALUATED: 'Intent result',
};

interface Status {
  payloadOk: boolean;
  linkOk: boolean;
  recomputed: string;
}

const short = (h: string) => `${h.slice(0, 8)}…${h.slice(-6)}`;

export function ChainDemo() {
  const original = useMemo(() => getFallbackLedgerFixture().slice(0, 5), []);
  const [rows, setRows] = useState<LedgerEventRow[]>(() => structuredClone(original));
  const [status, setStatus] = useState<Status[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const out: Status[] = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]!;
        const recomputed = await computeLedgerHashBrowser(r.prevHash, r.payload);
        out.push({
          recomputed,
          payloadOk: recomputed === r.hash,
          linkOk: i === 0 ? r.prevHash === GENESIS_HASH : r.prevHash === rows[i - 1]!.hash,
        });
      }
      if (alive) setStatus(out);
    })();
    return () => {
      alive = false;
    };
  }, [rows]);

  const edit = (i: number, value: string) => {
    setRows((prev) => {
      const next = structuredClone(prev);
      const field = EDITABLE[next[i]!.kind]!;
      const old = next[i]!.payload[field];
      next[i]!.payload[field] = typeof old === 'number' ? Number(value) || 0 : value;
      return next;
    });
  };

  const firstBadPayload = status.findIndex((s) => !s.payloadOk);
  const coverUp = () => {
    if (firstBadPayload < 0) return;
    setRows((prev) => {
      const next = structuredClone(prev);
      next[firstBadPayload]!.hash = status[firstBadPayload]!.recomputed;
      return next;
    });
  };
  const allOk = status.length === rows.length && status.every((s) => s.payloadOk && s.linkOk);

  if (!rows.length) return null;

  return (
    <section className="border-y border-rule bg-ink text-paper-raised">
      <div className="mx-auto max-w-[84rem] px-5 py-24 sm:px-8 md:py-32">
        <div className="grid gap-8 md:grid-cols-12">
          <h2 className="font-display text-step-5 leading-[1.02] md:col-span-6">A record that can&apos;t be quietly edited.</h2>
          <div className="max-w-[34rem] self-end text-step-0 text-paper-raised/75 md:col-span-5 md:col-start-8">
            <p>
              Every event is hashed together with the hash before it. These are the first five entries from a real run.
              Change a value and watch what your browser finds when it recomputes the chain.
            </p>
          </div>
        </div>

        <ol className="mt-14 grid gap-3 lg:grid-cols-5">
          {rows.map((r, i) => {
            const s = status[i];
            const bad = s && (!s.payloadOk || !s.linkOk);
            const field = EDITABLE[r.kind];
            return (
              <motion.li
                key={r.seq}
                layout
                className={`relative rounded-sheet border p-4 transition-colors ${
                  bad ? 'border-block bg-block/15' : 'border-paper-raised/20 bg-paper-raised/[0.04]'
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-display text-step-1">#{r.seq}</span>
                  <span className={`text-[0.72rem] ${bad ? 'text-[#F29A8F]' : 'text-[#8FD3B0]'}`}>
                    {!s ? 'checking' : !s.linkOk ? 'link broken' : !s.payloadOk ? 'hash mismatch' : 'intact'}
                  </span>
                </div>
                <p className="mt-2 text-step--1 font-medium">{LABEL[r.kind] ?? r.kind}</p>
                {field && (
                  <label className="mt-3 block text-[0.72rem] text-paper-raised/60">
                    {field}
                    <input
                      value={String(r.payload[field] ?? '')}
                      onChange={(e) => edit(i, e.target.value)}
                      className="mt-1 block w-full rounded-note border border-paper-raised/25 bg-transparent px-2 py-1.5 font-mono text-[0.8rem] text-paper-raised focus:border-paper-raised"
                    />
                  </label>
                )}
                <dl className="mt-3 space-y-1 font-mono text-[0.68rem] text-paper-raised/60">
                  <div className="flex justify-between gap-2">
                    <dt>prev</dt>
                    <dd className={s && !s.linkOk ? 'text-[#F29A8F]' : ''}>{short(r.prevHash)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>hash</dt>
                    <dd className={s && !s.payloadOk ? 'text-[#F29A8F]' : ''}>{short(r.hash)}</dd>
                  </div>
                </dl>
              </motion.li>
            );
          })}
        </ol>

        <div className="mt-8 flex flex-wrap items-center gap-3 text-step--1" role="status">
          <span className={allOk ? 'text-[#8FD3B0]' : 'text-[#F29A8F]'}>
            {allOk
              ? 'Chain verified: every hash recomputes and every link matches.'
              : firstBadPayload >= 0
                ? `Entry #${rows[firstBadPayload]!.seq} no longer matches its hash.`
                : 'The edited entry was re-hashed, so the next entry’s link to it is now broken.'}
          </span>
          {firstBadPayload >= 0 && (
            <button
              type="button"
              onClick={coverUp}
              className="rounded-note border border-paper-raised/30 px-3 py-1.5 font-medium hover:border-paper-raised"
            >
              Try to cover it up by re-hashing #{rows[firstBadPayload]!.seq}
            </button>
          )}
          {!allOk && (
            <button
              type="button"
              onClick={() => setRows(structuredClone(original))}
              className="rounded-note bg-paper-raised px-3 py-1.5 font-medium text-ink hover:bg-paper"
            >
              Restore the original entries
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
