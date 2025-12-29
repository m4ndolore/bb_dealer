# AAFES Adapter - Design Document

**Date:** 2025-12-28
**Status:** Approved

## Overview

Wrap the existing AAFES/Monetate API integration into an adapter that fits the Tech Deal Finder architecture, enabling unified deal aggregation across Best Buy and AAFES sources.

## API Details

```
POST https://engine.monetate.net/api/engine/v1/decide/aafes
Content-Type: application/json
```

Payload structure:
```json
{
  "channel": "a-efad0a6e/p/shopmyexchange.com",
  "events": [
    {"eventType": "monetate:decision:DecisionRequest", "requestId": "req-<timestamp>"},
    {"eventType": "monetate:context:PageView", "url": "https://www.shopmyexchange.com/browse?query=aafes"}
  ],
  "monetateId": "<generated>"
}
```

Dynamic fields:
- `requestId`: `"req-" + Date.now()`
- `monetateId`: Generated per request

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `config/aafes.json` | Create | API URL, channel, base URL |
| `adapters/aafes.js` | Create | Fetch, normalize, cache |
| `lib/deals.js` | Update | Add AAFES to ADAPTERS |

## Config File

`config/aafes.json`:
```json
{
  "apiUrl": "https://engine.monetate.net/api/engine/v1/decide/aafes",
  "baseUrl": "https://www.shopmyexchange.com",
  "channel": "a-efad0a6e/p/shopmyexchange.com"
}
```

## Adapter Interface

```javascript
// adapters/aafes.js
module.exports = {
  SOURCE: 'aafes',
  fetchDeals(options) -> Promise<Deal[]>
};
```

## Field Mapping

| AAFES Field | Deal Field |
|-------------|------------|
| `id` / `itemGroupId` | `id` (prefixed "aafes-") |
| `title` | `name` |
| `brand` | `brand` |
| `price` | `originalPrice` |
| `salePrice` | `currentPrice` |
| calculated | `discount` |
| `"new"` (hardcoded) | `condition` |
| `"online"` (hardcoded) | `availability` |
| `baseUrl + link` | `url` |
| `imageLink` | `image` |
| `detectCategory(title)` | `category` |

## Integration

Update `lib/deals.js`:
```javascript
const aafesAdapter = require('../adapters/aafes');

const ADAPTERS = {
  bestbuy: bestbuyAdapter,
  aafes: aafesAdapter
};
```

## Not Included

- No environment variables (config file only)
- No webhook/alerting (was CLI-specific)
- No changes to cache, categories, normalize, or server modules
