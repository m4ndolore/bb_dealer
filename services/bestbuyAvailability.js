// services/bestbuyAvailability.js
import { chromium } from "playwright";

/**
 * Keep one browser/context alive for performance.
 * If you already have Playwright infra, plug into that instead.
 */
let browser;
let context;

export async function initBestBuySession() {
  if (context) return context;

  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    locale: "en-US",
  });

  // Warm session so cookies/bot challenges are handled in real browser context
  const page = await context.newPage();
  await page.goto("https://www.bestbuy.com", { waitUntil: "domcontentloaded" });
  await page.close();

  return context;
}

export async function fetchProductVariants(sku, apiKey) {
  const url =
    `https://api.bestbuy.com/v1/products/${sku}.json?format=json` +
    `&show=sku,name,color,modelNumber,productVariations.sku` +
    `&apiKey=${encodeURIComponent(apiKey)}`;

  const r = await fetch(url);
  if (!r.ok) throw new Error(`Products API failed ${r.status}`);
  const p = await r.json();

  return {
    sku: p.sku,
    color: p.color,
    modelNumber: p.modelNumber,
    variations: (p.productVariations?.sku || []).map(String),
  };
}

export async function fetchOpenBoxBuyingOptions(sku, apiKey) {
  const url =
    `https://api.bestbuy.com/beta/products/${sku}/openBox?apiKey=${encodeURIComponent(apiKey)}`;

  const r = await fetch(url);
  if (!r.ok) return { sku: String(sku), offers: [], raw: null };

  const json = await r.json();
  const results = json?.results || [];
  const offers = results.flatMap(x => (x.offers || []).map(o => ({
    condition: o.condition,              // "excellent" or "certified"
    current: o.prices?.current,
    regular: o.prices?.regular,
  })));

  return { sku: String(sku), offers, raw: json };
}

export async function closeBestBuySession() {
  if (context) await context.close();
  if (browser) await browser.close();
  context = null;
  browser = null;
}

/**
 * Best Buy storeAvailability endpoint
 */
const STORE_AVAIL_URL =
  "https://www.bestbuy.com/productfulfillment/c/api/2.0/storeAvailability";

/**
 * Condition code mapping:
 * - You MUST confirm for your environment by capturing payloads for:
 *   /openbox?condition=fair, good, excellent
 */
export const conditionCodeMap = {
  fair: "0",
  good: "1",       // placeholder - confirm
  excellent: "2",  // placeholder - confirm
};

/**
 * Base payload - matches the JSON you captured.
 */
function basePayload(zipCode) {
  return {
    locationId: null,
    zipCode,
    showOnShelf: true,
    lookupInStoreQuantity: false,
    xboxAllAccess: false,
    consolidated: false,
    showOnlyOnShelf: false,
    showInStore: false,
    pickupTypes: ["UPS_ACCESS_POINT", "FEDEX_HAL"],
    onlyBestBuyLocations: true,
    items: [],
  };
}

/**
 * Build items array for multiple SKUs + multiple conditions in one call.
 */
function buildItems({ skus, conditions, quantity = 1 }) {
  const items = [];
  let seq = 1;

  for (const sku of skus) {
    for (const cond of conditions) {
      const condCode = conditionCodeMap[cond];
      if (!condCode) throw new Error(`Unknown condition: ${cond}`);

      items.push({
        sku: String(sku),
        condition: String(condCode),
        quantity,
        itemSeqNumber: String(seq++),
        reservationToken: null,
        selectedServices: [],
        requiredAccessories: [],
        isTradeIn: false,
        isLeased: false,
      });
    }
  }
  return items;
}

/**
 * Parse availability hits out of response.
 * Returns: [{ sku, conditionCode, storeId, qty, minDate, ... , availabilityToken }]
 */
export function extractHits(respJson) {
  const hits = [];
  const items = respJson?.items || [];

  for (const item of items) {
    const sku = String(item?.sku);
    const conditionCode = String(item?.condition);
    const locations = item?.locations || [];

    for (const loc of locations) {
      const storeId = String(loc?.locationId);
      const av = loc?.availability;
      if (!av) continue;

      const qty = Number(av?.availablePickupQuantity || 0);
      if (qty > 0) {
        hits.push({
          sku,
          conditionCode,
          storeId,
          qty,
          fulfillmentType: av?.fulfillmentType,
          minDate: av?.minDate,
          maxDate: av?.maxDate,
          minPickupMinutes: av?.minPickupMinutes,
          maxPickupTime: av?.maxPickupTime,
          displayDateType: av?.displayDateType,
          availabilityToken: av?.availabilityToken, // treat as sensitive
        });
      }
    }
  }
  return hits;
}

/**
 * Main function: ZIP + SKUs + conditions -> availability hits.
 */
export async function getStoreAvailability({ zipCode, skus, conditions }) {
  const ctx = await initBestBuySession();
  const payload = basePayload(zipCode);
  payload.items = buildItems({ skus, conditions });

  const res = await ctx.request.post(STORE_AVAIL_URL, { data: payload });

  if (!res.ok()) {
    const text = await res.text().catch(() => "");
    throw new Error(`storeAvailability failed ${res.status()} ${text.slice(0, 200)}`);
  }

  const json = await res.json();
  return {
    raw: json,
    hits: extractHits(json),
  };
}
