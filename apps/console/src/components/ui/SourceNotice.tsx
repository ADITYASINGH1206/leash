import React from 'react';
import { GATEWAY_BASE_URL } from '../../lib/api';
import type { DataSource } from '../../hooks/useLedgerData';

/** States plainly where the data on screen came from. */
export function SourceNotice({ source, error }: { source: DataSource; error?: string | null }) {
  if (source !== 'sample') return null;
  return (
    <div role="status" className="rounded-sheet border border-hold/40 bg-hold-wash/70 px-4 py-3 text-step--1 text-ink">
      <p>
        <strong className="font-semibold">The gateway is offline, so this is recorded sample data.</strong>{' '}
        It was captured from a real gateway run, but nothing here is live and actions are turned off.
      </p>
      <p className="mt-1 text-ink-soft">
        Start it with <code className="font-mono text-[0.75rem]">pnpm --filter @leash/gateway dev</code>, or set{' '}
        <code className="font-mono text-[0.75rem]">NEXT_PUBLIC_GATEWAY_URL</code> (now {GATEWAY_BASE_URL}).
        {error ? <> Last error: {error}</> : null}
      </p>
    </div>
  );
}
