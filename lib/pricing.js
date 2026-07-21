/**
 * Node pricing loader — fetches catalog from Supabase, exposes calculation API.
 * Merges data/products.json when Supabase is missing product rows (avoids $0 checkout).
 */
'use strict';

var fs = require('fs');
var path = require('path');
var calc = require('./pricing-calc');

var catalogCache = null;
var cacheExpiryMs = 0;
var CACHE_TTL_MS = 30000;
var productsJsonCache = null;

function normalizeCatalog(raw) {
  if (!raw || typeof raw !== 'object') return calc.emptyCatalog();
  return {
    currency: raw.currency || 'USD',
    updatedAt: raw.updatedAt || raw.updated_at || null,
    products: raw.products || {},
    compareAtPricesBySize: raw.compareAtPricesBySize || {},
    shippingMethods: raw.shippingMethods || [],
    powerUpgrades: raw.powerUpgrades || {},
    discountCodes: raw.discountCodes || {}
  };
}

function loadProductsJson() {
  if (productsJsonCache) return productsJsonCache;
  try {
    var filePath = path.join(__dirname, '..', 'data', 'products.json');
    productsJsonCache = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    productsJsonCache = { pricesBySize: { '30x45': 138, '40x60': 148 }, products: [] };
  }
  return productsJsonCache;
}

/**
 * Fill missing product prices from products.json so Stripe checkout matches the storefront.
 * Does not overwrite non-zero Supabase prices.
 */
function mergeProductsJsonFallback(catalog) {
  var json = loadProductsJson();
  var defaults = (json && json.pricesBySize) || {};
  var compareDefaults = (json && json.compareAtPricesBySize) || {};
  var perProduct = (json && json.perProductPricesBySize) || {};
  catalog.products = catalog.products || {};
  if (!catalog.compareAtPricesBySize || !Object.keys(catalog.compareAtPricesBySize).length) {
    catalog.compareAtPricesBySize = {
      '30x45': Number(compareDefaults['30x45']) || 0,
      '40x60': Number(compareDefaults['40x60']) || 0
    };
  }

  (json.products || []).forEach(function (product) {
    if (!product || !product.slug) return;
    var slug = String(product.slug);
    var priceMap = perProduct[slug] || defaults;
    var fallbackPrices = {
      '30x45': Number(priceMap['30x45']) || 138,
      '40x60': Number(priceMap['40x60']) || 148
    };
    var existing = catalog.products[slug];
    if (!existing) {
      catalog.products[slug] = {
        id: slug,
        slug: slug,
        name: product.name || slug,
        status: 'active',
        prices: fallbackPrices
      };
      return;
    }
    existing.prices = existing.prices || {};
    if (!Number(existing.prices['30x45'])) existing.prices['30x45'] = fallbackPrices['30x45'];
    if (!Number(existing.prices['40x60'])) existing.prices['40x60'] = fallbackPrices['40x60'];
  });

  if (!catalog.shippingMethods || !catalog.shippingMethods.length) {
    catalog.shippingMethods = [
      {
        code: 'standard',
        label: 'Standard Shipping',
        description: '14–18 Business Days',
        priceUsd: 23.99,
        isDefault: false,
        sortOrder: 1
      },
      {
        code: 'priority',
        label: 'Priority Shipping',
        description: '7–14 Business Days',
        priceUsd: 26.99,
        isDefault: true,
        sortOrder: 2
      }
    ];
  }
  if (!catalog.powerUpgrades || !Object.keys(catalog.powerUpgrades).length) {
    catalog.powerUpgrades = {
      usb: { powerType: 'usb', label: 'USB Only', priceUsd: 0 },
      dual: { powerType: 'dual', label: 'USB + Battery', priceUsd: 12 }
    };
  }
  return catalog;
}

async function loadCatalog(supabase, options) {
  options = options || {};
  var force = !!options.force;
  var now = Date.now();
  if (!force && catalogCache && now < cacheExpiryMs) {
    return catalogCache;
  }
  if (!supabase) {
    catalogCache = mergeProductsJsonFallback(calc.emptyCatalog());
    cacheExpiryMs = now + CACHE_TTL_MS;
    return catalogCache;
  }
  var result = await supabase.rpc('get_store_pricing');
  if (result.error) {
    throw new Error(result.error.message || 'Failed to load store pricing');
  }
  catalogCache = mergeProductsJsonFallback(normalizeCatalog(result.data));
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
