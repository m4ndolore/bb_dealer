/**
 * Geographic utilities for calculating distances and zip code lookups
 */

// Approximate coordinates for common US zip codes
// This is a subset - for production, use a proper geocoding API
const ZIP_COORDINATES = {
  // California
  '90001': { lat: 33.9425, lng: -118.2551 }, // Los Angeles
  '90210': { lat: 34.0901, lng: -118.4065 }, // Beverly Hills
  '92780': { lat: 33.7379, lng: -117.8311 }, // Tustin
  '95050': { lat: 37.3496, lng: -121.9574 }, // Santa Clara
  '94102': { lat: 37.7813, lng: -122.4167 }, // San Francisco

  // Texas
  '75001': { lat: 32.9537, lng: -96.8389 }, // Dallas area
  '75243': { lat: 32.9185, lng: -96.7711 }, // Dallas
  '77001': { lat: 29.7544, lng: -95.3532 }, // Houston
  '77081': { lat: 29.7372, lng: -95.4741 }, // Houston (MC area)
  '78727': { lat: 30.4418, lng: -97.6961 }, // Austin

  // Colorado
  '80201': { lat: 39.7392, lng: -104.9903 }, // Denver
  '80237': { lat: 39.6426, lng: -104.9037 }, // Denver (MC area)

  // Florida
  '33101': { lat: 25.7617, lng: -80.1918 }, // Miami
  '33144': { lat: 25.7679, lng: -80.3231 }, // Miami (MC area)

  // Georgia
  '30096': { lat: 34.0054, lng: -84.1396 }, // Duluth
  '30067': { lat: 33.9324, lng: -84.4685 }, // Marietta
  '30301': { lat: 33.7490, lng: -84.3880 }, // Atlanta

  // Illinois
  '60601': { lat: 41.8781, lng: -87.6298 }, // Chicago
  '60647': { lat: 41.9209, lng: -87.7011 }, // Chicago (MC area)
  '60559': { lat: 41.8029, lng: -87.9745 }, // Westmont

  // Indiana
  '46250': { lat: 39.9116, lng: -86.0565 }, // Indianapolis (MC area)

  // Kansas
  '66212': { lat: 38.9556, lng: -94.6708 }, // Overland Park

  // Massachusetts
  '02139': { lat: 42.3656, lng: -71.1040 }, // Cambridge
  '02101': { lat: 42.3601, lng: -71.0589 }, // Boston

  // Maryland
  '20852': { lat: 39.0510, lng: -77.1191 }, // Rockville
  '21234': { lat: 39.3943, lng: -76.5455 }, // Parkville

  // Michigan
  '48071': { lat: 42.5087, lng: -83.1055 }, // Madison Heights

  // Minnesota
  '55416': { lat: 44.9293, lng: -93.3501 }, // St. Louis Park

  // Missouri
  '63144': { lat: 38.6285, lng: -90.3459 }, // Brentwood

  // North Carolina
  '28217': { lat: 35.1687, lng: -80.8808 }, // Charlotte

  // New Jersey
  '07504': { lat: 40.9068, lng: -74.1324 }, // Paterson

  // New York
  '10001': { lat: 40.7484, lng: -73.9967 }, // NYC
  '11590': { lat: 40.7587, lng: -73.5898 }, // Westbury
  '11232': { lat: 40.6572, lng: -74.0063 }, // Brooklyn
  '11367': { lat: 40.7302, lng: -73.8188 }, // Flushing
  '10704': { lat: 40.9156, lng: -73.8541 }, // Yonkers

  // Ohio
  '43214': { lat: 40.0546, lng: -83.0220 }, // Columbus
  '44124': { lat: 41.5101, lng: -81.4401 }, // Mayfield Heights
  '45241': { lat: 39.2706, lng: -84.4138 }, // Sharonville

  // Pennsylvania
  '19087': { lat: 40.0453, lng: -75.3618 }, // St. Davids

  // Virginia
  '22031': { lat: 38.8596, lng: -77.2730 }, // Fairfax

  // Arizona
  '85018': { lat: 33.4780, lng: -111.9911 }, // Phoenix

  // Hawaii
  '96813': { lat: 21.3069, lng: -157.8583 }, // Honolulu
  '96817': { lat: 21.3339, lng: -157.8656 }, // Honolulu

  // Washington
  '98101': { lat: 47.6062, lng: -122.3321 }, // Seattle
};

/**
 * Calculate distance between two points using Haversine formula
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lng1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lng2 - Longitude of point 2
 * @returns {number} - Distance in miles
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 3959; // Earth's radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}

/**
 * Get approximate coordinates for a zip code
 * @param {string} zipCode - 5-digit US zip code
 * @returns {Object|null} - { lat, lng } or null if not found
 */
function getZipCoordinates(zipCode) {
  const zip = zipCode.substring(0, 5);

  // Direct lookup
  if (ZIP_COORDINATES[zip]) {
    return ZIP_COORDINATES[zip];
  }

  // Try to find a nearby zip (same 3-digit prefix)
  const prefix = zip.substring(0, 3);
  for (const [code, coords] of Object.entries(ZIP_COORDINATES)) {
    if (code.startsWith(prefix)) {
      return coords;
    }
  }

  return null;
}

/**
 * Calculate distance from a zip code to a store
 * @param {string} zipCode - User's zip code
 * @param {Object} store - Store object with lat/lng
 * @returns {number|null} - Distance in miles or null if zip not found
 */
function distanceToStore(zipCode, store) {
  const coords = getZipCoordinates(zipCode);
  if (!coords || !store.lat || !store.lng) {
    return null;
  }
  return haversineDistance(coords.lat, coords.lng, store.lat, store.lng);
}

/**
 * Sort stores by distance from a zip code
 * @param {string} zipCode - User's zip code
 * @param {Array} stores - Array of store objects with lat/lng
 * @returns {Array} - Stores sorted by distance, with distance property added
 */
function sortStoresByDistance(zipCode, stores) {
  const coords = getZipCoordinates(zipCode);

  return stores
    .map(store => {
      const distance = coords && store.lat && store.lng
        ? haversineDistance(coords.lat, coords.lng, store.lat, store.lng)
        : null;
      return { ...store, distance };
    })
    .sort((a, b) => {
      if (a.distance === null) return 1;
      if (b.distance === null) return -1;
      return a.distance - b.distance;
    });
}

module.exports = {
  haversineDistance,
  getZipCoordinates,
  distanceToStore,
  sortStoresByDistance,
  ZIP_COORDINATES
};
