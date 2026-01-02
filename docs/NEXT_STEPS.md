# Next Steps

## Session 2026-01-01: Inventory Discovery Improvements

Key discovery: **Expanding nationwide search from 5 to 18 zip codes found hidden inventory** (14" M4 Max in Atlanta & Las Vegas that was missed before).

See detailed findings:
- [INVENTORY_DISCOVERY_SUMMARY.md](./INVENTORY_DISCOVERY_SUMMARY.md) - What we learned
- [INVENTORY_FEATURES_PLAN.md](./INVENTORY_FEATURES_PLAN.md) - Implementation roadmap

### Quick Wins Identified
1. Expand `NATIONWIDE_ZIPCODES` in fetch-stores.js (5 min, high impact)
2. Check color variants when SKU sold out (user found Space Black had stock when Silver was gone)
3. Check ALL conditions at once instead of one at a time
4. Show `buttonState` (ADD_TO_CART vs SOLD_OUT) to indicate shippability

---

## Previous Session Summary

Completed:
1. Added Best Buy Clearance items (via Products API with clearance=true)
2. Added Clearance badge styling (red) to GUI
3. Find Stock feature is working (uses Firefox now)

Find Stock Status:
- Was failing with Chrome due to bot detection
- Fixed by switching to Firefox (fetch-stores.js now uses firefox instead of chromium)
- Tested and working - script completes successfully

---

## Handoff Prompt for Next Session

Continue working on the Tech Deal Finder app at /Users/paulgarcia/Dev/bestbuy-finder

## Current State
- Best Buy adapter fetches Open Box + Clearance items
- AAFES adapter fetches Monetate recommendations via Playwright (intercepts responses)
- Find Stock feature uses Playwright Firefox to check store inventory
- **Nationwide search needs expansion** - see INVENTORY_FEATURES_PLAN.md

## Known Issues / Next Steps
1. **Expand zip code coverage** - Priority 1, see plan
2. **Add shippability indicator** - Show if item can ship vs pickup-only
3. **Color variant discovery** - Auto-check alternate colors when sold out
4. **Multi-condition check** - Check Fair/Sat/Good/Exc in one click
5. **Certified Refurbished** - User will research and report back on how to add
6. **AAFES returns limited items** - Only gets ~50 items from Monetate recommendations

## To Test
```bash
source .env.local && node server.js
# Open: http://localhost:3000
```

## Key Files
- `adapters/bestbuy.js` - Open Box + Clearance fetching
- `adapters/aafes.js` - Monetate API via Playwright intercept
- `fetch-stores.js` - Store inventory lookup (Firefox) - **needs zip expansion**
- `server.js` - HTTP server with embedded React-like frontend
- `docs/INVENTORY_FEATURES_PLAN.md` - Improvement roadmap
