import React from 'react';
import Link from 'next/link';
import { rosettePath } from './Guilloche';

const MARK = rosettePath({ R: 40, r: 7, d: 14, scale: 0.42, steps: 700 });

/** Leash mark: a closed guilloché loop, the tether every payment must pass through. */
export function LogoMark({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    <svg viewBox="-24 -24 48 48" className={className} aria-hidden="true">
      <circle r="22.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d={MARK} fill="none" stroke="currentColor" strokeWidth="0.9" />
      <circle r="3.2" fill="currentColor" />
    </svg>
  );
}

export function Logo({ href = '/', tone = 'ink' }: { href?: string; tone?: 'ink' | 'paper' }) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2.5 ${tone === 'ink' ? 'text-ink' : 'text-paper-raised'}`}
      aria-label="Leash home"
    >
      <LogoMark className="w-7 h-7 text-intaglio" />
      <span className="font-display text-[1.6rem] leading-none tracking-tight">Leash</span>
    </Link>
  );
}
