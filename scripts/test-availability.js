#!/usr/bin/env node

function parseArg(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return fallback;
  return process.argv[idx + 1];
}

async function main() {
  const skuArg = parseArg("--sku");
  const conditionsArg = parseArg("--conditions", "fair,good,excellent");
  const zipCode = parseArg("--zip", "30303");

  if (!skuArg) {
    console.error("Usage: node scripts/test-availability.js --sku 6602747 --conditions fair,good,excellent --zip 30303");
    process.exit(1);
  }

  const skus = skuArg.split(",").map(s => s.trim()).filter(Boolean);
  const conditions = conditionsArg
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

  const { getStoreAvailability, mapConditionCodeToLabel } = await import("../services/bestbuyAvailability.js");
  const { hits } = await getStoreAvailability({ zipCode, skus, conditions });

  const cleaned = hits.map(h => ({
    sku: h.sku,
    conditionCode: h.conditionCode,
    condition: mapConditionCodeToLabel(h.conditionCode),
    storeId: h.storeId,
    qty: h.qty,
  }));

  console.log(JSON.stringify({
    zipCode,
    skus,
    conditions,
    hitCount: cleaned.length,
    hits: cleaned.slice(0, 5),
  }, null, 2));
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
