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
          reject(new Error(`Monetate API returned ${res.statusCode}: ${data.slice(0, 200)}`));
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
