/**
 * Node pricing loader — fetches catalog from Supabase, exposes calculation API.
 */
'use strict';

var calc = require('./pricing-calc');

var catalogCache = null;
var cacheExpiryMs = 0;
var CACHE_TTL_MS = 30000;

function normalizeCatalog(raw) {
  if (!raw || typeof raw !== 'object') return calc.emptyCatalog();
  return {
    currency: raw.currency || 'USD',
    updatedAt: raw.updatedAt || raw.updated_at || null,
    products: raw.products || {},
    shippingMethods: raw.shippingMethods || [],
    powerUpgrades: raw.powerUpgrades || {},
    discountCodes: raw.discountCodes || {}
  };
}

async function loadCatalog(supabase, options) {
  options = options || {};
  var force = !!options.force;
  var now = Date.now();
  if (!force && catalogCache && now < cacheExpiryMs) {
    return catalogCache;
  }
  if (!supabase) {
    catalogCache = calc.emptyCatalog();
    cacheExpiryMs = now + CACHE_TTL_MS;
    return catalogCache;
  }
  var result = await supabase.rpc('get_store_pricing');
  if (result.error) {
    throw new Error(result.error.message || 'Failed to load store pricing');
  }
  catalogCache = normalizeCatalog(result.data);
  cacheExpiryMs = now + CACHE_TTL_MS;
  return catalogCache;
}

function invalidateCatalogCache() {
  catalogCache = null;
  cacheExpiryMs = 0;
}

function createApi(catalog) {
  return calc.createPricingApi(catalog || catalogCache || calc.emptyCatalog());
}

function getCachedCatalog() {
  return catalogCache || calc.emptyCatalog();
}

function requireCatalog() {
  if (!catalogCache) {
    throw new Error('Pricing catalog not loaded. Call loadCatalog(supabase) first.');
  }
  return catalogCache;
}

function withCatalog(fn) {
  return function () {
    var args = Array.prototype.slice.call(arguments);
    var api = createApi(requireCatalog());
    return api[fn].apply(api, args);
  };
}

module.exports = {
  loadCatalog: loadCatalog,
  invalidateCatalogCache: invalidateCatalogCache,
  createApi: createApi,
  getCachedCatalog: getCachedCatalog,
  emptyCatalog: calc.emptyCatalog,
  normalizeCatalog: normalizeCatalog,
  CACHE_TTL_MS: CACHE_TTL_MS,
  SHIPPING_METHOD_KEY: calc.SHIPPING_METHOD_KEY,
  normalizeSize: calc.normalizeSize,
  normalizePowerType: calc.normalizePowerType,
  roundMoney: calc.roundMoney,
  toCents: calc.toCents,
  sizeToLabel: calc.sizeToLabel,
  calculateProductUnitPrice: function (options, catalog) {
    return calc.calculateProductUnitPrice(catalog || getCachedCatalog(), options);
  },
  calculateOrderTotals: function (options, catalog) {
    return calc.calculateOrderTotals(catalog || getCachedCatalog(), options);
  },
  getShippingCostUSD: function (method, catalog) {
    return calc.getShippingCostUSD(method, catalog || getCachedCatalog());
  },
  shippingMethodToLabel: function (method, catalog) {
    return calc.shippingMethodToLabel(method, catalog || getCachedCatalog());
  },
  normalizeShippingMethod: function (method, catalog) {
    return calc.createPricingApi(catalog || getCachedCatalog()).normalizeShippingMethod(method);
  }
};
