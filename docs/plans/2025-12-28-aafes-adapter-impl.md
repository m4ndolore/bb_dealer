# AAFES Adapter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add AAFES/Monetate as a deal source alongside Best Buy.

**Architecture:** Config-driven adapter that calls Monetate API, normalizes items to Deal model using shared libs, caches results.

**Tech Stack:** Node.js, native https, JSON file cache

---

### Task 1: Create Config Directory and File

**Files:**
- Create: `config/aafes.json`

**Step 1: Create config directory**

```bash
mkdir -p config
```

**Step 2: Create config file**

Create `config/aafes.json`:
```json
{
  "apiUrl": "https://engine.monetate.net/api/engine/v1/decide/aafes",
  "baseUrl": "https://www.shopmyexchange.com",
  "channel": "a-efad0a6e/p/shopmyexchange.com"
}
```

**Step 3: Commit**

```bash
git add config/aafes.json
git commit -m "feat: add AAFES config file"
```

---

### Task 2: Create AAFES Adapter

**Files:**
- Create: `adapters/aafes.js`

**Step 1: Create the adapter file**

Create `adapters/aafes.js`:
```javascript
/**
 * AAFES/Monetate API adapter
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { createDeal } = require('../lib/normalize');
const { detectCategory } = require('../lib/categories');
const cache = require('../lib/cache');

const SOURCE = 'aafes';

// Load config
const configPath = path.join(__dirname, '..', 'config', 'aafes.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

function generateMonetateId() {
  const part1 = Math.floor(Math.random() * 10);
  const part2 = Math.floor(Math.random() * 1000000000);
  const part3 = Date.now();
  return `${part1}.${part2}.${part3}`;
}

function buildPayload() {
  return {
    channel: config.channel,
    events: [
      {
        eventType: 'monetate:decision:DecisionRequest',
        requestId: `req-${Date.now()}`
      },
      {
        eventType: 'monetate:context:PageView',
        url: 'https://www.shopmyexchange.com/browse?query=aafes'
      }
    ],
    monetateId: generateMonetateId()
  };
}

function fetchApi(url, payload) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const body = JSON.stringify(payload);

    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('Invalid JSON response from Monetate API'));
          }
        } else {
          reject(new Error(`Monetate API returned ${res.statusCode}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function flattenItems(response) {
  const responses = response?.data?.responses ?? [];
  return responses.flatMap(r =>
    (r.actions ?? []).flatMap(a => a.items ?? [])
  );
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

  const id = item.id ?? item.itemGroupId ?? item.recSetId ?? `unknown-${Date.now()}`;

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

async function fetchDeals(options = {}) {
  const { forceRefresh = false } = options;

  // Check cache first
  if (!forceRefresh) {
    const cached = cache.read(SOURCE);
    if (cached && !cached.expired) {
      console.log(`Using cached AAFES data (${Math.round(cached.age / 1000 / 60)}m old)`);
      return cached.deals;
    }
  }

  console.log('Fetching fresh AAFES data...');

  const payload = buildPayload();
  const response = await fetchApi(config.apiUrl, payload);
  const items = flattenItems(response);

  console.log(`  Found ${items.length} items from Monetate API`);

  const deals = items.map(item => normalizeItem(item));

  console.log(`Total AAFES deals: ${deals.length}`);

  // Cache results
  cache.write(SOURCE, deals);

  return deals;
}

module.exports = {
  SOURCE,
  fetchDeals
};
```

**Step 2: Verify syntax**

```bash
node -c adapters/aafes.js
```

Expected: `adapters/aafes.js: no issues found` (or similar syntax OK message)

**Step 3: Commit**

```bash
git add adapters/aafes.js
git commit -m "feat: add AAFES adapter with Monetate API integration"
```

---

### Task 3: Integrate AAFES into Deals Aggregator

**Files:**
- Modify: `lib/deals.js:5-9`

**Step 1: Update deals.js**

Change the imports and ADAPTERS section at the top of `lib/deals.js`:

From:
```javascript
const bestbuyAdapter = require('../adapters/bestbuy');

const ADAPTERS = {
  bestbuy: bestbuyAdapter
};
```

To:
```javascript
const bestbuyAdapter = require('../adapters/bestbuy');
const aafesAdapter = require('../adapters/aafes');

const ADAPTERS = {
  bestbuy: bestbuyAdapter,
  aafes: aafesAdapter
};
```

**Step 2: Commit**

```bash
git add lib/deals.js
git commit -m "feat: integrate AAFES adapter into deals aggregator"
```

---

### Task 4: Test the Integration

**Step 1: Test AAFES adapter in isolation**

```bash
node -e "
const aafes = require('./adapters/aafes');
aafes.fetchDeals({ forceRefresh: true })
  .then(deals => {
    console.log('Fetched', deals.length, 'deals');
    if (deals.length > 0) {
      console.log('Sample deal:', JSON.stringify(deals[0], null, 2));
    }
  })
  .catch(err => console.error('Error:', err.message));
"
```

Expected: Should print deal count and sample deal with proper structure.

**Step 2: Test combined fetch**

```bash
node -e "
const { fetchAllDeals } = require('./lib/deals');
fetchAllDeals({
  sources: ['aafes'],
  forceRefresh: true,
  apiKeys: {}
})
  .then(result => {
    console.log('Deals:', result.deals.length);
    console.log('Sources:', result.sources);
    console.log('Errors:', result.errors);
  })
  .catch(err => console.error('Error:', err.message));
"
```

Expected: Should show AAFES source with success: true.

**Step 3: Verify cache was written**

```bash
ls -la cache/
cat cache/aafes.json | head -50
```

Expected: `aafes.json` exists with timestamp and deals array.

---

### Task 5: Update Server Default Sources

**Files:**
- Modify: `server.js` (find where sources default is set)

**Step 1: Find and update default sources**

Search for where `sources` is defined/defaulted in server.js and add 'aafes' to the default array.

**Step 2: Commit**

```bash
git add server.js
git commit -m "feat: enable AAFES source by default"
```

---

### Task 6: Final Integration Test

**Step 1: Start the server**

```bash
BESTBUY_API_KEY=your_key node server.js
```

**Step 2: Test in browser**

Open http://localhost:3000 and verify:
- AAFES appears in source filter dropdown
- AAFES deals appear in the list
- Source badge shows "aafes"
- Category detection works on AAFES products

**Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address integration issues"
```
