#!/usr/bin/env node

function parseArg(flag, fallback = null) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return fallback;
  return process.argv[idx + 1];
}

async function main() {
  const storeId = parseArg("--storeId");
  const q = parseArg("--q", "");
  const ram = parseArg("--ram");

  if (!storeId) {
    console.error("Usage: node scripts/test-store-scan.js --storeId 2651 --q \"macbook pro\" --ram \"48 gigabytes\"");
    process.exit(1);
  }

  const extraFacets = [];
  if (ram) {
    const trimmed = String(ram).trim();
    const ramLabel = /^\d+$/.test(trimmed) ? `${trimmed} gigabytes` : trimmed;
    extraFacets.push(`systemmemoryram_facet=RAM~${ramLabel}`);
  }

  const { fetchStorePinnedResults } = await import("../services/storePinnedSearch.js");
  const result = await fetchStorePinnedResults({ storeId, st: q, extraFacets });

  console.log(JSON.stringify({
    url: result.url,
    hitCount: result.results.length,
    results: result.results.slice(0, 5),
  }, null, 2));
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
