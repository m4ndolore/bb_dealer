// scripts/generate-seed-zips.js
import fs from "fs";

const data = JSON.parse(fs.readFileSync("config/retail-stores.json", "utf8"));
const stores = data.stores;

// Haversine distance in miles
function distMiles(a, b) {
  const R = 3958.7613;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(h));
}

function farthestPointSeeds(stores, k) {
  // Start from an Outlet if possible; otherwise first store
  const outlets = stores.filter(s => s.type === "Outlet Center");
  const seed0 = outlets.length ? outlets[0] : stores[0];

  const chosen = [seed0];
  const remaining = new Set(stores.map(s => s.id));

  remaining.delete(seed0.id);

  // Track each store’s distance to its nearest chosen seed
  const nearest = new Map();
  for (const s of stores) nearest.set(s.id, distMiles(s, seed0));

  while (chosen.length < k) {
    let bestId = null;
    let bestD = -1;

    for (const id of remaining) {
      const d = nearest.get(id);
      if (d > bestD) {
        bestD = d;
        bestId = id;
      }
    }

    const next = stores.find(s => s.id === bestId);
    chosen.push(next);
    remaining.delete(bestId);

    // Update nearest distances
    for (const id of remaining) {
      const s = stores.find(x => x.id === id);
      const d = distMiles(s, next);
      if (d < nearest.get(id)) nearest.set(id, d);
    }
  }

  return chosen;
}

const K = Number(process.argv[2] || 60);
const seeds = farthestPointSeeds(stores, K);

// Output both ZIPs and store IDs (storeIds are your "locationId" values)
const out = {
  k: K,
  seedZips: [...new Set(seeds.map(s => s.zip))],
  seedStores: seeds.map(s => ({ id: s.id, zip: s.zip, name: s.name, state: s.state }))
};

fs.writeFileSync("config/generated-seeds.json", JSON.stringify(out, null, 2));
console.log(`Wrote config/generated-seeds.json with ${out.seedZips.length} ZIP seeds`);
