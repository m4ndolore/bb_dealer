/**
 * AAFES/Monetate API adapter
 * Uses Playwright to intercept Monetate recommendations from shopmyexchange.com
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { createDeal } = require('../lib/normalize');
const { detectCategory } = require('../lib/categories');
const cache = require('../lib/cache');

const SOURCE = 'aafes';

// Load config
const configPath = path.join(__dirname, '..', 'config', 'aafes.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

/**
 * Fetch products by intercepting Monetate API responses from the actual page
 */
async function fetchWithPlaywright() {
  const isHeadless = process.env.HEADLESS !== 'false';
  console.log(`  Launching browser (headless: ${isHeadless})...`);

  const browser = await chromium.launch({
    headless: isHeadless,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale: 'en-US'
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  const page = await context.newPage();

  // Collect all items from intercepted Monetate responses
  let allItems = [];

  // Intercept Monetate API responses
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('engine.monetate.net') && url.includes('/decide/')) {
      try {
        const json = await response.json();
        const responses = json?.data?.responses ?? [];
        for (const r of responses) {
          const actions = r.actions ?? [];
          for (const action of actions) {
            const items = action.items ?? [];
            if (items.length > 0) {
              console.log(`  Intercepted ${items.length} items from Monetate`);
              allItems.push(...items);
            }
          }
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
  });

  try {
    // Navigate to pages that trigger Monetate recommendations
    const pages = [
      { name: 'homepage', url: 'https://www.shopmyexchange.com/' },
      { name: 'electronics', url: 'https://www.shopmyexchange.com/browse/electronics/_/N-111348' },
      { name: 'computers', url: 'https://www.shopmyexchange.com/browse/computers/_/N-105467' }
    ];

    for (const p of pages) {
      console.log(`  Loading ${p.name}...`);
      try {
        await page.goto(p.url, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });
        // Wait for Monetate calls to complete
        await page.waitForTimeout(5000);
      } catch (e) {
        console.log(`  Warning: ${p.name} failed - ${e.message.slice(0, 50)}`);
      }
    }

    return allItems;

  } finally {
    await browser.close();
  }
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeItem(item) {
  const title = item.title ?? 'Untitled';
  const brand = item.brand ?? '';

  const price = parseNumber(item.price);
  const salePrice = parseNumber(item.salePrice ?? item.saleprice);
  const originalPrice = price ?? 0;
  const currentPrice = salePrice ?? price ?? 0;

  const itemLink = item.link ? `${item.link}` : null;
  const fullUrl = config.baseUrl && itemLink ? `${config.baseUrl}${itemLink}` : itemLink;

  const id = item.id ?? item.itemGroupId ?? item.recSetId ?? `unknown-${Date.now()}-${Math.random()}`;

  return createDeal({
    id: `aafes-${id}`,
    source: SOURCE,
    category: detectCategory(title),
    name: title,
    brand,
    originalPrice,
    currentPrice,
    condition: 'new',
    availability: 'online',
    url: fullUrl || '',
    image: item.imageLink || ''
  });
}

async function fetchDeals(apiKey, options = {}) {
  // apiKey param unused - included for interface consistency with other adapters
  const { forceRefresh = false } = options;

  // Check cache first
  if (!forceRefresh) {
    const cached = cache.read(SOURCE);
    if (cached && !cached.expired) {
      console.log(`Using cached AAFES data (${Math.round(cached.age / 1000 / 60)}m old)`);
      return cached.deals;
    }
  }

  console.log('Fetching fresh AAFES data via Playwright...');

  const items = await fetchWithPlaywright();

  console.log(`  Total items intercepted: ${items.length}`);

  // Dedupe by ID
  const seen = new Set();
  const uniqueItems = items.filter(item => {
    const id = item.id ?? item.itemGroupId ?? item.recSetId;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  console.log(`  Unique items after dedupe: ${uniqueItems.length}`);

  const deals = uniqueItems.map(item => normalizeItem(item));

  console.log(`Total AAFES deals: ${deals.length}`);

  // Cache results
  cache.write(SOURCE, deals);

  return deals;
}

module.exports = {
  SOURCE,
  fetchDeals
};
