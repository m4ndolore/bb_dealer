#!/usr/bin/env node
/**
 * Playwright script to fetch Best Buy open-box store availability
 *
 * Usage: node fetch-stores.js <sku> <zipCode> <condition> [productPath]
 *
 * If productPath is provided, goes directly to open-box page (faster).
 * If not provided, first resolves the product URL via API redirect.
 *
 * Condition codes: 0=fair, 1=satisfactory, 2=good, 3=excellent
 *
 * If no stores found in user's zipCode, searches nationwide using strategic zipcodes.
 *
 * Outputs JSON to stdout: { sku, zipCode, condition, conditionName, productPath, stores: [...] }
 */

const { chromium } = require('playwright');

const sku = process.argv[2];
const zipCode = process.argv[3];
const condition = process.argv[4] || '0';
const productPath = process.argv[5] || null;

const conditionMap = {
  '0': 'fair',
  '1': 'satisfactory',
  '2': 'good',
  '3': 'excellent'
};

// Strategic US zipcodes for nationwide search (major metros, ~250mi radius coverage)
const NATIONWIDE_ZIPCODES = [
  '10001',  // NYC (Northeast)
  '90001',  // Los Angeles (Southwest)
  '60601',  // Chicago (Midwest)
  '77001',  // Houston (South/Texas)
  '98101',  // Seattle (Northwest)
];

async function fetchStoresForZip(page, sku, zip, condition) {
  const result = await page.evaluate(async ({ sku, zipCode, condition }) => {
    const payload = {
      locationId: '',
      zipCode: zipCode,
      showOnShelf: true,
      lookupInStoreQuantity: false,
      consolidated: false,
      items: [{ sku: sku, condition: condition, quantity: 1 }],
      onlyBestBuyLocations: true,
      pickupTypes: ['UPS_ACCESS_POINT', 'FEDEX_HAL'],
      showInStore: false,
      showOnlyOnShelf: false,
      xboxAllAccess: false
    };

    try {
      const response = await fetch('/productfulfillment/c/api/2.0/storeAvailability', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        return { error: `API returned ${response.status}` };
      }

      return await response.json();
    } catch (e) {
      return { error: e.message };
    }
  }, { sku, zipCode: zip, condition });

  return result;
}

function extractAvailableStores(result) {
  if (!result.ispu?.items?.[0]?.locations || !result.ispu?.locations) {
    return [];
  }

  // Build a map of store details from ispu.locations
  const storeDetailsMap = {};
  for (const store of result.ispu.locations) {
    storeDetailsMap[store.id] = store;
  }

  // Filter to only stores that have actual availability
  const availableStores = [];
  for (const loc of result.ispu.items[0].locations) {
    if (loc.availability && loc.availability.availablePickupQuantity > 0) {
      const storeDetails = storeDetailsMap[loc.locationId];
      if (storeDetails) {
        availableStores.push({
          id: storeDetails.id,
          name: storeDetails.name,
          address: storeDetails.address,
          city: storeDetails.city,
          state: storeDetails.state,
          zipCode: storeDetails.zipCode,
          phone: storeDetails.phone,
          distance: storeDetails.distance,
          quantity: loc.availability.availablePickupQuantity,
          pickupDate: loc.availability.minDate
        });
      }
    }
  }

  return availableStores;
}

async function fetchStores() {
  const conditionName = conditionMap[condition] || 'fair';
  const isHeadless = process.env.HEADLESS !== 'false';

  console.error(`SKU: ${sku}, Zip: ${zipCode}, Condition: ${conditionName}`);
  console.error(`Headless: ${isHeadless}`);

  const browser = await chromium.launch({
    headless: isHeadless,
    channel: 'chrome',  // Use installed Chrome instead of bundled Chromium
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1280,900'
    ]
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale: 'en-US'
  });

  await context.addInitScript(() => {
    // Hide webdriver
    Object.defineProperty(navigator, 'webdriver', { get: () => false });

    // Add chrome object if missing
    if (!window.chrome) {
      window.chrome = { runtime: {} };
    }

    // Override permissions query
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: Notification.permission }) :
        originalQuery(parameters)
    );

    // Add plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5]
    });

    // Add languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en']
    });
  });

  const page = await context.newPage();

  try {
    let resolvedPath = productPath;

    // Step 1: Resolve product path if not provided
    if (!resolvedPath) {
      console.error('Step 1: Resolving product path via API redirect...');
      const apiClickUrl = `https://api.bestbuy.com/click/-/${sku}/pdp`;

      await page.goto(apiClickUrl, { waitUntil: 'commit', timeout: 45000 });
      const currentUrl = page.url();
      console.error(`  Redirected to: ${currentUrl}`);

      const match = currentUrl.match(/\/product\/([^?]+)/);
      if (!match) {
        throw new Error('Could not extract product path from redirect URL');
      }
      resolvedPath = match[1];
      console.error(`  Product path: ${resolvedPath}`);
    }

    // Step 2: Load open-box page to establish session
    const openBoxUrl = `https://www.bestbuy.com/product/${resolvedPath}/sku/${sku}/openbox?condition=${conditionName}`;
    console.error(`Step 2: Loading open-box page for session...`);
    console.error(`  URL: ${openBoxUrl}`);

    await page.goto(openBoxUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);

    // Step 3: Call storeAvailability API for user's zipcode first
    console.error(`Step 3: Checking stores near ${zipCode}...`);

    const result = await fetchStoresForZip(page, sku, zipCode, condition);

    if (result.error) {
      console.error(`  API Error: ${result.error}`);
      console.log(JSON.stringify({
        sku,
        zipCode,
        condition,
        conditionName,
        productPath: resolvedPath,
        stores: [],
        error: result.error
      }));
      return;
    }

    let allStores = extractAvailableStores(result);
    const seenStoreIds = new Set(allStores.map(s => s.id));
    const localStoreCount = allStores.length;

    console.error(`  Found ${result.ispu?.locations?.length || 0} nearby stores, ${allStores.length} have this open-box item`);

    // Step 4: Always search nationwide to find ALL available stores
    console.error('Step 4: Searching nationwide for all available stock...');

    for (const nationwideZip of NATIONWIDE_ZIPCODES) {
      // Skip if it's the same as user's zip
      if (nationwideZip === zipCode) continue;

      console.error(`  Checking ${nationwideZip}...`);

      try {
        const nationwideResult = await fetchStoresForZip(page, sku, nationwideZip, condition);

        if (!nationwideResult.error) {
          const stores = extractAvailableStores(nationwideResult);

          // Add only new stores (dedupe by ID)
          for (const store of stores) {
            if (!seenStoreIds.has(store.id)) {
              seenStoreIds.add(store.id);
              // Clear distance since it's relative to a different zip
              store.distance = null;
              store.searchedFrom = nationwideZip;
              allStores.push(store);
            }
          }

          console.error(`    Found ${stores.length} stores with stock`);
        }
      } catch (e) {
        console.error(`    Error: ${e.message}`);
      }

      // Small delay between requests
      await page.waitForTimeout(500);
    }

    console.error(`  Total: ${allStores.length} stores nationwide (${localStoreCount} local, ${allStores.length - localStoreCount} other regions)`);

    // Output results
    console.log(JSON.stringify({
      sku,
      zipCode,
      condition,
      conditionName,
      productPath: resolvedPath,
      buttonState: result.buttonState?.[0]?.buttonState,
      localStoreCount,
      stores: allStores
    }));

  } catch (e) {
    console.error(`Error: ${e.message}`);
    console.log(JSON.stringify({
      sku,
      zipCode,
      condition,
      conditionName: conditionMap[condition] || 'fair',
      stores: [],
      error: e.message
    }));
  } finally {
    await browser.close();
  }
}

if (!sku || !zipCode) {
  console.error('Usage: node fetch-stores.js <sku> <zipCode> <condition> [productPath]');
  console.error('  condition: 0=fair, 1=satisfactory, 2=good, 3=excellent');
  console.error('  productPath: optional, e.g., "apple-macbook-air.../JJGCQ8R67J"');
  process.exit(1);
}

fetchStores().catch(e => {
  console.error(`Fatal: ${e.message}`);
  console.log(JSON.stringify({ error: e.message, stores: [] }));
  process.exit(1);
});
