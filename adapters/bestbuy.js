/**
 * Best Buy Open Box API adapter
 */

const https = require('https');
const { createDeal } = require('../lib/normalize');
const { detectCategory } = require('../lib/categories');
const cache = require('../lib/cache');

const SOURCE = 'bestbuy';

// Best Buy category IDs for Open Box API
const CATEGORY_IDS = {
  laptops: 'pcmcat247400050001',      // Laptops
  tablets: 'pcmcat209000050006',       // iPads & Tablets
  storage: 'pcmcat212600050008',       // Hard Drives & Storage
  compute: 'abcat0501000',             // Desktop Computers
};

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('Invalid JSON response'));
          }
        } else if (res.statusCode === 403) {
          reject(new Error('403 Forbidden - possibly rate limited'));
        } else if (res.statusCode === 429) {
          reject(new Error('Rate limited - too many requests'));
        } else {
          reject(new Error(`API returned ${res.statusCode}`));
        }
      });
    }).on('error', reject);
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchCategoryOffers(apiKey, categoryId, categoryName) {
  const baseUrl = `https://api.bestbuy.com/beta/products/openBox(categoryId=${categoryId})?apiKey=${apiKey}&pageSize=100`;

  let allOffers = [];
  let page = 1;
  let hasMore = true;
  let retryCount = 0;
  const MAX_RETRIES = 3;

  console.log(`  Fetching ${categoryName}...`);

  while (hasMore) {
    try {
      const url = `${baseUrl}&page=${page}`;
      const data = await fetch(url);

      // Reset retry count on success
      retryCount = 0;

      if (data.results && data.results.length > 0) {
        const totalPages = data.metadata?.page?.total || 1;
        console.log(`    Page ${page}/${totalPages}: ${data.results.length} products`);
        allOffers = allOffers.concat(data.results);

        if (page >= totalPages) {
          hasMore = false;
        } else {
          page++;
          await delay(1000);
        }
      } else {
        hasMore = false;
      }
    } catch (e) {
      console.log(`    Page ${page} failed: ${e.message}`);
      if (e.message.includes('403') && retryCount < MAX_RETRIES) {
        retryCount++;
        console.log(`    Rate limited, waiting 3s... (retry ${retryCount}/${MAX_RETRIES})`);
        await delay(3000);
        continue;
      }
      hasMore = false;
    }
  }

  return allOffers;
}

function parseProcessor(text) {
  if (/M5\s*Max/i.test(text)) return 'M5 Max';
  if (/M5\s*Pro/i.test(text)) return 'M5 Pro';
  if (/\bM5\b/i.test(text)) return 'M5';
  if (/M4\s*Max/i.test(text)) return 'M4 Max';
  if (/M4\s*Pro/i.test(text)) return 'M4 Pro';
  if (/\bM4\b/i.test(text)) return 'M4';
  if (/M3\s*Max/i.test(text)) return 'M3 Max';
  if (/M3\s*Pro/i.test(text)) return 'M3 Pro';
  if (/\bM3\b/i.test(text)) return 'M3';
  if (/M2\s*Max/i.test(text)) return 'M2 Max';
  if (/M2\s*Pro/i.test(text)) return 'M2 Pro';
  if (/\bM2\b/i.test(text)) return 'M2';
  if (/M1\s*Max/i.test(text)) return 'M1 Max';
  if (/M1\s*Pro/i.test(text)) return 'M1 Pro';
  if (/\bM1\b/i.test(text)) return 'M1';
  return null;
}

function normalizeOffer(product, offer = null) {
  const text = [
    product.names?.title,
    product.names?.short,
    product.descriptions?.short,
    product.name,
  ].filter(Boolean).join(' ');

  const title = product.names?.title || product.name || '';

  // Parse specs
  const processor = parseProcessor(text);
  const ramMatch = text.match(/(\d+)\s*GB\s*(Memory|RAM|Unified)/i);
  const ram = ramMatch ? parseInt(ramMatch[1], 10) : null;
  const storageMatch = text.match(/(\d+(?:TB|GB))\s*SSD/i);
  const storage = storageMatch ? storageMatch[1] : null;
  const sizeMatch = title.match(/(\d{2}(?:\.\d)?)["-]/);
  const screenSize = sizeMatch ? sizeMatch[1] + '"' : null;

  let modelType = null;
  if (/Air/i.test(title)) modelType = 'MacBook Air';
  else if (/MacBook Pro/i.test(title)) modelType = 'MacBook Pro';
  else if (/Mac Mini/i.test(title)) modelType = 'Mac Mini';
  else if (/Mac Studio/i.test(title)) modelType = 'Mac Studio';
  else if (/iPad Pro/i.test(title)) modelType = 'iPad Pro';
  else if (/iPad Air/i.test(title)) modelType = 'iPad Air';
  else if (/iPad/i.test(title)) modelType = 'iPad';

  // Pricing
  const originalPrice = offer?.prices?.regular || product.prices?.regular || 0;
  const currentPrice = offer?.prices?.current || product.prices?.current || 0;

  // Condition
  let condition = 'open-box';
  const cond = (offer?.condition || '').toLowerCase();
  if (cond === 'excellent' || cond === 'certified') condition = 'Open-Box Excellent';
  else if (cond === 'good') condition = 'Open-Box Good';
  else if (cond === 'satisfactory') condition = 'Open-Box Satisfactory';
  else if (cond === 'fair') condition = 'Open-Box Fair';

  // Availability
  const online = offer?.onlineAvailability ?? product.onlineAvailability ?? false;
  const inStore = offer?.inStoreAvailability ?? product.inStoreAvailability ?? false;
  let availability = 'online';
  if (online && inStore) availability = 'both';
  else if (inStore && !online) availability = 'in-store';

  const productUrl = `https://www.bestbuy.com/site/${product.sku}.p?skuId=${product.sku}#tab=buyingOptions`;

  return createDeal({
    id: `bestbuy-${product.sku}-${offer?.listingId || 'base'}`,
    source: SOURCE,
    category: detectCategory(text),
    name: title || `SKU ${product.sku}`,
    brand: product.manufacturer || '',
    originalPrice,
    currentPrice,
    condition,
    availability,
    url: productUrl,
    image: product.images?.standard || '',
    sku: product.sku,
    listingId: offer?.listingId,
    processor,
    modelType,
    screenSize,
    ram,
    storage
  });
}

async function fetchDeals(apiKey, options = {}) {
  const { categories = Object.keys(CATEGORY_IDS), forceRefresh = false } = options;

  // Check cache first
  if (!forceRefresh) {
    const cached = cache.read(SOURCE);
    if (cached && !cached.expired) {
      console.log(`Using cached Best Buy data (${Math.round(cached.age / 1000 / 60)}m old)`);
      return cached.deals;
    }
  }

  console.log('Fetching fresh Best Buy Open Box data...');

  // Validate API key
  try {
    const testUrl = `https://api.bestbuy.com/v1/products(sku=6593548)?apiKey=${apiKey}&format=json&show=sku`;
    await fetch(testUrl);
    console.log('API key valid ✓');
  } catch (e) {
    throw new Error('Invalid API key. Get a free key at https://developer.bestbuy.com/');
  }

  let allDeals = [];

  for (const categoryKey of categories) {
    const categoryId = CATEGORY_IDS[categoryKey];
    if (!categoryId) continue;

    const offers = await fetchCategoryOffers(apiKey, categoryId, categoryKey);

    for (const product of offers) {
      const productOffers = product.offers || [];

      if (productOffers.length === 0) {
        allDeals.push(normalizeOffer(product));
      } else {
        for (const offer of productOffers) {
          allDeals.push(normalizeOffer(product, offer));
        }
      }
    }

    // Delay between categories
    await delay(2000);
  }

  console.log(`Total Best Buy deals: ${allDeals.length}`);

  // Cache results
  cache.write(SOURCE, allDeals);

  return allDeals;
}

module.exports = {
  SOURCE,
  CATEGORY_IDS,
  fetchDeals
};
