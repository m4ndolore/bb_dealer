// services/bestbuyProductApi.js
import { createTtlCache } from "./memoryCache.js";

const variantsCache = createTtlCache({ ttlMs: 24 * 60 * 60 * 1000, maxEntries: 1000 });

export async function fetchProductVariants(sku, apiKey) {
  const cacheKey = String(sku);
  const cached = variantsCache.get(cacheKey);
  if (cached) return cached;

  const url =
    `https://api.bestbuy.com/v1/products/${encodeURIComponent(String(sku))}.json?format=json` +
    `&show=sku,name,color,modelNumber,productVariations.sku` +
    `&apiKey=${encodeURIComponent(apiKey)}`;

  const r = await fetch(url);
  if (!r.ok) throw new Error(`Products API failed ${r.status}`);
  const p = await r.json();

  const result = {
    sku: String(p.sku),
    color: p.color,
    modelNumber: p.modelNumber,
    variations: (p.productVariations?.sku || []).map(String),
  };

  variantsCache.set(cacheKey, result);
  return result;
}
