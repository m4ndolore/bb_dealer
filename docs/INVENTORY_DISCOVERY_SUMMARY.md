# Inventory Discovery Summary

## Session Date: 2026-01-01

## Problem Statement

User was searching for specific M4 Max MacBook Pro open-box deals that appeared in the GUI dashboard but showed "SOLD OUT" when checking store availability. The standard 5-zipcode nationwide search was missing inventory that actually existed.

## Key Discoveries

### 1. Expanded Zip Code Coverage Finds More Inventory

**Before:** 5 strategic zip codes (NYC, LA, Chicago, Houston, Seattle)
```
10001, 90001, 60601, 77001, 98101
```

**After:** 18 zip codes covering more regions
```
96813, 10001, 90001, 60601, 77001, 98101,
33101, 30301, 02101, 19101, 85001, 92101,
75201, 48201, 55401, 63101, 80201, 89101
```

**Result:** Found 14" M4 Max (SKU 6602747) in Atlanta GA and Las Vegas NV - stores that were missed by the original 5-zip search.

### 2. SKU Color Variants Are Separate Inventory Pools

Same model, different colors = different SKUs with independent inventory:

| SKU | Model | Color | Status |
|-----|-------|-------|--------|
| 6602753 | 16" M4 Max 36GB/1TB | Silver | SOLD OUT |
| 6602757 | 16" M4 Max 36GB/1TB | Space Black | IN STOCK (5 stores) |

**Implication:** When a user's desired SKU is sold out, automatically check alternate color variants.

### 3. ButtonState Indicates Shippability

The `buttonState` field from the storeAvailability API reveals fulfillment options:

| ButtonState | Meaning |
|-------------|---------|
| `ADD_TO_CART` | Can ship nationwide OR pickup available |
| `SOLD_OUT` | Pickup only at specific stores (no shipping) |
| `NOT_AVAILABLE` | No inventory anywhere |

**Key insight:** Items showing `SOLD_OUT` may still have in-store pickup at specific locations - just can't ship.

### 4. Dashboard Data vs Real-Time Availability Gap

The Open Box API returns products that may sell out between:
- When the API data is cached
- When the user clicks "Find Stock"

**Evidence:** SKU 6602752 appeared on dashboard at $1,938 (-33%) but was completely sold out when checked in real-time.

### 5. Condition-Specific Inventory Varies Wildly

Same SKU, different conditions = completely different availability:

| SKU 6602757 | Stores |
|-------------|--------|
| Fair | 1 store |
| Satisfactory | 5 stores |
| Good | 5 stores (+ ADD_TO_CART) |
| Excellent | 0 stores |

## Products Searched This Session

| SKU | Description | Best Price | Availability |
|-----|-------------|------------|--------------|
| 6602747 | 14" M4 Max 36GB/1TB Silver | $2,341 (Fair) | 2 stores: Atlanta, Vegas |
| 6602752 | 16" M4 Pro 48GB/512GB Silver | $1,938 (Fair) | SOLD OUT |
| 6602753 | 16" M4 Max 36GB/1TB Silver | ~$2,800 | SOLD OUT all conditions |
| 6602756 | 16" M4 Pro 48GB/512GB Space Black | ~$2,400 | 11+ stores (Good) |
| 6602757 | 16" M4 Max 36GB/1TB Space Black | ~$3,200 | 5 stores including Aiea HI |

## Technical Implementation Details

### Effective Store Availability Check

```javascript
// Payload that works for open-box condition checking
const payload = {
  locationId: '',
  zipCode: zipCode,
  showOnShelf: true,
  lookupInStoreQuantity: false,
  consolidated: false,
  items: [{ sku: sku, condition: conditionCode, quantity: 1 }],
  onlyBestBuyLocations: true,
  pickupTypes: ['UPS_ACCESS_POINT', 'FEDEX_HAL'],
  showInStore: false,
  showOnlyOnShelf: false,
  xboxAllAccess: false
};

// POST to: /productfulfillment/c/api/2.0/storeAvailability
```

### Condition Codes
- `0` = Fair
- `1` = Satisfactory
- `2` = Good
- `3` = Excellent

### Finding Color Variants via API

```bash
curl "https://api.bestbuy.com/v1/products(search=macbook%20pro%2016%20m4%20max%2036gb)?apiKey=KEY&format=json&show=sku,name,color"
```

---

## Recommended GUI Enhancements

See [INVENTORY_FEATURES_PLAN.md](./INVENTORY_FEATURES_PLAN.md) for detailed implementation plan.
