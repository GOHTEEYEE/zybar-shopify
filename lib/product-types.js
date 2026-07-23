/**
 * Reusable product type registry for ZYBAR.
 * Standard products, gift cards, and configurable custom products share one pipeline.
 */
'use strict';

var CUSTOM_SLUG = 'custom-led-car-wall-art';
var DEFAULT_CUSTOM_DESIGN_FEE_USD = 10;

var PRODUCT_TYPES = {
  standard: {
    id: 'standard',
    label: 'Standard Product'
  },
  gift_card: {
    id: 'gift_card',
    label: 'Gift Card'
  },
  custom: {
    id: 'custom',
    label: 'Custom Product',
    designFeeUsd: DEFAULT_CUSTOM_DESIGN_FEE_USD,
    slugs: [CUSTOM_SLUG],
    minPhotos: 1,
    maxPhotos: 1,
    maxPhotoBytes: 10 * 1024 * 1024,
    productionDays: { min: 3, max: 5 },
    designStatuses: [
      'pending_review',
      'designing',
      'waiting_for_approval',
      'approved',
      'producing',
      'quality_check',
      'shipped'
    ]
  }
};

function getProductTypeMeta(productType) {
  return PRODUCT_TYPES[productType] || PRODUCT_TYPES.standard;
}

function isCustomSlug(slug) {
  var key = String(slug || '').trim();
  if (!key) return false;
  var custom = PRODUCT_TYPES.custom;
  return custom.slugs.indexOf(key) !== -1;
}

function getProductTypeForSlug(slug, catalogProduct) {
  if (catalogProduct && catalogProduct.productType) {
    return String(catalogProduct.productType);
  }
  return isCustomSlug(slug) ? 'custom' : 'standard';
}

function getCustomDesignFeeUSD(catalog, slug) {
  if (!isCustomSlug(slug)) return 0;
  var product =
    catalog && catalog.products && catalog.products[slug] ? catalog.products[slug] : null;
  var fee = product && Number(product.customDesignFeeUsd);
  if (Number.isFinite(fee) && fee >= 0) return fee;
  return DEFAULT_CUSTOM_DESIGN_FEE_USD;
}

function normalizeCustomConfig(config) {
  config = config && typeof config === 'object' ? config : {};
  var photos = Array.isArray(config.photos) ? config.photos : [];
  return {
    vehicleBrand: String(config.vehicleBrand || '').trim(),
    vehicleModel: String(config.vehicleModel || '').trim(),
    vehicleYear: String(config.vehicleYear || '').trim(),
    specialRequests: String(config.specialRequests || config.lightingPreference || '').trim(),
    customerEmail: String(config.customerEmail || config.customer_email || '')
      .trim()
      .toLowerCase(),
    photos: photos
      .map(function (photo) {
        if (!photo || typeof photo !== 'object') return null;
        return {
          id: String(photo.id || '').trim(),
          url: String(photo.url || '').trim(),
          name: String(photo.name || '').trim(),
          path: String(photo.path || '').trim()
        };
      })
      .filter(function (photo) {
        return photo && (photo.url || photo.path || photo.id);
      })
  };
}

function vehicleLabel(config) {
  var normalized = normalizeCustomConfig(config);
  var parts = [normalized.vehicleBrand, normalized.vehicleModel, normalized.vehicleYear].filter(Boolean);
  return parts.join(' ');
}

function isCustomConfigComplete(config) {
  var normalized = normalizeCustomConfig(config);
  if (!normalized.vehicleModel) return false;
  if (!normalized.customerEmail || normalized.customerEmail.indexOf('@') === -1) return false;
  return normalized.photos.length >= PRODUCT_TYPES.custom.minPhotos;
}

var exportsObj = {
  CUSTOM_SLUG: CUSTOM_SLUG,
  DEFAULT_CUSTOM_DESIGN_FEE_USD: DEFAULT_CUSTOM_DESIGN_FEE_USD,
  PRODUCT_TYPES: PRODUCT_TYPES,
  getProductTypeMeta: getProductTypeMeta,
  isCustomSlug: isCustomSlug,
  getProductTypeForSlug: getProductTypeForSlug,
  getCustomDesignFeeUSD: getCustomDesignFeeUSD,
  normalizeCustomConfig: normalizeCustomConfig,
  vehicleLabel: vehicleLabel,
  isCustomConfigComplete: isCustomConfigComplete
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = exportsObj;
}
if (typeof globalThis !== 'undefined') {
  globalThis.ZYBAR = globalThis.ZYBAR || {};
  globalThis.ZYBAR.ProductTypes = exportsObj;
}
