# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Best Buy M4/M5 MacBook Finder - A Node.js web application that searches Best Buy's Open Box API for discounted M4/M5 MacBooks and shows real-time store availability using Playwright for web scraping.

## Commands

```bash
# Install dependencies (also installs Playwright Chromium)
npm install

# Start the server (requires BESTBUY_API_KEY env var)
BESTBUY_API_KEY=your_key node server.js
# or
npm start

# Run the store fetcher script directly (used internally by server)
node fetch-stores.js <sku> <zipCode> <condition> [productPath]

# Examples:
# With productPath (faster, skips URL resolution):
node fetch-stores.js 6551410 96817 2 "apple-macbook-air.../JJGCQ8R67J"

# Without productPath (resolves via API redirect):
node fetch-stores.js 6551410 96817 2

# Debug mode (non-headless browser)
HEADLESS=false node fetch-stores.js 6551410 96817 2
```

## Architecture

### Core Files

- **server.js** - Single-file Node.js HTTP server with embedded HTML/CSS/JS frontend
  - Serves the SPA at `/`
  - `/api/products` - Fetches M4/M5 MacBooks from Best Buy Open Box API, filters by processor, expands offers by condition
  - `/api/openbox-stores/:sku` - Spawns `fetch-stores.js` subprocess to get store availability
  - `/api/stores/:sku` - Direct API call for regular (non-open-box) inventory

- **fetch-stores.js** - Playwright script for fetching open-box store availability
  - Accepts optional `productPath` arg to skip URL resolution step
  - Loads open-box page to establish browser session with cookies
  - Calls `/productfulfillment/c/api/2.0/storeAvailability` API directly via `page.evaluate`
  - Outputs JSON to stdout, logs to stderr

- **adapters/microcenter.js** - Micro Center Open Box + Clearance scraping
  - Scrapes Micro Center website for Open Box and Clearance deals
  - Fetches products by category with pagination support
  - Normalizes product data to common schema (title, price, discount, etc.)
  - Supports filtering by discount percentage and price range

- **fetch-microcenter-stores.js** - Micro Center store inventory lookup
  - Checks product availability at Micro Center store locations
  - Uses Playwright for browser-based scraping
  - Returns store name, stock status, and location info

### Supporting Libraries

- **lib/geo.js** - Geographic utilities for location-based features
  - Distance calculations between coordinates
  - Zip code to coordinate lookup
  - Store proximity sorting

- **lib/microcenter-stores.js** - Micro Center store location data
  - Complete list of Micro Center store locations
  - Store metadata (address, coordinates, store ID)
  - Used by fetch-microcenter-stores.js for availability lookups

### Data Flow

1. Frontend loads → calls `/api/products`
2. Server queries Best Buy Open Box API (`/beta/products/openBox`)
3. Filters results for M4/M5 processors, expands each product's condition offers
4. User clicks "Find Stock" → frontend calls `/api/openbox-stores/:sku`
5. Server spawns Playwright subprocess → browser loads BB page → intercepts store API → returns locations

### Other Files (experimental/unused)

- `inventory-tracker.jsx`, `bestbuy-search.jsx` - React component prototypes (not used by main app)
- `shop_my_exchange.js` - Unrelated Monetate API script

## Key Implementation Details

- Rate limiting: 1s delay between API pages, 3s backoff on 403
- Condition codes: 0=fair, 1=satisfactory, 2=good, 3=excellent
- Playwright uses anti-detection (custom UA, webdriver property override)
- Frontend uses Tailwind CSS via CDN, vanilla JS for reactivity
