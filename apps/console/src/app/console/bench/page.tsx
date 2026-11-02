'use client';

import React, { useMemo, useState } from 'react';
import { PageHeader } from '../../../components/console/ConsoleShell';
import { AblationBars } from '../../../components/ui/AblationBars';
import { BENCH_METHOD_NOTE, bench, FAMILY_NAMES } from '../../../lib/bench';

const LAYER_KEYS = ['layer0Budget', 'layer1Policy', 'layer2Provenance', 'layer3Intent', 'layer4Risk'] as const;
const VERDICT_TEXT: Record<string, string> = { ALLOW: 'text-allow', HOLD: 'text-hold', BLOCK: 'text-block' };

const scenarioName = (id: string) =>
  id
    .replace(/^scenario_\d+_/, '')
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase());

export default function BenchPage() {
  const [family, setFamily] = useState<string>('all');
  const [onlyFailures, setOnlyFailures] = useState(false);
  const results = useMemo(
    () =>
      bench.results.filter(
        (r) => (family === 'all' || r.family === family) && (!onlyFailures || !r.passed),
      ),
    [family, onlyFailures],
  );
  const families = Object.keys(bench.familyBreakdown);
  const passed = bench.results.filter((r) => r.passed).length;

  return (
    <>
      <PageHeader
        title="Benchmark"
        lede={
          <>
            AgentPay-Bench: {bench.attackScenariosCount} attacks and {bench.controlScenariosCount} honest purchases, each a YAML
            file in <code className="font-mono text-[0.85em]">bench/scenarios</code>. Last run{' '}
            {new Date(bench.timestamp).toLocaleString()}.
          </>
        }
      />

      <div className="space-y-14">
        <section className="rounded-sheet border border-hold/35 bg-hold-wash/40 p-5 text-step--1 text-ink">
          <p className="font-medium">How to read these numbers</p>
          <p className="mt-1 text-ink-soft">{BENCH_METHOD_NOTE}</p>
          <p className="mt-2 text-ink-soft">
            Rerun with <code className="font-mono text-[0.8rem]">pnpm --filter @leash/bench-runner bench</code>; this page
            updates from <code className="font-mono text-[0.8rem]">bench/results/summary.json</code> on the next build.
          </p>
        </section>

        <section className="grid gap-12 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <h2 className="text-step-1 font-semibold text-ink">Attacks that got a PayPal authorization</h2>
            <p className="mt-1 text-step--1 text-ink-soft">One configuration per row, checks added from the top.</p>
            <div className="mt-6">
              <AblationBars />
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-px self-start overflow-hidden rounded-sheet border border-rule bg-rule">
            {[
              ['Scenarios matching the expected verdict', `${passed} of ${bench.results.length}`],
              ['Attacks stopped', bench.attackMitigationRate],
              ['Honest purchases held', bench.falseHoldRate],
              ['Honest purchases blocked', bench.falseBlockRate],
            ].map(([k, v]) => (
              <div key={k} className="bg-paper-raised p-4">
                <dt className="text-[0.78rem] text-ink-soft">{k}</dt>
                <dd className="mt-1 font-display text-step-3 tabular text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="text-step-1 font-semibold text-ink">Every scenario</h2>
            <div className="flex flex-wrap items-center gap-4 text-step--1">
              <label className="text-ink-soft">
                Family{' '}
                <select
                  value={family}
                  onChange={(e) => setFamily(e.target.value)}
                  className="ml-1 rounded-note border border-rule-strong bg-paper-raised px-2 py-1.5 text-ink"
                >
                  <option value="all">All families</option>
                  {families.map((f) => (
                    <option key={f} value={f}>
                      {FAMILY_NAMES[f] ?? f}
                    </option>
                  ))}
                </select>
              </label>
              <label className="inline-flex items-center gap-2 text-ink-soft">
                <input type="checkbox" checked={onlyFailures} onChange={(e) => setOnlyFailures(e.target.checked)} />
                Only mismatches
              </label>
            </div>
          </div>

          <div className="mt-5 overflow-x-auto rounded-sheet border border-rule bg-paper-raised">
            <table className="w-full min-w-[52rem] text-left text-step--1">
              <caption className="sr-only">Scenario results</caption>
              <thead className="border-b border-rule bg-paper text-ink-soft">
                <tr>
                  <th className="px-4 py-3 font-medium">Scenario</th>
                  <th className="px-4 py-3 font-medium">Family</th>
                  <th className="px-4 py-3 font-medium">Expected</th>
                  <th className="px-4 py-3 font-medium">Got</th>
                  <th className="px-4 py-3 font-medium" colSpan={5}>
                    Checks 0 to 4
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {results.map((r) => (
                  <tr key={r.scenarioId} className="hover:bg-paper/70">
                    <td className="px-4 py-2.5 text-ink">{scenarioName(r.scenarioId)}</td>
                    <td className="px-4 py-2.5 text-ink-soft">{FAMILY_NAMES[r.family] ?? r.family}</td>
                    <td className={`px-4 py-2.5 font-medium ${VERDICT_TEXT[r.expectedVerdict]}`}>{r.expectedVerdict}</td>
                    <td className={`px-4 py-2.5 font-medium ${VERDICT_TEXT[r.actualVerdict]}`}>
                      {r.actualVerdict}
                      {!r.passed && <span className="ml-1 text-ink-soft">(mismatch)</span>}
                    </td>
                    {LAYER_KEYS.map((k) => (
                      <td key={k} className={`px-2 py-2.5 text-[0.72rem] ${VERDICT_TEXT[r.layers[k] ?? ''] ?? 'text-ink-faint'}`}>
                        {r.layers[k] ?? 'n/a'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {results.length === 0 && <p className="p-6 text-step--1 text-ink-soft">No scenarios match this filter.</p>}
          </div>
        </section>
      </div>
    </>
  );
}
