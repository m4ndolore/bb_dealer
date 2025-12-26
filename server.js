#!/usr/bin/env node

/**
 * Best Buy M4/M5 MacBook Inventory Search
 * 
 * Usage:
 *   1. npm install (first time only)
 *   2. node server.js
 *   3. Open http://localhost:3000 in your browser
 * 
 * Set your API key via environment variable or enter in the UI:
 *   BESTBUY_API_KEY=your_key node server.js
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
let API_KEY = process.env.BESTBUY_API_KEY || '';

// Simple HTTPS fetch helper
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
          reject(new Error(`403 Forbidden - possibly rate limited`));
        } else if (res.statusCode === 429) {
          reject(new Error('Rate limited - too many requests'));
        } else {
          reject(new Error(`API returned ${res.statusCode}: ${data.slice(0, 100)}`));
        }
      });
    }).on('error', reject);
  });
}

// Delay helper
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Fetch and process Best Buy inventory
async function fetchInventory(apiKey) {
  // First, validate the API key with a simple test query
  console.log('Validating API key...');
  try {
    const testUrl = `https://api.bestbuy.com/v1/products(sku=6593548)?apiKey=${apiKey}&format=json&show=sku`;
    await fetch(testUrl);
    console.log('API key valid ✓');
  } catch (e) {
    throw new Error('Invalid API key. Get a free key at https://developer.bestbuy.com/');
  }

  // Best Buy has a separate Open Box API at /beta/products/openBox
  // Query by category ID for MacBooks
  const openBoxUrl = `https://api.bestbuy.com/beta/products/openBox(categoryId=pcmcat247400050001)?apiKey=${apiKey}&pageSize=100`;
  
  console.log('Fetching Open Box inventory...');
  
  let allOffers = [];
  let page = 1;
  let hasMore = true;
  
  while (hasMore) {
    try {
      const url = `${openBoxUrl}&page=${page}`;
      const data = await fetch(url);
      
      if (data.results && data.results.length > 0) {
        // metadata.page.total is the total number of pages
        const totalPages = data.metadata?.page?.total || 1;
        const totalCount = data.metadata?.resultSet?.count || 'unknown';
        console.log(`  Page ${page}/${totalPages}: ${data.results.length} products (${totalCount} total available)`);
        allOffers = allOffers.concat(data.results);
        
        // Check if there are more pages
        if (page >= totalPages) {
          hasMore = false;
        } else {
          page++;
          await delay(1000); // 1 second between pages to avoid rate limiting
        }
      } else {
        hasMore = false;
      }
    } catch (e) {
      console.log(`  Page ${page} failed: ${e.message}`);
      if (e.message.includes('403')) {
        // Rate limited - wait and retry once
        console.log('  Rate limited, waiting 3s...');
        await delay(3000);
        continue; // Retry same page
      }
      hasMore = false;
    }
  }
  
  console.log(`Total Open Box offers fetched: ${allOffers.length}`);

  // Filter for M4/M5 processors - check multiple fields
  const m4m5Pattern = /\bM[45]\b/i; // Simpler pattern to catch M4, M5, M4 Pro, etc.
  const filtered = allOffers.filter(offer => {
    // Build search text from all possible name/description fields
    const text = [
      offer.names?.title,
      offer.names?.short,
      offer.descriptions?.short,
      offer.name, // Some APIs use simple 'name' field
    ].filter(Boolean).join(' ');
    const matches = m4m5Pattern.test(text);
    return matches;
  });

  console.log(`After M4/M5 filter: ${filtered.length} products`);
  
  // Log sample if we got results
  if (filtered.length > 0) {
    console.log('\nSample Open Box offer:', JSON.stringify(filtered[0], null, 2));
  } else if (allOffers.length > 0) {
    console.log('\nSample unfiltered offer:', JSON.stringify(allOffers[0], null, 2));
  }

  // Expand each product's offers into individual items
  // (one product may have fair, good, and excellent offers at different prices)
  const expandedOffers = [];
  
  for (const product of filtered) {
    const text = [
      product.names?.title,
      product.names?.short,
      product.descriptions?.short,
      product.name,
    ].filter(Boolean).join(' ');
    
    const title = product.names?.title || product.name || '';
    
    let processor = 'Unknown';
    if (/M5\s*Max/i.test(text)) processor = 'M5 Max';
    else if (/M5\s*Pro/i.test(text)) processor = 'M5 Pro';
    else if (/\bM5\b/i.test(text)) processor = 'M5';
    else if (/M4\s*Max/i.test(text)) processor = 'M4 Max';
    else if (/M4\s*Pro/i.test(text)) processor = 'M4 Pro';
    else if (/\bM4\b/i.test(text)) processor = 'M4';

    let modelType = 'MacBook';
    if (/Air/i.test(title)) modelType = 'MacBook Air';
    else if (/Pro/i.test(title)) modelType = 'MacBook Pro';

    const sizeMatch = title.match(/(\d{2}(?:\.\d)?)["-]/);
    const screenSize = sizeMatch ? sizeMatch[1] + '"' : '';

    // Parse RAM - look for patterns like "16GB Memory", "24GB RAM", "32 GB"
    let ram = 0;
    const ramMatch = text.match(/(\d+)\s*GB\s*(Memory|RAM|Unified)/i);
    if (ramMatch) {
      ram = parseInt(ramMatch[1], 10);
    }

    // Parse storage
    let storage = '';
    const storageMatch = text.match(/(\d+(?:TB|GB))\s*SSD/i);
    if (storageMatch) {
      storage = storageMatch[1];
    }

    // Build the product URL - direct link to buying options tab
    const productUrl = `https://www.bestbuy.com/site/${product.sku}.p?skuId=${product.sku}#tab=buyingOptions`;

    // Get individual offers (each condition: fair, good, excellent)
    const offers = product.offers || [];
    
    if (offers.length === 0) {
      // No individual offers, use product-level pricing
      const originalPrice = product.prices?.regular || product.prices?.current || 0;
      const currentPrice = product.prices?.current || 0;
      const discount = originalPrice > 0 
        ? Math.round(((originalPrice - currentPrice) / originalPrice) * 100)
        : 0;

      expandedOffers.push({
        sku: product.sku,
        name: title || `SKU ${product.sku}`,
        url: productUrl,
        image: product.images?.standard || '',
        processor,
        modelType,
        screenSize,
        ram,
        storage,
        condition: 'Open-Box',
        originalPrice,
        currentPrice,
        discount,
        savings: originalPrice - currentPrice,
        inStore: true,
        online: true,
      });
    } else {
      // Create a row for each offer/condition
      for (const offer of offers) {
        const originalPrice = offer.prices?.regular || product.prices?.regular || 0;
        const currentPrice = offer.prices?.current || 0;
        const discount = originalPrice > 0 
          ? Math.round(((originalPrice - currentPrice) / originalPrice) * 100)
          : 0;

        // Map condition
        let condition = 'Open-Box';
        const cond = (offer.condition || '').toLowerCase();
        if (cond === 'excellent' || cond === 'certified') condition = 'Open-Box Excellent';
        else if (cond === 'good') condition = 'Open-Box Good';
        else if (cond === 'satisfactory') condition = 'Open-Box Satisfactory';
        else if (cond === 'fair') condition = 'Open-Box Fair';

        // Build offer-specific URL - all go to buying options tab
        // (Best Buy will show available conditions based on user's location)
        const offerUrl = productUrl;

        expandedOffers.push({
          sku: product.sku,
          listingId: offer.listingId,
          name: title || `SKU ${product.sku}`,
          url: offerUrl,
          image: product.images?.standard || '',
          processor,
          modelType,
          screenSize,
          ram,
          storage,
          condition,
          originalPrice,
          currentPrice,
          discount,
          savings: originalPrice - currentPrice,
          inStore: offer.inStoreAvailability || false,
          online: offer.onlineAvailability || false,
        });
      }
    }
  }

  console.log(`Expanded to ${expandedOffers.length} individual offers`);
  return expandedOffers;
}

// HTML template
const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Best Buy M4/M5 MacBook Finder</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background: #111827; }
    .line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  </style>
</head>
<body class="min-h-screen text-gray-100 p-4 md:p-6">
  <div class="max-w-6xl mx-auto" id="app">
    <div class="text-center py-12">
      <div class="text-4xl mb-4 animate-pulse">🔍</div>
      <p class="text-gray-400">Loading...</p>
    </div>
  </div>

  <script>
    let products = [];
    let sortField = 'discount';
    let sortDir = 'desc';
    let processorFilter = 'all';
    let conditionFilter = 'all';
    let modelFilter = 'all';
    let minRamFilter = 0;
    let availabilityFilter = 'all'; // 'all', 'ships', 'instore'
    let postalCode = localStorage.getItem('bb-postal-code') || '';
    let storeModal = null; // {sku, stores, loading, error}

    async function loadProducts() {
      try {
        const res = await fetch('/api/products');
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        products = data.products;
        render();
      } catch (e) {
        document.getElementById('app').innerHTML = \`
          <div class="bg-red-900/50 border border-red-700 rounded-xl p-6 text-center">
            <p class="text-red-200 text-lg">\${e.message}</p>
            <p class="text-gray-400 mt-2">Check your API key and restart the server.</p>
          </div>
        \`;
      }
    }

    function savePostalCode(code) {
      postalCode = code;
      localStorage.setItem('bb-postal-code', code);
      render();
    }

    // Map our condition names to BB's condition codes
    function getConditionCode(condition) {
      // Based on observation: "0" = fair from the URL pattern
      // Need to test others, but likely: 0=fair, 1=satisfactory, 2=good, 3=excellent
      if (condition.includes('Fair')) return '0';
      if (condition.includes('Satisfactory')) return '1';
      if (condition.includes('Good')) return '2';
      if (condition.includes('Excellent')) return '3';
      return '0'; // Default to fair
    }

    async function findStores(sku, condition = 'Open-Box Fair') {
      if (!postalCode || postalCode.length < 5) {
        alert('Please enter your zip code first');
        return;
      }
      
      const conditionCode = getConditionCode(condition);
      storeModal = { sku, condition, stores: [], loading: true, error: null };
      render();
      
      try {
        const params = new URLSearchParams({
          zipCode: postalCode,
          condition: conditionCode
        });
        
        const res = await fetch(\`/api/openbox-stores/\${sku}?\${params}\`);
        const data = await res.json();
        
        if (data.error) throw new Error(data.error);
        
        storeModal = { 
          sku,
          condition,
          stores: data.stores || [], 
          loading: false, 
          error: null,
          buttonState: data.buttonState,
          product: products.find(p => p.sku === sku)
        };
      } catch (e) {
        storeModal = { sku, condition, stores: [], loading: false, error: e.message };
      }
      render();
    }

    function closeModal() {
      storeModal = null;
      render();
    }

    function getFiltered() {
      return products
        .filter(p => processorFilter === 'all' || p.processor === processorFilter)
        .filter(p => conditionFilter === 'all' || p.condition === conditionFilter)
        .filter(p => modelFilter === 'all' || p.modelType === modelFilter)
        .filter(p => minRamFilter === 0 || p.ram >= minRamFilter)
        .filter(p => {
          if (availabilityFilter === 'all') return true;
          if (availabilityFilter === 'ships') return p.online === true;
          if (availabilityFilter === 'instore') return p.online === false;
          return true;
        })
        .sort((a, b) => {
          let aVal, bVal;
          switch (sortField) {
            case 'discount': aVal = a.discount; bVal = b.discount; break;
            case 'currentPrice': aVal = a.currentPrice; bVal = b.currentPrice; break;
            case 'savings': aVal = a.savings; bVal = b.savings; break;
            case 'ram': aVal = a.ram; bVal = b.ram; break;
            case 'name': aVal = a.name.toLowerCase(); bVal = b.name.toLowerCase(); break;
            default: return 0;
          }
          return sortDir === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
        });
    }

    function getUnique(key) {
      return [...new Set(products.map(p => p[key]))].sort();
    }

    function render() {
      const filtered = getFiltered();
      const totalSavings = filtered.reduce((sum, p) => sum + p.savings, 0);
      const avgDiscount = filtered.length > 0 
        ? Math.round(filtered.reduce((sum, p) => sum + p.discount, 0) / filtered.length) 
        : 0;

      const processors = getUnique('processor').sort((a, b) => {
        const order = ['M4', 'M4 Pro', 'M4 Max', 'M5', 'M5 Pro', 'M5 Max'];
        return order.indexOf(a) - order.indexOf(b);
      });

      document.getElementById('app').innerHTML = \`
        \${storeModal ? \`
          <div class="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50" onclick="if(event.target===this)closeModal()">
            <div class="bg-gray-800 rounded-2xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto">
              <div class="flex justify-between items-start mb-4">
                <div>
                  <h2 class="text-xl font-bold text-white">Open-Box Pickup Locations</h2>
                  <p class="text-sm text-gray-400 mt-1">SKU \${storeModal.sku} · \${storeModal.condition}</p>
                </div>
                <button onclick="closeModal()" class="text-gray-400 hover:text-white text-2xl">&times;</button>
              </div>
              
              \${storeModal.loading ? \`
                <div class="text-center py-8">
                  <div class="text-3xl animate-spin mb-2">⏳</div>
                  <p class="text-gray-400">Finding stores with this open-box item...</p>
                </div>
              \` : storeModal.error ? \`
                <div class="bg-red-900/50 border border-red-700 rounded-lg p-4">
                  <p class="text-red-200">\${storeModal.error}</p>
                  <a href="https://www.bestbuy.com/site/\${storeModal.sku}.p?skuId=\${storeModal.sku}#tab=buyingOptions" 
                     target="_blank" class="inline-block mt-3 text-yellow-400 hover:text-yellow-300">
                    Check on bestbuy.com instead →
                  </a>
                </div>
              \` : storeModal.stores.length === 0 ? \`
                <div class="text-center py-8">
                  <div class="text-3xl mb-2">😔</div>
                  <p class="text-gray-400">No stores near \${postalCode} have this open-box item.</p>
                  <p class="text-gray-500 text-sm mt-2">Try a different condition or check bestbuy.com</p>
                  <a href="https://www.bestbuy.com/site/\${storeModal.sku}.p?skuId=\${storeModal.sku}#tab=buyingOptions" 
                     target="_blank" 
                     class="inline-block mt-4 px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-medium rounded-lg transition">
                    View on Best Buy →
                  </a>
                </div>
              \` : \`
                <div class="bg-green-900/30 border border-green-700/50 rounded-lg p-3 mb-4">
                  <p class="text-green-200 text-sm">✓ Found \${storeModal.stores.length} store\${storeModal.stores.length === 1 ? '' : 's'} with this open-box item for pickup</p>
                </div>
                <div class="space-y-3 max-h-80 overflow-y-auto">
                  \${storeModal.stores.map(store => \`
                    <div class="bg-gray-700 rounded-lg p-4">
                      <div class="flex justify-between items-start">
                        <div>
                          <div class="font-semibold text-white text-lg">\${store.name}</div>
                          <div class="text-sm text-gray-400">\${store.address}</div>
                          <div class="text-sm text-gray-400">\${store.city}, \${store.state} \${store.zipCode}</div>
                          <div class="text-xs text-gray-500 mt-1">\${store.phone || ''}</div>
                        </div>
                        <div class="text-right">
                          <div class="text-xl font-bold text-blue-400">\${store.distance ? store.distance.toFixed(1) + ' mi' : ''}</div>
                        </div>
                      </div>
                    </div>
                  \`).join('')}
                </div>
                <div class="mt-4 pt-4 border-t border-gray-700 text-center">
                  <a href="https://www.bestbuy.com/site/\${storeModal.sku}.p?skuId=\${storeModal.sku}#tab=buyingOptions" 
                     target="_blank" 
                     class="inline-block px-6 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-medium rounded-lg transition">
                    Reserve / Buy on Best Buy →
                  </a>
                </div>
              \`}
            </div>
          </div>
        \` : ''}

        <div class="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
          <div>
            <h1 class="text-2xl md:text-3xl font-bold text-blue-400">Best Buy M4/M5 MacBook Finder</h1>
            <p class="text-gray-400 text-sm mt-1">Open-box inventory • \${new Date().toLocaleString()}</p>
          </div>
          <div class="flex gap-2 items-center">
            <div class="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
              <span class="text-gray-400 text-sm">📍</span>
              <input type="text" 
                     id="zipInput"
                     value="\${postalCode}" 
                     placeholder="Zip code" 
                     maxlength="5"
                     class="w-20 bg-transparent border-none text-white text-sm focus:outline-none"
                     onchange="savePostalCode(this.value)"
                     onkeypress="if(event.key==='Enter')this.blur()">
            </div>
            <button onclick="location.reload()" class="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium transition">
              🔄 Refresh
            </button>
          </div>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div class="bg-gray-800 rounded-xl p-4">
            <div class="text-2xl font-bold text-white">\${products.length}</div>
            <div class="text-gray-400 text-sm">Total Found</div>
          </div>
          <div class="bg-gray-800 rounded-xl p-4">
            <div class="text-2xl font-bold text-purple-400">\${filtered.length}</div>
            <div class="text-gray-400 text-sm">Matching Filters</div>
          </div>
          <div class="bg-gray-800 rounded-xl p-4">
            <div class="text-2xl font-bold text-green-400">\${avgDiscount}%</div>
            <div class="text-gray-400 text-sm">Avg Discount</div>
          </div>
          <div class="bg-gray-800 rounded-xl p-4">
            <div class="text-2xl font-bold text-yellow-400">$\${Math.round(totalSavings).toLocaleString()}</div>
            <div class="text-gray-400 text-sm">Total Savings</div>
          </div>
        </div>

        <div class="bg-gray-800 rounded-xl p-4 mb-6">
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <div>
              <label class="block text-xs text-gray-400 mb-1">Sort By</label>
              <select onchange="sortField=this.value;render()" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm">
                <option value="discount" \${sortField==='discount'?'selected':''}>Discount %</option>
                <option value="currentPrice" \${sortField==='currentPrice'?'selected':''}>Price</option>
                <option value="savings" \${sortField==='savings'?'selected':''}>$ Savings</option>
                <option value="ram" \${sortField==='ram'?'selected':''}>RAM</option>
                <option value="name" \${sortField==='name'?'selected':''}>Name</option>
              </select>
            </div>
            <div>
              <label class="block text-xs text-gray-400 mb-1">Direction</label>
              <select onchange="sortDir=this.value;render()" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm">
                <option value="desc" \${sortDir==='desc'?'selected':''}>High to Low</option>
                <option value="asc" \${sortDir==='asc'?'selected':''}>Low to High</option>
              </select>
            </div>
            <div>
              <label class="block text-xs text-gray-400 mb-1">Model</label>
              <select onchange="modelFilter=this.value;render()" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm">
                <option value="all">All Models</option>
                \${getUnique('modelType').map(m => \`<option value="\${m}" \${modelFilter===m?'selected':''}>\${m}</option>\`).join('')}
              </select>
            </div>
            <div>
              <label class="block text-xs text-gray-400 mb-1">Processor</label>
              <select onchange="processorFilter=this.value;render()" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm">
                <option value="all">All Processors</option>
                \${processors.map(p => \`<option value="\${p}" \${processorFilter===p?'selected':''}>\${p}</option>\`).join('')}
              </select>
            </div>
            <div>
              <label class="block text-xs text-gray-400 mb-1">Min RAM</label>
              <select onchange="minRamFilter=parseInt(this.value);render()" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm">
                <option value="0" \${minRamFilter===0?'selected':''}>Any RAM</option>
                <option value="16" \${minRamFilter===16?'selected':''}>16GB+</option>
                <option value="24" \${minRamFilter===24?'selected':''}>24GB+</option>
                <option value="32" \${minRamFilter===32?'selected':''}>32GB+</option>
                <option value="48" \${minRamFilter===48?'selected':''}>48GB+</option>
                <option value="64" \${minRamFilter===64?'selected':''}>64GB+</option>
                <option value="128" \${minRamFilter===128?'selected':''}>128GB+</option>
              </select>
            </div>
            <div>
              <label class="block text-xs text-gray-400 mb-1">Condition</label>
              <select onchange="conditionFilter=this.value;render()" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm">
                <option value="all">All Conditions</option>
                \${getUnique('condition').map(c => \`<option value="\${c}" \${conditionFilter===c?'selected':''}>\${c}</option>\`).join('')}
              </select>
            </div>
            <div>
              <label class="block text-xs text-gray-400 mb-1">Availability</label>
              <select onchange="availabilityFilter=this.value;render()" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm">
                <option value="all" \${availabilityFilter==='all'?'selected':''}>All</option>
                <option value="ships" \${availabilityFilter==='ships'?'selected':''}>Ships Nationwide</option>
                <option value="instore" \${availabilityFilter==='instore'?'selected':''}>In-Store Only</option>
              </select>
            </div>
          </div>
        </div>

        <div class="space-y-3">
          \${filtered.length === 0 ? \`
            <div class="bg-gray-800 rounded-xl p-12 text-center">
              <div class="text-4xl mb-4">📭</div>
              <p class="text-gray-400">No products match your filters.</p>
            </div>
          \` : filtered.map(p => \`
            <div class="bg-gray-800 rounded-xl p-4 border border-gray-700 hover:border-gray-600 transition">
              <div class="flex flex-col md:flex-row gap-4">
                \${p.image ? \`<img src="\${p.image}" alt="" class="w-24 h-24 object-contain bg-white rounded-lg shrink-0">\` : ''}
                <div class="flex-1 min-w-0">
                  <a href="\${p.url}" target="_blank" class="font-semibold text-white hover:text-blue-400 transition line-clamp-2">\${p.name}</a>
                  <div class="flex flex-wrap gap-2 mt-2">
                    <span class="px-2 py-1 bg-blue-900/50 text-blue-300 text-xs rounded-lg font-medium">\${p.processor}</span>
                    <span class="px-2 py-1 bg-purple-900/50 text-purple-300 text-xs rounded-lg">\${p.modelType} \${p.screenSize}</span>
                    \${p.ram ? \`<span class="px-2 py-1 bg-indigo-900/50 text-indigo-300 text-xs rounded-lg">\${p.ram}GB RAM</span>\` : ''}
                    \${p.storage ? \`<span class="px-2 py-1 bg-violet-900/50 text-violet-300 text-xs rounded-lg">\${p.storage} SSD</span>\` : ''}
                    <span class="px-2 py-1 text-xs rounded-lg \${
                      p.condition.includes('Excellent') ? 'bg-green-900/50 text-green-300' :
                      p.condition.includes('Good') ? 'bg-lime-900/50 text-lime-300' :
                      p.condition.includes('Satisfactory') ? 'bg-yellow-900/50 text-yellow-300' :
                      'bg-orange-900/50 text-orange-300'
                    }">\${p.condition}</span>
                    \${p.online ? '<span class="px-2 py-1 bg-green-600 text-white text-xs rounded-lg font-medium">✓ Ships Nationwide</span>' : '<span class="px-2 py-1 bg-amber-900/50 text-amber-300 text-xs rounded-lg">🏪 In-Store Pickup Only</span>'}
                    <span class="px-2 py-1 bg-gray-700 text-gray-400 text-xs rounded-lg">SKU: \${p.sku}</span>
                  </div>
                </div>
                <div class="flex items-center gap-4 md:gap-6 shrink-0">
                  <div class="text-right">
                    <div class="text-2xl font-bold text-white">$\${p.currentPrice.toLocaleString()}</div>
                    <div class="text-sm text-gray-500 line-through">$\${p.originalPrice.toLocaleString()}</div>
                  </div>
                  <div class="text-xl font-bold px-3 py-1 rounded-lg \${
                    p.discount >= 20 ? 'bg-green-600 text-white' :
                    p.discount >= 10 ? 'text-yellow-400' : 'text-gray-400'
                  }">-\${p.discount}%</div>
                  <div class="flex flex-col gap-1">
                    <a href="\${p.url}" target="_blank" class="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-medium rounded-lg transition text-center text-sm">View →</a>
                    \${!p.online ? \`<button onclick="findStores('\${p.sku}', '\${p.condition}')" class="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white font-medium rounded-lg transition text-sm">📍 Find Stock</button>\` : ''}
                  </div>
                </div>
              </div>
            </div>
          \`).join('')}
        </div>

        <div class="mt-6 text-center text-sm text-gray-500">
          <p>Data from Best Buy Open Box API • Refresh page to check for new inventory</p>
          <p class="mt-1 text-xs">\${postalCode ? \`Searching near \${postalCode}\` : 'Enter zip code to find in-store items near you'}</p>
        </div>
      \`;
    }

    loadProducts();
  </script>
</body>
</html>`;

// HTTP Server
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  
  // Open-box store availability endpoint (uses Playwright to scrape BB)
  if (url.pathname.startsWith('/api/openbox-stores/')) {
    res.setHeader('Content-Type', 'application/json');
    
    const sku = url.pathname.split('/api/openbox-stores/')[1];
    const zipCode = url.searchParams.get('zipCode');
    const condition = url.searchParams.get('condition') || '0';
    
    if (!sku || !zipCode) {
      res.end(JSON.stringify({ error: 'SKU and zipCode required' }));
      return;
    }
    
    console.log(`Fetching open-box stores for SKU ${sku}, condition ${condition}, zip ${zipCode}...`);
    
    // Spawn the playwright script
    const { spawn } = require('child_process');
    const scriptPath = require('path').join(__dirname, 'fetch-stores.js');
    
    const child = spawn('node', [scriptPath, sku, zipCode, condition], {
      timeout: 60000
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
      console.log(`  Playwright: ${data.toString().trim()}`);
    });
    
    child.on('close', (code) => {
      if (code !== 0) {
        console.log(`  Playwright exited with code ${code}`);
        res.end(JSON.stringify({ error: stderr || 'Failed to fetch stores', stores: [] }));
        return;
      }
      
      try {
        const result = JSON.parse(stdout);
        console.log(`  Found ${result.stores?.length || 0} stores`);
        res.end(JSON.stringify(result));
      } catch (e) {
        console.log(`  Parse error: ${e.message}`);
        res.end(JSON.stringify({ error: 'Failed to parse response', stores: [] }));
      }
    });
    
    child.on('error', (err) => {
      console.log(`  Spawn error: ${err.message}`);
      res.end(JSON.stringify({ error: err.message, stores: [] }));
    });
    
    return;
  }
  
  // Store availability endpoint (public API - shows regular inventory)
  if (url.pathname.startsWith('/api/stores/')) {
    res.setHeader('Content-Type', 'application/json');
    
    const sku = url.pathname.split('/api/stores/')[1];
    const postalCode = url.searchParams.get('postalCode');
    const nationwide = url.searchParams.get('nationwide') === 'true';
    
    if (!sku) {
      res.end(JSON.stringify({ error: 'SKU required' }));
      return;
    }
    
    if (!API_KEY) {
      res.end(JSON.stringify({ error: 'No API key configured' }));
      return;
    }
    
    try {
      let allStores = [];
      const seenStoreIds = new Set();
      
      // If nationwide, query major metros to cover the US
      // Reduced list to avoid rate limiting - ~10 zips covers most of US
      const metroZips = [
        '10001',  // NYC (covers NE)
        '90001',  // LA (covers SW)
        '60601',  // Chicago (covers Midwest)
        '77001',  // Houston (covers TX/South)
        '98101',  // Seattle (covers NW)
        '33101',  // Miami (covers FL/SE)
        '80201',  // Denver (covers Mountain)
        '30301',  // Atlanta (covers Southeast)
        '96813',  // Honolulu (covers HI)
      ];
      
      let zipCodes;
      if (nationwide) {
        // User's zip first (if provided), then all metros
        zipCodes = postalCode ? [postalCode, ...metroZips] : metroZips;
      } else if (postalCode) {
        zipCodes = [postalCode];
      } else {
        res.end(JSON.stringify({ error: 'Postal code required for local search' }));
        return;
      }
      
      console.log(`Checking store availability for SKU ${sku} (${nationwide ? 'nationwide - ' + zipCodes.length + ' zips' : 'local'})...`);
      
      let consecutiveFailures = 0;
      
      for (let i = 0; i < zipCodes.length; i++) {
        const zip = zipCodes[i];
        
        // Delay between requests - longer for nationwide to avoid rate limits
        if (i > 0) {
          const delayMs = nationwide ? 1500 : 500; // 1.5s for nationwide, 0.5s for local
          await delay(delayMs);
        }
        
        // If we've had 3 consecutive failures, wait longer
        if (consecutiveFailures >= 3) {
          console.log('  Too many failures, waiting 5s before continuing...');
          await delay(5000);
          consecutiveFailures = 0;
        }
        
        try {
          const storesUrl = `https://api.bestbuy.com/v1/products/${sku}/stores.json?postalCode=${zip}&apiKey=${API_KEY}`;
          const data = await fetch(storesUrl);
          consecutiveFailures = 0; // Reset on success
          
          if (data.stores && data.stores.length > 0) {
            console.log(`  Zip ${zip}: found ${data.stores.length} stores`);
            for (const store of data.stores) {
              if (!seenStoreIds.has(store.storeID)) {
                seenStoreIds.add(store.storeID);
                store.searchedFrom = zip;
                allStores.push(store);
              }
            }
          } else {
            console.log(`  Zip ${zip}: no stores`);
          }
        } catch (e) {
          consecutiveFailures++;
          console.log(`  Zip ${zip} failed: ${e.message}`);
          
          // On rate limit, wait extra time
          if (e.message.includes('403') || e.message.includes('rate')) {
            console.log('  Rate limited, waiting 3s...');
            await delay(3000);
          }
        }
      }
      
      // Sort by distance from user's zip (if available) then by distance field
      if (postalCode && allStores.length > 0) {
        // Stores from user's zip search have accurate distance, others don't
        // Put user's local results first, then others sorted by their reported distance
        allStores.sort((a, b) => {
          const aLocal = a.searchedFrom === postalCode;
          const bLocal = b.searchedFrom === postalCode;
          if (aLocal && !bLocal) return -1;
          if (!aLocal && bLocal) return 1;
          return (a.distance || 9999) - (b.distance || 9999);
        });
      }
      
      console.log(`Found ${allStores.length} stores with SKU ${sku}`);
      res.end(JSON.stringify({ 
        sku,
        postalCode,
        nationwide,
        stores: allStores.slice(0, 25) // Return top 25
      }));
    } catch (e) {
      console.log(`Store lookup failed: ${e.message}`);
      res.end(JSON.stringify({ error: e.message, stores: [] }));
    }
    return;
  }
  
  // Products API endpoint
  if (url.pathname === '/api/products') {
    res.setHeader('Content-Type', 'application/json');
    
    // Check for API key in query param (for initial setup)
    const keyParam = url.searchParams.get('key');
    if (keyParam) API_KEY = keyParam;
    
    if (!API_KEY) {
      res.end(JSON.stringify({ error: 'No API key configured. Set BESTBUY_API_KEY environment variable.' }));
      return;
    }
    
    try {
      const products = await fetchInventory(API_KEY);
      console.log(`Found ${products.length} M4/M5 MacBooks`);
      res.end(JSON.stringify({ products }));
    } catch (e) {
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }
  
  // Serve HTML
  res.setHeader('Content-Type', 'text/html');
  res.end(HTML);
});

server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║  Best Buy M4/M5 MacBook Finder                            ║
╠═══════════════════════════════════════════════════════════╣
║  Server running at: http://localhost:${PORT}                 ║
${API_KEY ? '║  API Key: ✓ Configured                                    ║' : '║  API Key: ✗ Set BESTBUY_API_KEY env var                   ║'}
╚═══════════════════════════════════════════════════════════╝
`);
});