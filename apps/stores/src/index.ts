import {
  STORE_PRODUCTS,
  type StoreId,
  type StoreProduct,
} from "./fixtures/products.js";

export interface CatalogOptions {
  /**
   * When false (default), products containing adversarial prompt injections
   * are omitted from catalog responses. Set to true only in Attack Mode simulations.
   */
  includeAttackProducts?: boolean;
}

/**
 * Retrieves catalog items for a given demo store.
 */
export function getStoreCatalog(
  storeId: StoreId,
  options: CatalogOptions = {},
): StoreProduct[] {
  const { includeAttackProducts = false } = options;
  return STORE_PRODUCTS.filter((p) => {
    if (p.storeId !== storeId) return false;
    if (!includeAttackProducts && p.hiddenInjection) return false;
    return true;
  });
}

/**
 * Looks up a single product by SKU.
 */
export function getProductBySku(sku: string): StoreProduct | undefined {
  return STORE_PRODUCTS.find((p) => p.sku === sku);
}

export { STORE_PRODUCTS, type StoreId, type StoreProduct };
