/**
 * Micro Center Open Box and Clearance adapter
 */

const { firefox } = require('playwright');
const { createDeal } = require('../lib/normalize');
const cache = require('../lib/cache');

const SOURCE = 'microcenter';

// Micro Center store locations
const STORES = [
  { id: '101', name: 'Tustin', state: 'CA', zip: '92780' },
  { id: '181', name: 'Denver', state: 'CO', zip: '80231' },
  { id: '195', name: 'Santa Clara', state: 'CA', zip: '95050' },
  { id: '131', name: 'Dallas', state: 'TX', zip: '75240' },
  { id: '155', name: 'Houston', state: 'TX', zip: '77025' },
  // Add more as needed
];

// Open-box category URLs (N= codes from Micro Center's site)
const OPEN_BOX_CATEGORIES = {
  desktops: 'N=4294967292',
  laptops: 'N=4294967291',
  apple: 'N=4294967167',
  processors: 'N=4294966995',
  tvs: 'N=4294966895',
};

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

      // Extract product URL
      const urlMatch = productHtml.match(/href="(\/product\/\d+\/[^"]+\?ob=1)"/);
      const productUrl = urlMatch ? `https://www.microcenter.com${urlMatch[1]}` : '';

      // Extract original price (ObStrike class - the struck-through "New" price)
      const originalPriceMatch = productHtml.match(/<span class="ObStrike">([0-9,]+(?:\.\d{2})?)<\/span>/);
      const originalPrice = originalPriceMatch
        ? parseFloat(originalPriceMatch[1].replace(/,/g, ''))
        : 0;

      // Extract open-box price (the discounted price after "Open Box From")
      // Pattern: Open Box From <strong><span class="upperOB">$</span>424.96</strong>
      const openBoxPriceMatch = productHtml.match(/Open Box From\s*<strong><span[^>]*>\$<\/span>([0-9,]+(?:\.\d{2})?)<\/strong>/);
      const currentPrice = openBoxPriceMatch
        ? parseFloat(openBoxPriceMatch[1].replace(/,/g, ''))
        : originalPrice;

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
 * Fetch open-box deals from Micro Center using Playwright
 * @param {Object} options - Fetch options
 * @param {boolean} options.forceRefresh - Force refresh cache
 * @param {string} options.storeId - Specific store ID to search (default: '101' Tustin)
 * @param {Array<string>} options.categories - Categories to search (default: all)
 * @returns {Promise<Array>} - Array of normalized deals
 */
async function fetchDeals(options = {}) {
  const {
    forceRefresh = false,
    storeId = '101',
    categories = Object.keys(OPEN_BOX_CATEGORIES)
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

  const browser = await firefox.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
    viewport: { width: 1280, height: 900 },
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const page = await context.newPage();
  const allProducts = [];

  try {
    for (const category of categories) {
      const categoryCode = OPEN_BOX_CATEGORIES[category];
      if (!categoryCode) continue;

      const url = `https://www.microcenter.com/search/search_results.aspx?${categoryCode}&prt=clearance&storeid=${storeId}`;
      console.log(`  Fetching ${category}...`);

      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(3000);

        // Get product count
        const productCount = await page.textContent('.productSearchCount').catch(() => '0');
        console.log(`    Found ${productCount} products`);

        if (productCount === '0') continue;

        // Get HTML and parse products
        const html = await page.content();
        const products = parseProductsFromHtml(html);

        // Add category to each product
        products.forEach(p => {
          p.category = category;
          allProducts.push(p);
        });

        console.log(`    Parsed ${products.length} products`);

        // Rate limiting
        await delay(1000);
      } catch (e) {
        console.error(`    Error fetching ${category}:`, e.message);
      }
    }
  } finally {
    await browser.close();
  }

  // Normalize products to deals
  const deals = allProducts.map(product => createDeal({
    id: `mc-${product.id}`,
    source: SOURCE,
    name: product.name,
    brand: product.brand,
    originalPrice: product.originalPrice,
    currentPrice: product.currentPrice,
    condition: 'open-box',
    availability: product.stockCount > 0 ? 'in-store' : 'unknown',
    url: product.url,
    image: product.image,
    sku: product.sku,
  }));

  console.log(`Fetched ${deals.length} Micro Center deals total`);
  cache.write(SOURCE, deals);
  return deals;
}

module.exports = {
  SOURCE,
  STORES,
  OPEN_BOX_CATEGORIES,
  fetchDeals,
  parseProductsFromHtml,
};
