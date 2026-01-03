/**
 * Micro Center store locations with full details
 * Store numbers match the inventory array from product pages
 */

const MICROCENTER_STORES = [
  {
    storeNumber: '205',
    name: 'Phoenix',
    address: '4531 E. Thomas Rd.',
    city: 'Phoenix',
    state: 'AZ',
    zip: '85018',
    lat: 33.475858,
    lng: -111.984108
  },
  {
    storeNumber: '215',
    name: 'Austin',
    address: '12707 N. Mopac Expy',
    city: 'Austin',
    state: 'TX',
    zip: '78727',
    lat: 30.422742,
    lng: -97.699786,
    comingSoon: true  // Opening mid-to-late 2026
  },
  {
    storeNumber: '195',
    name: 'Santa Clara',
    address: '5201 Stevens Creek Blvd.',
    city: 'Santa Clara',
    state: 'CA',
    zip: '95051',
    lat: 37.32415,
    lng: -121.99392
  },
  {
    storeNumber: '101',
    name: 'Tustin',
    address: '1100 E Edinger Ave',
    city: 'Tustin',
    state: 'CA',
    zip: '92780',
    lat: 33.725580,
    lng: -117.832515
  },
  {
    storeNumber: '181',
    name: 'Denver',
    address: '8000 E Quincy Ave',
    city: 'Denver',
    state: 'CO',
    zip: '80237',
    lat: 39.638487,
    lng: -104.896025
  },
  {
    storeNumber: '185',
    name: 'Miami',
    address: '7795 W Flagler St, M31',
    city: 'Miami',
    state: 'FL',
    zip: '33144',
    lat: 25.772402,
    lng: -80.322265
  },
  {
    storeNumber: '065',
    name: 'Duluth',
    address: '2340 Pleasant Hill Road',
    city: 'Duluth',
    state: 'GA',
    zip: '30096',
    lat: 33.963463,
    lng: -84.138602
  },
  {
    storeNumber: '041',
    name: 'Marietta',
    address: '1275 Powers Ferry Rd SE Ste 50',
    city: 'Marietta',
    state: 'GA',
    zip: '30067',
    lat: 33.919535,
    lng: -84.467274
  },
  {
    storeNumber: '151',
    name: 'Chicago',
    address: '2645 N Elston Ave',
    city: 'Chicago',
    state: 'IL',
    zip: '60647',
    lat: 41.929328,
    lng: -87.683715
  },
  {
    storeNumber: '025',
    name: 'Westmont',
    address: '80 E Ogden Ave',
    city: 'Westmont',
    state: 'IL',
    zip: '60559',
    lat: 41.810147,
    lng: -87.973453
  },
  {
    storeNumber: '165',
    name: 'Indianapolis',
    address: '5702 E 86th St',
    city: 'Indianapolis',
    state: 'IN',
    zip: '46250',
    lat: 39.913423,
    lng: -86.070925
  },
  {
    storeNumber: '191',
    name: 'Overland Park',
    address: '9294 Metcalf Ave',
    city: 'Overland Park',
    state: 'KS',
    zip: '66212',
    lat: 38.960419,
    lng: -94.667659
  },
  {
    storeNumber: '121',
    name: 'Cambridge',
    address: '730 Memorial Drive',
    city: 'Cambridge',
    state: 'MA',
    zip: '02139',
    lat: 42.357280,
    lng: -71.115163
  },
  {
    storeNumber: '085',
    name: 'Rockville',
    address: '1776 E Jefferson ST Ste 203',
    city: 'Rockville',
    state: 'MD',
    zip: '20852',
    lat: 39.057254,
    lng: -77.126122
  },
  {
    storeNumber: '125',
    name: 'Parkville',
    address: '1957 E Joppa Rd',
    city: 'Parkville',
    state: 'MD',
    zip: '21234',
    lat: 39.399382,
    lng: -76.545687
  },
  {
    storeNumber: '055',
    name: 'Madison Heights',
    address: '32800 Concord Dr',
    city: 'Madison Heights',
    state: 'MI',
    zip: '48071',
    lat: 42.534072,
    lng: -83.113237
  },
  {
    storeNumber: '045',
    name: 'St. Louis Park',
    address: '3710 Highway 100 South',
    city: 'St. Louis Park',
    state: 'MN',
    zip: '55416',
    lat: 44.936619,
    lng: -93.351094
  },
  {
    storeNumber: '095',
    name: 'Brentwood',
    address: '87 Brentwood Promenade Court',
    city: 'Brentwood',
    state: 'MO',
    zip: '63144',
    lat: 38.627242,
    lng: -90.341618
  },
  {
    storeNumber: '175',
    name: 'Charlotte',
    address: '4744 South Blvd',
    city: 'Charlotte',
    state: 'NC',
    zip: '28217',
    lat: 35.174802,
    lng: -80.877522
  },
  {
    storeNumber: '075',
    name: 'North Jersey',
    address: '263 McLean Blvd',
    city: 'Paterson',
    state: 'NJ',
    zip: '07504',
    lat: 40.908246,
    lng: -74.134343
  },
  {
    storeNumber: '171',
    name: 'Westbury',
    address: '655 Merrick Ave',
    city: 'Westbury',
    state: 'NY',
    zip: '11590',
    lat: 40.746884,
    lng: -73.587313
  },
  {
    storeNumber: '115',
    name: 'Brooklyn',
    address: '850 3rd Ave',
    city: 'Brooklyn',
    state: 'NY',
    zip: '11232',
    lat: 40.659336,
    lng: -74.004446
  },
  {
    storeNumber: '145',
    name: 'Flushing',
    address: '71-43 Kissena Blvd',
    city: 'Queens',
    state: 'NY',
    zip: '11367',
    lat: 40.728478,
    lng: -73.815315
  },
  {
    storeNumber: '105',
    name: 'Yonkers',
    address: '750-A Central Park Ave',
    city: 'Yonkers',
    state: 'NY',
    zip: '10704',
    lat: 40.925657,
    lng: -73.856071
  },
  {
    storeNumber: '141',
    name: 'Columbus',
    address: '747 Bethel Rd',
    city: 'Columbus',
    state: 'OH',
    zip: '43214',
    lat: 40.062000,
    lng: -83.040330
  },
  {
    storeNumber: '051',
    name: 'Mayfield Heights',
    address: '1349 Som Center Rd',
    city: 'Mayfield Heights',
    state: 'OH',
    zip: '44124',
    lat: 41.524047,
    lng: -81.438541
  },
  {
    storeNumber: '071',
    name: 'Sharonville',
    address: '11755 Mosteller Rd',
    city: 'Sharonville',
    state: 'OH',
    zip: '45241',
    lat: 39.287393,
    lng: -84.428542
  },
  {
    storeNumber: '061',
    name: 'St. Davids',
    address: '550 E Lancaster Ave Ste C',
    city: 'St Davids',
    state: 'PA',
    zip: '19087',
    lat: 40.040771,
    lng: -75.368402
  },
  {
    storeNumber: '155',
    name: 'Houston',
    address: '5305 S Rice Ave',
    city: 'Houston',
    state: 'TX',
    zip: '77081',
    lat: 29.724660,
    lng: -95.468177
  },
  {
    storeNumber: '131',
    name: 'Dallas',
    address: '13929 N Central Expy',
    city: 'Dallas',
    state: 'TX',
    zip: '75243',
    lat: 32.938058,
    lng: -96.748542
  },
  {
    storeNumber: '081',
    name: 'Fairfax',
    address: '3089 Nutley St',
    city: 'Fairfax',
    state: 'VA',
    zip: '22031',
    lat: 38.867742,
    lng: -77.262885
  }
];

/**
 * Get store by store number
 * @param {string} storeNumber - The store number (e.g., '101')
 * @returns {Object|null} - Store object or null if not found
 */
function getStoreByNumber(storeNumber) {
  return MICROCENTER_STORES.find(s => s.storeNumber === storeNumber) || null;
}

/**
 * Get all active stores (excluding coming soon)
 * @returns {Array} - Array of active store objects
 */
function getActiveStores() {
  return MICROCENTER_STORES.filter(s => !s.comingSoon);
}

module.exports = {
  MICROCENTER_STORES,
  getStoreByNumber,
  getActiveStores
};
