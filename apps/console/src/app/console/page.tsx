'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '../../components/console/ConsoleShell';
import { DecisionRow } from '../../components/console/DecisionRow';
import { SourceNotice } from '../../components/ui/SourceNotice';
import { useLedgerData } from '../../hooks/useLedgerData';
import { verifyLedgerChainBrowser } from '../../lib/crypto';

export default function ConsoleOverview() {
  const { rows, decisions, source, error, refresh } = useLedgerData(4000);
  const [chain, setChain] = useState<{ valid: boolean; count: number } | null>(null);

  useEffect(() => {
    let alive = true;
    verifyLedgerChainBrowser(rows).then((r) => alive && setChain({ valid: r.valid, count: r.verifiedCount }));
    return () => {
      alive = false;
    };
  }, [rows]);

  const count = (s: string) => decisions.filter((d) => d.status === s).length;
  const held = decisions.filter((d) => d.status === 'HELD');
  const moved = decisions
    .filter((d) => d.status === 'CAPTURED')
    .reduce((s, d) => s + Number(d.amount), 0)
    .toFixed(2);
  const reserved = decisions
    .filter((d) => d.status === 'AUTHORIZED')
    .reduce((s, d) => s + Number(d.amount), 0)
    .toFixed(2);

  return (
    <>
      <PageHeader
        title="Overview"
        lede="What your agents have tried to buy, what Leash decided, and what is waiting for you."
      />
      <div className="space-y-10">
        <SourceNotice source={source} error={error} />

        <section aria-label="Summary" className="grid gap-px overflow-hidden rounded-sheet border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-4">
          {[
            { k: 'Captured', v: `$${moved}`, note: `${count('CAPTURED')} ${count('CAPTURED') === 1 ? 'payment' : 'payments'}, goods shipped` },
            { k: 'On hold at PayPal', v: `$${reserved}`, note: `${count('AUTHORIZED')} ${count('AUTHORIZED') === 1 ? 'authorization' : 'authorizations'} waiting to ship` },
            { k: 'Waiting for you', v: String(held.length), note: held.length ? 'Review below or on your phone' : 'Nothing to review' },
            { k: 'Blocked', v: String(count('BLOCKED')), note: 'Never reached PayPal' },
          ].map((c) => (
            <div key={c.k} className="bg-paper-raised p-5">
              <p className="text-step--1 text-ink-soft">{c.k}</p>
              <p className="mt-2 font-display text-step-4 leading-none tabular text-ink">{c.v}</p>
              <p className="mt-2 text-[0.78rem] text-ink-faint">{c.note}</p>
            </div>
          ))}
        </section>

        <section className="flex flex-wrap items-center justify-between gap-3 rounded-sheet border border-rule px-5 py-4">
          <p className="text-step--1 text-ink">
            {chain === null
              ? 'Checking the ledger…'
              : chain.valid
                ? `Ledger intact: your browser recomputed all ${chain.count} hashes.`
                : `Ledger broken after entry ${chain.count}.`}
          </p>
          <Link href="/console/ledger" className="text-step--1 font-medium text-intaglio hover:underline">
            Open the ledger
          </Link>
        </section>

        {held.length > 0 && (
          <section>
            <h2 className="text-step-1 font-semibold text-ink">Waiting for you</h2>
            <ul className="mt-4 space-y-3">
              {held.map((d) => (
                <DecisionRow key={d.id} d={d} readOnly={source !== 'live'} onChanged={refresh} />
              ))}
            </ul>
          </section>
        )}

        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="text-step-1 font-semibold text-ink">Latest decisions</h2>
            <Link href="/console/feed" className="text-step--1 font-medium text-intaglio hover:underline">
              All decisions
            </Link>
          </div>
          {decisions.length === 0 ? (
            <div className="mt-4 rounded-sheet border border-dashed border-rule-strong p-8 text-center">
              <p className="text-step-0 text-ink">No payments yet.</p>
              <p className="mt-1 text-step--1 text-ink-soft">
                Run the <Link className="text-intaglio underline" href="/judge">judge demo</Link> or point an agent at the MCP endpoint.
              </p>
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {decisions.slice(0, 5).map((d) => (
                <DecisionRow key={d.id} d={d} readOnly={source !== 'live'} onChanged={refresh} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
