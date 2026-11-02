'use client';

import React, { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { ABLATION_NAMES, bench, pct } from '../../lib/bench';
import { usePrefersReducedMotion } from '../../hooks/useReducedMotion';

/** Attack success rate as checks are added, straight from the runner's output. */
export function AblationBars() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-10% 0px' });
  const reduced = usePrefersReducedMotion();
  return (
    <div ref={ref} className="space-y-5">
      {(bench.ablation ?? []).map((row, i) => {
        const v = pct(row.attackSuccessRate);
        return (
          <div key={row.configuration} className="grid grid-cols-[9.5rem_1fr_4rem] items-center gap-4 text-step--1">
            <span className="text-ink">{ABLATION_NAMES[row.configuration] ?? row.configuration}</span>
            <div className="h-7 rounded-note bg-paper-sunk">
              <motion.div
                className={`h-full rounded-note ${v === 0 ? 'bg-allow' : v > 60 ? 'bg-block' : 'bg-hold'}`}
                initial={{ width: reduced ? `${Math.max(v, 0.6)}%` : '0%' }}
                animate={{ width: inView || reduced ? `${Math.max(v, 0.6)}%` : '0%' }}
                transition={{ duration: 0.9, delay: reduced ? 0 : i * 0.15, ease: [0.2, 0.8, 0.2, 1] }}
              />
            </div>
            <span className="text-right font-display text-step-1 tabular text-ink">{row.attackSuccessRate}</span>
          </div>
        );
      })}
    </div>
  );
}
