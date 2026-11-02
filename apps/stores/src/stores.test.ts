import { describe, it, expect } from "vitest";
import { getStoreCatalog, getProductBySku } from "./index.js";

describe("Demo Storefronts Catalog", () => {
  it("provides at least 5 standard products across each store", () => {
    const gadgetHub = getStoreCatalog("gadgethub");
    const trend = getStoreCatalog("trendboutique");
    const daily = getStoreCatalog("dailymart");

    expect(gadgetHub.length).toBeGreaterThanOrEqual(5);
    expect(trend.length).toBeGreaterThanOrEqual(5);
    expect(daily.length).toBeGreaterThanOrEqual(5);

    // Ensure all standard catalog items are cleanly in stock and formatted
    for (const p of [...gadgetHub, ...trend, ...daily]) {
      expect(p.price).toMatch(/^\d+(\.\d{2})?$/);
      expect(p.name.length).toBeGreaterThan(3);
      expect(p.category.length).toBeGreaterThan(2);
      expect(p.hiddenInjection).toBeUndefined(); // Standard items must NOT have injections
    }
  });

  it("filters out attack products unless explicitly requested via options", () => {
    const normalGadget = getStoreCatalog("gadgethub");
    expect(normalGadget.some((p) => p.hiddenInjection)).toBe(false);

    const attackGadget = getStoreCatalog("gadgethub", {
      includeAttackProducts: true,
    });
    const attackItem = attackGadget.find((p) => p.hiddenInjection);
    expect(attackItem).toBeDefined();
    expect(attackItem?.hiddenInjection).toContain("SYSTEM OVERRIDE");
  });

  it("retrieves products by SKU correctly", () => {
    const product = getProductBySku("GH-USBC-CASE");
    expect(product).toBeDefined();
    expect(product?.name).toBe("Slim Matte USB-C Phone Case");
    expect(product?.storeId).toBe("gadgethub");
  });
});
