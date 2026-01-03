#!/usr/bin/env node

/**
 * Fetch store availability for a Micro Center product
 *
 * Usage:
 *   node fetch-microcenter-stores.js <productUrl> [zipCode]
 *
 * Example:
 *   node fetch-microcenter-stores.js "https://www.microcenter.com/product/123456/..." 92780
 *
 * Output: JSON to stdout with store availability
 * Logs: Progress messages to stderr
 */

const { firefox } = require('playwright');
const { MICROCENTER_STORES, getStoreByNumber } = require('./lib/microcenter-stores');
const { sortStoresByDistance } = require('./lib/geo');

const productUrl = process.argv[2];
const zipCode = process.argv[3] || '';

if (!productUrl) {
  console.error('Usage: node fetch-microcenter-stores.js <productUrl> [zipCode]');
  process.exit(1);
}

const HEADLESS = process.env.HEADLESS !== 'false';

async function fetchStoreAvailability() {
  console.error(`Fetching Micro Center store availability...`);
  console.error(`  URL: ${productUrl}`);
  console.error(`  Zip: ${zipCode || '(none)'}`);

  const browser = await firefox.launch({ headless: HEADLESS });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
    viewport: { width: 1280, height: 900 },
  });

  // Anti-detection
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const page = await context.newPage();

  try {
    // Navigate to product page
    await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);

    // Extract the inventory array from the page
    const inventory = await page.evaluate(() => {
      // The inventory variable is defined globally on the page
      if (typeof window.inventory !== 'undefined') {
        return window.inventory;
      }
      // Try to find it in the HTML
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const text = script.textContent || '';
        const match = text.match(/var\s+inventory\s*=\s*(\[[\s\S]*?\]);/);
        if (match) {
          try {
            return JSON.parse(match[1]);
          } catch (e) {
            // ignore parse error
          }
        }
      }
      return null;
    });

    await browser.close();

    if (!inventory) {
      console.error('  Could not find inventory data on page');
      console.log(JSON.stringify({ error: 'No inventory data found', stores: [] }));
      return;
    }

    console.error(`  Found ${inventory.length} stores in inventory data`);

    // Merge inventory data with our store details
    const storesWithStock = inventory
      .filter(item => item.qoh > 0 && item.storeNumber !== '029') // Exclude "Shippable Items"
      .map(item => {
        const storeDetails = getStoreByNumber(item.storeNumber);
        if (!storeDetails) {
          return {
            storeNumber: item.storeNumber,
            name: item.storeName,
            stockCount: item.qoh,
            address: '',
            city: '',
            state: '',
            zip: ''
          };
        }
        return {
          storeNumber: item.storeNumber,
          name: storeDetails.name,
          stockCount: item.qoh,
          address: storeDetails.address,
          city: storeDetails.city,
          state: storeDetails.state,
          zip: storeDetails.zip,
          lat: storeDetails.lat,
          lng: storeDetails.lng
        };
      });

    // Sort by distance if zip code provided
    let sortedStores = storesWithStock;
    if (zipCode) {
      sortedStores = sortStoresByDistance(zipCode, storesWithStock);
    }

    console.error(`  Found ${sortedStores.length} stores with stock`);

    console.log(JSON.stringify({
      stores: sortedStores,
      totalStores: inventory.length,
      storesWithStock: sortedStores.length
    }));

  } catch (error) {
    await browser.close();
    console.error(`  Error: ${error.message}`);
    console.log(JSON.stringify({ error: error.message, stores: [] }));
  }
}

fetchStoreAvailability();
