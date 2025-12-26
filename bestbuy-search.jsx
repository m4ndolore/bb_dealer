import { useState, useEffect } from "react";

const PROCESSOR_FILTERS = ["M4", "M4 Pro", "M4 Max", "M5", "M5 Pro", "M5 Max"];

export default function BestBuySearch() {
  const [apiKey, setApiKey] = useState("");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastFetched, setLastFetched] = useState(null);
  
  // Filters
  const [sortField, setSortField] = useState("discount");
  const [sortDir, setSortDir] = useState("desc");
  const [processorFilter, setProcessorFilter] = useState("all");
  const [conditionFilter, setConditionFilter] = useState("all");
  const [modelFilter, setModelFilter] = useState("all"); // Air, Pro, etc.

  // Load API key from storage
  useEffect(() => {
    async function loadApiKey() {
      try {
        const result = await window.storage.get("bestbuy-api-key");
        if (result?.value) {
          setApiKey(result.value);
        }
      } catch (e) {
        // Storage not available
        const saved = localStorage.getItem("bestbuy-api-key");
        if (saved) setApiKey(saved);
      }
    }
    loadApiKey();
  }, []);

  const saveApiKey = async () => {
    const key = apiKeyInput.trim();
    if (!key) return;
    setApiKey(key);
    try {
      await window.storage.set("bestbuy-api-key", key);
    } catch (e) {
      localStorage.setItem("bestbuy-api-key", key);
    }
    setApiKeyInput("");
  };

  const clearApiKey = async () => {
    setApiKey("");
    setProducts([]);
    try {
      await window.storage.delete("bestbuy-api-key");
    } catch (e) {
      localStorage.removeItem("bestbuy-api-key");
    }
  };

  const fetchInventory = async () => {
    if (!apiKey) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Best Buy API query for MacBooks that are open-box or refurbished
      // We search broadly and filter client-side for M4/M5 processors
      const queries = [
        // Open-box MacBooks
        `https://api.bestbuy.com/v1/products((categoryPath.id=pcmcat247400050001)&openBox=true)?apiKey=${apiKey}&format=json&show=sku,name,salePrice,regularPrice,onSale,openBoxCondition,url,image,modelNumber,shortDescription,details.name,details.value&pageSize=100`,
        // Refurbished MacBooks (if available)
        `https://api.bestbuy.com/v1/products((categoryPath.id=pcmcat247400050001)&condition=refurbished)?apiKey=${apiKey}&format=json&show=sku,name,salePrice,regularPrice,onSale,url,image,modelNumber,shortDescription,details.name,details.value&pageSize=100`,
        // Also search with M4 keyword to catch any we might miss
        `https://api.bestbuy.com/v1/products((search=macbook%20M4)&openBox=true)?apiKey=${apiKey}&format=json&show=sku,name,salePrice,regularPrice,onSale,openBoxCondition,url,image,modelNumber,shortDescription,details.name,details.value&pageSize=100`,
      ];

      const allProducts = [];
      const seenSkus = new Set();

      for (const query of queries) {
        try {
          const response = await fetch(query);
          if (!response.ok) {
            if (response.status === 403) {
              throw new Error("Invalid API key. Please check your key and try again.");
            }
            continue; // Skip failed queries but continue with others
          }
          const data = await response.json();
          
          if (data.products) {
            for (const product of data.products) {
              if (!seenSkus.has(product.sku)) {
                seenSkus.add(product.sku);
                allProducts.push(product);
              }
            }
          }
        } catch (e) {
          if (e.message.includes("Invalid API key")) throw e;
          console.log("Query failed:", e);
        }
      }

      // Filter for M4/M5 processors
      const m4m5Pattern = /\b(M4|M5)\s*(Pro|Max)?\b/i;
      const filtered = allProducts.filter(product => {
        const searchText = `${product.name} ${product.shortDescription || ""} ${product.modelNumber || ""}`;
        return m4m5Pattern.test(searchText);
      });

      // Enrich with parsed data
      const enriched = filtered.map(product => {
        const text = `${product.name} ${product.shortDescription || ""}`;
        
        // Detect processor
        let processor = "Unknown";
        if (/M5\s*Max/i.test(text)) processor = "M5 Max";
        else if (/M5\s*Pro/i.test(text)) processor = "M5 Pro";
        else if (/M5\b/i.test(text)) processor = "M5";
        else if (/M4\s*Max/i.test(text)) processor = "M4 Max";
        else if (/M4\s*Pro/i.test(text)) processor = "M4 Pro";
        else if (/M4\b/i.test(text)) processor = "M4";

        // Detect model type
        let modelType = "MacBook";
        if (/Air/i.test(product.name)) modelType = "MacBook Air";
        else if (/Pro/i.test(product.name)) modelType = "MacBook Pro";

        // Detect screen size
        const sizeMatch = product.name.match(/(\d{2}(?:\.\d)?)["-]/);
        const screenSize = sizeMatch ? sizeMatch[1] + '"' : "";

        // Parse condition
        let condition = product.openBoxCondition || "Open-Box";
        if (condition === "excellent") condition = "Open-Box Excellent";
        else if (condition === "satisfactory") condition = "Open-Box Satisfactory";
        else if (condition === "fair") condition = "Open-Box Fair";

        const originalPrice = product.regularPrice || product.salePrice;
        const currentPrice = product.salePrice;
        const discount = originalPrice > 0 
          ? Math.round(((originalPrice - currentPrice) / originalPrice) * 100)
          : 0;

        return {
          ...product,
          processor,
          modelType,
          screenSize,
          condition,
          originalPrice,
          currentPrice,
          discount,
          savings: originalPrice - currentPrice,
        };
      });

      setProducts(enriched);
      setLastFetched(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Auto-fetch when API key is set
  useEffect(() => {
    if (apiKey) {
      fetchInventory();
    }
  }, [apiKey]);

  // Get unique values for filters
  const uniqueConditions = [...new Set(products.map(p => p.condition))].sort();
  const uniqueModels = [...new Set(products.map(p => p.modelType))].sort();
  const uniqueProcessors = [...new Set(products.map(p => p.processor))].sort((a, b) => {
    const order = ["M4", "M4 Pro", "M4 Max", "M5", "M5 Pro", "M5 Max"];
    return order.indexOf(a) - order.indexOf(b);
  });

  // Filter and sort products
  const filteredProducts = products
    .filter(p => processorFilter === "all" || p.processor === processorFilter)
    .filter(p => conditionFilter === "all" || p.condition === conditionFilter)
    .filter(p => modelFilter === "all" || p.modelType === modelFilter)
    .sort((a, b) => {
      let aVal, bVal;
      switch (sortField) {
        case "discount":
          aVal = a.discount;
          bVal = b.discount;
          break;
        case "currentPrice":
          aVal = a.currentPrice;
          bVal = b.currentPrice;
          break;
        case "savings":
          aVal = a.savings;
          bVal = b.savings;
          break;
        case "name":
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          break;
        default:
          return 0;
      }
      if (sortDir === "asc") return aVal > bVal ? 1 : -1;
      return aVal < bVal ? 1 : -1;
    });

  const totalSavings = filteredProducts.reduce((sum, p) => sum + p.savings, 0);
  const avgDiscount = filteredProducts.length > 0
    ? Math.round(filteredProducts.reduce((sum, p) => sum + p.discount, 0) / filteredProducts.length)
    : 0;

  // No API key - show setup screen
  if (!apiKey) {
    return (
      <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
        <div className="max-w-xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-blue-400 mb-2">
              Best Buy M4/M5 MacBook Finder
            </h1>
            <p className="text-gray-400">
              Find open-box and refurbished deals on the latest MacBooks
            </p>
          </div>

          <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700">
            <h2 className="text-xl font-semibold mb-4">Setup Required</h2>
            <p className="text-gray-300 mb-4">
              This app uses Best Buy's free API to search real inventory. 
              Get your API key in 30 seconds:
            </p>
            
            <ol className="list-decimal list-inside space-y-2 text-gray-300 mb-6">
              <li>
                Go to{" "}
                <a 
                  href="https://developer.bestbuy.com/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline"
                >
                  developer.bestbuy.com ↗
                </a>
              </li>
              <li>Click "Get API Key" and create a free account</li>
              <li>Copy your API key and paste it below</li>
            </ol>

            <div className="flex gap-2">
              <input
                type="text"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="Paste your API key here..."
                className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500"
                onKeyDown={(e) => e.key === "Enter" && saveApiKey()}
              />
              <button
                onClick={saveApiKey}
                disabled={!apiKeyInput.trim()}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition"
              >
                Save
              </button>
            </div>

            <p className="text-xs text-gray-500 mt-3">
              Your API key is stored locally and never shared.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-blue-400">
              Best Buy M4/M5 MacBook Finder
            </h1>
            <p className="text-gray-400 text-sm mt-1">
              Open-box & refurbished inventory • {lastFetched && `Updated ${lastFetched.toLocaleTimeString()}`}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchInventory}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 rounded-lg font-medium transition flex items-center gap-2"
            >
              {loading ? (
                <>
                  <span className="animate-spin">⟳</span> Searching...
                </>
              ) : (
                <>🔄 Refresh</>
              )}
            </button>
            <button
              onClick={clearApiKey}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition"
              title="Change API Key"
            >
              ⚙️
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-900/50 border border-red-700 rounded-xl p-4 mb-6">
            <p className="text-red-200">{error}</p>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-gray-800 rounded-xl p-4">
            <div className="text-2xl font-bold text-white">{products.length}</div>
            <div className="text-gray-400 text-sm">Total Found</div>
          </div>
          <div className="bg-gray-800 rounded-xl p-4">
            <div className="text-2xl font-bold text-purple-400">{filteredProducts.length}</div>
            <div className="text-gray-400 text-sm">Matching Filters</div>
          </div>
          <div className="bg-gray-800 rounded-xl p-4">
            <div className="text-2xl font-bold text-green-400">{avgDiscount}%</div>
            <div className="text-gray-400 text-sm">Avg Discount</div>
          </div>
          <div className="bg-gray-800 rounded-xl p-4">
            <div className="text-2xl font-bold text-yellow-400">
              ${Math.round(totalSavings).toLocaleString()}
            </div>
            <div className="text-gray-400 text-sm">Total Savings Available</div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-gray-800 rounded-xl p-4 mb-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Sort By</label>
              <select
                value={sortField}
                onChange={(e) => setSortField(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm"
              >
                <option value="discount">Discount %</option>
                <option value="currentPrice">Price</option>
                <option value="savings">$ Savings</option>
                <option value="name">Name</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Direction</label>
              <select
                value={sortDir}
                onChange={(e) => setSortDir(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm"
              >
                <option value="desc">High to Low</option>
                <option value="asc">Low to High</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Model</label>
              <select
                value={modelFilter}
                onChange={(e) => setModelFilter(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm"
              >
                <option value="all">All Models</option>
                {uniqueModels.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Processor</label>
              <select
                value={processorFilter}
                onChange={(e) => setProcessorFilter(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm"
              >
                <option value="all">All Processors</option>
                {uniqueProcessors.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Condition</label>
              <select
                value={conditionFilter}
                onChange={(e) => setConditionFilter(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm"
              >
                <option value="all">All Conditions</option>
                {uniqueConditions.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Results */}
        {loading && products.length === 0 ? (
          <div className="bg-gray-800 rounded-xl p-12 text-center">
            <div className="text-4xl mb-4 animate-pulse">🔍</div>
            <p className="text-gray-400">Searching Best Buy inventory...</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="bg-gray-800 rounded-xl p-12 text-center">
            <div className="text-4xl mb-4">📭</div>
            <p className="text-gray-400">
              {products.length === 0 
                ? "No M4/M5 MacBooks found in open-box inventory right now."
                : "No products match your current filters."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredProducts.map((product) => (
              <div
                key={product.sku}
                className="bg-gray-800 rounded-xl p-4 border border-gray-700 hover:border-gray-600 transition"
              >
                <div className="flex flex-col md:flex-row gap-4">
                  {/* Image */}
                  {product.image && (
                    <div className="shrink-0">
                      <img
                        src={product.image}
                        alt={product.name}
                        className="w-24 h-24 object-contain bg-white rounded-lg"
                      />
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <a
                      href={product.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-white hover:text-blue-400 transition line-clamp-2"
                    >
                      {product.name}
                    </a>
                    
                    <div className="flex flex-wrap gap-2 mt-2">
                      <span className="px-2 py-1 bg-blue-900/50 text-blue-300 text-xs rounded-lg font-medium">
                        {product.processor}
                      </span>
                      <span className="px-2 py-1 bg-purple-900/50 text-purple-300 text-xs rounded-lg">
                        {product.modelType} {product.screenSize}
                      </span>
                      <span className={`px-2 py-1 text-xs rounded-lg ${
                        product.condition.includes("Excellent") 
                          ? "bg-green-900/50 text-green-300"
                          : product.condition.includes("Satisfactory")
                          ? "bg-yellow-900/50 text-yellow-300"
                          : "bg-orange-900/50 text-orange-300"
                      }`}>
                        {product.condition}
                      </span>
                      <span className="px-2 py-1 bg-gray-700 text-gray-400 text-xs rounded-lg">
                        SKU: {product.sku}
                      </span>
                    </div>
                  </div>

                  {/* Pricing */}
                  <div className="flex items-center gap-4 md:gap-6 shrink-0">
                    <div className="text-right">
                      <div className="text-2xl font-bold text-white">
                        ${product.currentPrice.toLocaleString()}
                      </div>
                      <div className="text-sm text-gray-500 line-through">
                        ${product.originalPrice.toLocaleString()}
                      </div>
                    </div>
                    <div className={`text-xl font-bold px-3 py-1 rounded-lg ${
                      product.discount >= 20 
                        ? "bg-green-600 text-white" 
                        : product.discount >= 10 
                        ? "text-yellow-400"
                        : "text-gray-400"
                    }`}>
                      -{product.discount}%
                    </div>
                    <a
                      href={product.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-medium rounded-lg transition"
                    >
                      View →
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 text-center text-sm text-gray-500">
          Data from Best Buy API • Refresh to check for new inventory
        </div>
      </div>
    </div>
  );
}
