'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { SiteHeader } from '../../components/home/SiteHeader';
import { Button } from '../../components/ui/Button';
import { Stamp } from '../../components/ui/Stamp';
import { useGateway } from '../../hooks/useGateway';
import { GATEWAY_BASE_URL, IS_LOCAL_GATEWAY } from '../../lib/api';
import { JUDGE_STEPS, runJudgeWalkthrough, type JudgeStep } from '../../lib/judge';

const fresh = (): JudgeStep[] => JUDGE_STEPS.map((s) => ({ ...s, state: 'pending' }));

export default function JudgePage() {
  const { state: gw, health, problem } = useGateway(5000);
  const [steps, setSteps] = useState<JudgeStep[]>(fresh);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState<null | boolean>(null);

  const start = async () => {
    setSteps(fresh());
    setFinished(null);
    setRunning(true);
    const { ok } = await runJudgeWalkthrough((key, patch) =>
      setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s))),
    );
    setRunning(false);
    setFinished(ok);
  };

  const done = steps.filter((s) => s.state === 'done').length;

  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-[64rem] px-5 py-14 sm:px-8 md:py-20">
        <h1 className="font-display text-step-6 leading-none text-ink">Judge demo</h1>
        <p className="mt-5 max-w-[40rem] text-step-1 text-ink-soft">
          Seven steps against the live gateway, in about ten seconds. Nothing on this page is scripted: every verdict, id and
          hash comes back from the gateway&apos;s decision engine and ledger.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Button variant="primary" onClick={start} disabled={running || gw !== 'live'} className="px-5 py-3 text-step-0">
            {running ? 'Running…' : finished === null ? 'Start the walkthrough' : 'Run it again'}
          </Button>
          <span className="text-step--1 text-ink-soft" role="status">
            {gw === 'live'
              ? `Gateway live at ${GATEWAY_BASE_URL}${health?.paypalMode === 'mock' ? '. PayPal is in mock mode, so ids are generated locally.' : ''}${health?.storage === 'memory' ? ' State is held in memory and resets when the gateway restarts.' : ''}`
              : gw === 'offline'
                ? problem?.kind === 'not-leash'
                  ? 'A different service answered at the gateway URL.'
                  : 'The gateway is offline or waking up from sleep.'
                : 'Connecting to gateway…'}
          </span>
        </div>

        {gw === 'offline' && (
          <div className="mt-6 rounded-sheet border border-hold/40 bg-hold-wash/60 p-5 text-step--1 text-ink">
            <p className="font-medium">
              {problem?.kind === 'not-leash' ? 'The gateway URL points at the wrong service.' : 'Start or wake up the gateway to run the demo.'}
            </p>
            {problem?.message && <p className="mt-1 text-ink-soft">{problem.message}</p>}
            <p className="mt-1 text-ink-soft">
              {IS_LOCAL_GATEWAY ? (
                <>
                  Locally: <code className="font-mono">pnpm --filter @leash/gateway dev</code>.{' '}
                </>
              ) : null}
              Hosted: if Render put the free-tier service to sleep, allow 15–25 seconds for it to wake up. Also make sure browser shields or ad blockers are disabled for onrender.com so cross-subdomain API calls are allowed.
            </p>
          </div>
        )}

        {/* Progress along the cord */}
        <div className="mt-12 h-1 overflow-hidden rounded-full bg-paper-sunk" aria-hidden="true">
          <motion.div
            className="h-full bg-intaglio"
            animate={{ width: `${(done / steps.length) * 100}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>

        <ol className="mt-8 space-y-3">
          {steps.map((s, i) => (
            <li
              key={s.key}
              className={`rounded-sheet border p-5 transition-colors ${
                s.state === 'running'
                  ? 'border-intaglio bg-paper-raised shadow-sheet'
                  : s.state === 'failed'
                    ? 'border-block/50 bg-block-wash/40'
                    : 'border-rule bg-paper-raised/70'
              }`}
            >
              <div className="grid grid-cols-[2.5rem_1fr_auto] items-start gap-4">
                <span
                  className={`font-display text-step-3 leading-none ${
                    s.state === 'pending' ? 'text-ink-faint' : 'text-intaglio'
                  }`}
                >
                  {i + 1}
                </span>
                <div>
                  <h2 className="text-step-1 font-semibold text-ink">{s.title}</h2>
                  <p className="mt-0.5 text-step--1 text-ink-soft">{s.expectation}</p>
                  <AnimatePresence>
                    {(s.summary || s.error) && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="overflow-hidden">
                        <p className={`mt-3 text-step-0 ${s.error ? 'text-block' : 'text-ink'}`}>{s.error ?? s.summary}</p>
                        {s.details && s.details.length > 0 && (
                          <dl className="mt-3 grid gap-1.5 text-[0.78rem]">
                            {s.details.map(([k, v]) => (
                              <div key={k + v} className="grid gap-x-4 sm:grid-cols-[11rem_1fr]">
                                <dt className="text-ink-faint">{k}</dt>
                                <dd className="break-words text-ink-soft">{v}</dd>
                              </div>
                            ))}
                          </dl>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <div className="flex min-w-[6rem] justify-end pt-1">
                  {s.state === 'running' && <span className="h-2.5 w-2.5 animate-pulse-dot rounded-full bg-intaglio" aria-label="Running" />}
                  {s.state === 'done' && s.outcome && <Stamp value={s.outcome} size="sm" animate />}
                  {s.state === 'failed' && <Stamp value="Failed" size="sm" className="text-block" />}
                </div>
              </div>
            </li>
          ))}
        </ol>

        {finished !== null && (
          <p className="mt-8 text-step-0 text-ink" role="status">
            {finished ? (
              <>
                Done. See it from the user&apos;s side in the <Link className="text-intaglio underline" href="/console/feed">live decisions</Link>{' '}
                and the <Link className="text-intaglio underline" href="/console/ledger">ledger</Link>.
              </>
            ) : (
              'The walkthrough stopped at the step marked above.'
            )}
          </p>
        )}
      </main>
    </>
  );
}
