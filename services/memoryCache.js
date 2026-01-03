// services/memoryCache.js

export function createTtlCache({ ttlMs, maxEntries = 500 } = {}) {
  const map = new Map();

  function get(key) {
    const entry = map.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      map.delete(key);
      return null;
    }
    // Refresh LRU order
    map.delete(key);
    map.set(key, entry);
    return entry.value;
  }

  function set(key, value) {
    map.set(key, { value, expiresAt: Date.now() + ttlMs });
    if (map.size > maxEntries) {
      const oldestKey = map.keys().next().value;
      map.delete(oldestKey);
    }
  }

  function prune() {
    const now = Date.now();
    for (const [key, entry] of map.entries()) {
      if (entry.expiresAt <= now) map.delete(key);
    }
  }

  return { get, set, prune };
}
