# Best Buy M4/M5 MacBook Finder

Find open-box M4/M5 MacBook deals at Best Buy with real-time inventory and store availability.

## Features

- Searches Best Buy's Open Box API for M4/M5 MacBooks (Air & Pro)
- Filters by processor, RAM (16GB+, 24GB+, etc.), condition, and availability
- Shows exact pricing and discount percentages
- **Find Stock**: Shows actual stores with open-box inventory near you
- Sorts by discount, price, savings, or RAM

## Setup

1. **Get a Best Buy API key** (free): https://developer.bestbuy.com/
   - Sign up and create an app to get your key

2. **Install dependencies**:
   ```bash
   cd bestbuy-finder
   npm install
   ```
   This will install Playwright and download Chromium automatically.

3. **Set your API key**:
   ```bash
   export BBY_API_KEY="your_api_key_here"
   ```
   Or add to `~/.zshrc` for permanence.

4. **Run the server**:
   ```bash
   npm start
   # or
   node server.js
   ```

5. **Open**: http://localhost:3000 (or set PORT=8080 if 3000 is busy)

## Usage

1. Enter your zip code in the header
2. Browse M4/M5 MacBook open-box inventory
3. Filter by processor, RAM, condition, availability (Ships vs In-Store)
4. Click **"📍 Find Stock"** on in-store items to see which stores have that open-box unit
5. Click **"View →"** to go directly to Best Buy's product page

## Files

- `server.js` - Main Node.js server with embedded HTML/CSS/JS frontend
- `fetch-stores.js` - Playwright script to get open-box store locations
- `package.json` - Dependencies

## How It Works

1. **Product data**: Uses Best Buy's public Open Box API to find M4/M5 MacBooks
2. **Store availability**: Uses Playwright to load the product page in a real browser and capture the store availability data (Best Buy blocks direct API calls from scripts)

node scripts/test-availability.js --sku 6602752 --conditions fair,good,excellent --zip 96734

## Environment Variables

- `BBY_API_KEY` - Required for variant lookups and open-box shipping offers
- `BESTBUY_API_KEY` - Required for existing product deal fetches (still supported for new endpoints if BBY_API_KEY is not set)
- `PORT` - Optional. Server port (default: 3000)

## Inventory APIs

- `POST /api/find-stock`
  - Body: `{ "skus": ["6602747"], "conditions": ["fair","good","excellent"], "seedZips": ["30303"], "maxZips": 40 }`
  - Returns store hits enriched with store metadata and open-box offer summaries.
- `GET /api/store-scan?storeId=2651&q=macbook%20pro&ram=48`
  - Uses a store-pinned search URL to list what is available at a specific store.

## Seed ZIPs

- Default seed list lives in `config/seed-zips.js` (SEED_ZIPS_80).
- Generate a new farthest-point seed list:
  ```bash
  node scripts/generate-seed-zips.js 80
  ```
  Output: `config/generated-seeds.json`

## Quick Tests

```bash
node scripts/test-availability.js --sku 6602747 --conditions fair,good,excellent --zip 30303
node scripts/test-store-scan.js --storeId 2651 --q "macbook pro m4 max 36gb 1tb"
```
