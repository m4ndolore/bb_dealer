#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const storesPath = path.join(__dirname, "..", "config", "retail-stores.json");
const storesData = JSON.parse(fs.readFileSync(storesPath, "utf8"));
const stores = storesData.stores || [];

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

function farthestPointSeeds(storesList, k) {
  const outlets = storesList.filter(s => s.type === "Outlet Center");
  const seed0 = outlets.length ? outlets[0] : storesList[0];

  const chosen = [seed0];
  const remaining = new Set(storesList.map(s => s.id));
  remaining.delete(seed0.id);

  const nearest = new Map();
  for (const s of storesList) nearest.set(s.id, distMiles(s, seed0));

  while (chosen.length < k && remaining.size > 0) {
    let bestId = null;
    let bestD = -1;

    for (const id of remaining) {
      const d = nearest.get(id);
      if (d > bestD) {
        bestD = d;
        bestId = id;
      }
    }

    const next = storesList.find(s => s.id === bestId);
    chosen.push(next);
    remaining.delete(bestId);

    for (const id of remaining) {
      const s = storesList.find(x => x.id === id);
      const d = distMiles(s, next);
      if (d < nearest.get(id)) nearest.set(id, d);
    }
  }

  return chosen;
}

const K = Number(process.argv[2] || 60);
const seeds = farthestPointSeeds(stores, K);

const out = {
  k: K,
  seedZips: [...new Set(seeds.map(s => s.zip))],
  seedStores: seeds.map(s => ({ id: s.id, zip: s.zip, name: s.name, state: s.state })),
};

const outPath = path.join(__dirname, "..", "config", "generated-seeds.json");
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`Wrote ${outPath} with ${out.seedZips.length} ZIP seeds`);
