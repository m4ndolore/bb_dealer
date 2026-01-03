/**
 * Best Buy Open Box and Clearance API adapter
 */

const https = require('https');
const { createDeal } = require('../lib/normalize');
const { detectCategory } = require('../lib/categories');
const cache = require('../lib/cache');

const SOURCE = 'bestbuy';

// Best Buy category IDs for Open Box API
const CATEGORY_IDS = {
  laptops: 'pcmcat247400050001',      // Laptops
  tablets: 'pcmcat209000050006',       // iPads & Tablets
  storage: 'pcmcat212600050008',       // Hard Drives & Storage
  desktops: 'abcat0501000',            // Desktop Computers
};

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
        } else if (res.statusCode === 403) {
          reject(new Error('403 Forbidden - possibly rate limited'));
        } else if (res.statusCode === 429) {
          reject(new Error('Rate limited - too many requests'));
        } else {
          reject(new Error(`API returned ${res.statusCode}`));
        }
      });
    }).on('error', reject);
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchCategoryOffers(apiKey, categoryId, categoryName) {
  const baseUrl = `https://api.bestbuy.com/beta/products/openBox(categoryId=${categoryId})?apiKey=${apiKey}&pageSize=100`;

  let allOffers = [];
  let page = 1;
  let hasMore = true;
  let retryCount = 0;
  const MAX_RETRIES = 3;

  console.log(`  Fetching ${categoryName}...`);

  while (hasMore) {
    try {
      const url = `${baseUrl}&page=${page}`;
      const data = await fetch(url);

      // Reset retry count on success
      retryCount = 0;

      if (data.results && data.results.length > 0) {
        const totalPages = data.metadata?.page?.total || 1;
        console.log(`    Page ${page}/${totalPages}: ${data.results.length} products`);
        allOffers = allOffers.concat(data.results);

        if (page >= totalPages) {
          hasMore = false;
        } else {
          page++;
          await delay(1000);
        }
      } else {
        hasMore = false;
      }
    } catch (e) {
      console.log(`    Page ${page} failed: ${e.message}`);
      if (e.message.includes('403') && retryCount < MAX_RETRIES) {
        retryCount++;
        console.log(`    Rate limited, waiting 3s... (retry ${retryCount}/${MAX_RETRIES})`);
        await delay(3000);
        continue;
      }
      hasMore = false;
    }
  }

  return allOffers;
}

// Search-based query for better brand coverage (category filter misses non-Apple)
async function fetchDealsBySearch(apiKey, searchTerm, dealType) {
  // dealType: 'clearance', 'onSale', or 'both'
  let filter = '';
  if (dealType === 'clearance') filter = '&clearance=true';
  else if (dealType === 'onSale') filter = '&onSale=true';
  else if (dealType === 'both') filter = '&(clearance=true|onSale=true)';

  const baseUrl = `https://api.bestbuy.com/v1/products(search=${encodeURIComponent(searchTerm)}${filter})?apiKey=${apiKey}&format=json&pageSize=100&show=sku,name,regularPrice,salePrice,onlineAvailability,inStoreAvailability,manufacturer,image,categoryPath,percentSavings`;

  let allProducts = [];
  let page = 1;
  let hasMore = true;
  let retryCount = 0;
  const MAX_RETRIES = 3;

  console.log(`  Fetching "${searchTerm}" ${dealType}...`);

  while (hasMore && page <= 10) { // Cap at 10 pages
    try {
      const url = `${baseUrl}&page=${page}`;
      const data = await fetch(url);
      retryCount = 0;

      if (data.products && data.products.length > 0) {
        const totalPages = Math.min(data.totalPages || 1, 10);
        console.log(`    Page ${page}/${totalPages}: ${data.products.length} items`);
        allProducts = allProducts.concat(data.products);

        if (page >= totalPages) {
          hasMore = false;
        } else {
          page++;
          await delay(1000);
        }
      } else {
        hasMore = false;
      }
    } catch (e) {
      console.log(`    Page ${page} failed: ${e.message}`);
      if (e.message.includes('403') && retryCount < MAX_RETRIES) {
        retryCount++;
        await delay(3000);
        continue;
      }
      hasMore = false;
    }
  }

  return allProducts;
}

async function fetchClearanceProducts(apiKey, categoryId, categoryName) {
  const baseUrl = `https://api.bestbuy.com/v1/products(categoryPath.id=${categoryId}&clearance=true)?apiKey=${apiKey}&format=json&pageSize=100&show=sku,name,regularPrice,salePrice,onlineAvailability,inStoreAvailability,manufacturer,image,categoryPath`;

  let allProducts = [];
  let page = 1;
  let hasMore = true;
  let retryCount = 0;
  const MAX_RETRIES = 3;

  console.log(`  Fetching ${categoryName} clearance...`);

  while (hasMore) {
    try {
      const url = `${baseUrl}&page=${page}`;
      const data = await fetch(url);

      retryCount = 0;

      if (data.products && data.products.length > 0) {
        const totalPages = data.totalPages || 1;
        console.log(`    Page ${page}/${totalPages}: ${data.products.length} clearance items`);
        allProducts = allProducts.concat(data.products);

        if (page >= totalPages) {
          hasMore = false;
        } else {
          page++;
          await delay(1000);
        }
      } else {
        hasMore = false;
      }
    } catch (e) {
      console.log(`    Page ${page} failed: ${e.message}`);
      if (e.message.includes('403') && retryCount < MAX_RETRIES) {
        retryCount++;
        console.log(`    Rate limited, waiting 3s... (retry ${retryCount}/${MAX_RETRIES})`);
        await delay(3000);
        continue;
      }
      hasMore = false;
    }
  }

  return allProducts;
}

function normalizeClearanceProduct(product) {
  const title = product.name || '';
  const text = title;

  const processor = parseProcessor(text);
  const ramMatch = text.match(/(\d+)\s*GB\s*(Memory|RAM|Unified)/i);
  const ram = ramMatch ? parseInt(ramMatch[1], 10) : null;
  const storageMatch = text.match(/(\d+(?:TB|GB))\s*SSD/i);
  const storage = storageMatch ? storageMatch[1] : null;
  const sizeMatch = title.match(/(\d{2}(?:\.\d)?)["-]/);
  const screenSize = sizeMatch ? sizeMatch[1] + '"' : null;

  const modelType = parseModelType(title);

  const originalPrice = product.regularPrice || 0;
  const currentPrice = product.salePrice || product.regularPrice || 0;

  const online = product.onlineAvailability ?? false;
  const inStore = product.inStoreAvailability ?? false;
  let availability = 'online';
  if (online && inStore) availability = 'both';
  else if (inStore && !online) availability = 'in-store';

  const productUrl = `https://www.bestbuy.com/site/${product.sku}.p?skuId=${product.sku}`;

  return createDeal({
    id: `bestbuy-clearance-${product.sku}`,
    source: SOURCE,
    category: detectCategory(text),
    name: title || `SKU ${product.sku}`,
    brand: product.manufacturer || parseBrand(title) || '',
    originalPrice,
    currentPrice,
    condition: 'Clearance',
    availability,
    url: productUrl,
    image: product.image || '',
    sku: product.sku,
    processor,
    modelType,
    screenSize,
    ram,
    storage
  });
}

function parseModelType(title) {
  // Apple models
  if (/MacBook Air/i.test(title)) return 'MacBook Air';
  if (/MacBook Pro/i.test(title)) return 'MacBook Pro';
  if (/Mac Mini/i.test(title)) return 'Mac Mini';
  if (/Mac Studio/i.test(title)) return 'Mac Studio';
  if (/iPad Pro/i.test(title)) return 'iPad Pro';
  if (/iPad Air/i.test(title)) return 'iPad Air';
  if (/\biPad\b/i.test(title)) return 'iPad';
  // HP models
  if (/OmniBook/i.test(title)) return 'OmniBook';
  if (/Spectre/i.test(title)) return 'Spectre';
  if (/Envy/i.test(title)) return 'Envy';
  if (/Pavilion/i.test(title)) return 'Pavilion';
  if (/Omen/i.test(title)) return 'Omen';
  // Dell models
  if (/\bXPS\b/i.test(title)) return 'XPS';
  if (/Inspiron/i.test(title)) return 'Inspiron';
  if (/Latitude/i.test(title)) return 'Latitude';
  if (/Alienware/i.test(title)) return 'Alienware';
  // Lenovo models
  if (/ThinkPad/i.test(title)) return 'ThinkPad';
  if (/IdeaPad/i.test(title)) return 'IdeaPad';
  if (/\bYoga\b/i.test(title)) return 'Yoga';
  if (/Legion/i.test(title)) return 'Legion';
  // ASUS models
  if (/ZenBook/i.test(title)) return 'ZenBook';
  if (/VivoBook/i.test(title)) return 'VivoBook';
  if (/\bROG\b/i.test(title)) return 'ROG';
  if (/\bTUF\b/i.test(title)) return 'TUF';
  // Microsoft
  if (/Surface Pro/i.test(title)) return 'Surface Pro';
  if (/Surface Laptop/i.test(title)) return 'Surface Laptop';
  if (/Surface Book/i.test(title)) return 'Surface Book';
  // Other
  if (/Chromebook/i.test(title)) return 'Chromebook';
  if (/Galaxy Book/i.test(title)) return 'Galaxy Book';
  if (/\bGram\b/i.test(title)) return 'Gram';
  if (/Razer Blade/i.test(title)) return 'Razer Blade';
  if (/Galaxy Tab/i.test(title)) return 'Galaxy Tab';
  return null;
}

function parseBrand(text) {
  // Product names often start with "Brand - Product Name..."
  const dashMatch = text.match(/^([A-Za-z]+(?:\s+[A-Za-z]+)?)\s*-\s*/);
  if (dashMatch) {
    const brand = dashMatch[1].trim();
    // Common brand names
    const knownBrands = ['Apple', 'HP', 'Dell', 'Lenovo', 'ASUS', 'Acer', 'Microsoft', 'Samsung', 'LG', 'Razer', 'MSI', 'Alienware', 'Google'];
    for (const known of knownBrands) {
      if (brand.toLowerCase() === known.toLowerCase()) {
        return known;
      }
    }
    return brand;
  }
  return null;
}

function parseProcessor(text) {
  if (/M5\s*Max/i.test(text)) return 'M5 Max';
  if (/M5\s*Pro/i.test(text)) return 'M5 Pro';
  if (/\bM5\b/i.test(text)) return 'M5';
  if (/M4\s*Max/i.test(text)) return 'M4 Max';
  if (/M4\s*Pro/i.test(text)) return 'M4 Pro';
  if (/\bM4\b/i.test(text)) return 'M4';
  if (/M3\s*Max/i.test(text)) return 'M3 Max';
  if (/M3\s*Pro/i.test(text)) return 'M3 Pro';
  if (/\bM3\b/i.test(text)) return 'M3';
  if (/M2\s*Max/i.test(text)) return 'M2 Max';
  if (/M2\s*Pro/i.test(text)) return 'M2 Pro';
  if (/\bM2\b/i.test(text)) return 'M2';
  if (/M1\s*Max/i.test(text)) return 'M1 Max';
  if (/M1\s*Pro/i.test(text)) return 'M1 Pro';
  if (/\bM1\b/i.test(text)) return 'M1';
  return null;
}

function normalizeOffer(product, offer = null) {
  const text = [
    product.names?.title,
    product.names?.short,
    product.descriptions?.short,
    product.name,
  ].filter(Boolean).join(' ');

  const title = product.names?.title || product.name || '';

  // Parse specs
  const processor = parseProcessor(text);
  const ramMatch = text.match(/(\d+)\s*GB\s*(Memory|RAM|Unified)/i);
  const ram = ramMatch ? parseInt(ramMatch[1], 10) : null;
  const storageMatch = text.match(/(\d+(?:TB|GB))\s*SSD/i);
  const storage = storageMatch ? storageMatch[1] : null;
  const sizeMatch = title.match(/(\d{2}(?:\.\d)?)["-]/);
  const screenSize = sizeMatch ? sizeMatch[1] + '"' : null;

  const modelType = parseModelType(title);

  // Pricing
  const originalPrice = offer?.prices?.regular || product.prices?.regular || 0;
  const currentPrice = offer?.prices?.current || product.prices?.current || 0;

  // Condition
  let condition = 'open-box';
  const cond = (offer?.condition || '').toLowerCase();
  if (cond === 'excellent' || cond === 'certified') condition = 'Open-Box Excellent';
  else if (cond === 'good') condition = 'Open-Box Good';
  else if (cond === 'satisfactory') condition = 'Open-Box Satisfactory';
  else if (cond === 'fair') condition = 'Open-Box Fair';

  // Availability
  const online = offer?.onlineAvailability ?? product.onlineAvailability ?? false;
  const inStore = offer?.inStoreAvailability ?? product.inStoreAvailability ?? false;
  let availability = 'online';
  if (online && inStore) availability = 'both';
  else if (inStore && !online) availability = 'in-store';

  const productUrl = `https://www.bestbuy.com/site/${product.sku}.p?skuId=${product.sku}#tab=buyingOptions`;

  return createDeal({
    id: `bestbuy-${product.sku}-${offer?.listingId || 'base'}`,
    source: SOURCE,
    category: detectCategory(text),
    name: title || `SKU ${product.sku}`,
    brand: product.manufacturer || parseBrand(title) || '',
    originalPrice,
    currentPrice,
    condition,
    availability,
    url: productUrl,
    image: product.images?.standard || '',
    sku: product.sku,
    listingId: offer?.listingId,
    processor,
    modelType,
    screenSize,
    ram,
    storage
  });
}

async function fetchDeals(apiKey, options = {}) {
  const { categories = Object.keys(CATEGORY_IDS), forceRefresh = false } = options;

  // Check cache first
  if (!forceRefresh) {
    const cached = cache.read(SOURCE);
    if (cached && !cached.expired) {
      console.log(`Using cached Best Buy data (${Math.round(cached.age / 1000 / 60)}m old)`);
      return cached.deals;
    }
  }

  console.log('Fetching fresh Best Buy Open Box and Clearance data...');

  // Validate API key
  try {
    const testUrl = `https://api.bestbuy.com/v1/products(sku=6593548)?apiKey=${apiKey}&format=json&show=sku`;
    await fetch(testUrl);
    console.log('API key valid ✓');
  } catch (e) {
    throw new Error('Invalid API key. Get a free key at https://developer.bestbuy.com/');
  }

  let allDeals = [];

  // Fetch Open Box items
  console.log('Fetching Open Box items...');
  for (const categoryKey of categories) {
    const categoryId = CATEGORY_IDS[categoryKey];
    if (!categoryId) continue;

    const offers = await fetchCategoryOffers(apiKey, categoryId, categoryKey);

    for (const product of offers) {
      const productOffers = product.offers || [];

      if (productOffers.length === 0) {
        allDeals.push(normalizeOffer(product));
      } else {
        for (const offer of productOffers) {
          allDeals.push(normalizeOffer(product, offer));
        }
      }
    }

    await delay(2000);
  }

  // Fetch Clearance items (category-based - mostly Apple)
  console.log('Fetching Clearance items...');
  for (const categoryKey of categories) {
    const categoryId = CATEGORY_IDS[categoryKey];
    if (!categoryId) continue;

    const clearanceProducts = await fetchClearanceProducts(apiKey, categoryId, categoryKey);

    for (const product of clearanceProducts) {
      allDeals.push(normalizeClearanceProduct(product));
    }

    await delay(2000);
  }

  // Fetch deals via search (better brand coverage - HP, Dell, Lenovo, etc.)
  console.log('Fetching deals by search (multi-brand coverage)...');
  const searchTerms = ['laptop', 'notebook', 'chromebook'];
  const seenSkus = new Set(allDeals.map(d => d.sku));

  for (const term of searchTerms) {
    try {
      const searchProducts = await fetchDealsBySearch(apiKey, term, 'clearance');

      for (const product of searchProducts) {
        // Skip if we already have this SKU from category-based fetch
        if (seenSkus.has(String(product.sku))) continue;
        seenSkus.add(String(product.sku));

        // Only include if it has a meaningful discount
        const savings = product.percentSavings || 0;
        if (savings >= 5) {
          allDeals.push(normalizeClearanceProduct(product));
        }
      }

      await delay(2000);
    } catch (e) {
      console.log(`  Search for "${term}" failed: ${e.message}`);
    }
  }

  console.log(`Total Best Buy deals: ${allDeals.length} (Open Box + Clearance + Search)`);

  // Cache results
  cache.write(SOURCE, allDeals);

  return allDeals;
}

module.exports = {
  SOURCE,
  CATEGORY_IDS,
  fetchDeals
};
