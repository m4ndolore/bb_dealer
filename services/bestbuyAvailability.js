// services/bestbuyAvailability.js
import { chromium } from "playwright";
import { createTtlCache } from "./memoryCache.js";

/**
 * Keep one browser/context alive for performance.
 * If you already have Playwright infra, plug into that instead.
 */
let browser;
let context;

export async function initBestBuySession() {
  if (context) return context;

  console.log("BestBuy session: launching Playwright...");
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    locale: "en-US",
  });

  // Warm session so cookies/bot challenges are handled in real browser context
  const page = await context.newPage();
  try {
    console.log("BestBuy session: warming up homepage...");
    await page.goto("https://www.bestbuy.com", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    console.log("BestBuy session: warm-up complete.");
  } catch (e) {
    // Best Buy sometimes stalls or blocks; proceed anyway so API calls can still work.
    console.warn(`BestBuy warmup failed: ${e.message}`);
  }
  await page.close();

  return context;
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

export function mapConditionCodeToLabel(code) {
  const inverse = {
    "0": "fair",
    "1": "good",
    "2": "excellent",
  };
  return inverse[String(code)] || String(code);
}

const availabilityCache = createTtlCache({ ttlMs: 8 * 60 * 1000, maxEntries: 1000 });

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
function buildItemsFromCombos({ combos, quantity = 1 }) {
  const items = [];
  let seq = 1;
  for (const combo of combos) {
    items.push({
      sku: String(combo.sku),
      condition: String(combo.condition),
      quantity,
      itemSeqNumber: String(seq++),
      reservationToken: null,
      selectedServices: [],
      requiredAccessories: [],
      isTradeIn: false,
      isLeased: false,
    });
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
          availabilityToken: av?.availabilityToken,
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
  if (!zipCode) throw new Error("zipCode required");
  if (!Array.isArray(skus) || !Array.isArray(conditions)) {
    throw new Error("skus[] and conditions[] required");
  }

  const start = Date.now();
  console.log(
    `storeAvailability: zip ${zipCode} skus ${skus.length} conditions ${conditions.length}`
  );

  const cachedHits = [];
  const missingCombos = [];

  for (const sku of skus) {
    for (const cond of conditions) {
      const condCode = conditionCodeMap[cond] || String(cond);
      const cacheKey = `${zipCode}|${sku}|${condCode}`;
      const cached = availabilityCache.get(cacheKey);
      if (cached !== null) {
        cachedHits.push(...cached);
      } else {
        missingCombos.push({ sku: String(sku), condition: String(condCode) });
      }
    }
  }

  if (missingCombos.length === 0) {
    console.log(
      `storeAvailability: cache hit for all combos (${cachedHits.length} hits)`
    );
    return { raw: null, hits: cachedHits };
  }

  const ctx = await initBestBuySession();
  const payload = basePayload(zipCode);
  payload.items = buildItemsFromCombos({ combos: missingCombos });

  const res = await ctx.request.post(STORE_AVAIL_URL, { data: payload });

  if (!res.ok()) {
    const text = await res.text().catch(() => "");
    throw new Error(`storeAvailability failed ${res.status()} ${text.slice(0, 200)}`);
  }

  const json = await res.json();
  const hits = extractHits(json);
  const durationMs = Date.now() - start;
  console.log(
    `storeAvailability: zip ${zipCode} -> ${hits.length} hits (${durationMs}ms)`
  );

  const grouped = new Map();
  for (const hit of hits) {
    const key = `${zipCode}|${hit.sku}|${hit.conditionCode}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(hit);
  }

  for (const combo of missingCombos) {
    const key = `${zipCode}|${combo.sku}|${combo.condition}`;
    availabilityCache.set(key, grouped.get(key) || []);
  }

  return { raw: json, hits: [...cachedHits, ...hits] };
}
