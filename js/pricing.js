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
      shippingMethods: raw.shippingMethods || [],
      powerUpgrades: raw.powerUpgrades || {},
      discountCodes: raw.discountCodes || {}
    };
  }

  function apiBase() {
    var config = window.ZYBAR_STRIPE_CONFIG || {};
    return config.apiBaseUrl || window.location.origin;
  }

  function fetchCatalog(force) {
    var now = Date.now();
    if (!force && api && now - loadedAt < CACHE_TTL_MS) {
      return Promise.resolve(api);
    }
    return fetch(apiBase() + '/api/pricing', {
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Pricing unavailable (' + res.status + ')');
        return res.json();
      })
      .then(function (raw) {
        var c = getCalc();
        if (!c) throw new Error('Pricing calculator not loaded');
        api = c.createPricingApi(normalizeCatalog(raw));
        loadedAt = Date.now();
        return api;
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

  load().then(installApi).catch(function (err) {
    console.error('[Pricing]', err.message || err);
  });
})();
