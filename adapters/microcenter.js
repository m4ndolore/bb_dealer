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
