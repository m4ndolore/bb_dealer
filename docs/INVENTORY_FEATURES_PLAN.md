# Inventory Features Implementation Plan

Based on discoveries from the 2026-01-01 inventory hunting session.

---

## Priority 1: Expanded Nationwide Search

### Problem
Current 5-zip search misses inventory in secondary markets (Atlanta, Las Vegas, Phoenix, etc.)

### Solution
Expand `NATIONWIDE_ZIPCODES` in `fetch-stores.js` from 5 to 18+ zips:

```javascript
const NATIONWIDE_ZIPCODES = [
  // Tier 1: Major metros (existing)
  '10001',  // NYC
  '90001',  // Los Angeles
  '60601',  // Chicago
  '77001',  // Houston
  '98101',  // Seattle

  // Tier 2: Secondary markets (add these)
  '33101',  // Miami
  '30301',  // Atlanta
  '02101',  // Boston
  '19101',  // Philadelphia
  '85001',  // Phoenix
  '92101',  // San Diego
  '75201',  // Dallas
  '48201',  // Detroit
  '55401',  // Minneapolis
  '63101',  // St. Louis
  '80201',  // Denver
  '89101',  // Las Vegas
];
```

### Implementation
- File: `fetch-stores.js`
- Effort: 5 minutes
- Impact: High - catches ~30% more inventory

---

## Priority 2: Show Shippability Status in GUI

### Problem
Users can't tell if an item ships nationwide or is pickup-only until they click "Find Stock"

### Solution
Add visual indicator based on `buttonState` from API:

```javascript
// In product card rendering
${p.buttonState === 'ADD_TO_CART'
  ? '<span class="px-2 py-1 bg-green-600 text-white text-xs rounded-lg">Ships Nationwide</span>'
  : '<span class="px-2 py-1 bg-amber-600 text-white text-xs rounded-lg">In-Store Only</span>'
}
```

### Implementation
1. Modify `adapters/bestbuy.js` to capture `buttonState` during product fetch
2. Pass through to normalized deal object
3. Display in `server.js` HTML template

### Files
- `adapters/bestbuy.js` - Add buttonState to API calls
- `lib/normalize.js` - Add buttonState to deal schema
- `server.js` - Update product card template

---

## Priority 3: Color Variant Discovery

### Problem
When SKU 6602753 (Silver) is sold out, user doesn't know 6602757 (Space Black) has stock

### Solution
Add "Check Other Colors" feature that queries Best Buy API for variants:

```javascript
async function findColorVariants(sku, apiKey) {
  // Get product name from SKU
  const product = await fetch(`https://api.bestbuy.com/v1/products/${sku}.json?apiKey=${apiKey}&show=name,color`);

  // Search for same model, different colors
  const searchTerms = product.name.replace(product.color, '').trim();
  const variants = await fetch(`https://api.bestbuy.com/v1/products(search=${encodeURIComponent(searchTerms)})?apiKey=${apiKey}&show=sku,name,color`);

  return variants.products.filter(p => p.sku !== sku);
}
```

### GUI Addition
- Add "Check Other Colors" button on SOLD_OUT items
- Show variant SKUs with their availability status
- Link directly to variant's open-box page

---

## Priority 4: Multi-Condition Check

### Problem
User has to manually check each condition (Fair, Satisfactory, Good, Excellent)

### Solution
"Find Stock" button checks ALL conditions simultaneously and displays combined results:

```javascript
// Check all conditions in parallel
const conditions = ['0', '1', '2', '3']; // fair, sat, good, exc
const results = await Promise.all(
  conditions.map(c => fetchStoresForCondition(sku, zipCode, c))
);

// Combine and display
const combined = {
  fair: results[0],
  satisfactory: results[1],
  good: results[2],
  excellent: results[3]
};
```

### GUI Display
```
┌─────────────────────────────────────────────────┐
│ Store Availability - SKU 6602747                │
├─────────────────────────────────────────────────┤
│ EXCELLENT: No stock                             │
│ GOOD: No stock                                  │
│ SATISFACTORY: No stock                          │
│ FAIR: 2 stores                                  │
│   • Buckhead, Atlanta GA - (404) 842-0938       │
│   • SW Las Vegas, NV - (702) 260-8707           │
└─────────────────────────────────────────────────┘
```

---

## Priority 5: Direct SKU Search

### Problem
Dashboard only shows items from category queries; user can't search specific SKU

### Solution
Add SKU search box to GUI header:

```html
<div class="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
  <span class="text-gray-400 text-sm">🔍</span>
  <input type="text"
         id="skuSearch"
         placeholder="Search SKU"
         maxlength="10"
         class="w-24 bg-transparent border-none text-white text-sm"
         onkeypress="if(event.key==='Enter') searchSku(this.value)">
</div>
```

### Backend
New endpoint: `GET /api/sku/:sku`
- Fetches product details from Best Buy API
- Checks all conditions for availability
- Returns normalized deal object

---

## Priority 6: Cache Freshness Indicator

### Problem
Dashboard shows items from cached data that may be sold out

### Solution
1. Show cache age in UI: "Data from 15 minutes ago"
2. Add visual staleness indicator (yellow/red) for old data
3. "Refresh" button with loading state

```javascript
// In /api/products response
{
  products: [...],
  cacheAge: 900000, // ms since last fetch
  cachedAt: "2026-01-01T10:30:00Z"
}
```

---

## Priority 7: Stock Alerts (Future)

### Problem
Hot deals sell out within hours

### Solution
Background job that:
1. Periodically checks user's saved SKUs
2. Sends notification when stock appears
3. Tracks price changes

### Architecture
```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│ User saves  │────▶│ Background   │────▶│ Push/Email  │
│ SKU to watch│     │ stock checker│     │ notification│
└─────────────┘     └──────────────┘     └─────────────┘
```

---

## Implementation Order

| Priority | Feature | Effort | Impact |
|----------|---------|--------|--------|
| 1 | Expand zip codes | 5 min | High |
| 2 | Shippability badge | 30 min | High |
| 3 | Multi-condition check | 1 hr | High |
| 4 | Color variants | 2 hr | Medium |
| 5 | Direct SKU search | 1 hr | Medium |
| 6 | Cache freshness | 30 min | Low |
| 7 | Stock alerts | 4 hr | High (future) |

---

## Quick Wins (Do Now)

### 1. Update fetch-stores.js zip codes
```bash
# Add to NATIONWIDE_ZIPCODES array in fetch-stores.js
'33101', '30301', '02101', '19101', '85001', '92101',
'75201', '48201', '55401', '63101', '80201', '89101'
```

### 2. Add condition to Find Stock button label
Change "Find Stock" to show which condition is being checked.

### 3. Log buttonState in console
Helps debug shippability issues while developing full solution.
