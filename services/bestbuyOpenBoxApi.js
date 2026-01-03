// services/bestbuyOpenBoxApi.js
import { createTtlCache } from "./memoryCache.js";

const openBoxCache = createTtlCache({ ttlMs: 10 * 60 * 1000, maxEntries: 1000 });

export async function fetchOpenBoxBuyingOptions(sku, apiKey) {
  const cacheKey = String(sku);
  const cached = openBoxCache.get(cacheKey);
  if (cached) return cached;

  const url =
    `https://api.bestbuy.com/beta/products/${encodeURIComponent(String(sku))}/openBox` +
    `?apiKey=${encodeURIComponent(apiKey)}`;

  const r = await fetch(url);
  if (!r.ok) {
    const empty = { sku: String(sku), offers: [], raw: null };
    openBoxCache.set(cacheKey, empty);
    return empty;
  }

  const json = await r.json();
  const results = json?.results || [];
  const offers = results.flatMap(x => (x.offers || []).map(o => ({
    condition: o.condition,
    current: o.prices?.current,
    regular: o.prices?.regular,
  })));

  const payload = { sku: String(sku), offers, raw: json };
  openBoxCache.set(cacheKey, payload);
  return payload;
}
