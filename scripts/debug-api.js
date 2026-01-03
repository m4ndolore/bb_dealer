#!/usr/bin/env node
const { firefox } = require('playwright');

(async () => {
  const browser = await firefox.launch({ headless: true });
  const page = await browser.newPage();

  // First load the open-box page to get proper cookies/session
  const openBoxUrl = 'https://www.bestbuy.com/product/apple-macbook-pro-16-inch-laptop-apple-m4-pro-chip-built-for-apple-intelligence-48gb-memory-512gb-ssd-silver/JJGCQ8HR3C/sku/6602752/openbox?condition=fair';
  console.log('Loading open-box page for session...');
  await page.goto(openBoxUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);

  // Try different payload variations
  const payloads = [
    {
      name: 'Original (condition=0)',
      payload: {
        locationId: '',
        zipCode: '55113',
        showOnShelf: true,
        lookupInStoreQuantity: false,
        consolidated: false,
        items: [{ sku: '6602752', condition: '0', quantity: 1 }],
        onlyBestBuyLocations: true,
        pickupTypes: ['UPS_ACCESS_POINT', 'FEDEX_HAL'],
        showInStore: false,
        showOnlyOnShelf: false,
        xboxAllAccess: false
      }
    },
    {
      name: 'lookupInStoreQuantity=true',
      payload: {
        locationId: '',
        zipCode: '55113',
        showOnShelf: true,
        lookupInStoreQuantity: true,
        consolidated: false,
        items: [{ sku: '6602752', condition: '0', quantity: 1 }],
        onlyBestBuyLocations: true,
        pickupTypes: ['UPS_ACCESS_POINT', 'FEDEX_HAL'],
        showInStore: true,
        showOnlyOnShelf: false,
        xboxAllAccess: false
      }
    },
    {
      name: 'condition as string "fair"',
      payload: {
        locationId: '',
        zipCode: '55113',
        showOnShelf: true,
        lookupInStoreQuantity: true,
        consolidated: false,
        items: [{ sku: '6602752', condition: 'fair', quantity: 1 }],
        onlyBestBuyLocations: true,
        pickupTypes: [],
        showInStore: true,
        showOnlyOnShelf: false,
        xboxAllAccess: false
      }
    },
    {
      name: 'Minimal payload',
      payload: {
        zipCode: '55113',
        items: [{ sku: '6602752', condition: '0', quantity: 1 }]
      }
    }
  ];

  for (const {name, payload} of payloads) {
    const result = await page.evaluate(async (p) => {
      const response = await fetch('/productfulfillment/c/api/2.0/storeAvailability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p)
      });
      return await response.json();
    }, payload);

    const item = result.ispu?.items?.[0];
    const store7 = item?.locations?.find(l => l.locationId === '7');
    const hasAvail = store7 && store7.availability !== undefined;
    const qty = store7?.availability?.availablePickupQuantity || 0;

    console.log(`${name}: ${hasAvail ? 'Has availability, qty=' + qty : 'No availability data'}`);

    // Check if any store has availability
    const withStock = (item?.locations || []).filter(l => l.availability?.availablePickupQuantity > 0);
    if (withStock.length > 0) {
      console.log(`  -> Found ${withStock.length} stores with stock!`);
      withStock.forEach(l => {
        const store = result.ispu?.locations?.find(s => s.id === l.locationId);
        console.log(`     ${store?.name} (${store?.city}) - qty: ${l.availability.availablePickupQuantity}`);
      });
    }
  }

  await browser.close();
})();
