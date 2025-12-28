/**
 * Aggregates deals from all sources
 */

const bestbuyAdapter = require('../adapters/bestbuy');

const ADAPTERS = {
  bestbuy: bestbuyAdapter
};

async function fetchAllDeals(config = {}) {
  const { sources = ['bestbuy'], forceRefresh = false, apiKeys = {} } = config;

  const results = {
    deals: [],
    errors: [],
    sources: {}
  };

  for (const source of sources) {
    const adapter = ADAPTERS[source];
    if (!adapter) {
      results.errors.push({ source, error: `Unknown source: ${source}` });
      continue;
    }

    try {
      const startTime = Date.now();
      const deals = await adapter.fetchDeals(apiKeys[source], { forceRefresh });
      const duration = Date.now() - startTime;

      results.deals.push(...deals);
      results.sources[source] = {
        count: deals.length,
        duration,
        success: true
      };
    } catch (e) {
      results.errors.push({ source, error: e.message });
      results.sources[source] = {
        count: 0,
        error: e.message,
        success: false
      };
    }
  }

  results.deals.sort((a, b) => b.discount - a.discount);

  return results;
}

function filterDeals(deals, filters = {}) {
  return deals.filter(deal => {
    if (filters.category && deal.category !== filters.category) return false;
    if (filters.source && deal.source !== filters.source) return false;
    if (filters.minDiscount && deal.discount < filters.minDiscount) return false;
    if (filters.condition && deal.condition !== filters.condition) return false;
    if (filters.availability && deal.availability !== filters.availability) return false;
    return true;
  });
}

module.exports = {
  fetchAllDeals,
  filterDeals,
  ADAPTERS
};
