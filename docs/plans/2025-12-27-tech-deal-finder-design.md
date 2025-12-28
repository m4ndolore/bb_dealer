# Tech Deal Finder - Design Document

**Date:** 2025-12-27
**Status:** Approved

## Overview

A unified web dashboard aggregating tech deals from multiple sources for a software development startup. Optimized for finding discounted storage, compute, memory, tablets, and laptops.

## Data Sources

| Source | Method | Status |
|--------|--------|--------|
| Best Buy Open-Box | Open Box API + Playwright | Partially built (laptops only) |
| AAFES/Exchange | Monetate API | Script exists, needs integration |
| Apple Refurbished | Web scraping | New |
| Amazon Warehouse | Product Advertising API or scraping | New |

## Categories

| Category | Examples |
|----------|----------|
| Storage | SSDs (NVMe, external), NAS devices |
| Compute | Mac Mini, Raspberry Pi, Intel NUC, mini PCs |
| Memory | RAM modules, upgrades |
| Tablets | iPad Pro, iPad Air |
| Laptops | M3/M4/M5 MacBooks |

## Discount Thresholds

| Category | Good Deal | Great Deal |
|----------|-----------|------------|
| Storage | 25% | 40% |
| Compute | 20% | 30% |
| Memory | 25% | 40% |
| Tablets | 20% | 25% |
| Laptops | 20% | 25% |

## Unified Data Model

```javascript
Deal {
  id: string
  source: "bestbuy" | "apple" | "amazon" | "aafes"
  category: "storage" | "compute" | "memory" | "tablets" | "laptops"

  name: string
  brand: string

  originalPrice: number
  currentPrice: number
  discount: number  // percentage

  condition: "new" | "refurbished" | "open-box" | "warehouse"
  availability: "online" | "in-store" | "both"

  url: string
  image: string

  fetchedAt: timestamp
}
```

## User Interface

### Layout

Single-page app with filtering and sorting:

- **Filters:** Category, Source, Min Discount, Condition
- **Sort:** Discount % (default), Price
- **Visual indicators:**
  - Green badge: GREAT DEAL (exceeds great threshold)
  - Yellow badge: GOOD DEAL (exceeds good threshold)
- **Source badges:** Color-coded by source

### Filter/Sort Priority

1. Discount percentage (primary sort)
2. Category (filter)
3. Source (filter)
4. Price (secondary sort)

## Architecture

### File Structure

```
tech-deal-finder/
├── server.js                 # Main HTTP server
├── adapters/
│   ├── bestbuy.js           # Best Buy Open Box API
│   ├── apple.js             # Apple Refurbished scraper
│   ├── amazon.js            # Amazon Warehouse
│   └── aafes.js             # AAFES Monetate API
├── lib/
│   ├── cache.js             # JSON file caching
│   ├── normalize.js         # Normalize to Deal model
│   └── categories.js        # Category detection & thresholds
├── cache/
│   ├── bestbuy.json
│   ├── apple.json
│   ├── amazon.json
│   └── aafes.json
└── package.json
```

### API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /` | Serve single-page app |
| `GET /api/deals` | Return cached deals |
| `POST /api/refresh` | Trigger background refresh |
| `GET /api/refresh/status` | Check refresh progress |

### Data Flow

1. User loads page - server returns cached deals instantly
2. Frontend triggers background refresh
3. Server fetches all sources in parallel
4. Each adapter normalizes to Deal model, writes to cache
5. Frontend reloads when refresh complete

### Fetch Strategy

- **On load:** Show cached data (< 1 hour old)
- **Background:** Refresh all sources in parallel
- **Manual:** Refresh button for force update
- **Rate limiting:** Respect per-source limits

### Tech Stack

- Node.js server
- Vanilla JS frontend
- Tailwind CSS
- Playwright for scraping
- JSON file cache (no database)

## Implementation Phases

### Phase 1: Refactor & Expand Best Buy

- Extract logic into `adapters/bestbuy.js`
- Add categories: Storage, Compute, Memory, Tablets
- Update UI with category/source filters
- Add caching layer

### Phase 2: AAFES Adapter

- Wrap existing `shop_my_exchange.js` into adapter
- Add category detection from product titles
- Integrate into unified refresh flow

### Phase 3: Apple Refurbished Adapter

- Scrape apple.com/shop/refurbished
- Parse Mac and iPad sections
- Calculate discount from original MSRP

### Phase 4: Amazon Warehouse Adapter

- Try Product Advertising API first
- Fallback to scraping Warehouse Deals pages
- Parse condition and pricing

### Phase 5: Polish

- Loading states during refresh
- Per-source error handling
- Persist filter preferences in localStorage
