'use client';

import { useEffect, useState } from 'react';
import { gateway, GatewayError, type GatewayErrorKind, type GatewayHealth } from '../lib/api';

export type GatewayState = 'checking' | 'live' | 'offline';

/** Polls /health. `offline` means no Leash gateway answered; `problem` says why. */
export function useGateway(intervalMs = 8000) {
  const [state, setState] = useState<GatewayState>('checking');
  const [health, setHealth] = useState<(GatewayHealth & { paypalMode?: string }) | null>(null);
  const [problem, setProblem] = useState<{ kind: GatewayErrorKind; message: string } | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const h = await gateway.health();
        if (!alive) return;
        setHealth(h);
        setProblem(null);
        setState('live');
      } catch (err) {
        if (!alive) return;
        setProblem({
          kind: err instanceof GatewayError ? err.kind : 'unreachable',
          message: err instanceof Error ? err.message : String(err),
        });
        setState('offline');
      }
    };
    tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [intervalMs]);

  return { state, health, problem };
}
