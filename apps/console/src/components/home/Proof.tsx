'use client';

import React from 'react';
import Link from 'next/link';
import { AblationBars } from '../ui/AblationBars';
import { BENCH_METHOD_NOTE, bench, FAMILY_NAMES } from '../../lib/bench';

export function Proof() {
  const families = Object.entries(bench.familyBreakdown).filter(([k]) => k !== 'normal_control');

  return (
    <section id="proof" className="mx-auto max-w-[84rem] scroll-mt-20 px-5 py-24 sm:px-8 md:py-32">
      <div className="grid gap-8 md:grid-cols-12">
        <h2 className="font-display text-step-5 leading-[1.02] text-ink md:col-span-7">
          {bench.attackScenariosCount} attacks and {bench.controlScenariosCount} honest purchases, in the open.
        </h2>
        <p className="max-w-[34rem] self-end text-step-0 text-ink-soft md:col-span-4 md:col-start-9">
          AgentPay-Bench ships in the repository so anyone can rerun it. Switching checks off one at a time shows what each
          one contributes.
        </p>
      </div>

      <div className="mt-16 grid gap-14 lg:grid-cols-12">
        <figure className="lg:col-span-7">
          <figcaption className="text-step-0 font-medium text-ink">Share of attacks that got a PayPal authorization</figcaption>
          <div className="mt-6">
            <AblationBars />
          </div>
          <p className="mt-6 max-w-[40rem] text-[0.78rem] text-ink-faint">{BENCH_METHOD_NOTE}</p>
        </figure>

        <div className="lg:col-span-4 lg:col-start-9">
          <p className="text-step-0 font-medium text-ink">Attack families</p>
          <ul className="mt-4 divide-y divide-rule border-y border-rule text-step--1">
            {families.map(([k, f]) => (
              <li key={k} className="flex items-baseline justify-between gap-4 py-2.5">
                <span className="text-ink-soft">{FAMILY_NAMES[k] ?? k}</span>
                <span className="tabular text-ink">
                  {f.mitigated}/{f.total} stopped
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-step--1 text-ink-soft">
            False holds on honest purchases: {bench.falseHoldRate}. False blocks: {bench.falseBlockRate}.
          </p>
          <Link href="/console/bench" className="mt-6 inline-block text-step--1 font-medium text-intaglio underline-offset-4 hover:underline">
            See every scenario
          </Link>
        </div>
      </div>
    </section>
  );
}
