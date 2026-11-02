'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { usePrefersReducedMotion } from '../../hooks/useReducedMotion';
import { GatewayBadge } from '../ui/GatewayBadge';

const FirewallScene = dynamic(() => import('../three/FirewallScene'), {
  ssr: false,
  loading: () => null,
});

const LINES = ['Let agents spend.', 'Only the way', 'you meant.'];

function useIsDesktop() {
  const [desktop, setDesktop] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return desktop;
}

export function Hero() {
  const reduced = usePrefersReducedMotion();
  const desktop = useIsDesktop();
  return (
    <section className="relative isolate overflow-hidden border-b border-rule">
      {/* The scene sits behind the copy and bleeds off the right edge */}
      <motion.div
        className="absolute inset-y-0 right-[1%] left-[41%] -z-10 hidden md:block"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduced ? 0 : 1.4, delay: reduced ? 0 : 0.5 }}
      >
        {desktop === true && <FirewallScene still={reduced} />}
      </motion.div>

      <div className="mx-auto grid max-w-[84rem] px-5 pb-16 pt-14 sm:px-8 md:min-h-[min(46rem,88vh)] md:grid-cols-12 md:pb-24 md:pt-24">
        <div className="md:col-span-7 lg:col-span-6">
          <GatewayBadge />
          <h1 className="mt-8 font-display text-step-6 tracking-[-0.015em] text-ink lg:text-step-7">
            {LINES.map((line, i) => (
              <span key={line} className="block overflow-hidden pb-1">
                <motion.span
                  className="block"
                  initial={{ y: reduced ? 0 : '105%' }}
                  animate={{ y: 0 }}
                  transition={{ duration: 0.8, delay: reduced ? 0 : 0.08 + i * 0.11, ease: [0.2, 0.8, 0.2, 1] }}
                >
                  {line}
                </motion.span>
              </span>
            ))}
          </h1>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: reduced ? 0 : 0.55 }}
          >
            <p className="mt-7 max-w-[31rem] text-step-1 text-ink-soft">
              Leash sits between any AI agent and PayPal. Each payment has to point to a mandate you signed, pass five
              checks, and is only captured once the merchant ships.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                href="/judge"
                className="rounded-note bg-intaglio px-5 py-3 text-step-0 font-medium text-paper-raised shadow-sheet transition-colors hover:bg-intaglio-deep"
              >
                Run the live demo
              </Link>
              <Link
                href="/console"
                className="rounded-note border border-rule-strong px-5 py-3 text-step-0 font-medium text-ink transition-colors hover:border-ink"
              >
                Open the console
              </Link>
            </div>
          </motion.div>

          {/* Legend for the scene: what the moving coins mean */}
          <dl className="mt-12 hidden max-w-md grid-cols-3 gap-4 text-step--1 md:grid">
            {[
              ['bg-allow', 'Passes all five checks', 'and lands in a PayPal hold'],
              ['bg-hold', 'Held at a check', 'until you approve it'],
              ['bg-block', 'Stopped', 'before PayPal is called'],
            ].map(([c, t, d]) => (
              <div key={t}>
                <dt className="flex items-center gap-2 font-medium text-ink">
                  <span className={`h-2.5 w-2.5 rounded-full ${c}`} aria-hidden="true" />
                  {t}
                </dt>
                <dd className="mt-0.5 text-ink-soft">{d}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {/* On phones the scene sits below the copy */}
      <div className="h-[22rem] md:hidden">{desktop === false && <FirewallScene still={reduced} />}</div>
    </section>
  );
}
