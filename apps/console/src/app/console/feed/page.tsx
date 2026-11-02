'use client';

import React, { useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { PageHeader } from '../../../components/console/ConsoleShell';
import { DecisionRow } from '../../../components/console/DecisionRow';
import { SourceNotice } from '../../../components/ui/SourceNotice';
import { useLedgerData } from '../../../hooks/useLedgerData';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'HELD', label: 'Waiting for you' },
  { key: 'AUTHORIZED', label: 'On hold at PayPal' },
  { key: 'CAPTURED', label: 'Captured' },
  { key: 'BLOCKED', label: 'Blocked' },
] as const;

export default function FeedPage() {
  const { decisions, source, error, refresh } = useLedgerData(2500);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all');
  const shown = useMemo(
    () => (filter === 'all' ? decisions : decisions.filter((d) => d.status === filter)),
    [decisions, filter],
  );

  return (
    <>
      <PageHeader
        title="Live decisions"
        lede={
          <>
            Every payment an agent asks for, newest first, refreshed every few seconds. The five numbered marks are the five
            checks; open a row to read what each one said.
          </>
        }
      />
      <div className="space-y-6">
        <SourceNotice source={source} error={error} />
        <div role="tablist" aria-label="Filter decisions" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const n = f.key === 'all' ? decisions.length : decisions.filter((d) => d.status === f.key).length;
            return (
              <button
                key={f.key}
                role="tab"
                aria-selected={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-full border px-3.5 py-1.5 text-step--1 transition-colors ${
                  filter === f.key ? 'border-ink bg-ink text-paper-raised' : 'border-rule-strong text-ink-soft hover:text-ink'
                }`}
              >
                {f.label} <span className="tabular opacity-70">{n}</span>
              </button>
            );
          })}
        </div>
        {shown.length === 0 ? (
          <p className="rounded-sheet border border-dashed border-rule-strong p-8 text-center text-step--1 text-ink-soft">
            Nothing here yet. Decisions appear the moment an agent asks to pay.
          </p>
        ) : (
          <ul className="space-y-3">
            <AnimatePresence initial={false}>
              {shown.map((d) => (
                <DecisionRow key={d.id} d={d} readOnly={source !== 'live'} onChanged={refresh} />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </>
  );
}
