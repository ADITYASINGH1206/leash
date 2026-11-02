import React from 'react';
import type { Verdict } from '../../lib/api';

const TONE: Record<string, string> = {
  ALLOW: 'text-allow',
  AUTHORIZED: 'text-allow',
  CAPTURED: 'text-allow',
  VERIFIED: 'text-allow',
  SIGNED: 'text-intaglio',
  APPROVED: 'text-allow',
  HOLD: 'text-hold',
  HELD: 'text-hold',
  BLOCK: 'text-block',
  BLOCKED: 'text-block',
  VOIDED: 'text-ink-soft',
  REFUNDED: 'text-ink-soft',
};

const WORD: Record<string, string> = {
  ALLOW: 'Allowed',
  AUTHORIZED: 'Authorized',
  CAPTURED: 'Captured',
  VERIFIED: 'Verified',
  SIGNED: 'Signed',
  APPROVED: 'Approved',
  HOLD: 'Held',
  HELD: 'Held',
  BLOCK: 'Blocked',
  BLOCKED: 'Blocked',
  VOIDED: 'Voided',
  REFUNDED: 'Refunded',
};

/** A rubber-stamp verdict. `animate` presses it in once, when it first appears. */
export function Stamp({
  value,
  size = 'md',
  animate = false,
  className = '',
}: {
  value: Verdict | string;
  size?: 'sm' | 'md' | 'lg';
  animate?: boolean;
  className?: string;
}) {
  const sz = size === 'lg' ? 'text-step-2' : size === 'sm' ? 'text-[0.78rem]' : 'text-step-0';
  return (
    <span className={`stamp ${TONE[value] ?? 'text-ink'} ${sz} ${animate ? 'animate-stamp' : ''} ${className}`}>
      {WORD[value] ?? value}
    </span>
  );
}

/** Small inline verdict mark for dense rows. */
export function VerdictDot({ value }: { value: Verdict | string }) {
  const bg =
    value === 'BLOCK' || value === 'BLOCKED'
      ? 'bg-block'
      : value === 'HOLD' || value === 'HELD'
        ? 'bg-hold'
        : 'bg-allow';
  return <span className={`inline-block w-2 h-2 rounded-full ${bg}`} aria-hidden="true" />;
}
