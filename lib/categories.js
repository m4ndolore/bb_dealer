/**
 * Category definitions and discount thresholds
 */

const CATEGORIES = {
  storage: {
    name: 'Storage',
    keywords: ['ssd', 'nvme', 'nas', 'hard drive', 'external drive', 'flash drive'],
    goodDeal: 25,
    greatDeal: 40
  },
  compute: {
    name: 'Compute',
    keywords: ['mac mini', 'mac studio', 'raspberry pi', 'intel nuc', 'mini pc', 'beelink', 'geekom'],
    goodDeal: 20,
    greatDeal: 30
  },
  memory: {
    name: 'Memory',
    keywords: ['ram', 'memory', 'ddr4', 'ddr5', 'sodimm', 'dimm'],
    goodDeal: 25,
    greatDeal: 40
  },
  tablets: {
    name: 'Tablets',
    keywords: ['ipad', 'ipad pro', 'ipad air', 'tablet'],
    goodDeal: 20,
    greatDeal: 25
  },
  laptops: {
    name: 'Laptops',
    keywords: ['macbook', 'macbook pro', 'macbook air', 'laptop'],
    goodDeal: 20,
    greatDeal: 25
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
