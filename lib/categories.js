/**
 * Category definitions and discount thresholds
 */

// Order matters! More specific categories must come before generic ones
// (e.g., 'laptops' before 'storage' since laptops contain "SSD" in their names)
const CATEGORIES = {
  laptops: {
    name: 'Laptops',
    keywords: [
      'laptop', 'notebook',
      'macbook', 'macbook pro', 'macbook air',
      'chromebook', 'ultrabook',
      'omnibook', 'spectre', 'envy', 'pavilion', 'omen',  // HP
      'thinkpad', 'ideapad', 'yoga', 'legion',            // Lenovo
      'xps', 'inspiron', 'latitude', 'alienware',         // Dell
      'zenbook', 'vivobook', 'rog', 'tuf',                // ASUS
      'swift', 'nitro', 'predator',                       // Acer
      'surface laptop', 'surface book',                   // Microsoft
      'gram',                                             // LG
      'razer blade',                                      // Razer
    ],
    goodDeal: 20,
    greatDeal: 25
  },
  desktops: {
    name: 'Desktops',
    keywords: [
      'desktop', 'tower', 'all-in-one', 'aio',
      'imac', 'mac mini', 'mac studio', 'mac pro',        // Apple
      'optiplex', 'precision tower',                       // Dell
      'thinkcentre', 'thinkstation',                       // Lenovo
      'prodesk', 'elitedesk', 'z workstation',            // HP
      'intel nuc', 'mini pc', 'beelink', 'geekom',        // Mini PCs
      'raspberry pi',
    ],
    goodDeal: 20,
    greatDeal: 30
  },
  tablets: {
    name: 'Tablets',
    keywords: ['ipad', 'ipad pro', 'ipad air', 'tablet', 'surface pro', 'surface go', 'galaxy tab'],
    goodDeal: 20,
    greatDeal: 25
  },
  memory: {
    name: 'Memory',
    keywords: ['ram module', 'memory module', 'ddr4', 'ddr5', 'sodimm', 'dimm'],
    goodDeal: 25,
    greatDeal: 40
  },
  storage: {
    name: 'Storage',
    keywords: ['ssd', 'nvme', 'nas', 'hard drive', 'external drive', 'flash drive', 'portable drive'],
    goodDeal: 25,
    greatDeal: 40
  }
};

function detectCategory(text) {
  const lowerText = text.toLowerCase();

  for (const [categoryId, config] of Object.entries(CATEGORIES)) {
    for (const keyword of config.keywords) {
      if (lowerText.includes(keyword)) {
        return categoryId;
      }
    }
  }

  return null;
}

function getThresholds(categoryId) {
  const category = CATEGORIES[categoryId];
  if (!category) return { goodDeal: 20, greatDeal: 30 };
  return { goodDeal: category.goodDeal, greatDeal: category.greatDeal };
}

function getDealBadge(discount, categoryId) {
  const { goodDeal, greatDeal } = getThresholds(categoryId);
  if (discount >= greatDeal) return 'great';
  if (discount >= goodDeal) return 'good';
  return null;
}

module.exports = {
  CATEGORIES,
  detectCategory,
  getThresholds,
  getDealBadge
};
