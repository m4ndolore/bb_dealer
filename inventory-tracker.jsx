import { useState, useEffect } from "react";

const PROCESSORS = ["Apple M4", "Apple M4 Pro", "Apple M4 Max", "Apple M5", "Apple M5 Pro", "Apple M5 Max"];
const CONDITIONS = ["Open-Box Excellent", "Open-Box Satisfactory", "Open-Box Fair", "Refurbished"];

const defaultProducts = [
  {
    id: "1",
    name: "MacBook Pro 14\" - M4 Pro - 24GB RAM - 512GB SSD",
    originalPrice: 1999,
    currentPrice: 1749,
    condition: "Open-Box Excellent",
    processor: "Apple M4 Pro",
    sku: "6593548",
    addedAt: new Date().toISOString(),
    notes: "",
  },
  {
    id: "2", 
    name: "MacBook Air 15\" - M4 - 16GB RAM - 256GB SSD",
    originalPrice: 1299,
    currentPrice: 1099,
    condition: "Open-Box Satisfactory",
    processor: "Apple M4",
    sku: "6601851",
    addedAt: new Date().toISOString(),
    notes: "",
  },
];

export default function InventoryTracker() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState("discount");
  const [sortDir, setSortDir] = useState("desc");
  const [filterProcessor, setFilterProcessor] = useState("all");
  const [filterCondition, setFilterCondition] = useState("all");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showBookmarklet, setShowBookmarklet] = useState(false);
  
  const [formData, setFormData] = useState({
    name: "",
    originalPrice: "",
    currentPrice: "",
    condition: "Open-Box Excellent",
    processor: "Apple M4",
    sku: "",
    notes: "",
  });

  // Load from storage on mount
  useEffect(() => {
    async function loadData() {
      try {
        const result = await window.storage.get("bestbuy-inventory");
        if (result?.value) {
          setProducts(JSON.parse(result.value));
        } else {
          // Load defaults for first-time users
          setProducts(defaultProducts);
          await window.storage.set("bestbuy-inventory", JSON.stringify(defaultProducts));
        }
      } catch (e) {
        console.log("Storage not available, using local state");
        setProducts(defaultProducts);
      }
      setLoading(false);
    }
    loadData();
  }, []);

  // Save to storage whenever products change
  useEffect(() => {
    if (!loading && products.length >= 0) {
      window.storage?.set("bestbuy-inventory", JSON.stringify(products)).catch(console.error);
    }
  }, [products, loading]);

  const calculateDiscount = (original, current) => {
    if (!original || !current) return 0;
    return Math.round(((original - current) / original) * 100);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const newProduct = {
      id: editingId || Date.now().toString(),
      ...formData,
      originalPrice: parseFloat(formData.originalPrice) || 0,
      currentPrice: parseFloat(formData.currentPrice) || 0,
      addedAt: editingId 
        ? products.find(p => p.id === editingId)?.addedAt 
        : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (editingId) {
      setProducts(products.map(p => p.id === editingId ? newProduct : p));
    } else {
      setProducts([...products, newProduct]);
    }

    setFormData({
      name: "",
      originalPrice: "",
      currentPrice: "",
      condition: "Open-Box Excellent",
      processor: "Apple M4",
      sku: "",
      notes: "",
    });
    setShowAddForm(false);
    setEditingId(null);
  };

  const handleEdit = (product) => {
    setFormData({
      name: product.name,
      originalPrice: product.originalPrice.toString(),
      currentPrice: product.currentPrice.toString(),
      condition: product.condition,
      processor: product.processor,
      sku: product.sku || "",
      notes: product.notes || "",
    });
    setEditingId(product.id);
    setShowAddForm(true);
  };

  const handleDelete = (id) => {
    if (confirm("Delete this item?")) {
      setProducts(products.filter(p => p.id !== id));
    }
  };

  const handleClearAll = () => {
    if (confirm("Clear all inventory? This cannot be undone.")) {
      setProducts([]);
    }
  };

  // Sort and filter products
  const filteredProducts = products
    .filter(p => filterProcessor === "all" || p.processor === filterProcessor)
    .filter(p => filterCondition === "all" || p.condition === filterCondition)
    .sort((a, b) => {
      let aVal, bVal;
      switch (sortField) {
        case "discount":
          aVal = calculateDiscount(a.originalPrice, a.currentPrice);
          bVal = calculateDiscount(b.originalPrice, b.currentPrice);
          break;
        case "currentPrice":
          aVal = a.currentPrice;
          bVal = b.currentPrice;
          break;
        case "originalPrice":
          aVal = a.originalPrice;
          bVal = b.originalPrice;
          break;
        case "name":
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          break;
        case "addedAt":
          aVal = new Date(a.addedAt).getTime();
          bVal = new Date(b.addedAt).getTime();
          break;
        default:
          return 0;
      }
      if (sortDir === "asc") return aVal > bVal ? 1 : -1;
      return aVal < bVal ? 1 : -1;
    });

  const totalSavings = filteredProducts.reduce(
    (sum, p) => sum + (p.originalPrice - p.currentPrice),
    0
  );

  const bookmarkletCode = `javascript:(function(){const name=document.querySelector('.sku-title h1')?.innerText||'';const prices=document.querySelectorAll('[data-testid="customer-price"] span');const currentPrice=prices[0]?.innerText?.replace(/[^0-9.]/g,'')||'';const originalEl=document.querySelector('.pricing-price__regular-price');const originalPrice=originalEl?.innerText?.replace(/[^0-9.]/g,'')||currentPrice;const sku=location.pathname.match(/\\/(\\d+)\\.p/)?.[1]||'';const data={name,currentPrice,originalPrice,sku,url:location.href};prompt('Copy this JSON:',JSON.stringify(data));})();`;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-xl">Loading inventory...</div>
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
              Best Buy Inventory Tracker
            </h1>
            <p className="text-gray-400 text-sm mt-1">
              Track open-box & refurbished Apple laptops
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowBookmarklet(!showBookmarklet)}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition"
            >
              📑 Bookmarklet
            </button>
            <button
              onClick={() => {
                setShowAddForm(true);
                setEditingId(null);
                setFormData({
                  name: "",
                  originalPrice: "",
                  currentPrice: "",
                  condition: "Open-Box Excellent",
                  processor: "Apple M4",
                  sku: "",
                  notes: "",
                });
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium transition"
            >
              + Add Item
            </button>
          </div>
        </div>

        {/* Bookmarklet Instructions */}
        {showBookmarklet && (
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 mb-6">
            <h3 className="font-semibold text-yellow-400 mb-2">Quick Add Bookmarklet</h3>
            <p className="text-sm text-gray-300 mb-3">
              Drag this link to your bookmarks bar, then click it on any Best Buy product page to extract product info:
            </p>
            <a
              href={bookmarkletCode}
              onClick={(e) => e.preventDefault()}
              className="inline-block px-4 py-2 bg-yellow-600 hover:bg-yellow-500 rounded-lg text-sm font-medium mb-3"
            >
              📋 BB Product Grabber
            </a>
            <p className="text-xs text-gray-500">
              After clicking on a product page, copy the JSON and paste the values into the Add Item form.
            </p>
          </div>
        )}

        {/* Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-gray-800 rounded-xl p-4">
            <div className="text-2xl font-bold text-white">{products.length}</div>
            <div className="text-gray-400 text-sm">Total Items</div>
          </div>
          <div className="bg-gray-800 rounded-xl p-4">
            <div className="text-2xl font-bold text-green-400">
              ${totalSavings.toLocaleString()}
            </div>
            <div className="text-gray-400 text-sm">Potential Savings</div>
          </div>
          <div className="bg-gray-800 rounded-xl p-4">
            <div className="text-2xl font-bold text-blue-400">
              {filteredProducts.length > 0 
                ? Math.round(filteredProducts.reduce((sum, p) => 
                    sum + calculateDiscount(p.originalPrice, p.currentPrice), 0) / filteredProducts.length)
                : 0}%
            </div>
            <div className="text-gray-400 text-sm">Avg Discount</div>
          </div>
          <div className="bg-gray-800 rounded-xl p-4">
            <div className="text-2xl font-bold text-purple-400">
              {filteredProducts.length}
            </div>
            <div className="text-gray-400 text-sm">Showing</div>
          </div>
        </div>

        {/* Filters & Sort */}
        <div className="bg-gray-800 rounded-xl p-4 mb-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Sort By</label>
              <select
                value={sortField}
                onChange={(e) => setSortField(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm"
              >
                <option value="discount">Discount %</option>
                <option value="currentPrice">Current Price</option>
                <option value="originalPrice">Original Price</option>
                <option value="name">Name</option>
                <option value="addedAt">Date Added</option>
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
              <label className="block text-xs text-gray-400 mb-1">Processor</label>
              <select
                value={filterProcessor}
                onChange={(e) => setFilterProcessor(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm"
              >
                <option value="all">All Processors</option>
                {PROCESSORS.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Condition</label>
              <select
                value={filterCondition}
                onChange={(e) => setFilterCondition(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm"
              >
                <option value="all">All Conditions</option>
                {CONDITIONS.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Add/Edit Form Modal */}
        {showAddForm && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-800 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-bold mb-4">
                {editingId ? "Edit Item" : "Add New Item"}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Product Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    placeholder="MacBook Pro 14&quot; - M4 Pro - 24GB RAM"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Original Price *</label>
                    <input
                      type="number"
                      required
                      step="0.01"
                      value={formData.originalPrice}
                      onChange={(e) => setFormData({...formData, originalPrice: e.target.value})}
                      placeholder="1999"
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Current Price *</label>
                    <input
                      type="number"
                      required
                      step="0.01"
                      value={formData.currentPrice}
                      onChange={(e) => setFormData({...formData, currentPrice: e.target.value})}
                      placeholder="1749"
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Processor</label>
                    <select
                      value={formData.processor}
                      onChange={(e) => setFormData({...formData, processor: e.target.value})}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                    >
                      {PROCESSORS.map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Condition</label>
                    <select
                      value={formData.condition}
                      onChange={(e) => setFormData({...formData, condition: e.target.value})}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                    >
                      {CONDITIONS.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">SKU (optional)</label>
                  <input
                    type="text"
                    value={formData.sku}
                    onChange={(e) => setFormData({...formData, sku: e.target.value})}
                    placeholder="6593548"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Notes (optional)</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                    placeholder="Space Black, available at local store..."
                    rows={2}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddForm(false);
                      setEditingId(null);
                    }}
                    className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium transition"
                  >
                    {editingId ? "Update" : "Add Item"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Product List */}
        <div className="space-y-3">
          {filteredProducts.length === 0 ? (
            <div className="bg-gray-800 rounded-xl p-8 text-center">
              <p className="text-gray-400">No items found. Add some inventory to get started!</p>
            </div>
          ) : (
            filteredProducts.map((product) => {
              const discount = calculateDiscount(product.originalPrice, product.currentPrice);
              return (
                <div
                  key={product.id}
                  className="bg-gray-800 rounded-xl p-4 hover:bg-gray-750 transition border border-gray-700"
                >
                  <div className="flex flex-col md:flex-row md:items-center gap-4">
                    {/* Main Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2">
                        <h3 className="font-semibold text-white truncate">{product.name}</h3>
                        {discount >= 20 && (
                          <span className="shrink-0 px-2 py-0.5 bg-green-600 text-xs rounded-full font-medium">
                            Great Deal
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <span className="px-2 py-1 bg-blue-900/50 text-blue-300 text-xs rounded-lg">
                          {product.processor}
                        </span>
                        <span className="px-2 py-1 bg-purple-900/50 text-purple-300 text-xs rounded-lg">
                          {product.condition}
                        </span>
                        {product.sku && (
                          <a
                            href={`https://www.bestbuy.com/site/${product.sku}.p`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2 py-1 bg-gray-700 text-gray-300 text-xs rounded-lg hover:bg-gray-600 transition"
                          >
                            SKU: {product.sku} ↗
                          </a>
                        )}
                      </div>
                      {product.notes && (
                        <p className="text-sm text-gray-400 mt-2">{product.notes}</p>
                      )}
                    </div>

                    {/* Pricing */}
                    <div className="flex items-center gap-4 md:gap-6">
                      <div className="text-right">
                        <div className="text-2xl font-bold text-white">
                          ${product.currentPrice.toLocaleString()}
                        </div>
                        <div className="text-sm text-gray-500 line-through">
                          ${product.originalPrice.toLocaleString()}
                        </div>
                      </div>
                      <div className={`text-2xl font-bold ${
                        discount >= 20 ? "text-green-400" : 
                        discount >= 10 ? "text-yellow-400" : "text-gray-400"
                      }`}>
                        -{discount}%
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleEdit(product)}
                          className="p-2 hover:bg-gray-700 rounded-lg transition"
                          title="Edit"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDelete(product.id)}
                          className="p-2 hover:bg-red-900/50 rounded-lg transition"
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Actions */}
        {products.length > 0 && (
          <div className="mt-6 flex justify-between items-center text-sm text-gray-500">
            <span>Data persists across sessions</span>
            <button
              onClick={handleClearAll}
              className="text-red-400 hover:text-red-300 transition"
            >
              Clear All Data
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
