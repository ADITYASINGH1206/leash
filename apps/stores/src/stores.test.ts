import { describe, it, expect } from 'vitest';
import { STORE_PRODUCTS, getStoreCatalog } from './index.js';

describe('Demo Storefronts Catalog', () => {
  it('provides products across all 3 stores', () => {
    const gadgetHub = getStoreCatalog('gadgethub');
    const trend = getStoreCatalog('trendboutique');
    const daily = getStoreCatalog('dailymart');

    expect(gadgetHub.length).toBeGreaterThanOrEqual(2);
    expect(trend.length).toBeGreaterThanOrEqual(1);
    expect(daily.length).toBeGreaterThanOrEqual(1);
  });

  it('contains attack-mode product with hidden prompt injection', () => {
    const attackItem = STORE_PRODUCTS.find(p => p.hiddenInjection);
    expect(attackItem).toBeDefined();
    expect(attackItem?.hiddenInjection).toContain('SYSTEM OVERRIDE');
  });
});
