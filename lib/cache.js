/**
 * Simple JSON file cache with TTL
 */

const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, '..', 'cache');
const DEFAULT_TTL = 60 * 60 * 1000; // 1 hour

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function getCachePath(source) {
  return path.join(CACHE_DIR, `${source}.json`);
}

function read(source) {
  ensureCacheDir();
  const cachePath = getCachePath(source);

  if (!fs.existsSync(cachePath)) {
    return null;
  }

  try {
    const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    const age = Date.now() - data.timestamp;

    return {
      deals: data.deals,
      timestamp: data.timestamp,
      age,
      expired: age > DEFAULT_TTL
    };
  } catch (e) {
    return null;
  }
}

function write(source, deals) {
  ensureCacheDir();
  const cachePath = getCachePath(source);

  const data = {
    timestamp: Date.now(),
    deals
  };

  fs.writeFileSync(cachePath, JSON.stringify(data, null, 2));
}

function clear(source) {
  const cachePath = getCachePath(source);
  if (fs.existsSync(cachePath)) {
    fs.unlinkSync(cachePath);
  }
}

function clearAll() {
  ensureCacheDir();
  const files = fs.readdirSync(CACHE_DIR);
  for (const file of files) {
    if (file.endsWith('.json')) {
      fs.unlinkSync(path.join(CACHE_DIR, file));
    }
  }
}

module.exports = {
  read,
  write,
  clear,
  clearAll,
  DEFAULT_TTL
};
