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
   export BESTBUY_API_KEY="your_api_key_here"
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

## Environment Variables

- `BESTBUY_API_KEY` - Required. Your Best Buy API key
- `PORT` - Optional. Server port (default: 3000)