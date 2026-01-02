#!/usr/bin/env node
/**
 * Check all conditions across expanded zip codes for a specific SKU
 */

const { firefox } = require('playwright');

const SKU = process.argv[2] || '6602752';

const EXPANDED_ZIPS = [
  '10001', '90001', '60601', '77001', '98101',  // Current 5
  '30303', '33101', '85001', '02101', '19103',  // Atlanta, Miami, Phoenix, Boston, Philly
  '48201', '55401', '63101', '80202', '89101',  // Detroit, Minneapolis, St Louis, Denver, Vegas
  '84101', '97201', '27601', '37201', '46201',  // SLC, Portland, Raleigh, Nashville, Indianapolis
];

const COND_NAMES = { '0': 'fair', '1': 'satisfactory', '2': 'good', '3': 'excellent' };

async function main() {
  console.error(`Checking SKU ${SKU} across ${EXPANDED_ZIPS.length} zip codes and all conditions...`);

  const browser = await firefox.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0'
  });
  const page = await context.newPage();

  // Load any BB page for session
  await page.goto('https://www.bestbuy.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);

  const allStores = [];
  const seenKeys = new Set();

  for (const condition of ['0', '1', '2', '3']) {
    console.error(`\nCondition: ${COND_NAMES[condition]}`);

    for (const zip of EXPANDED_ZIPS) {
      try {
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
          const response = await fetch('/productfulfillment/c/api/2.0/storeAvailability', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          return await response.json();
        }, { sku: SKU, zipCode: zip, condition });

        if (result.ispu?.items?.[0]?.locations) {
          const storeMap = {};
          for (const s of (result.ispu?.locations || [])) {
            storeMap[s.id] = s;
          }
          for (const loc of result.ispu.items[0].locations) {
            const qty = loc.availability?.availablePickupQuantity || 0;
            const key = `${loc.locationId}-${condition}`;
            if (qty > 0 && !seenKeys.has(key)) {
              seenKeys.add(key);
              const store = storeMap[loc.locationId];
              const hit = {
                condition: COND_NAMES[condition],
                storeId: loc.locationId,
                name: store?.name,
                city: store?.city,
                state: store?.state,
                zip: store?.zipCode,
                qty: qty
              };
              allStores.push(hit);
              console.error(`  FOUND: ${store?.name} (${store?.city}, ${store?.state}) - ${COND_NAMES[condition]} x${qty}`);
            }
          }
        }
      } catch (e) {
        // Ignore errors for individual zips
      }
      await page.waitForTimeout(150);
    }
  }

  await browser.close();

  console.log(JSON.stringify({ sku: SKU, found: allStores.length, stores: allStores }, null, 2));
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
