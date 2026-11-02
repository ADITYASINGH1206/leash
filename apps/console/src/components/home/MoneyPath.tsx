'use client';

import React, { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { usePrefersReducedMotion } from '../../hooks/useReducedMotion';

const STEPS = [
  { n: 1, title: 'Connect PayPal once', api: 'Vault v3', body: 'You save your PayPal wallet with Leash. The agent never sees a card, a token or a password.' },
  { n: 2, title: 'Authorize a hold', api: 'Orders v2, intent AUTHORIZE', body: 'An allowed payment reserves the money with the merchant as payee. Nothing is charged yet.' },
  { n: 3, title: 'Merchant ships', api: 'Signed fulfilment notice', body: 'The merchant sends the carrier and tracking number. Leash re-checks the order with PayPal.' },
  { n: 4, title: 'Capture', api: 'Payments v2 capture', body: 'Only now does money move, and never more than the signed cart total.' },
];

export function MoneyPath() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-20% 0px' });
  const reduced = usePrefersReducedMotion();
  const play = inView && !reduced;

  return (
    <section className="mx-auto max-w-[84rem] px-5 py-24 sm:px-8 md:py-32">
      <div className="grid gap-8 md:grid-cols-12">
        <h2 className="font-display text-step-5 leading-[1.02] text-ink md:col-span-6">Money moves when the goods do.</h2>
        <p className="max-w-[34rem] self-end text-step-0 text-ink-soft md:col-span-5 md:col-start-8">
          A decision to allow only reserves money. So even a wrong &ldquo;allow&rdquo; can be voided before the merchant is paid.
        </p>
      </div>

      <div ref={ref} className="relative mt-16">
        {/* The rail and the coin that travels it once, when the section comes into view */}
        <div className="absolute left-0 right-0 top-[1.15rem] hidden h-px bg-rule-strong md:block" aria-hidden="true" />
        <motion.div
          className="absolute top-[1.15rem] hidden h-[2px] origin-left bg-intaglio md:block"
          style={{ left: 0, right: 0 }}
          initial={{ scaleX: reduced ? 1 : 0 }}
          animate={{ scaleX: inView ? 1 : reduced ? 1 : 0 }}
          transition={{ duration: 2.4, ease: 'easeInOut' }}
          aria-hidden="true"
        />
        <motion.div
          className="absolute top-[0.55rem] hidden h-5 w-5 rounded-full border-2 border-paper bg-allow shadow-sheet md:block"
          initial={{ left: '0%' }}
          animate={{ left: play ? 'calc(100% - 1.25rem)' : reduced ? 'calc(100% - 1.25rem)' : '0%' }}
          transition={{ duration: 2.4, ease: 'easeInOut' }}
          aria-hidden="true"
        />

        <ol className="grid gap-10 md:grid-cols-4 md:gap-8">
          {STEPS.map((s, i) => (
            <motion.li
              key={s.n}
              initial={{ opacity: reduced ? 1 : 0.35 }}
              animate={{ opacity: inView ? 1 : reduced ? 1 : 0.35 }}
              transition={{ duration: 0.4, delay: reduced ? 0 : 0.3 + i * 0.6 }}
              className="relative pt-14"
            >
              <span className="absolute left-0 top-0 flex h-9 w-9 items-center justify-center rounded-full border border-rule-strong bg-paper font-display text-step-0 text-ink">
                {s.n}
              </span>
              <h3 className="text-step-1 font-semibold tracking-tight text-ink">{s.title}</h3>
              <p className="mt-1 text-step--1 text-intaglio">{s.api}</p>
              <p className="mt-3 text-step--1 text-ink-soft">{s.body}</p>
            </motion.li>
          ))}
        </ol>

        <div className="mt-12 grid gap-2 rounded-sheet border border-hold/35 bg-hold-wash/50 p-5 text-step--1 md:ml-[25%] md:max-w-[50%]">
          <p className="font-medium text-ink">No shipment within 72 hours</p>
          <p className="text-ink-soft">
            The hold is voided and the budget is returned to your mandate. That sits inside PayPal&apos;s three-day honour period
            for authorizations.
          </p>
        </div>
      </div>
    </section>
  );
}
