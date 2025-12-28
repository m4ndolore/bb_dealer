# Phase 1: Refactor & Expand Best Buy - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract Best Buy logic into adapter pattern, add caching, expand categories beyond laptops.

**Architecture:** Source adapters normalize data to unified Deal model. JSON file cache stores results. Category detection classifies products. Server aggregates and serves via API.

**Tech Stack:** Node.js, existing Best Buy Open Box API, JSON file caching, Playwright (for store lookup).

---

## Task 1: Create Directory Structure

**Files:**
- Create: `adapters/` directory
- Create: `lib/` directory
- Create: `cache/` directory

**Step 1: Create directories**

```bash
mkdir -p adapters lib cache
```

**Step 2: Commit structure**

```bash
git add -A
git commit -m "chore: add adapters, lib, cache directory structure"
```

---

## Task 2: Create Categories Module

**Files:**
- Create: `lib/categories.js`

**Step 1: Write categories module**

```javascript
/**
 * Category definitions and discount thresholds
 */

const CATEGORIES = {
  storage: {
    name: 'Storage',
    keywords: ['ssd', 'nvme', 'nas', 'hard drive', 'external drive', 'flash drive'],
    goodDeal: 25,
    greatDeal: 40
  },
  compute: {
    name: 'Compute',
    keywords: ['mac mini', 'mac studio', 'raspberry pi', 'intel nuc', 'mini pc', 'beelink', 'geekom'],
    goodDeal: 20,
    greatDeal: 30
  },
  memory: {
    name: 'Memory',
    keywords: ['ram', 'memory', 'ddr4', 'ddr5', 'sodimm', 'dimm'],
    goodDeal: 25,
    greatDeal: 40
  },
  tablets: {
    name: 'Tablets',
    keywords: ['ipad', 'ipad pro', 'ipad air', 'tablet'],
    goodDeal: 20,
    greatDeal: 25
  },
  laptops: {
    name: 'Laptops',
    keywords: ['macbook', 'macbook pro', 'macbook air', 'laptop'],
    goodDeal: 20,
    greatDeal: 25
  }
};

function detectCategory(text) {
  const lowerText = text.toLowerCase();

  for (const [categoryId, config] of Object.entries(CATEGORIES)) {
    for (const keyword of config.keywords) {
      if (lowerText.includes(keyword)) {
        return categoryId;
      }
    }
  }

  return null;
}

function getThresholds(categoryId) {
  const category = CATEGORIES[categoryId];
  if (!category) return { goodDeal: 20, greatDeal: 30 };
  return { goodDeal: category.goodDeal, greatDeal: category.greatDeal };
}

function getDealBadge(discount, categoryId) {
  const { goodDeal, greatDeal } = getThresholds(categoryId);
  if (discount >= greatDeal) return 'great';
  if (discount >= goodDeal) return 'good';
  return null;
}

module.exports = {
  CATEGORIES,
  detectCategory,
  getThresholds,
  getDealBadge
};
```

**Step 2: Commit**

```bash
git add lib/categories.js
git commit -m "feat: add categories module with detection and thresholds"
```

---

## Task 3: Create Cache Module

**Files:**
- Create: `lib/cache.js`

**Step 1: Write cache module**

```javascript
/**
 * Simple JSON file cache with TTL
 */

const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, '..', 'cache');
const DEFAULT_TTL = 60 * 60 * 1000; // 1 hour

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function getCachePath(source) {
  return path.join(CACHE_DIR, `${source}.json`);
}

function read(source) {
  ensureCacheDir();
  const cachePath = getCachePath(source);

  if (!fs.existsSync(cachePath)) {
    return null;
  }

  try {
    const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    const age = Date.now() - data.timestamp;

    return {
      deals: data.deals,
      timestamp: data.timestamp,
      age,
      expired: age > DEFAULT_TTL
    };
  } catch (e) {
    return null;
  }
}

function write(source, deals) {
  ensureCacheDir();
  const cachePath = getCachePath(source);

  const data = {
    timestamp: Date.now(),
    deals
  };

  fs.writeFileSync(cachePath, JSON.stringify(data, null, 2));
}

function clear(source) {
  const cachePath = getCachePath(source);
  if (fs.existsSync(cachePath)) {
    fs.unlinkSync(cachePath);
  }
}

function clearAll() {
  ensureCacheDir();
  const files = fs.readdirSync(CACHE_DIR);
  for (const file of files) {
    if (file.endsWith('.json')) {
      fs.unlinkSync(path.join(CACHE_DIR, file));
    }
  }
}

module.exports = {
  read,
  write,
  clear,
  clearAll,
  DEFAULT_TTL
};
```

**Step 2: Commit**

```bash
git add lib/cache.js
git commit -m "feat: add JSON file cache module with TTL"
```

---

## Task 4: Create Normalize Module

**Files:**
- Create: `lib/normalize.js`

**Step 1: Write normalize module**

```javascript
/**
 * Normalize deals from various sources to unified Deal model
 */

const { detectCategory, getDealBadge } = require('./categories');

/**
 * Unified Deal model:
 * {
 *   id: string,
 *   source: "bestbuy" | "apple" | "amazon" | "aafes",
 *   category: "storage" | "compute" | "memory" | "tablets" | "laptops",
 *   name: string,
 *   brand: string,
 *   originalPrice: number,
 *   currentPrice: number,
 *   discount: number,
 *   condition: "new" | "refurbished" | "open-box" | "warehouse",
 *   availability: "online" | "in-store" | "both",
 *   url: string,
 *   image: string,
 *   dealBadge: "great" | "good" | null,
 *   fetchedAt: number
 * }
 */

function createDeal(fields) {
  const category = fields.category || detectCategory(fields.name || '');
  const discount = fields.discount || calculateDiscount(fields.originalPrice, fields.currentPrice);
  const dealBadge = getDealBadge(discount, category);

  return {
    id: fields.id,
    source: fields.source,
    category,
    name: fields.name || '',
    brand: fields.brand || '',
    originalPrice: fields.originalPrice || 0,
    currentPrice: fields.currentPrice || 0,
    discount,
    condition: fields.condition || 'open-box',
    availability: fields.availability || 'online',
    url: fields.url || '',
    image: fields.image || '',
    dealBadge,
    fetchedAt: fields.fetchedAt || Date.now(),
    // Source-specific extras
    sku: fields.sku,
    listingId: fields.listingId,
    processor: fields.processor,
    modelType: fields.modelType,
    screenSize: fields.screenSize,
    ram: fields.ram,
    storage: fields.storage
  };
}

function calculateDiscount(original, current) {
  if (!original || original <= 0) return 0;
  return Math.round(((original - current) / original) * 100);
}

module.exports = {
  createDeal,
  calculateDiscount
};
```

**Step 2: Commit**

```bash
git add lib/normalize.js
git commit -m "feat: add normalize module for unified Deal model"
```

---

## Task 5: Extract Best Buy Adapter

**Files:**
- Create: `adapters/bestbuy.js`
- Reference: `server.js` (copy logic, don't modify yet)

**Step 1: Write Best Buy adapter**

Create `adapters/bestbuy.js` that extracts the fetchInventory logic from server.js and expands category support:

```javascript
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

  console.log(`  Fetching ${categoryName}...`);

  while (hasMore) {
    try {
      const url = `${baseUrl}&page=${page}`;
      const data = await fetch(url);

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
      if (e.message.includes('403')) {
        console.log('    Rate limited, waiting 3s...');
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
```

**Step 2: Commit**

```bash
git add adapters/bestbuy.js
git commit -m "feat: add Best Buy adapter with multi-category support"
```

---

## Task 6: Create Main Deals Aggregator

**Files:**
- Create: `lib/deals.js`

**Step 1: Write deals aggregator**

```javascript
/**
 * Aggregates deals from all sources
 */

const bestbuyAdapter = require('../adapters/bestbuy');

const ADAPTERS = {
  bestbuy: bestbuyAdapter
  // Future: apple, amazon, aafes
};

async function fetchAllDeals(config = {}) {
  const { sources = ['bestbuy'], forceRefresh = false, apiKeys = {} } = config;

  const results = {
    deals: [],
    errors: [],
    sources: {}
  };

  for (const source of sources) {
    const adapter = ADAPTERS[source];
    if (!adapter) {
      results.errors.push({ source, error: `Unknown source: ${source}` });
      continue;
    }

    try {
      const startTime = Date.now();
      const deals = await adapter.fetchDeals(apiKeys[source], { forceRefresh });
      const duration = Date.now() - startTime;

      results.deals.push(...deals);
      results.sources[source] = {
        count: deals.length,
        duration,
        success: true
      };
    } catch (e) {
      results.errors.push({ source, error: e.message });
      results.sources[source] = {
        count: 0,
        error: e.message,
        success: false
      };
    }
  }

  // Sort by discount (highest first)
  results.deals.sort((a, b) => b.discount - a.discount);

  return results;
}

function filterDeals(deals, filters = {}) {
  return deals.filter(deal => {
    if (filters.category && deal.category !== filters.category) return false;
    if (filters.source && deal.source !== filters.source) return false;
    if (filters.minDiscount && deal.discount < filters.minDiscount) return false;
    if (filters.condition && deal.condition !== filters.condition) return false;
    if (filters.availability && deal.availability !== filters.availability) return false;
    return true;
  });
}

module.exports = {
  fetchAllDeals,
  filterDeals,
  ADAPTERS
};
```

**Step 2: Commit**

```bash
git add lib/deals.js
git commit -m "feat: add deals aggregator module"
```

---

## Task 7: Update Server with New Architecture

**Files:**
- Modify: `server.js` (major refactor)

**Step 1: Rewrite server.js to use new modules**

Replace the entire server.js with the new architecture. Key changes:
- Use `lib/deals.js` for fetching
- Update API endpoints
- Update frontend with category/source filters
- Keep existing store lookup functionality

This is a large file - implement by:
1. Keep the HTML template but update filters
2. Replace fetchInventory with deals module
3. Add new API endpoints

**Step 2: Commit**

```bash
git add server.js
git commit -m "refactor: update server to use adapter architecture"
```

---

## Task 8: Test End-to-End

**Step 1: Start server and verify**

```bash
BESTBUY_API_KEY=your_key node server.js
```

**Step 2: Test in browser**

- Verify deals load from multiple categories
- Verify category filter works
- Verify source filter shows "Best Buy"
- Verify discount badges appear correctly
- Verify existing store lookup still works

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: end-to-end testing fixes"
```

---

## Task 9: Merge to Main

**Step 1: Verify all tests pass**

Manual verification that app works correctly.

**Step 2: Merge**

```bash
git checkout main
git merge feature/tech-deal-finder
git push origin main
```

**Step 3: Clean up worktree**

```bash
git worktree remove .worktrees/tech-deal-finder
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Create directories | adapters/, lib/, cache/ |
| 2 | Categories module | lib/categories.js |
| 3 | Cache module | lib/cache.js |
| 4 | Normalize module | lib/normalize.js |
| 5 | Best Buy adapter | adapters/bestbuy.js |
| 6 | Deals aggregator | lib/deals.js |
| 7 | Update server | server.js |
| 8 | End-to-end test | - |
| 9 | Merge | - |
