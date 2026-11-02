'use client';

import React, { useRef, useState } from 'react';
import { motion, useMotionValueEvent, useScroll, useSpring, useTransform } from 'framer-motion';
import { Guilloche } from '../brand/Guilloche';

const LAYERS = [
  {
    n: 0,
    name: 'Mandate check',
    kind: 'Cryptographic',
    catches: 'Forged or expired mandates, replayed carts, spending past the budget, the wrong merchant.',
    how: 'Both signatures are verified and the budget is reserved inside a locked database row, so two requests can never spend the same last dollar.',
    result: 'Fails here: blocked at once.',
  },
  {
    n: 1,
    name: 'Policy rules',
    kind: 'Rules you can read',
    catches: 'Gift cards, crypto and money transfers; too many purchases an hour; new merchants above $10; purchases in the middle of your night.',
    how: 'Rules are short expressions stored per user. They run in a few milliseconds and say exactly which rule fired.',
    result: 'Block or hold, with the rule named.',
  },
  {
    n: 2,
    name: 'Provenance scan',
    kind: 'Reads the pages itself',
    catches: 'Hidden instructions on the pages the agent cites: invisible text, zero-size fonts, comments, zero-width characters.',
    how: 'Leash fetches each cited page itself instead of trusting the agent’s copy, then separates what a person sees from what is hidden.',
    result: 'Blocked if the hidden text names something in the cart.',
  },
  {
    n: 3,
    name: 'Intent judge',
    kind: 'Isolated model',
    catches: 'Purchases that stay inside the limits but are not what you asked for.',
    how: 'A small model compares the verified cart with your mandate. It never sees raw web pages, and the agent’s own reasoning is treated as a claim to check.',
    result: 'Held when unsure, blocked when clearly wrong.',
  },
  {
    n: 4,
    name: 'Risk score',
    kind: 'Behaviour',
    catches: 'Unusual amounts, new categories, bursts of purchases, one order split into many just-under-limit payments.',
    how: 'An anomaly model scores each payment from 0 to 100 and lists the three features that moved the score most.',
    result: 'Held between 40 and 70, blocked above.',
  },
];

function Rail({ progress }: { progress: number }) {
  const active = Math.min(4, Math.floor(progress * 5));
  const y = 20 + progress * 360;
  return (
    <svg viewBox="0 0 120 400" className="h-[min(70vh,34rem)] w-auto" aria-hidden="true">
      <line x1="60" y1="0" x2="60" y2="400" stroke="#2440B8" strokeWidth="2" />
      {LAYERS.map((l, i) => {
        const gy = 40 + i * 80;
        const lit = i <= active && progress > 0.02;
        return (
          <g key={l.n} transform={`translate(60 ${gy})`}>
            <circle r="26" fill="#F5F6F1" stroke={lit ? '#2440B8' : 'rgba(20,32,57,0.28)'} strokeWidth="1.2" />
            <text
              y="7"
              textAnchor="middle"
              className="font-display"
              fontSize="20"
              fill={lit ? '#2440B8' : '#7C8598'}
            >
              {l.n}
            </text>
          </g>
        );
      })}
      <g transform={`translate(60 ${y})`}>
        <circle r="9" fill="#1D7350" />
        <circle r="13" fill="none" stroke="#1D7350" strokeOpacity="0.35" />
      </g>
    </svg>
  );
}

export function Pipeline() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 60%', 'end 70%'] });
  const smooth = useSpring(scrollYProgress, { stiffness: 120, damping: 24, mass: 0.4 });
  const [p, setP] = useState(0);
  useMotionValueEvent(smooth, 'change', (v) => setP(Math.max(0, Math.min(1, v))));
  const rosetteRotate = useTransform(smooth, [0, 1], [0, 90]);
  const active = Math.min(4, Math.floor(p * 5));

  return (
    <section id="how" className="scroll-mt-20 border-y border-rule bg-paper-raised/60">
      <div className="mx-auto max-w-[84rem] px-5 pt-24 sm:px-8 md:pt-32">
        <div className="grid gap-8 md:grid-cols-12">
          <h2 className="font-display text-step-5 leading-[1.02] text-ink md:col-span-6">Five checks, cheapest first.</h2>
          <p className="max-w-[34rem] self-end text-step-0 text-ink-soft md:col-span-5 md:col-start-8">
            The certain, fast checks run first; the model-based ones run in parallel only after those pass. If any check
            errors or takes longer than 2.4 seconds, the payment is held for you. Nothing fails open.
          </p>
        </div>
      </div>

      <div ref={ref} className="mx-auto grid max-w-[84rem] gap-10 px-5 pb-24 pt-16 sm:px-8 md:grid-cols-12 md:pb-32">
        <div className="hidden md:col-span-4 md:block">
          <div className="sticky top-28 flex items-start gap-6">
            <Rail progress={p} />
            <motion.div style={{ rotate: rosetteRotate }} className="mt-10 text-intaglio/25">
              <Guilloche size={150} layers={3} petals={16 + active * 2} />
            </motion.div>
          </div>
        </div>

        <ol className="md:col-span-8">
          {LAYERS.map((l, i) => (
            <li
              key={l.n}
              className={`grid gap-4 border-t border-rule py-10 transition-opacity duration-300 sm:grid-cols-[4.5rem_1fr] md:min-h-[46vh] ${
                i === active || p === 0 ? 'opacity-100' : 'md:opacity-45'
              }`}
            >
              <span className="font-display text-step-5 leading-none text-intaglio">{l.n}</span>
              <div>
                <h3 className="text-step-2 font-semibold tracking-tight text-ink">
                  {l.name} <span className="ml-2 text-step-0 font-normal text-ink-faint">{l.kind}</span>
                </h3>
                <dl className="mt-5 grid max-w-[40rem] gap-4 text-step-0">
                  <div>
                    <dt className="text-step--1 font-medium text-ink">Catches</dt>
                    <dd className="mt-1 text-ink-soft">{l.catches}</dd>
                  </div>
                  <div>
                    <dt className="text-step--1 font-medium text-ink">How</dt>
                    <dd className="mt-1 text-ink-soft">{l.how}</dd>
                  </div>
                  <div>
                    <dt className="text-step--1 font-medium text-ink">Outcome</dt>
                    <dd className="mt-1 text-ink-soft">{l.result}</dd>
                  </div>
                </dl>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
