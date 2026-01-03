# Micro Center Adapter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Micro Center as a new source for open-box and clearance deals, with tab-based UI and discount/price sliders.

**Architecture:** New adapter (`adapters/microcenter.js`) scrapes Micro Center's website, normalizes deals using existing `lib/normalize.js`, and integrates with `lib/deals.js`. GUI gets tabs for source switching and slider filters.

**Tech Stack:** Node.js, HTTPS for scraping, existing normalize/cache libs, vanilla JS frontend with Tailwind CSS.

---

## Phase 1: Basic Scraping (MVP)

### Task 1: Create Micro Center Adapter Skeleton

**Files:**
- Create: `adapters/microcenter.js`

**Step 1: Create the adapter file with basic structure**

```javascript
/**
 * Micro Center Open Box and Clearance adapter
 */

const https = require('https');
const { createDeal } = require('../lib/normalize');
const { detectCategory } = require('../lib/categories');
const cache = require('../lib/cache');

const SOURCE = 'microcenter';

// Micro Center store locations (for reference)
const STORES = [
  { id: '101', name: 'Tustin', state: 'CA', zip: '92780' },
  { id: '181', name: 'Denver', state: 'CO', zip: '80231' },
  // Add more as needed
];

function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      }
    };

    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    }).on('error', reject);
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchDeals(options = {}) {
  const { forceRefresh = false } = options;

  // Check cache first
  if (!forceRefresh) {
    const cached = cache.read(SOURCE);
    if (cached && !cached.expired) {
      console.log(`Using cached Micro Center data (${Math.round(cached.age / 1000 / 60)}m old)`);
      return cached.deals;
    }
  }

  console.log('Fetching fresh Micro Center deals...');

  // TODO: Implement scraping in next task
  const deals = [];

  cache.write(SOURCE, deals);
  return deals;
}

module.exports = {
  SOURCE,
  STORES,
  fetchDeals
};
```

**Step 2: Verify file is valid**

Run: `node -c adapters/microcenter.js`
Expected: No syntax errors

**Step 3: Commit**

```bash
git add adapters/microcenter.js
git commit -m "feat(microcenter): add adapter skeleton"
```

---

### Task 2: Register Adapter in Deals Aggregator

**Files:**
- Modify: `lib/deals.js`

**Step 1: Add microcenter adapter import and registration**

In `lib/deals.js`, add at line 6 (after aafes import):

```javascript
const microcenterAdapter = require('../adapters/microcenter');
```

Then update the ADAPTERS object to include microcenter:

```javascript
const ADAPTERS = {
  bestbuy: bestbuyAdapter,
  aafes: aafesAdapter,
  microcenter: microcenterAdapter
};
```

**Step 2: Verify module loads**

Run: `node -e "require('./lib/deals.js'); console.log('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add lib/deals.js
git commit -m "feat(microcenter): register adapter in deals aggregator"
```

---

### Task 3: Implement Open Box Page Scraping

**Files:**
- Modify: `adapters/microcenter.js`

**Step 1: First, manually inspect the page structure**

Run in browser or curl:
```bash
curl -s "https://www.microcenter.com/site/products/open-box.aspx" | head -200
```

Look for product listing patterns (class names, data attributes).

**Step 2: Add HTML parsing function**

Add to `adapters/microcenter.js` after the delay function:

```javascript
function parseProductsFromHtml(html) {
  const products = [];

  // Match product cards - adjust regex based on actual HTML structure
  // This is a starting point - will need refinement based on actual page
  const productPattern = /<div[^>]*class="[^"]*product_wrapper[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;

  let match;
  while ((match = productPattern.exec(html)) !== null) {
    const block = match[1];

    // Extract product details
    const nameMatch = block.match(/data-name="([^"]+)"/);
    const priceMatch = block.match(/data-price="([^"]+)"/);
    const skuMatch = block.match(/data-id="([^"]+)"/);
    const urlMatch = block.match(/href="([^"]+)"/);
    const imgMatch = block.match(/src="([^"]+)"/);
    const origPriceMatch = block.match(/<span[^>]*class="[^"]*msrp[^"]*"[^>]*>\$?([\d,]+\.?\d*)/i);

    if (nameMatch && priceMatch) {
      const originalPrice = origPriceMatch
        ? parseFloat(origPriceMatch[1].replace(',', ''))
        : parseFloat(priceMatch[1]);
      const currentPrice = parseFloat(priceMatch[1]);

      products.push({
        name: nameMatch[1],
        sku: skuMatch ? skuMatch[1] : null,
        currentPrice,
        originalPrice,
        url: urlMatch ? 'https://www.microcenter.com' + urlMatch[1] : '',
        image: imgMatch ? imgMatch[1] : ''
      });
    }
  }

  return products;
}
```

**Step 3: Update fetchDeals to scrape open-box page**

Replace the TODO in fetchDeals with:

```javascript
async function fetchDeals(options = {}) {
  const { forceRefresh = false } = options;

  if (!forceRefresh) {
    const cached = cache.read(SOURCE);
    if (cached && !cached.expired) {
      console.log(`Using cached Micro Center data (${Math.round(cached.age / 1000 / 60)}m old)`);
      return cached.deals;
    }
  }

  console.log('Fetching fresh Micro Center deals...');

  const urls = [
    'https://www.microcenter.com/site/products/open-box.aspx'
  ];

  let allDeals = [];

  for (const url of urls) {
    try {
      console.log(`  Fetching ${url}...`);
      const html = await fetchHtml(url);
      const products = parseProductsFromHtml(html);
      console.log(`    Found ${products.length} products`);

      for (const product of products) {
        if (product.currentPrice > 0) {
          allDeals.push(createDeal({
            id: `microcenter-${product.sku || Date.now()}`,
            source: SOURCE,
            name: product.name,
            originalPrice: product.originalPrice,
            currentPrice: product.currentPrice,
            condition: 'Open-Box',
            availability: 'in-store',
            url: product.url,
            image: product.image,
            sku: product.sku
          }));
        }
      }

      await delay(1500);
    } catch (e) {
      console.log(`    Error: ${e.message}`);
    }
  }

  console.log(`Total Micro Center deals: ${allDeals.length}`);
  cache.write(SOURCE, allDeals);
  return allDeals;
}
```

**Step 4: Test the scraper**

Run: `node -e "require('./adapters/microcenter.js').fetchDeals().then(d => console.log('Found:', d.length, 'deals'))"`

Note: This may return 0 initially - we'll need to refine the regex based on actual HTML.

**Step 5: Commit**

```bash
git add adapters/microcenter.js
git commit -m "feat(microcenter): implement basic open-box page scraping"
```

---

### Task 4: Refine HTML Parsing Based on Actual Page Structure

**Files:**
- Modify: `adapters/microcenter.js`

**Step 1: Fetch and save sample HTML for analysis**

```bash
curl -s "https://www.microcenter.com/site/products/open-box.aspx" > /tmp/mc-openbox.html
```

**Step 2: Analyze the HTML structure**

Look for patterns like:
- Product container class names
- Price elements
- Product name/title elements
- SKU/ID attributes
- Image sources

**Step 3: Update parseProductsFromHtml with correct selectors**

Adjust the regex patterns based on actual HTML structure found in Step 2.

**Step 4: Test again and verify products are found**

Run: `node -e "require('./adapters/microcenter.js').fetchDeals().then(d => console.log(JSON.stringify(d[0], null, 2)))"`

**Step 5: Commit**

```bash
git add adapters/microcenter.js
git commit -m "fix(microcenter): refine HTML parsing for actual page structure"
```

---

### Task 5: Add Micro Center to Server Sources

**Files:**
- Modify: `server.js`

**Step 1: Update the /api/products endpoint to include microcenter**

Find this line in server.js (around line 686):

```javascript
const results = await fetchAllDeals({
  sources: ['bestbuy', 'aafes'],
```

Change to:

```javascript
const results = await fetchAllDeals({
  sources: ['bestbuy', 'aafes', 'microcenter'],
```

**Step 2: Add Micro Center to SOURCES in frontend**

Find the SOURCES constant in the HTML template (around line 105):

```javascript
const SOURCES = {
  bestbuy: { name: 'Best Buy', color: 'blue' },
  aafes: { name: 'AAFES', color: 'green' }
};
```

Add microcenter:

```javascript
const SOURCES = {
  bestbuy: { name: 'Best Buy', color: 'blue' },
  aafes: { name: 'AAFES', color: 'green' },
  microcenter: { name: 'Micro Center', color: 'purple' }
};
```

**Step 3: Test the full flow**

Run: `source .env.local && timeout 60 node server.js`
Open: http://localhost:3000
Verify: Micro Center products appear (or at least no errors)

**Step 4: Commit**

```bash
git add server.js
git commit -m "feat(microcenter): integrate adapter with server and frontend"
```

---

## Phase 2: Tab UI and Slider Filters

### Task 6: Add Tab Navigation UI

**Files:**
- Modify: `server.js` (HTML template)

**Step 1: Add tab state variable**

After the existing state variables (around line 91), add:

```javascript
let activeTab = localStorage.getItem('bb-active-tab') || 'all';
```

**Step 2: Add saveTab function**

After savePostalCode function, add:

```javascript
function saveTab(tab) {
  activeTab = tab;
  localStorage.setItem('bb-active-tab', tab);
  render();
}
```

**Step 3: Update getFiltered to respect activeTab**

In getFiltered function, add at the start of the filter chain:

```javascript
.filter(p => activeTab === 'all' || p.source === activeTab)
```

**Step 4: Add tab UI in render function**

After the header section (around line 318), add tabs:

```javascript
<div class="flex gap-1 mb-6 bg-gray-800 rounded-xl p-1">
  <button onclick="saveTab('all')" class="px-4 py-2 rounded-lg font-medium transition \${activeTab === 'all' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'}">
    All Sources
  </button>
  <button onclick="saveTab('bestbuy')" class="px-4 py-2 rounded-lg font-medium transition \${activeTab === 'bestbuy' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}">
    Best Buy
  </button>
  <button onclick="saveTab('microcenter')" class="px-4 py-2 rounded-lg font-medium transition \${activeTab === 'microcenter' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}">
    Micro Center
  </button>
  <button onclick="saveTab('aafes')" class="px-4 py-2 rounded-lg font-medium transition \${activeTab === 'aafes' ? 'bg-green-600 text-white' : 'text-gray-400 hover:text-white'}">
    AAFES
  </button>
</div>
```

**Step 5: Test tabs**

Run server, click tabs, verify filtering works and state persists on reload.

**Step 6: Commit**

```bash
git add server.js
git commit -m "feat(ui): add tab navigation for source filtering"
```

---

### Task 7: Add Discount Slider Filter

**Files:**
- Modify: `server.js` (HTML template)

**Step 1: Add minDiscount state variable**

After activeTab variable:

```javascript
let minDiscountFilter = parseInt(localStorage.getItem('bb-min-discount') || '0');
```

**Step 2: Add slider change handler**

```javascript
function saveMinDiscount(value) {
  minDiscountFilter = parseInt(value);
  localStorage.setItem('bb-min-discount', value);
  render();
}
```

**Step 3: Update getFiltered to apply discount filter**

Add to filter chain:

```javascript
.filter(p => p.discount >= minDiscountFilter)
```

**Step 4: Add slider UI in filter section**

Add after existing filter dropdowns:

```javascript
<div class="col-span-2">
  <label class="block text-xs text-gray-400 mb-1">Min Discount: \${minDiscountFilter}%+</label>
  <input type="range" min="0" max="70" step="5" value="\${minDiscountFilter}"
         onchange="saveMinDiscount(this.value)"
         class="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer">
</div>
```

**Step 5: Test slider**

Move slider, verify products filter and value persists.

**Step 6: Commit**

```bash
git add server.js
git commit -m "feat(ui): add discount slider filter"
```

---

### Task 8: Add Price Range Slider

**Files:**
- Modify: `server.js` (HTML template)

**Step 1: Add price range state variables**

```javascript
let minPriceFilter = parseInt(localStorage.getItem('bb-min-price') || '0');
let maxPriceFilter = parseInt(localStorage.getItem('bb-max-price') || '10000');
```

**Step 2: Add handlers**

```javascript
function saveMinPrice(value) {
  minPriceFilter = parseInt(value);
  localStorage.setItem('bb-min-price', value);
  render();
}

function saveMaxPrice(value) {
  maxPriceFilter = parseInt(value);
  localStorage.setItem('bb-max-price', value);
  render();
}
```

**Step 3: Update getFiltered**

Add to filter chain:

```javascript
.filter(p => p.currentPrice >= minPriceFilter && p.currentPrice <= maxPriceFilter)
```

**Step 4: Add price range UI**

```javascript
<div>
  <label class="block text-xs text-gray-400 mb-1">Min Price: $\${minPriceFilter}</label>
  <input type="range" min="0" max="5000" step="100" value="\${minPriceFilter}"
         onchange="saveMinPrice(this.value)"
         class="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer">
</div>
<div>
  <label class="block text-xs text-gray-400 mb-1">Max Price: $\${maxPriceFilter}</label>
  <input type="range" min="0" max="10000" step="100" value="\${maxPriceFilter}"
         onchange="saveMaxPrice(this.value)"
         class="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer">
</div>
```

**Step 5: Test price filtering**

**Step 6: Commit**

```bash
git add server.js
git commit -m "feat(ui): add price range slider filters"
```

---

## Phase 3: Find Stock for Micro Center

### Task 9: Research Micro Center Store Availability

**Files:**
- None (research task)

**Step 1: Inspect a product page for store availability**

Open a Micro Center product page in browser, open DevTools Network tab, look for:
- XHR requests when selecting stores
- Store availability data in page source
- Any JSON endpoints

**Step 2: Document findings**

Note the URL patterns and data structure for store availability.

**Step 3: No commit (research only)**

---

### Task 10: Implement Micro Center Find Stock Endpoint

**Files:**
- Modify: `server.js`
- Create: `fetch-mc-stores.js` (if needed)

**Step 1: Add endpoint for Micro Center store availability**

Add after the existing /api/openbox-stores endpoint:

```javascript
if (url.pathname.startsWith('/api/microcenter-stores/')) {
  res.setHeader('Content-Type', 'application/json');

  const sku = url.pathname.split('/api/microcenter-stores/')[1];
  const zipCode = url.searchParams.get('zipCode');

  // Implementation depends on research from Task 9
  // Placeholder:
  res.end(JSON.stringify({
    sku,
    stores: [],
    error: 'Not implemented yet'
  }));
  return;
}
```

**Step 2: Commit placeholder**

```bash
git add server.js
git commit -m "feat(microcenter): add store availability endpoint placeholder"
```

---

### Task 11: Add Store Distance Calculation

**Files:**
- Create: `lib/geo.js`

**Step 1: Create geo utility with zip code distance calculation**

```javascript
/**
 * Simple zip code distance utilities
 */

// Major zip code centroids (lat, lon) - subset for common areas
const ZIP_COORDS = {
  '10001': [40.7484, -73.9967],  // NYC
  '90001': [33.9425, -118.2551], // LA
  '96813': [21.3069, -157.8583], // Honolulu
  // Add Micro Center store zips
  '92780': [33.7367, -117.8311], // Tustin MC
  '80231': [39.6761, -104.8879], // Denver MC
  // ... more as needed
};

function getDistance(zip1, zip2) {
  const coord1 = ZIP_COORDS[zip1];
  const coord2 = ZIP_COORDS[zip2];

  if (!coord1 || !coord2) return null;

  // Haversine formula
  const R = 3959; // Earth radius in miles
  const dLat = (coord2[0] - coord1[0]) * Math.PI / 180;
  const dLon = (coord2[1] - coord1[1]) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(coord1[0] * Math.PI / 180) * Math.cos(coord2[0] * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return Math.round(R * c);
}

module.exports = { getDistance, ZIP_COORDS };
```

**Step 2: Commit**

```bash
git add lib/geo.js
git commit -m "feat: add zip code distance calculation utility"
```

---

## Phase 4: Polish

### Task 12: Add Clearance Page Scraping

**Files:**
- Modify: `adapters/microcenter.js`

**Step 1: Add clearance URL to fetch list**

Update the urls array in fetchDeals:

```javascript
const urls = [
  'https://www.microcenter.com/site/products/open-box.aspx',
  'https://www.microcenter.com/site/content/clearance-outlet.aspx'
];
```

**Step 2: Test and verify clearance items are fetched**

**Step 3: Commit**

```bash
git add adapters/microcenter.js
git commit -m "feat(microcenter): add clearance page scraping"
```

---

### Task 13: Handle Scraping Errors Gracefully

**Files:**
- Modify: `adapters/microcenter.js`

**Step 1: Add error handling for blocked requests**

Update fetchHtml to handle common error cases:

```javascript
function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 15000
    };

    const req = https.get(url, options, (res) => {
      if (res.statusCode === 403 || res.statusCode === 429) {
        reject(new Error(`Blocked or rate limited (${res.statusCode})`));
        return;
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}
```

**Step 2: Return empty array on complete failure instead of crashing**

**Step 3: Commit**

```bash
git add adapters/microcenter.js
git commit -m "fix(microcenter): handle scraping errors gracefully"
```

---

### Task 14: Final Testing and Documentation

**Files:**
- Modify: `docs/NEXT_STEPS.md`
- Modify: `CLAUDE.md`

**Step 1: Full integration test**

Run: `source .env.local && node server.js`
Test:
- [ ] Micro Center tab shows products (or graceful error)
- [ ] Tab switching works and persists
- [ ] Discount slider filters correctly
- [ ] Price range filters correctly
- [ ] Find Stock button appears for MC products

**Step 2: Update CLAUDE.md with new adapter info**

Add to Architecture section:

```markdown
- **adapters/microcenter.js** - Micro Center Open Box + Clearance scraping
```

**Step 3: Update NEXT_STEPS.md**

Document what was completed and remaining work.

**Step 4: Final commit**

```bash
git add docs/NEXT_STEPS.md CLAUDE.md
git commit -m "docs: update documentation for Micro Center adapter"
```

---

## Summary

| Task | Description | Est. Time |
|------|-------------|-----------|
| 1 | Create adapter skeleton | 5 min |
| 2 | Register in deals aggregator | 5 min |
| 3 | Implement basic scraping | 20 min |
| 4 | Refine HTML parsing | 30 min |
| 5 | Add to server sources | 10 min |
| 6 | Add tab navigation | 20 min |
| 7 | Add discount slider | 15 min |
| 8 | Add price range slider | 15 min |
| 9 | Research store availability | 20 min |
| 10 | Implement Find Stock endpoint | 30 min |
| 11 | Add distance calculation | 15 min |
| 12 | Add clearance scraping | 10 min |
| 13 | Handle errors gracefully | 15 min |
| 14 | Final testing and docs | 20 min |

**Total estimated time: ~4 hours**
