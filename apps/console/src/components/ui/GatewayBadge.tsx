'use client';

import React from 'react';
import { useGateway } from '../../hooks/useGateway';

/** Live gateway indicator. Says "offline" plainly instead of pretending. */
export function GatewayBadge({ compact = false }: { compact?: boolean }) {
  const { state, health } = useGateway();
  const dot = state === 'live' ? 'bg-allow animate-pulse-dot' : state === 'offline' ? 'bg-block' : 'bg-ink-faint';
  const label =
    state === 'live'
      ? compact
        ? 'Gateway live'
        : `Gateway live, ${health?.ledgerHeight ?? 0} ledger entries${health?.paypalMode === 'mock' ? ', PayPal mock mode' : ''}`
      : state === 'offline'
        ? 'Gateway offline'
        : 'Checking gateway';
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border border-rule bg-paper-raised/80 px-3 py-1 text-[0.75rem] text-ink-soft ${compact ? 'hidden sm:inline-flex' : ''}`}
      role="status"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden="true" />
      {label}
    </span>
  );
}
