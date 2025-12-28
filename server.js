#!/usr/bin/env node

/**
 * Tech Deal Finder
 *
 * Aggregates open-box deals from multiple sources (Best Buy, etc.)
 *
 * Usage:
 *   1. npm install (first time only)
 *   2. node server.js
 *   3. Open http://localhost:3000 in your browser
 *
 * Set your API key via environment variable:
 *   BESTBUY_API_KEY=your_key node server.js
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// New modular architecture
const { fetchAllDeals } = require('./lib/deals');
const { CATEGORIES } = require('./lib/categories');

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


// HTML template
const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tech Deal Finder</title>
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
    let categoryFilter = 'all';
    let sourceFilter = 'all';
    let postalCode = localStorage.getItem('bb-postal-code') || '';
    let storeModal = null; // {sku, stores, loading, error}

    // Category definitions (from server)
    const CATEGORIES = {
      storage: { name: 'Storage' },
      compute: { name: 'Compute' },
      memory: { name: 'Memory' },
      tablets: { name: 'Tablets' },
      laptops: { name: 'Laptops' }
    };

    // Source definitions
    const SOURCES = {
      bestbuy: { name: 'Best Buy', color: 'blue' }
    };

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
        .filter(p => categoryFilter === 'all' || p.category === categoryFilter)
        .filter(p => sourceFilter === 'all' || p.source === sourceFilter)
        .filter(p => processorFilter === 'all' || p.processor === processorFilter)
        .filter(p => conditionFilter === 'all' || p.condition === conditionFilter)
        .filter(p => modelFilter === 'all' || p.modelType === modelFilter)
        .filter(p => minRamFilter === 0 || p.ram >= minRamFilter)
        .filter(p => {
          if (availabilityFilter === 'all') return true;
          if (availabilityFilter === 'ships') return p.availability === 'online';
          if (availabilityFilter === 'instore') return p.availability === 'in-store';
          return true;
        })
        .sort((a, b) => {
          let aVal, bVal;
          switch (sortField) {
            case 'discount': aVal = a.discount; bVal = b.discount; break;
            case 'currentPrice': aVal = a.currentPrice; bVal = b.currentPrice; break;
            case 'savings': aVal = a.originalPrice - a.currentPrice; bVal = b.originalPrice - b.currentPrice; break;
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
            <h1 class="text-2xl md:text-3xl font-bold text-blue-400">Tech Deal Finder</h1>
            <p class="text-gray-400 text-sm mt-1">Open-box deals from multiple sources • \${new Date().toLocaleString()}</p>
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
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-3">
            <div>
              <label class="block text-xs text-gray-400 mb-1">Category</label>
              <select onchange="categoryFilter=this.value;render()" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm">
                <option value="all" \${categoryFilter==='all'?'selected':''}>All Categories</option>
                \${Object.entries(CATEGORIES).map(([id, cat]) => \`<option value="\${id}" \${categoryFilter===id?'selected':''}>\${cat.name}</option>\`).join('')}
              </select>
            </div>
            <div>
              <label class="block text-xs text-gray-400 mb-1">Source</label>
              <select onchange="sourceFilter=this.value;render()" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm">
                <option value="all" \${sourceFilter==='all'?'selected':''}>All Sources</option>
                \${Object.entries(SOURCES).map(([id, src]) => \`<option value="\${id}" \${sourceFilter===id?'selected':''}>\${src.name}</option>\`).join('')}
              </select>
            </div>
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
              <label class="block text-xs text-gray-400 mb-1">Availability</label>
              <select onchange="availabilityFilter=this.value;render()" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm">
                <option value="all" \${availabilityFilter==='all'?'selected':''}>All</option>
                <option value="ships" \${availabilityFilter==='ships'?'selected':''}>Ships Nationwide</option>
                <option value="instore" \${availabilityFilter==='instore'?'selected':''}>In-Store Only</option>
              </select>
            </div>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            <div>
              <label class="block text-xs text-gray-400 mb-1">Model</label>
              <select onchange="modelFilter=this.value;render()" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm">
                <option value="all">All Models</option>
                \${getUnique('modelType').filter(Boolean).map(m => \`<option value="\${m}" \${modelFilter===m?'selected':''}>\${m}</option>\`).join('')}
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
                  <div class="flex items-start gap-2 mb-1">
                    <a href="\${p.url}" target="_blank" class="font-semibold text-white hover:text-blue-400 transition line-clamp-2">\${p.name}</a>
                    \${p.dealBadge === 'great' ? '<span class="shrink-0 px-2 py-1 bg-green-500 text-white text-xs rounded-lg font-bold">GREAT DEAL</span>' : ''}
                    \${p.dealBadge === 'good' ? '<span class="shrink-0 px-2 py-1 bg-yellow-500 text-black text-xs rounded-lg font-bold">GOOD DEAL</span>' : ''}
                  </div>
                  <div class="flex flex-wrap gap-2 mt-2">
                    <span class="px-2 py-1 bg-blue-600 text-white text-xs rounded-lg font-medium">\${SOURCES[p.source]?.name || p.source}</span>
                    \${p.category && CATEGORIES[p.category] ? \`<span class="px-2 py-1 bg-gray-600 text-gray-200 text-xs rounded-lg">\${CATEGORIES[p.category].name}</span>\` : ''}
                    \${p.processor ? \`<span class="px-2 py-1 bg-blue-900/50 text-blue-300 text-xs rounded-lg font-medium">\${p.processor}</span>\` : ''}
                    \${p.modelType ? \`<span class="px-2 py-1 bg-purple-900/50 text-purple-300 text-xs rounded-lg">\${p.modelType} \${p.screenSize || ''}</span>\` : ''}
                    \${p.ram ? \`<span class="px-2 py-1 bg-indigo-900/50 text-indigo-300 text-xs rounded-lg">\${p.ram}GB RAM</span>\` : ''}
                    \${p.storage ? \`<span class="px-2 py-1 bg-violet-900/50 text-violet-300 text-xs rounded-lg">\${p.storage} SSD</span>\` : ''}
                    <span class="px-2 py-1 text-xs rounded-lg \${
                      p.condition.includes('Excellent') ? 'bg-green-900/50 text-green-300' :
                      p.condition.includes('Good') ? 'bg-lime-900/50 text-lime-300' :
                      p.condition.includes('Satisfactory') ? 'bg-yellow-900/50 text-yellow-300' :
                      'bg-orange-900/50 text-orange-300'
                    }">\${p.condition}</span>
                    \${p.availability === 'online' ? '<span class="px-2 py-1 bg-green-600 text-white text-xs rounded-lg font-medium">Ships Nationwide</span>' : '<span class="px-2 py-1 bg-amber-900/50 text-amber-300 text-xs rounded-lg">In-Store Pickup Only</span>'}
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
                    <a href="\${p.url}" target="_blank" class="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-medium rounded-lg transition text-center text-sm">View</a>
                    \${p.availability === 'in-store' ? \`<button onclick="findStores('\${p.sku}', '\${p.condition}')" class="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white font-medium rounded-lg transition text-sm">Find Stock</button>\` : ''}
                  </div>
                </div>
              </div>
            </div>
          \`).join('')}
        </div>

        <div class="mt-6 text-center text-sm text-gray-500">
          <p>Tech deals from multiple sources • Refresh page to check for new inventory</p>
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
      const results = await fetchAllDeals({
        sources: ['bestbuy'],
        apiKeys: { bestbuy: API_KEY }
      });

      if (results.errors.length > 0) {
        console.log('Errors:', results.errors);
      }

      console.log(`Found ${results.deals.length} deals from ${Object.keys(results.sources).length} source(s)`);
      res.end(JSON.stringify({
        products: results.deals,
        sources: results.sources,
        errors: results.errors
      }));
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
║  Tech Deal Finder                                         ║
╠═══════════════════════════════════════════════════════════╣
║  Server running at: http://localhost:${PORT}                 ║
${API_KEY ? '║  API Key: ✓ Configured                                    ║' : '║  API Key: ✗ Set BESTBUY_API_KEY env var                   ║'}
╚═══════════════════════════════════════════════════════════╝
`);
});