import { STORE_PRODUCTS } from './fixtures/products.js';

export function getStoreCatalog(storeId: string) {
  return STORE_PRODUCTS.filter(p => p.storeId === storeId);
}

export { STORE_PRODUCTS };
