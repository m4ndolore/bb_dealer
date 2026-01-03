/**
 * Micro Center Open Box, Closeout, and Refurbished adapter
 *
 * Scrapes three types of clearance deals:
 * - Open Box: Customer returns/display models (&prt=clearance)
 * - Closeout: Demos, displays, discontinued items (N filter ,518)
 * - Refurbished: Manufacturer/authorized refurbs (N filter ,519)
 */

const { firefox } = require('playwright');
const { createDeal } = require('../lib/normalize');
const cache = require('../lib/cache');

const SOURCE = 'microcenter';

// Timeout constants
const PAGE_TIMEOUT = 30000;  // 30 seconds for page loads
const WAIT_TIMEOUT = 5000;   // 5 seconds for element waits
const RATE_LIMIT_DELAY = 1500; // 1.5 seconds between requests

// Micro Center store locations
const STORES = [
  { id: '101', name: 'Tustin', state: 'CA', zip: '92780' },
  { id: '181', name: 'Denver', state: 'CO', zip: '80231' },
  { id: '195', name: 'Santa Clara', state: 'CA', zip: '95050' },
  { id: '131', name: 'Dallas', state: 'TX', zip: '75240' },
  { id: '155', name: 'Houston', state: 'TX', zip: '77025' },
  // Add more as needed
];

// Product category N= codes from Micro Center's site
const PRODUCT_CATEGORIES = {
  desktops: '4294967292',
  laptops: '4294967291',
  apple: '4294967167',
  processors: '4294966995',
  tvs: '4294966895',
};

// Deal types with their URL patterns
const DEAL_TYPES = {
  openbox: {
    name: 'Open Box',
    condition: 'open-box',
    // Uses &prt=clearance parameter
    buildUrl: (categoryCode, storeId) =>
      `https://www.microcenter.com/search/search_results.aspx?N=${categoryCode}&prt=clearance&storeid=${storeId}`,
  },
  closeout: {
    name: 'Closeout',
    condition: 'closeout',
    // Uses ,518 appended to category code
    buildUrl: (categoryCode, storeId) =>
      `https://www.microcenter.com/search/search_results.aspx?N=${categoryCode},518&storeid=${storeId}`,
  },
  refurbished: {
    name: 'Refurbished',
    condition: 'refurbished',
    // Uses ,519 appended to category code
    buildUrl: (categoryCode, storeId) =>
      `https://www.microcenter.com/search/search_results.aspx?N=${categoryCode},519&storeid=${storeId}`,
  },
};

// Legacy export for backward compatibility
const OPEN_BOX_CATEGORIES = Object.fromEntries(
  Object.entries(PRODUCT_CATEGORIES).map(([k, v]) => [k, `N=${v}`])
);

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Parse products from raw HTML using regex (more reliable than DOM parsing)
 * @param {string} html - Raw HTML from Micro Center search results
 * @returns {Array} - Array of parsed product objects
 */
function parseProductsFromHtml(html) {
  const products = [];

  // Find the product grid section first (it's an article element)
  const gridMatch = html.match(/<article[^>]*id="productGrid"[^>]*>([\s\S]*?)<\/article>/);
  if (!gridMatch) {
    console.log('No product grid found');
    return products;
  }

  const gridHtml = gridMatch[1];

  // Split by product_wrapper to get individual products
  // Match each li with id="pwrapper_N"
  const productBlocks = gridHtml.split(/<li[^>]*id="pwrapper_\d+"[^>]*class="product_wrapper"[^>]*>/);

  // Skip first empty element
  for (let i = 1; i < productBlocks.length; i++) {
    const productHtml = productBlocks[i];

    try {
      // Extract data-id (product ID) - get the first occurrence
      const dataIdMatch = productHtml.match(/data-id="(\d+)"/);
      const productId = dataIdMatch ? dataIdMatch[1] : null;

      if (!productId) continue;

      // Extract data-brand (from first occurrence)
      const brandMatch = productHtml.match(/data-brand="([^"]+)"/);
      const brand = brandMatch ? brandMatch[1] : '';

      // Extract data-name (short name from first occurrence)
      const nameMatch = productHtml.match(/data-name="([^"]+)"/);
      const shortName = nameMatch ? nameMatch[1] : '';

      // Extract full name from h2 link (includes specs)
      const fullNameMatch = productHtml.match(/<a[^>]*class="productClickItemV2[^"]*ProductLink[^"]*"[^>]*>([^<]+)</);
      const fullName = fullNameMatch ? fullNameMatch[1].trim() : shortName;

      // Extract SKU
      const skuMatch = productHtml.match(/SKU:\s*(\d+)/);
      const sku = skuMatch ? skuMatch[1] : null;

      // Extract image URL
      const imgMatch = productHtml.match(/src="(https:\/\/productimages\.microcenter\.com\/[^"]+)"/);
      const image = imgMatch ? imgMatch[1] : '';

      // Extract product URL (may or may not have ?ob=1 query param)
      const urlMatch = productHtml.match(/href="(\/product\/\d+\/[^"?]+[^"]*)"/);
      const productUrl = urlMatch ? `https://www.microcenter.com${urlMatch[1]}` : '';

      // Extract prices - multiple patterns for different deal types
      let originalPrice = 0;
      let currentPrice = 0;

      // Pattern 1: Open Box - has ObStrike (original) and "Open Box From" (current)
      const obStrikeMatch = productHtml.match(/<span class="ObStrike">([0-9,]+(?:\.\d{2})?)<\/span>/);
      const openBoxPriceMatch = productHtml.match(/Open Box From\s*<strong><span[^>]*>\$<\/span>([0-9,]+(?:\.\d{2})?)<\/strong>/);

      // Pattern 2: Closeout/Refurbished - has "original" price struck through and "our price"
      // Original: <span class="original">$1,299.99</span>
      // Current: <span itemprop="price" content="999.99">
      const origPriceMatch = productHtml.match(/<span class="original">\$([0-9,]+(?:\.\d{2})?)<\/span>/);
      const ourPriceMatch = productHtml.match(/itemprop="price"\s+content="([0-9.]+)"/);

      // Pattern 3: Simple price (no discount shown)
      // <span itemprop="price">$999.99</span> or data-price attribute
      const simplePriceMatch = productHtml.match(/data-price="([0-9.]+)"/);

      if (obStrikeMatch) {
        originalPrice = parseFloat(obStrikeMatch[1].replace(/,/g, ''));
      } else if (origPriceMatch) {
        originalPrice = parseFloat(origPriceMatch[1].replace(/,/g, ''));
      }

      if (openBoxPriceMatch) {
        currentPrice = parseFloat(openBoxPriceMatch[1].replace(/,/g, ''));
      } else if (ourPriceMatch) {
        currentPrice = parseFloat(ourPriceMatch[1]);
      } else if (simplePriceMatch) {
        currentPrice = parseFloat(simplePriceMatch[1]);
      }

      // If no original price found, use current price as original
      if (!originalPrice && currentPrice) {
        originalPrice = currentPrice;
      }
      // If no current price found, use original as current
      if (!currentPrice && originalPrice) {
        currentPrice = originalPrice;
      }

      // Extract stock info
      const stockMatch = productHtml.match(/<span class="inventoryCnt">(\d+)/);
      const stockCount = stockMatch ? parseInt(stockMatch[1], 10) : 0;

      // Extract store name
      const storeMatch = productHtml.match(/<span class="storeName">\s*at\s+([^<]+)/);
      const storeName = storeMatch ? storeMatch[1].trim() : '';

      // Only add if we have essential data
      if (productId && (shortName || fullName)) {
        products.push({
          id: productId,
          sku,
          brand,
          name: fullName || shortName,
          shortName,
          originalPrice,
          currentPrice,
          image,
          url: productUrl,
          stockCount,
          storeName,
        });
      }
    } catch (e) {
      console.error('Error parsing product:', e.message);
    }
  }

  return products;
}

/**
 * Fetch a single page of products with error handling
 * @param {Object} page - Playwright page instance
 * @param {string} url - URL to fetch
 * @param {string} dealType - Type of deal (openbox, closeout, refurbished)
 * @param {string} category - Product category name
 * @returns {Promise<Array>} - Array of parsed products with dealType attached
 */
async function fetchPage(page, url, dealType, category) {
  try {
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: PAGE_TIMEOUT,
    });

    // Wait for content to load
    await page.waitForTimeout(WAIT_TIMEOUT);

    // Get product count - don't fail if element not found
    let productCountText = '0';
    try {
      productCountText = await page.textContent('.productSearchCount', { timeout: WAIT_TIMEOUT });
    } catch {
      // Element not found or timed out - page may have no results
    }

    const productCount = parseInt(productCountText, 10) || 0;
    if (productCount === 0) {
      return [];
    }

    // Get HTML and parse products
    const html = await page.content();
    const products = parseProductsFromHtml(html);

    // Attach metadata to each product
    return products.map(p => ({
      ...p,
      category,
      dealType,
    }));
  } catch (error) {
    // Log error but don't crash - return empty array
    const errorType = error.name === 'TimeoutError' ? 'Timeout' : 'Error';
    console.error(`    ${errorType} fetching ${dealType}/${category}: ${error.message}`);
    return [];
  }
}

/**
 * Fetch deals from Micro Center using Playwright
 * Scrapes open-box, closeout, and refurbished items
 *
 * @param {Object} options - Fetch options
 * @param {boolean} options.forceRefresh - Force refresh cache
 * @param {string} options.storeId - Specific store ID to search (default: '101' Tustin)
 * @param {Array<string>} options.categories - Product categories to search (default: all)
 * @param {Array<string>} options.dealTypes - Deal types to search (default: all)
 * @returns {Promise<Array>} - Array of normalized deals
 */
async function fetchDeals(options = {}) {
  const {
    forceRefresh = false,
    storeId = '101',
    categories = Object.keys(PRODUCT_CATEGORIES),
    dealTypes = Object.keys(DEAL_TYPES),
  } = options;

  // Check cache first
  if (!forceRefresh) {
    const cached = cache.read(SOURCE);
    if (cached && !cached.expired) {
      console.log(`Using cached Micro Center data (${Math.round(cached.age / 1000 / 60)}m old)`);
      return cached.deals;
    }
  }

  console.log('Fetching fresh Micro Center deals...');
  console.log(`  Store: ${storeId}, Categories: ${categories.join(', ')}`);
  console.log(`  Deal types: ${dealTypes.join(', ')}`);

  let browser = null;
  const allProducts = [];

  try {
    // Launch browser with error handling
    browser = await firefox.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
      viewport: { width: 1280, height: 900 },
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    const page = await context.newPage();

    // Iterate through each deal type and category
    for (const dealTypeKey of dealTypes) {
      const dealTypeConfig = DEAL_TYPES[dealTypeKey];
      if (!dealTypeConfig) {
        console.warn(`  Unknown deal type: ${dealTypeKey}, skipping`);
        continue;
      }

      console.log(`  Fetching ${dealTypeConfig.name} deals...`);

      for (const category of categories) {
        const categoryCode = PRODUCT_CATEGORIES[category];
        if (!categoryCode) {
          console.warn(`    Unknown category: ${category}, skipping`);
          continue;
        }

        const url = dealTypeConfig.buildUrl(categoryCode, storeId);
        console.log(`    ${category}...`);

        const products = await fetchPage(page, url, dealTypeKey, category);

        if (products.length > 0) {
          console.log(`      Found ${products.length} products`);
          allProducts.push(...products);
        }

        // Rate limiting between requests
        await delay(RATE_LIMIT_DELAY);
      }
    }
  } catch (error) {
    // Log top-level errors (browser launch failure, etc.)
    console.error(`Micro Center scraping failed: ${error.message}`);
    // Don't throw - return whatever we have (possibly empty)
  } finally {
    // Always close browser if it was opened
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error(`Error closing browser: ${closeError.message}`);
      }
    }
  }

  // Normalize products to deals
  const deals = allProducts.map(product => {
    const dealTypeConfig = DEAL_TYPES[product.dealType] || DEAL_TYPES.openbox;

    return createDeal({
      id: `mc-${product.dealType}-${product.id}`,
      source: SOURCE,
      name: product.name,
      brand: product.brand,
      originalPrice: product.originalPrice,
      currentPrice: product.currentPrice,
      condition: dealTypeConfig.condition,
      availability: product.stockCount > 0 ? 'in-store' : 'unknown',
      url: product.url,
      image: product.image,
      sku: product.sku,
    });
  });

  // Summary logging
  const byType = {};
  allProducts.forEach(p => {
    byType[p.dealType] = (byType[p.dealType] || 0) + 1;
  });
  console.log(`Fetched ${deals.length} Micro Center deals total:`);
  Object.entries(byType).forEach(([type, count]) => {
    console.log(`  - ${DEAL_TYPES[type]?.name || type}: ${count}`);
  });

  // Cache results (even if partial due to errors)
  if (deals.length > 0) {
    cache.write(SOURCE, deals);
  }

  return deals;
}

module.exports = {
  SOURCE,
  STORES,
  PRODUCT_CATEGORIES,
  DEAL_TYPES,
  OPEN_BOX_CATEGORIES, // Legacy export for backward compatibility
  fetchDeals,
  parseProductsFromHtml,
};
