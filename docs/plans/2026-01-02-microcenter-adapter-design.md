# Micro Center Adapter Design

**Date:** 2026-01-02
**Status:** Approved

## Overview

Add Micro Center as a new source for the Tech Deal Finder, focusing on open-box and clearance deals on expensive hardware (Apple priority, but all categories). This expands beyond the original roadmap which had Apple Refurbished next.

## Requirements

- **Products:** All categories, with Apple as priority
- **Deal threshold:** User-configurable via sliders (not hard-coded)
- **Target discounts:** 30-70% off (typical for open-box/clearance)
- **Location handling:** Show all deals, Find Stock sorts by distance from user's zip
- **Data source:** Web scraping (no public API available)

## Architecture

### New Adapter: `adapters/microcenter.js`

Follows existing adapter pattern:

```javascript
// adapters/microcenter.js
const https = require('https');
const { createDeal } = require('../lib/normalize');
const { detectCategory } = require('../lib/categories');
const cache = require('../lib/cache');

const SOURCE = 'microcenter';

async function fetchDeals(options = {}) {
  // Check cache first
  const cached = cache.read(SOURCE);
  if (cached && !cached.expired) {
    return cached.deals;
  }

  // Scrape open-box and clearance pages
  const urls = [
    'https://www.microcenter.com/site/products/open-box.aspx',
    'https://www.microcenter.com/site/content/clearance-outlet.aspx'
  ];

  // Fetch HTML, parse products, normalize
  // ...
}

module.exports = { SOURCE, fetchDeals };
```

### Data Flow

```
Micro Center Website
        ↓ (HTML scrape via https)
adapters/microcenter.js
        ↓ (normalize via lib/normalize.js)
lib/deals.js (aggregator)
        ↓
server.js /api/products?source=microcenter
        ↓
GUI (Micro Center tab with filters)
```

### Scraping Strategy

**Approach:** Simple HTTP fetch first, upgrade to Playwright only if needed.

**Target URLs:**
- Open Box: `https://www.microcenter.com/site/products/open-box.aspx`
- Clearance: `https://www.microcenter.com/site/content/clearance-outlet.aspx`
- Category-specific (Apple, Laptops, GPUs) as needed

**Data to Extract:**
- Product name
- SKU
- Original price / Sale price
- Calculated discount %
- Category
- Store availability
- Product URL
- Image URL

**Fallback:** If JavaScript-rendered content is missed, upgrade to Playwright like AAFES adapter.

## GUI Changes

### Tab Navigation

```
┌─────────────┬───────────────┬─────────┐
│  Best Buy   │  Micro Center │  AAFES  │
└─────────────┴───────────────┴─────────┘
```

Each tab has identical filter controls with tab-specific state.

### New Filter Controls

**Discount Slider:**
```
Min Discount: [====●===========] 25%
              0%              70%+
```
- Single slider sets minimum discount threshold
- Shows count of matching items
- Default: 0% (show all)

**Price Range Slider:**
```
Price: [$●=============●=====] $500 - $3000
       $0                    $5000+
```
- Dual-handle slider for min/max
- Default: $0 - $5000+ (show all)

**Filter Placement:**
```
┌─ Filters ─────────────────────────────────────┐
│ Category: [All ▼]  Processor: [All ▼]        │
│ Condition: [All ▼]  Sort: [Discount % ▼]     │
│                                               │
│ Min Discount: [====●=======] 20%+            │
│ Price Range:  [$●=======●===] $200 - $3000   │
└───────────────────────────────────────────────┘
```

### Source Badge Colors
- Best Buy: Blue
- Micro Center: Green
- AAFES: Orange

### State Persistence
- Selected tab persists in localStorage
- Filter settings are per-tab

## Find Stock Behavior

When user clicks "Find Stock" on a Micro Center item:

1. User's zip code is used (same input as Best Buy)
2. Fetch store availability for that SKU
3. Display all ~25 Micro Center stores sorted by distance
4. Show stock status: "In Stock" / "Out of Stock"

**Modal Display:**
```
┌─────────────────────────────────────────────────┐
│ Store Availability - MacBook Pro 14" M4        │
│ SKU: 123456                                     │
├─────────────────────────────────────────────────┤
│ ✓ Tustin, CA (12 mi) - In Stock                │
│ ✓ Santa Ana, CA (18 mi) - In Stock             │
│ ✗ Los Angeles, CA (35 mi) - Out of Stock       │
│ ✓ Denver, CO (850 mi) - In Stock               │
│   ...                                          │
└─────────────────────────────────────────────────┘
│           [View on Micro Center →]             │
└─────────────────────────────────────────────────┘
```

**Implementation Options:**
- Scrape product detail page for store inventory dropdown
- Or discover Micro Center's internal store availability endpoint
- Cache store locations (they rarely change)

## Error Handling

**Scraping Failures:**
- Site down or blocked: "Unable to load Micro Center deals" with retry button
- HTML structure changes: Log error, return empty array, don't crash other sources

**Empty Results:**
- No matching deals: "No deals found. Try adjusting your filters."
- No inventory at all: "No open-box or clearance items available right now."

**Rate Limiting:**
- 1-2 second delay between page fetches
- 15-30 minute cache TTL
- Show cache age in UI

**Store Distance:**
- Use zip code centroid lookup table
- Fallback: Show stores alphabetically if lookup fails

**Partial Data:**
- Missing price: Show "Price not available"
- Missing store data: Show "Check website for availability"

## Implementation Phases

### Phase 1: Basic Scraping (MVP) - 2-3 hours
- Create `adapters/microcenter.js`
- Scrape open-box and clearance pages
- Parse product name, prices, discount %, URL, image
- Add to `/api/products` endpoint
- Add "Micro Center" tab to GUI (basic list view)

### Phase 2: Filters & Sliders - 1-2 hours
- Add discount slider to filter bar
- Add price range slider
- Apply filters client-side
- Persist filter state in localStorage

### Phase 3: Find Stock - 2-3 hours
- Discover Micro Center's per-store inventory mechanism
- Implement store availability modal
- Add zip-to-distance calculation
- Sort stores by distance

### Phase 4: Polish - 1-2 hours
- Handle edge cases gracefully
- Add cache freshness indicator
- Category-specific scraping
- Upgrade to Playwright if needed

## Files to Create/Modify

**New Files:**
- `adapters/microcenter.js` - Main adapter

**Modified Files:**
- `lib/deals.js` - Add microcenter to sources
- `lib/categories.js` - Add any new categories (GPUs, etc.)
- `server.js` - Add tab UI, slider filters, Micro Center endpoints

## Open Questions

1. Does Micro Center have an internal store availability API we can use?
2. What's the exact HTML structure of their product listings?
3. Do they rate-limit or block scrapers?

These will be answered during Phase 1 implementation.
