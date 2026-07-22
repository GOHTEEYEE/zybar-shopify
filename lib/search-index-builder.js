/**
 * Build storefront search index from catalog + products.json metadata.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var SearchMetadata = require('./search-metadata.js');
var Pricing = require('./pricing.js');

var displayTitlesCache = null;

function loadDisplayTitles() {
  if (displayTitlesCache) return displayTitlesCache;
  try {
    displayTitlesCache = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'data', 'product-display-titles.json'), 'utf8')
    );
  } catch (_) {
    displayTitlesCache = {};
  }
  return displayTitlesCache;
}

function productImageUrl(slug) {
  return '/Image/' + slug + '-1-on.webp';
}

function formatPrice(pricingApi, slug) {
  if (!pricingApi) return '';
  var amount = pricingApi.calculateProductUnitPrice({
    slug: slug,
    productSlug: slug,
    size: '30x45',
    powerType: 'usb'
  });
  return pricingApi.formatUsd(amount);
}

function buildIndexFromCatalog(catalog, productsJson) {
  var titles = loadDisplayTitles();
  var pricingApi = Pricing.createApi(catalog);
  var products = (productsJson && productsJson.products) || [];
  var bySlug = {};
  products.forEach(function (p) {
    if (p && p.slug) bySlug[p.slug] = p;
  });

  var items = [];
  var catalogProducts = (catalog && catalog.products) || {};

  Object.keys(catalogProducts).forEach(function (slug) {
    var entry = catalogProducts[slug];
    if (!entry || entry.status === 'archived') return;
    var source = bySlug[slug] || { slug: slug, name: entry.name || slug };
    if (source.productType === 'custom' || slug === 'custom-led-car-wall-art') {
      items.push(buildCustomItem(pricingApi, source, titles[slug]));
      return;
    }
    items.push(buildStandardItem(pricingApi, source, titles[slug], entry));
  });

  // Include products.json rows missing from catalog (fallback)
  products.forEach(function (p) {
    if (!p || !p.slug || catalogProducts[p.slug]) return;
    items.push(buildStandardItem(pricingApi, p, titles[p.slug], null));
  });

  items.sort(function (a, b) {
    return String(a.name).localeCompare(String(b.name));
  });

  return {
    updatedAt: new Date().toISOString(),
    count: items.length,
    items: items
  };
}

function buildStandardItem(pricingApi, product, displayTitle, catalogEntry) {
  var slug = product.slug;
  var meta = SearchMetadata.buildSearchMetadata(product, displayTitle || catalogEntry && catalogEntry.name);
  var name = displayTitle || product.name || meta.brand + ' ' + meta.model;
  return {
    slug: slug,
    name: String(name).trim(),
    href: '/products/' + slug + '/',
    imageUrl: productImageUrl(slug),
    ledColor: meta.ledColor || product.ledColor || '',
    brand: meta.brand,
    model: meta.model,
    chassisCodes: meta.chassisCodes,
    generation: meta.generation,
    keywords: meta.keywords,
    searchText: [name, meta.searchText, slug.replace(/-/g, ' ')].join(' ').toLowerCase(),
    priceLabel: 'From ' + formatPrice(pricingApi, slug),
    productType: 'standard'
  };
}

function buildCustomItem(pricingApi, product, displayTitle) {
  var slug = 'custom-led-car-wall-art';
  var name = displayTitle || product.name || 'Custom LED Car Wall Art';
  var meta = SearchMetadata.buildSearchMetadata(
    Object.assign({}, product, {
      slug: slug,
      search: {
        brand: 'Custom',
        model: 'Your Vehicle',
        keywords: ['custom', 'bespoke', 'build', 'your car', 'dream car', 'one off'],
        aliases: ['custom made', 'custom order']
      }
    }),
    name
  );
  return {
    slug: slug,
    name: name,
    href: '/products/custom-led-car-wall-art/',
    imageUrl: '/Image/custom-led-car-wall-art-1.jpg',
    ledColor: 'Custom',
    brand: 'Custom',
    model: 'Your Vehicle',
    chassisCodes: meta.chassisCodes,
    generation: meta.generation,
    keywords: meta.keywords,
    searchText: [name, meta.searchText, 'custom build your car dream vehicle'].join(' ').toLowerCase(),
    priceLabel: 'From ' + formatPrice(pricingApi, slug),
    productType: 'custom'
  };
}

async function buildSearchIndex(supabase) {
  var catalog = await Pricing.loadCatalog(supabase, { force: false });
  var productsJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'data', 'products.json'), 'utf8')
  );
  return buildIndexFromCatalog(catalog, productsJson);
}

module.exports = {
  buildSearchIndex: buildSearchIndex,
  buildIndexFromCatalog: buildIndexFromCatalog
};
