/**
 * Normalize deals from various sources to unified Deal model
 */

const { detectCategory, getDealBadge } = require('./categories');

function createDeal(fields) {
  const category = fields.category || detectCategory(fields.name || '');
  const originalPrice = fields.originalPrice || 0;
  const currentPrice = fields.currentPrice || 0;
  const discount = fields.discount || calculateDiscount(originalPrice, currentPrice);
  const savings = originalPrice - currentPrice;
  const dealBadge = getDealBadge(discount, category);

  return {
    id: fields.id,
    source: fields.source,
    category,
    name: fields.name || '',
    brand: fields.brand || '',
    originalPrice,
    currentPrice,
    discount,
    savings,
    condition: fields.condition || 'open-box',
    availability: fields.availability || 'online',
    url: fields.url || '',
    image: fields.image || '',
    dealBadge,
    fetchedAt: fields.fetchedAt || Date.now(),
    sku: fields.sku,
    listingId: fields.listingId,
    processor: fields.processor,
    modelType: fields.modelType,
    screenSize: fields.screenSize,
    ram: fields.ram,
    storage: fields.storage
  };
}

function calculateDiscount(original, current) {
  if (!original || original <= 0) return 0;
  return Math.round(((original - current) / original) * 100);
}

module.exports = {
  createDeal,
  calculateDiscount
};
