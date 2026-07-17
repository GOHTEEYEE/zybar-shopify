/**
 * Pure pricing calculations from a store catalog object.
 * No hardcoded prices — catalog comes from Supabase get_store_pricing().
 */
'use strict';

var DEFAULT_SIZE = '30x45';
var DEFAULT_POWER = 'usb';
var DEFAULT_SHIPPING_METHOD = 'standard';
var SHIPPING_METHOD_KEY = 'zybar.shipping.method';

function emptyCatalog() {
  return {
    currency: 'USD',
    products: {},
    compareAtPricesBySize: {},
    shippingMethods: [],
    powerUpgrades: {},
    discountCodes: {}
  };
}

function normalizeSize(size) {
  var value = String(size || DEFAULT_SIZE).trim().toLowerCase().replace(/\s+/g, '');
  if (value === '40x60' || value === '40×60') return '40x60';
  return DEFAULT_SIZE;
}

function normalizePowerType(powerType) {
  var value = String(powerType || DEFAULT_POWER).trim().toLowerCase();
  if (value === 'dual' || value === 'usb+battery' || value === 'usb_battery') return 'dual';
  return DEFAULT_POWER;
}

function normalizeShippingMethod(method, catalog) {
  var value = String(method || '').trim().toLowerCase();
  if (value === 'priority' || value === 'fast' || value === 'fast_priority') return 'priority';
  if (value === 'standard') return 'standard';
  var def = getDefaultShippingCode(catalog);
  return def || DEFAULT_SHIPPING_METHOD;
}

function roundMoney(amount) {
  return Math.round(Number(amount || 0) * 100) / 100;
}

function formatUsd(amount) {
  return '$' + roundMoney(amount).toFixed(2);
}

function formatShippingUsd(amount) {
  var n = roundMoney(amount);
  if (n % 1 === 0) return '$' + String(Math.round(n));
  return formatUsd(n);
}

function toCents(amount) {
  return Math.round(roundMoney(amount) * 100);
}

function sizeToLabel(size) {
  return normalizeSize(size) === '40x60' ? '40 × 60 cm' : '30 × 45 cm';
}

function getProductEntry(catalog, slug) {
  if (!catalog || !slug) return null;
  var key = String(slug).trim();
  return (catalog.products && catalog.products[key]) || null;
}

function getProductSizePriceUSD(catalog, slug, size) {
  var product = getProductEntry(catalog, slug);
  if (!product || !product.prices) return 0;
  var key = normalizeSize(size);
  var val = product.prices[key];
  return Number.isFinite(Number(val)) ? roundMoney(Number(val)) : 0;
}

function getProductCompareAtSizePriceUSD(catalog, slug, size) {
  var key = normalizeSize(size);
  var product = getProductEntry(catalog, slug);
  if (product && product.compareAtPrices) {
    var productVal = Number(product.compareAtPrices[key]);
    if (Number.isFinite(productVal) && productVal > 0) return roundMoney(productVal);
  }
  var globalMap = catalog && catalog.compareAtPricesBySize;
  if (globalMap) {
    var globalVal = Number(globalMap[key]);
    if (Number.isFinite(globalVal) && globalVal > 0) return roundMoney(globalVal);
  }
  return 0;
}

function calculateProductCompareAtPrice(catalog, options) {
  options = options || {};
  var slug = options.productSlug || options.slug || '';
  var size = normalizeSize(options.size);
  var powerType = normalizePowerType(options.powerType);
  var base = getProductCompareAtSizePriceUSD(catalog, slug, size);
  if (!(base > 0)) return 0;
  var power = getPowerUpgradeUSD(catalog, powerType);
  return roundMoney(base + power);
}

function getPowerUpgradeUSD(catalog, powerType) {
  var key = normalizePowerType(powerType);
  var entry = catalog && catalog.powerUpgrades && catalog.powerUpgrades[key];
  if (!entry) return 0;
  var val = typeof entry === 'object' ? entry.priceUsd : entry;
  return Number.isFinite(Number(val)) ? roundMoney(Number(val)) : 0;
}

function powerTypeToLabel(powerType, catalog) {
  var key = normalizePowerType(powerType);
  var entry = catalog && catalog.powerUpgrades && catalog.powerUpgrades[key];
  if (entry && entry.label) return entry.label;
  return key === 'dual' ? 'USB + Battery' : 'USB Only';
}

function getShippingMethods(catalog) {
  return Array.isArray(catalog && catalog.shippingMethods) ? catalog.shippingMethods : [];
}

function getDefaultShippingCode(catalog) {
  var methods = getShippingMethods(catalog);
  var def = methods.find(function (m) { return m && m.isDefault; });
  if (def && def.code) return def.code;
  if (methods[0] && methods[0].code) return methods[0].code;
  return DEFAULT_SHIPPING_METHOD;
}

function getShippingMethodMeta(catalog, method) {
  var code = normalizeShippingMethod(method, catalog);
  var methods = getShippingMethods(catalog);
  var found = methods.find(function (m) { return m && m.code === code; });
  if (found) return found;
  return methods[0] || { code: code, label: 'Shipping', priceUsd: 0 };
}

function shippingMethodToLabel(method, catalog) {
  return getShippingMethodMeta(catalog, method).label || 'Shipping';
}

function getShippingCostUSD(shippingMethod, catalog) {
  var meta = getShippingMethodMeta(catalog, shippingMethod);
  return Number.isFinite(Number(meta.priceUsd)) ? roundMoney(Number(meta.priceUsd)) : 0;
}

function calculateProductUnitPrice(catalog, options) {
  options = options || {};
  var slug = options.productSlug || options.slug || '';
  var size = normalizeSize(options.size);
  var powerType = normalizePowerType(options.powerType);
  var base = getProductSizePriceUSD(catalog, slug, size);
  var power = getPowerUpgradeUSD(catalog, powerType);
  return roundMoney(base + power);
}

function calculateLineTotal(catalog, options) {
  options = options || {};
  var qty = Number(options.quantity);
  var safeQty = Number.isFinite(qty) && qty > 0 ? qty : 1;
  var unit =
    typeof options.unitPriceUSD === 'number' && Number.isFinite(options.unitPriceUSD)
      ? options.unitPriceUSD
      : calculateProductUnitPrice(catalog, options);
  return roundMoney(unit * safeQty);
}

function calculateCartSubtotal(catalog, items) {
  var subtotal = 0;
  (items || []).forEach(function (item) {
    subtotal += calculateLineTotal(catalog, {
      slug: item && (item.slug || item.productSlug || item.product_id),
      productSlug: item && (item.slug || item.productSlug || item.product_id),
      size: item && item.size,
      powerType: item && item.powerType,
      quantity: item && item.quantity,
      unitPriceUSD: item && item.unitPriceUSD
    });
  });
  return roundMoney(subtotal);
}

function applyDiscountUSD(catalog, code, subtotalUSD) {
  var raw = String(code || '').trim().toLowerCase();
  if (!raw || !catalog || !catalog.discountCodes) return 0;
  var entry = catalog.discountCodes[raw];
  if (!entry) return 0;
  var subtotal = roundMoney(subtotalUSD);
  var minOrder = Number(entry.minOrderUsd) || 0;
  if (subtotal < minOrder) return 0;
  var type = String(entry.discountType || 'fixed').toLowerCase();
  var value = Number(entry.valueUsd) || 0;
  if (type === 'percent') {
    return roundMoney(Math.min(subtotal, subtotal * (value / 100)));
  }
  return roundMoney(Math.min(subtotal, value));
}

function calculateOrderTotals(catalog, options) {
  options = options || {};
  var items = Array.isArray(options.items) ? options.items : [];
  var shippingMethod = normalizeShippingMethod(options.shippingMethod, catalog);
  var subtotal = calculateCartSubtotal(catalog, items);
  var shipping = getShippingCostUSD(shippingMethod, catalog);
  var tax = roundMoney(Number(options.taxUSD) || 0);
  var discount =
    typeof options.discountUSD === 'number' && Number.isFinite(options.discountUSD)
      ? roundMoney(options.discountUSD)
      : applyDiscountUSD(catalog, options.discountCode, subtotal);
  var total = roundMoney(Math.max(0, subtotal + shipping + tax - discount));
  return {
    subtotal: subtotal,
    shipping: shipping,
    tax: tax,
    discount: discount,
    total: total,
    shippingMethod: shippingMethod
  };
}

function repairCartItem(catalog, item) {
  if (!item || typeof item !== 'object') return item;
  var size = normalizeSize(item.size);
  var powerType = normalizePowerType(item.powerType);
  var slug = item.slug || item.productSlug || '';
  item.size = size;
  item.powerType = powerType;
  item.sizeLabel = item.sizeLabel || sizeToLabel(size);
  item.powerTypeLabel = powerTypeToLabel(powerType, catalog);
  item.unitPriceUSD = calculateProductUnitPrice(catalog, {
    slug: slug,
    size: size,
    powerType: powerType
  });
  return item;
}

function createPricingApi(catalog) {
  catalog = catalog || emptyCatalog();
  return {
    getCatalog: function () { return catalog; },
    DEFAULT_SIZE: DEFAULT_SIZE,
    DEFAULT_POWER: DEFAULT_POWER,
    DEFAULT_SHIPPING_METHOD: getDefaultShippingCode(catalog),
    SHIPPING_METHOD_KEY: SHIPPING_METHOD_KEY,
    normalizeSize: normalizeSize,
    normalizePowerType: normalizePowerType,
    normalizeShippingMethod: function (m) { return normalizeShippingMethod(m, catalog); },
    roundMoney: roundMoney,
    formatUsd: formatUsd,
    formatShippingUsd: formatShippingUsd,
    toCents: toCents,
    sizeToLabel: sizeToLabel,
    powerTypeToLabel: function (p) { return powerTypeToLabel(p, catalog); },
    shippingMethodToLabel: function (m) { return shippingMethodToLabel(m, catalog); },
    getProductSizePriceUSD: function (slug, size) { return getProductSizePriceUSD(catalog, slug, size); },
    getProductCompareAtSizePriceUSD: function (slug, size) {
      return getProductCompareAtSizePriceUSD(catalog, slug, size);
    },
    calculateProductCompareAtPrice: function (o) {
      return calculateProductCompareAtPrice(catalog, o);
    },
    getPowerUpgradeUSD: function (p) { return getPowerUpgradeUSD(catalog, p); },
    getShippingCostUSD: function (m) { return getShippingCostUSD(m, catalog); },
    getShippingMethods: function () { return getShippingMethods(catalog); },
    getDefaultShippingCode: function () { return getDefaultShippingCode(catalog); },
    calculateProductUnitPrice: function (o) { return calculateProductUnitPrice(catalog, o); },
    calculateLineTotal: function (o) { return calculateLineTotal(catalog, o); },
    calculateCartSubtotal: function (items) { return calculateCartSubtotal(catalog, items); },
    calculateOrderTotals: function (o) { return calculateOrderTotals(catalog, o); },
    repairCartItem: function (item) { return repairCartItem(catalog, item); },
    applyDiscountUSD: function (code, subtotal) { return applyDiscountUSD(catalog, code, subtotal); }
  };
}

var pricingCalcExports = {
  emptyCatalog: emptyCatalog,
  createPricingApi: createPricingApi,
  normalizeSize: normalizeSize,
  normalizePowerType: normalizePowerType,
  roundMoney: roundMoney,
  toCents: toCents,
  calculateProductUnitPrice: calculateProductUnitPrice,
  calculateOrderTotals: calculateOrderTotals,
  getShippingCostUSD: getShippingCostUSD,
  shippingMethodToLabel: shippingMethodToLabel,
  sizeToLabel: sizeToLabel,
  powerTypeToLabel: powerTypeToLabel,
  SHIPPING_METHOD_KEY: SHIPPING_METHOD_KEY
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = pricingCalcExports;
}
if (typeof globalThis !== 'undefined') {
  globalThis.ZYBAR = globalThis.ZYBAR || {};
  globalThis.ZYBAR.PricingCalc = pricingCalcExports;
}
