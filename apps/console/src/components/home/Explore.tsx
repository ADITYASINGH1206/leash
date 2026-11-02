import React from 'react';
import Link from 'next/link';
import { Guilloche } from '../brand/Guilloche';

const PAGES = [
  { href: '/judge', name: 'Judge demo', body: 'Runs the whole story against the live gateway in about ten seconds: sign, buy, attack, hold, approve, capture, verify.' },
  { href: '/console/feed', name: 'Live decisions', body: 'Each payment as it is decided, with what every check said.' },
  { href: '/console/ledger', name: 'Ledger', body: 'The full hash-chained record. Verify it in your browser, filter it, export it.' },
  { href: '/console/mandates', name: 'Mandates', body: 'Write what your agent may buy in plain words, read it back, sign it with this device.' },
  { href: '/approvals', name: 'Approvals', body: 'The phone view. Held payments wait here until you re-sign or deny them.' },
  { href: '/console/bench', name: 'Benchmark', body: 'All 60 AgentPay-Bench scenarios and the per-check ablation.' },
  { href: '/console/ask', name: 'Ask the ledger', body: 'Plain questions, answered from the ledger entries themselves.' },
  { href: '/developers', name: 'For developers', body: 'The MCP tool your agent calls, the REST endpoints, and a ten-line integration.' },
];

export function Explore() {
  return (
    <section className="mx-auto max-w-[84rem] px-5 sm:px-8">
      <h2 className="font-display text-step-5 leading-[1.02] text-ink">Walk through it yourself.</h2>
      <ul className="mt-12 border-t border-rule-strong">
        {PAGES.map((p) => (
          <li key={p.href} className="border-b border-rule">
            <Link
              href={p.href}
              className="group grid items-center gap-2 py-6 sm:grid-cols-[minmax(12rem,20rem)_1fr_3rem] sm:gap-8"
            >
              <span className="font-display text-step-3 text-ink transition-colors group-hover:text-intaglio">{p.name}</span>
              <span className="max-w-[40rem] text-step-0 text-ink-soft">{p.body}</span>
              <span className="hidden justify-self-end text-intaglio/0 transition-colors duration-300 group-hover:text-intaglio/70 sm:block">
                <Guilloche size={44} layers={2} petals={12} strokeWidth={0.9} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
