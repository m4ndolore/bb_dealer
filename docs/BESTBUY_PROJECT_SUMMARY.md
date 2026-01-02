# Best Buy Deal Finder - Project Summary

## What This Project Does

A Node.js web application that finds discounted Best Buy products (Open Box + Clearance) and shows real-time store availability. Users enter their zip code, browse deals, and click "Find Stock" to see which stores have items for pickup.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         server.js                               │
│  HTTP server with embedded HTML/CSS/JS frontend (Tailwind)      │
│  - GET /              → SPA frontend                            │
│  - GET /api/products  → Aggregated deals from all sources       │
│  - GET /api/openbox-stores/:sku → Store availability (Playwright)│
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌──────────────────────────┐    ┌──────────────────────────────────┐
│  adapters/bestbuy.js     │    │  fetch-stores.js                 │
│  - Open Box API          │    │  - Playwright (Firefox)          │
│  - Clearance API         │    │  - Calls storeAvailability API   │
│  - Normalize to common   │    │  - Nationwide search (5 zips)    │
│    deal schema           │    │  - Returns stores with stock     │
└──────────────────────────┘    └──────────────────────────────────┘
```

## Key Files (Best Buy Only)

| File | Purpose |
|------|---------|
| `server.js` | HTTP server + embedded frontend |
| `adapters/bestbuy.js` | Fetches Open Box + Clearance from Best Buy API |
| `fetch-stores.js` | Playwright script to find store availability |
| `lib/deals.js` | Aggregates deals from adapters |
| `lib/normalize.js` | Extracts processor/RAM/storage from product names |
| `config/stores.json` | All 1,386 Best Buy locations (full details) |
| `config/retail-stores.json` | 904 retail stores only (Big Box + Outlet) |
| `config/stores-lookup.json` | Quick lookup: storeId → {name, city, state, zip} |
| `scripts/fetch-all-stores.js` | Script to refresh store data from API |

## Current Capabilities

### Working
- Fetch Open Box items via `/beta/products/openBox` API
- Fetch Clearance items via Products API with `clearance=true`
- Parse processor (M4/M4 Pro/M4 Max), RAM, storage from product names
- Show discount %, savings, condition badges
- "Find Stock" button → spawns Playwright to find stores with open-box item
- Nationwide search across 5 strategic zip codes
- Anti-bot detection bypass (Firefox + custom UA + webdriver override)

### Data We Have
- **904 retail stores** with id, name, address, city, state, zip, lat/lng, phone
- Store types: 886 Big Box + 18 Outlet Center

## APIs We Use

### 1. Best Buy Products API (requires API key)
```bash
# Open Box items
GET https://api.bestbuy.com/beta/products/openBox?apiKey=KEY&categoryId=abcat0502000

# Clearance items
GET https://api.bestbuy.com/v1/products(clearance=true&categoryId=abcat0502000)?apiKey=KEY

# All stores
GET https://api.bestbuy.com/v1/stores?apiKey=KEY&format=json
```

### 2. Best Buy Internal storeAvailability API (no key, needs session)
```javascript
// Called from browser context after loading BB page
POST /productfulfillment/c/api/2.0/storeAvailability
{
  "zipCode": "96813",
  "items": [{ "sku": "6551410", "condition": "0", "quantity": 1 }],
  "showOnShelf": true,
  "onlyBestBuyLocations": true
}
```
Condition codes: 0=fair, 1=satisfactory, 2=good, 3=excellent

---

## What We Could Use Help With

### Priority 1: Store-Based Inventory Search (New Feature)

**Discovery**: Best Buy's search page supports a store-specific facet:
```
storepickupstores_facet=Store Availability - In Store Pickup~{store_id}
```

This inverts the query - instead of "which stores have SKU X?", we can ask "what does Store Y have in stock?"

**Files to reference**:
- `docs/example.py` - Proof of concept Python script
- `config/retail-stores.json` - All 904 retail store IDs

**Tasks**:
1. Create `/api/store-inventory/:storeId` endpoint
2. Build faceted search URL with store ID filter
3. Scrape product tiles from search results (`li.sku-item`)
4. Return all Open Box / Clearance items at that store
5. Add "Browse Nearby Stores" UI - show stores near user's zip, click to see inventory

### Priority 2: Expand Nationwide Search

Current `fetch-stores.js` only checks 5 zip codes. Testing showed items in Atlanta/Las Vegas were missed.

**Task**: Expand `NATIONWIDE_ZIPCODES` to 15-20 strategic locations for better coverage.

### Priority 3: Multi-Condition Lookup

Currently users must click "Find Stock" separately for each condition (Fair, Good, Excellent).

**Task**: Check all conditions in a single request or parallel requests, show consolidated results.

### Priority 4: Color Variant Discovery

User found Space Black MacBook had stock when Silver was sold out. Same model, different SKU.

**Task**: When an item is sold out, automatically check alternate color SKUs for the same model.

### Priority 5: Shippability Indicator

The `storeAvailability` API returns `buttonState` (ADD_TO_CART vs SOLD_OUT) which indicates if an item can ship nationwide vs pickup-only.

**Task**: Surface this in the UI - show "Ships Nationwide" badge when available.

---

## Environment Setup

```bash
# Install dependencies (also installs Playwright Firefox)
npm install

# Set API key
echo "BESTBUY_API_KEY=your_key" > .env.local

# Run server
node server.js
# Open http://localhost:3000

# Refresh store data (optional)
node scripts/fetch-all-stores.js

# Test store lookup directly
node fetch-stores.js 6551410 96813 2
# Args: <sku> <zipCode> <condition> [productPath]
```

## Useful Commands

```bash
# Debug mode (opens browser window)
HEADLESS=false node fetch-stores.js 6551410 96813 0

# Check a specific store's inventory (example.py approach)
# Not yet implemented - this is Priority 1 task
```

---

## Code Patterns

### Adding a new feature to the frontend
The frontend is embedded in `server.js` as a template literal. Vanilla JS with Tailwind CSS classes.

### Adding a new Best Buy data source
1. Add fetch logic to `adapters/bestbuy.js`
2. Normalize to standard deal schema (see `lib/normalize.js`)
3. Return array of deals with: `sku, name, url, currentPrice, originalPrice, discount, condition, availability, source, category`

### Playwright scripts
- Use Firefox (Chrome gets blocked)
- Load a BB page first to get session cookies
- Call internal APIs via `page.evaluate()`
- Output JSON to stdout, logs to stderr
