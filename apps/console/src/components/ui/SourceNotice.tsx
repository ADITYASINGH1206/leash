import React from 'react';
import { GATEWAY_BASE_URL, IS_LOCAL_GATEWAY } from '../../lib/api';
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
        {IS_LOCAL_GATEWAY ? (
          <>
            Start it with <code className="font-mono text-[0.75rem]">pnpm --filter @leash/gateway dev</code>, or set{' '}
            <code className="font-mono text-[0.75rem]">NEXT_PUBLIC_GATEWAY_URL</code> (now {GATEWAY_BASE_URL}).
          </>
        ) : (
          <>
            This site is pointed at {GATEWAY_BASE_URL}. Check that it is your own gateway&apos;s public URL (set in{' '}
            <code className="font-mono text-[0.75rem]">NEXT_PUBLIC_GATEWAY_URL</code> when the console is built), that the
            gateway is running, and that this site is listed in its{' '}
            <code className="font-mono text-[0.75rem]">CORS_ORIGINS</code>. See docs/DEPLOYMENT.md.
          </>
        )}
        {error ? <> Last error: {error}</> : null}
      </p>
    </div>
  );
}
