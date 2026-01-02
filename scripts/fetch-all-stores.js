#!/usr/bin/env node
/**
 * Fetches all Best Buy store locations from the API and saves to config/stores.json
 *
 * Usage: node scripts/fetch-all-stores.js
 *
 * Loads API key from .env.local at project root
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Load .env.local from project root
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }
}

const API_KEY = process.env.BESTBUY_API_KEY;

if (!API_KEY) {
  console.error('Error: BESTBUY_API_KEY environment variable required');
  process.exit(1);
}

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
        } else {
          reject(new Error(`API returned ${res.statusCode}: ${data.slice(0, 200)}`));
        }
      });
    }).on('error', reject);
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchAllStores() {
  const allStores = [];
  let page = 1;
  const pageSize = 100;
  let totalPages = 1;

  console.log('Fetching Best Buy stores...\n');

  while (page <= totalPages) {
    const url = `https://api.bestbuy.com/v1/stores?apiKey=${API_KEY}&format=json&pageSize=${pageSize}&page=${page}&show=storeId,storeType,name,address,address2,city,region,postalCode,fullPostalCode,country,lat,lng,phone`;

    console.log(`Fetching page ${page}${totalPages > 1 ? ` of ${totalPages}` : ''}...`);

    try {
      const data = await fetch(url);

      if (page === 1) {
        totalPages = data.totalPages;
        console.log(`Total stores: ${data.total}`);
        console.log(`Total pages: ${totalPages}\n`);
      }

      if (data.stores && data.stores.length > 0) {
        allStores.push(...data.stores);
        console.log(`  Retrieved ${data.stores.length} stores (total: ${allStores.length})`);
      }

      page++;

      // Rate limit: wait between requests
      if (page <= totalPages) {
        await delay(500);
      }
    } catch (e) {
      console.error(`Error on page ${page}: ${e.message}`);

      // Retry once after delay
      await delay(2000);
      try {
        const data = await fetch(url);
        if (data.stores) {
          allStores.push(...data.stores);
        }
        page++;
      } catch (e2) {
        console.error(`Retry failed: ${e2.message}`);
        break;
      }
    }
  }

  return allStores;
}

async function main() {
  try {
    const stores = await fetchAllStores();

    // Group by store type for summary
    const byType = {};
    for (const store of stores) {
      const type = store.storeType || 'Unknown';
      byType[type] = (byType[type] || 0) + 1;
    }

    console.log('\n--- Store Types ---');
    for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${type}: ${count}`);
    }

    // Group by state for summary
    const byState = {};
    for (const store of stores) {
      const state = store.region || 'Unknown';
      byState[state] = (byState[state] || 0) + 1;
    }

    console.log('\n--- Stores by State ---');
    for (const [state, count] of Object.entries(byState).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
      console.log(`  ${state}: ${count}`);
    }
    console.log('  ...');

    // Create config output
    const output = {
      generatedAt: new Date().toISOString(),
      totalStores: stores.length,
      storeTypes: byType,
      storesByState: byState,
      stores: stores.map(s => ({
        id: s.storeId,
        type: s.storeType,
        name: s.name,
        address: s.address,
        address2: s.address2 || null,
        city: s.city,
        state: s.region,
        zip: s.postalCode,
        fullZip: s.fullPostalCode || null,
        country: s.country,
        lat: s.lat,
        lng: s.lng,
        phone: s.phone
      }))
    };

    // Write to config file
    const configDir = path.join(__dirname, '..', 'config');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    const outputPath = path.join(configDir, 'stores.json');
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

    console.log(`\n✓ Saved ${stores.length} stores to ${outputPath}`);

    // Also create a smaller lookup file (just id, name, city, state, zip)
    const lookupPath = path.join(configDir, 'stores-lookup.json');
    const lookup = {};
    for (const store of stores) {
      lookup[store.storeId] = {
        name: store.name,
        city: store.city,
        state: store.region,
        zip: store.postalCode,
        type: store.storeType
      };
    }
    fs.writeFileSync(lookupPath, JSON.stringify(lookup, null, 2));
    console.log(`✓ Saved lookup table to ${lookupPath}`);

  } catch (e) {
    console.error(`Fatal error: ${e.message}`);
    process.exit(1);
  }
}

main();
