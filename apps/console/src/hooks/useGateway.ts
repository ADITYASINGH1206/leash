'use client';

import { useEffect, useState } from 'react';
import { gateway, type GatewayHealth } from '../lib/api';

export type GatewayState = 'checking' | 'live' | 'offline';

/** Polls /health. `offline` means the gateway could not be reached. */
export function useGateway(intervalMs = 8000) {
  const [state, setState] = useState<GatewayState>('checking');
  const [health, setHealth] = useState<(GatewayHealth & { paypalMode?: string }) | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const h = await gateway.health();
        if (!alive) return;
        setHealth(h);
        setState('live');
      } catch {
        if (!alive) return;
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

  return { state, health };
}
