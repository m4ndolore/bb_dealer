#!/usr/bin/env node
/**
 * Playwright script to fetch Best Buy open-box store availability
 * Usage: node fetch-stores.js <sku> <zipCode> <condition>
 * 
 * Outputs JSON to stdout: { sku, zipCode, condition, stores: [...] }
 */

const { chromium } = require('playwright');

const sku = process.argv[2];
const zipCode = process.argv[3];
const condition = process.argv[4] || '0';

// Map condition codes to URL-friendly names
const conditionMap = {
  '0': 'fair',
  '1': 'satisfactory',
  '2': 'good',
  '3': 'excellent'
};

async function fetchStores() {
  const conditionName = conditionMap[condition] || 'fair';
  const openBoxUrl = `https://www.bestbuy.com/site/${sku}.p?skuId=${sku}#tab=buyingOptions`;
  
  console.error(`Navigating to: ${openBoxUrl}`);
  
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });
  
  const page = await context.newPage();
  
  // Capture the storeAvailability API response
  let storeData = null;
  
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('storeAvailability') || url.includes('fulfillment')) {
      console.error(`Intercepted: ${url.substring(0, 80)}...`);
      try {
        const json = await response.json();
        if (json.ispu?.locations) {
          console.error(`  -> Found ${json.ispu.locations.length} store locations!`);
          storeData = json;
        } else if (json.ispu) {
          console.error(`  -> ispu exists but no locations`);
        }
      } catch (e) {
        // Not JSON or not the response we want
      }
    }
  });
  
  try {
    // Navigate to the product page - don't wait for networkidle, BB has too many scripts
    await page.goto(openBoxUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Wait for the page to stabilize a bit
    await page.waitForTimeout(3000);
    
    // Try to find and click on the "Open-Box" or "Buying Options" section
    const buyingOptionsTab = page.locator('[data-testid="buying-options-tab"]').or(
      page.locator('button:has-text("Buying Options")')
    ).or(
      page.locator('a:has-text("Buying Options")')
    );
    
    if (await buyingOptionsTab.count() > 0) {
      console.error('Clicking Buying Options tab...');
      await buyingOptionsTab.first().click();
      await page.waitForTimeout(2000);
    }
    
    // Look for open-box section
    const openBoxSection = page.locator('[data-testid="open-box-section"]').or(
      page.locator('text=Open-Box')
    );
    
    if (await openBoxSection.count() > 0) {
      console.error('Found Open-Box section');
    }
    
    // Try to set zip code if there's a location input
    const zipInput = page.locator('input[data-track="Zip Code"]').or(
      page.locator('input[placeholder*="ZIP"]')
    ).or(
      page.locator('input[aria-label*="ZIP"]')
    ).or(
      page.locator('input[placeholder*="zip"]')
    );
    
    if (await zipInput.count() > 0) {
      console.error(`Found zip input, entering ${zipCode}`);
      await zipInput.first().fill(zipCode);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(3000);
    }
    
    // Look for "Check Stores" or "See all pickup locations" or "choose a store" button
    const checkStoresBtn = page.locator('button:has-text("Check Stores")').or(
      page.locator('button:has-text("check stores")')
    ).or(
      page.locator('button:has-text("See all pickup")')
    ).or(
      page.locator('button:has-text("choose a store")')
    ).or(
      page.locator('button:has-text("Choose a Store")')
    ).or(
      page.locator('[data-track="See all pickup locations"]')
    ).or(
      page.locator('button:has-text("Find a Store")')
    );
    
    if (await checkStoresBtn.count() > 0) {
      console.error('Found check stores button, clicking...');
      await checkStoresBtn.first().click();
      await page.waitForTimeout(5000); // Wait longer for store modal to load
    } else {
      console.error('No check stores button found, waiting for API response...');
      await page.waitForTimeout(5000);
    }
    
    // If we intercepted store data from the API, use it
    if (storeData) {
      const stores = storeData.ispu?.locations || [];
      console.log(JSON.stringify({
        sku,
        zipCode,
        condition,
        stores: stores.map(s => ({
          id: s.id,
          name: s.name,
          address: s.address,
          city: s.city,
          state: s.state,
          zipCode: s.zipCode,
          phone: s.phone,
          distance: s.distance
        }))
      }));
      await browser.close();
      return;
    }
    
    // Wait a bit more and check again for intercepted data
    console.error('Waiting for more network activity...');
    await page.waitForTimeout(3000);
    
    if (storeData) {
      const stores = storeData.ispu?.locations || [];
      console.log(JSON.stringify({
        sku,
        zipCode,
        condition,
        stores: stores.map(s => ({
          id: s.id,
          name: s.name,
          address: s.address,
          city: s.city,
          state: s.state,
          zipCode: s.zipCode,
          phone: s.phone,
          distance: s.distance
        }))
      }));
      await browser.close();
      return;
    }
    
    // Fallback: try to scrape store info from the DOM
    console.error('No API interception, trying DOM scrape...');
    
    const storeElements = await page.locator('[class*="store-list"] [class*="store-item"]').or(
      page.locator('[class*="pickup-store"]')
    ).or(
      page.locator('[data-testid*="store"]')
    ).all();
    
    if (storeElements.length > 0) {
      console.error(`Found ${storeElements.length} store elements in DOM`);
      const stores = [];
      for (const el of storeElements) {
        const text = await el.textContent();
        stores.push({ rawText: text });
      }
      console.log(JSON.stringify({ sku, zipCode, condition, stores, source: 'dom' }));
    } else {
      // Last resort: return page HTML snippet for debugging
      const bodyText = await page.locator('body').textContent();
      const hasOpenBox = bodyText.includes('Open-Box') || bodyText.includes('open-box');
      console.error(`Page has open-box content: ${hasOpenBox}`);
      console.log(JSON.stringify({ 
        sku, 
        zipCode, 
        condition, 
        stores: [],
        error: 'Could not find store data',
        hasOpenBoxContent: hasOpenBox
      }));
    }
    
  } catch (e) {
    console.error(`Error: ${e.message}`);
    console.log(JSON.stringify({ 
      sku, 
      zipCode, 
      condition, 
      stores: [], 
      error: e.message 
    }));
  } finally {
    await browser.close();
  }
}

if (!sku || !zipCode) {
  console.error('Usage: node fetch-stores.js <sku> <zipCode> [condition]');
  process.exit(1);
}

fetchStores().catch(e => {
  console.error(`Fatal: ${e.message}`);
  console.log(JSON.stringify({ error: e.message, stores: [] }));
  process.exit(1);
});