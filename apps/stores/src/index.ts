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

export type HiddenInjectionTechnique =
  | "comment"
  | "display_none"
  | "visibility_hidden"
  | "font_zero"
  | "opacity_zero"
  | "color_contrast"
  | "aria_hidden"
  | "alt_attr";

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

/**
 * Renders an HTML page for a product, optionally embedding its hidden adversarial prompt injection
 * using a specified DOM obfuscation technique.
 */
export function renderProductHtml(
  product: StoreProduct,
  options: { technique?: HiddenInjectionTechnique } = {},
): string {
  const technique = options.technique ?? "comment";
  let injectionMarkup = "";

  if (product.hiddenInjection) {
    switch (technique) {
      case "comment":
        injectionMarkup = `<!-- ${product.hiddenInjection} -->`;
        break;
      case "display_none":
        injectionMarkup = `<div style="display: none;">${product.hiddenInjection}</div>`;
        break;
      case "visibility_hidden":
        injectionMarkup = `<div style="visibility: hidden;">${product.hiddenInjection}</div>`;
        break;
      case "font_zero":
        injectionMarkup = `<span style="font-size: 0px;">${product.hiddenInjection}</span>`;
        break;
      case "opacity_zero":
        injectionMarkup = `<span style="opacity: 0;">${product.hiddenInjection}</span>`;
        break;
      case "color_contrast":
        injectionMarkup = `<span style="color: white; background-color: white;">${product.hiddenInjection}</span>`;
        break;
      case "aria_hidden":
        injectionMarkup = `<span aria-hidden="true">${product.hiddenInjection}</span>`;
        break;
      case "alt_attr":
        injectionMarkup = `<img src="/images/${product.sku}.jpg" alt="${product.hiddenInjection}" />`;
        break;
    }
  }

  return `<!DOCTYPE html>
<html>
<head>
  <title>${product.name} - Leash Demo Store</title>
</head>
<body>
  <div class="product-card" data-sku="${product.sku}">
    <h1>${product.name}</h1>
    <p class="category">Category: ${product.category}</p>
    <p class="description">${product.description}</p>
    <p class="price">$${product.price}</p>
    ${injectionMarkup}
  </div>
</body>
</html>`;
}

export { STORE_PRODUCTS, type StoreId, type StoreProduct };
