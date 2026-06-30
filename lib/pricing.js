/**
 * ZYBAR unified pricing — base + size + power + shipping.
 * Used by browser (window.ZYBAR.Pricing) and Node (require).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.ZYBAR = root.ZYBAR || {};
  root.ZYBAR.Pricing = api;
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var BASE_PRICE_USD = 76;
  var DEFAULT_SIZE = "30x45";
  var DEFAULT_POWER = "usb";
  var DEFAULT_SHIPPING_METHOD = "standard";
  var SHIPPING_METHOD_KEY = "zybar.shipping.method";

  var SIZE_UPGRADES_USD = {
    "30x45": 0,
    "40x60": 15
  };

  var POWER_UPGRADES_USD = {
    usb: 0,
    dual: 12
  };

  var SHIPPING_USD = {
    standard: 20,
    priority: 25
  };

  function normalizeSize(size) {
    var value = String(size || DEFAULT_SIZE).trim().toLowerCase().replace(/\s+/g, "");
    if (value === "40x60" || value === "40×60") return "40x60";
    return DEFAULT_SIZE;
  }

  function normalizePowerType(powerType) {
    var value = String(powerType || DEFAULT_POWER).trim().toLowerCase();
    if (value === "dual" || value === "usb+battery" || value === "usb_battery") return "dual";
    return DEFAULT_POWER;
  }

  function normalizeShippingMethod(method) {
    var value = String(method || DEFAULT_SHIPPING_METHOD).trim().toLowerCase();
    if (value === "priority" || value === "fast" || value === "fast_priority") return "priority";
    return DEFAULT_SHIPPING_METHOD;
  }

  function roundMoney(amount) {
    return Math.round(Number(amount || 0) * 100) / 100;
  }

  function formatUsd(amount) {
    return "$" + roundMoney(amount).toFixed(2);
  }

  function toCents(amount) {
    return Math.round(roundMoney(amount) * 100);
  }

  function sizeToLabel(size) {
    return normalizeSize(size) === "40x60" ? "40 × 60 cm" : "30 × 45 cm";
  }

  function powerTypeToLabel(powerType) {
    return normalizePowerType(powerType) === "dual" ? "USB + Battery" : "USB Only";
  }

  function shippingMethodToLabel(method) {
    return normalizeShippingMethod(method) === "priority"
      ? "Priority Shipping"
      : "Standard Shipping";
  }

  function getSizeUpgradeUSD(size) {
    var key = normalizeSize(size);
    return typeof SIZE_UPGRADES_USD[key] === "number" ? SIZE_UPGRADES_USD[key] : 0;
  }

  function getPowerUpgradeUSD(powerType) {
    var key = normalizePowerType(powerType);
    return typeof POWER_UPGRADES_USD[key] === "number" ? POWER_UPGRADES_USD[key] : 0;
  }

  function getShippingCostUSD(shippingMethod) {
    var key = normalizeShippingMethod(shippingMethod);
    return typeof SHIPPING_USD[key] === "number" ? SHIPPING_USD[key] : SHIPPING_USD.standard;
  }

  function calculateProductUnitPrice(options) {
    options = options || {};
    return roundMoney(
      BASE_PRICE_USD + getSizeUpgradeUSD(options.size) + getPowerUpgradeUSD(options.powerType)
    );
  }

  function calculateLineTotal(options) {
    options = options || {};
    var qty = Number(options.quantity);
    var safeQty = Number.isFinite(qty) && qty > 0 ? qty : 1;
    var unit =
      typeof options.unitPriceUSD === "number" && Number.isFinite(options.unitPriceUSD)
        ? options.unitPriceUSD
        : calculateProductUnitPrice(options);
    return roundMoney(unit * safeQty);
  }

  function calculateCartSubtotal(items) {
    var subtotal = 0;
    (items || []).forEach(function (item) {
      subtotal += calculateLineTotal({
        size: item && item.size,
        powerType: item && item.powerType,
        quantity: item && item.quantity
      });
    });
    return roundMoney(subtotal);
  }

  function calculateOrderTotals(options) {
    options = options || {};
    var items = Array.isArray(options.items) ? options.items : [];
    var shippingMethod = normalizeShippingMethod(options.shippingMethod);
    var subtotal = calculateCartSubtotal(items);
    var shipping = getShippingCostUSD(shippingMethod);
    var tax = roundMoney(Number(options.taxUSD) || 0);
    var discount = roundMoney(Number(options.discountUSD) || 0);
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

  function repairCartItem(item) {
    if (!item || typeof item !== "object") return item;
    var size = normalizeSize(item.size);
    var powerType = normalizePowerType(item.powerType);
    item.size = size;
    item.powerType = powerType;
    item.sizeLabel = item.sizeLabel || sizeToLabel(size);
    item.powerTypeLabel = powerTypeToLabel(powerType);
    item.unitPriceUSD = calculateProductUnitPrice({ size: size, powerType: powerType });
    return item;
  }

  function readShippingMethod() {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        return normalizeShippingMethod(window.localStorage.getItem(SHIPPING_METHOD_KEY));
      }
    } catch (_) {}
    return DEFAULT_SHIPPING_METHOD;
  }

  function writeShippingMethod(method) {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(SHIPPING_METHOD_KEY, normalizeShippingMethod(method));
      }
    } catch (_) {}
  }

  return {
    BASE_PRICE_USD: BASE_PRICE_USD,
    DEFAULT_SIZE: DEFAULT_SIZE,
    DEFAULT_POWER: DEFAULT_POWER,
    DEFAULT_SHIPPING_METHOD: DEFAULT_SHIPPING_METHOD,
    SHIPPING_METHOD_KEY: SHIPPING_METHOD_KEY,
    SIZE_UPGRADES_USD: SIZE_UPGRADES_USD,
    POWER_UPGRADES_USD: POWER_UPGRADES_USD,
    SHIPPING_USD: SHIPPING_USD,
    normalizeSize: normalizeSize,
    normalizePowerType: normalizePowerType,
    normalizeShippingMethod: normalizeShippingMethod,
    roundMoney: roundMoney,
    formatUsd: formatUsd,
    toCents: toCents,
    sizeToLabel: sizeToLabel,
    powerTypeToLabel: powerTypeToLabel,
    shippingMethodToLabel: shippingMethodToLabel,
    getSizeUpgradeUSD: getSizeUpgradeUSD,
    getPowerUpgradeUSD: getPowerUpgradeUSD,
    getShippingCostUSD: getShippingCostUSD,
    calculateProductUnitPrice: calculateProductUnitPrice,
    calculateLineTotal: calculateLineTotal,
    calculateCartSubtotal: calculateCartSubtotal,
    calculateOrderTotals: calculateOrderTotals,
    repairCartItem: repairCartItem,
    readShippingMethod: readShippingMethod,
    writeShippingMethod: writeShippingMethod
  };
});
