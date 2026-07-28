/**
 * Browser pricing — loads catalog from /api/pricing (Supabase-backed).
 * No hardcoded prices. Call ZYBAR.Pricing.load() before checkout UI.
 */
(function () {
  'use strict';

  var calc = null;
  var api = null;
  var loadPromise = null;
  var loadedAt = 0;
  var CACHE_TTL_MS = 30000;
  var SHIPPING_METHOD_KEY = 'zybar.shipping.method';

  function getCalc() {
    return window.ZYBAR && window.ZYBAR.PricingCalc ? window.ZYBAR.PricingCalc : null;
  }

  function normalizeCatalog(raw) {
    if (!raw || typeof raw !== 'object') {
      var c = getCalc();
      return c ? c.emptyCatalog() : { products: {}, shippingMethods: [], powerUpgrades: {}, discountCodes: {} };
    }
    return {
      currency: raw.currency || 'USD',
      updatedAt: raw.updatedAt || null,
      products: raw.products || {},
      compareAtPricesBySize: raw.compareAtPricesBySize || {},
      shippingMethods: raw.shippingMethods || [],
      powerUpgrades: raw.powerUpgrades || {},
      discountCodes: raw.discountCodes || {}
    };
  }

  function apiBase() {
    var config = window.ZYBAR_STRIPE_CONFIG || {};
    return config.apiBaseUrl || window.location.origin;
  }

  function applyProductsJsonFallback(catalog, json) {
    if (!json || typeof json !== 'object') return catalog;
    var defaults = json.pricesBySize || {};
    var compareDefaults = json.compareAtPricesBySize || {};
    var perProduct = json.perProductPricesBySize || {};
    var perProductCompare = json.perProductCompareAtPricesBySize || {};
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
      var compareMap = perProductCompare[slug] || compareDefaults;
      var existing = catalog.products[slug];
      var prices = {
        '30x45': Number(priceMap['30x45']) || 0,
        '40x60': Number(priceMap['40x60']) || 0
      };
      var comparePrices = {
        '30x45': Number(compareMap['30x45']) || 0,
        '40x60': Number(compareMap['40x60']) || 0
      };
      if (!existing) {
        catalog.products[slug] = {
          slug: slug,
          name: product.name || slug,
          prices: prices,
          compareAtPrices: comparePrices
        };
        return;
      }
      existing.prices = existing.prices || {};
      existing.compareAtPrices = existing.compareAtPrices || {};
      // perProductPricesBySize is an intentional override (e.g. sale tiers) — always win.
      if (perProduct[slug]) {
        existing.prices['30x45'] = prices['30x45'];
        existing.prices['40x60'] = prices['40x60'];
      } else {
        if (!Number(existing.prices['30x45'])) existing.prices['30x45'] = prices['30x45'];
        if (!Number(existing.prices['40x60'])) existing.prices['40x60'] = prices['40x60'];
      }
      if (perProductCompare[slug]) {
        existing.compareAtPrices['30x45'] = comparePrices['30x45'];
        existing.compareAtPrices['40x60'] = comparePrices['40x60'];
      } else {
        if (!Number(existing.compareAtPrices['30x45']) && comparePrices['30x45']) {
          existing.compareAtPrices['30x45'] = comparePrices['30x45'];
        }
        if (!Number(existing.compareAtPrices['40x60']) && comparePrices['40x60']) {
          existing.compareAtPrices['40x60'] = comparePrices['40x60'];
        }
      }
    });
    return catalog;
  }

  function applyLocalDefaults(catalog) {
    if (!catalog.shippingMethods || !catalog.shippingMethods.length) {
      catalog.shippingMethods = [
        {
          code: 'standard',
          label: 'Standard Shipping',
          description: '14–18 Business Days',
          priceUsd: 23.99,
          isDefault: false
        },
        {
          code: 'priority',
          label: 'Priority Shipping',
          description: '7–14 Business Days',
          priceUsd: 26.99,
          isDefault: true
        }
      ];
    }
    if (!catalog.powerUpgrades || !Object.keys(catalog.powerUpgrades).length) {
      catalog.powerUpgrades = {
        usb: { label: 'USB Only', priceUsd: 0 },
        dual: { label: 'USB + Battery', priceUsd: 12 }
      };
    }
    catalog.discountCodes = catalog.discountCodes || {};
    if (!catalog.discountCodes.luneva5) {
      catalog.discountCodes.luneva5 = {
        discountType: 'percent',
        valueUsd: 5,
        minOrderUsd: 0
      };
    }
    return catalog;
  }

  function loadProductsJson() {
    return fetch('/data/products.json', { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .catch(function () {
        return null;
      });
  }

  function buildApiFromCatalog(raw, json) {
    var c = getCalc();
    if (!c) throw new Error('Pricing calculator not loaded');
    var catalog = applyLocalDefaults(applyProductsJsonFallback(normalizeCatalog(raw), json));
    api = c.createPricingApi(catalog);
    loadedAt = Date.now();
    installApi(api);
    return api;
  }

  function fetchCatalog(force) {
    var now = Date.now();
    if (!force && api && now - loadedAt < CACHE_TTL_MS) {
      return Promise.resolve(api);
    }
    return loadProductsJson().then(function (json) {
      return fetch(apiBase() + '/api/pricing', {
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      })
        .then(function (res) {
          if (!res.ok) throw new Error('Pricing unavailable (' + res.status + ')');
          return res.json();
        })
        .then(function (raw) {
          return buildApiFromCatalog(raw, json);
        })
        .catch(function (err) {
          console.warn('[Pricing] API unavailable, using products.json fallback.', err.message || err);
          return buildApiFromCatalog(null, json);
        });
    });
  }

  function load(force) {
    if (!loadPromise || force) {
      loadPromise = fetchCatalog(!!force).catch(function (err) {
        loadPromise = null;
        throw err;
      });
    }
    return loadPromise;
  }

  function readShippingMethod() {
    try {
      if (api) return api.normalizeShippingMethod(localStorage.getItem(SHIPPING_METHOD_KEY));
      var fallback = localStorage.getItem(SHIPPING_METHOD_KEY);
      return fallback || 'standard';
    } catch (_) {
      return 'standard';
    }
  }

  function writeShippingMethod(method) {
    try {
      var normalized = api ? api.normalizeShippingMethod(method) : method;
      localStorage.setItem(SHIPPING_METHOD_KEY, normalized);
    } catch (_) {}
  }

  function stubApi() {
    var c = getCalc();
    var empty = c ? c.createPricingApi(c.emptyCatalog()) : null;
    var base = empty || {
      calculateProductUnitPrice: function () { return 0; },
      calculateOrderTotals: function () { return { subtotal: 0, shipping: 0, tax: 0, discount: 0, total: 0 }; },
      formatUsd: function (n) { return '$' + Number(n || 0).toFixed(2); },
      formatShippingUsd: function (n) { return '$' + Number(n || 0); },
      repairCartItem: function (i) { return i; },
      normalizeSize: function (s) { return s || '30x45'; },
      normalizePowerType: function (p) { return p || 'usb'; },
      normalizeShippingMethod: function (m) { return m || 'standard'; },
      getShippingMethods: function () { return []; },
      toCents: function (n) { return Math.round(Number(n || 0) * 100); }
    };
    return Object.assign({}, base, {
      load: load,
      refresh: function () { return load(true); },
      ready: load(),
      readShippingMethod: readShippingMethod,
      writeShippingMethod: writeShippingMethod,
      SHIPPING_METHOD_KEY: SHIPPING_METHOD_KEY,
      isLoaded: function () { return !!api && loadedAt > 0; }
    });
  }

  function installApi(pricingApi) {
    window.ZYBAR = window.ZYBAR || {};
    window.ZYBAR.Pricing = Object.assign({}, pricingApi, {
      load: load,
      refresh: function () { return load(true); },
      ready: Promise.resolve(pricingApi),
      readShippingMethod: readShippingMethod,
      writeShippingMethod: writeShippingMethod,
      SHIPPING_METHOD_KEY: SHIPPING_METHOD_KEY,
      isLoaded: function () { return true; }
    });
  }

  window.ZYBAR = window.ZYBAR || {};
  window.ZYBAR.Pricing = stubApi();

  load()
    .then(function () {})
    .catch(function (err) {
      console.error('[Pricing]', err.message || err);
    });
})();
