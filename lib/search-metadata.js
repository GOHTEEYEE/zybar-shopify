/**
 * Derive searchable vehicle metadata from product slugs and names.
 * Optional per-product overrides in products.json under `search`.
 */
'use strict';

var BRAND_RULES = [
  { re: /^mercedes-benz/i, brand: 'Mercedes-Benz' },
  { re: /^mercedes/i, brand: 'Mercedes-Benz' },
  { re: /^bmw/i, brand: 'BMW' },
  { re: /^audi/i, brand: 'Audi' },
  { re: /^porsche/i, brand: 'Porsche' },
  { re: /^ferrari/i, brand: 'Ferrari' },
  { re: /^lambr?ghini/i, brand: 'Lamborghini' },
  { re: /^bugatti/i, brand: 'Bugatti' },
  { re: /^nissan/i, brand: 'Nissan' },
  { re: /^toyota/i, brand: 'Toyota' },
  { re: /^honda/i, brand: 'Honda' },
  { re: /^ford/i, brand: 'Ford' },
  { re: /^dodge/i, brand: 'Dodge' },
  { re: /^maserati/i, brand: 'Maserati' },
  { re: /^yamaha/i, brand: 'Yamaha' },
  { re: /^mclaren/i, brand: 'McLaren' }
];

var GENERATION_HINTS = {
  e36: 'E36 Generation',
  e39: 'E39 Generation',
  e46: 'E46 Generation',
  e90: 'E90 Generation',
  g80: 'G80 Generation',
  fk8: 'FK8 Type R',
  r35: 'R35 GT-R',
  gt3: 'GT3',
  rs6: 'RS6',
  f40: 'F40',
  f8: 'F8',
  svj: 'SVJ',
  supra: 'A90 Supra'
};

function titleCase(value) {
  return String(value || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, function (c) {
      return c.toUpperCase();
    });
}

function detectBrand(slug, name) {
  var hay = String(slug || '') + ' ' + String(name || '');
  for (var i = 0; i < BRAND_RULES.length; i++) {
    if (BRAND_RULES[i].re.test(hay)) return BRAND_RULES[i].brand;
  }
  var token = String(slug || '').split('-')[0];
  if (token && token.length > 2 && !/^[a-z]$/.test(token)) return titleCase(token);
  return '';
}

function extractCodes(slug, name, extra) {
  var text = [slug, name].concat(extra || []).join(' ').toLowerCase();
  var codes = [];
  var patterns = [
    /\be\d{2}\b/gi,
    /\bg\d{2}\b/gi,
    /\bfk\d\b/gi,
    /\br35\b/gi,
    /\bgt3\b/gi,
    /\brs6\b/gi,
    /\bf40\b/gi,
    /\bf8\b/gi,
    /\bsvj\b/gi,
    /\bamg\b/gi,
    /\bgtr\b/gi,
    /\bgt-?r\b/gi,
    /\bhellcat\b/gi,
    /\bsupra\b/gi,
    /\bm4\b/gi,
    /\bm2\b/gi,
    /\bm5\b/gi,
    /\br8\b/gi
  ];
  patterns.forEach(function (re) {
    var match;
    var r = new RegExp(re.source, re.flags);
    while ((match = r.exec(text))) {
      var code = String(match[0]).toUpperCase().replace('GT-R', 'GTR');
      if (codes.indexOf(code) === -1) codes.push(code);
    }
  });
  if (/gt-?r35|gt-r-?35/i.test(text)) {
    ['R35', 'GTR'].forEach(function (c) {
      if (codes.indexOf(c) === -1) codes.push(c);
    });
  }
  if (/fk8/i.test(text) && codes.indexOf('FK8') === -1) codes.push('FK8');
  if (/g80/i.test(text) && codes.indexOf('G80') === -1) codes.push('G80');
  return codes;
}

function deriveModel(slug, brand, name) {
  var cleanName = String(name || '')
    .replace(/\s*edition\s*$/i, '')
    .replace(/\s*–\s*/g, ' ')
    .trim();
  if (brand && cleanName.toLowerCase().indexOf(brand.toLowerCase()) === 0) {
    return cleanName.slice(brand.length).trim();
  }
  var parts = String(slug || '').split('-').filter(Boolean);
  if (parts[0] && parts[0].length === 1) parts.shift();
  if (brand) {
    var brandToken = brand.toLowerCase().split(' ')[0];
    if (parts[0] && parts[0].toLowerCase() === brandToken) parts.shift();
    if (parts[0] === 'benz') parts.shift();
  }
  return titleCase(parts.join(' '));
}

function generationFromCodes(codes) {
  for (var i = 0; i < codes.length; i++) {
    var key = codes[i].toLowerCase();
    if (GENERATION_HINTS[key]) return GENERATION_HINTS[key];
  }
  return '';
}

function buildSearchMetadata(product, displayTitle) {
  product = product || {};
  var slug = String(product.slug || '').trim();
  var name = displayTitle || product.name || titleCase(slug.replace(/-/g, ' '));
  var override = product.search && typeof product.search === 'object' ? product.search : {};

  var brand = override.brand || detectBrand(slug, name);
  var chassis = []
    .concat(override.chassis || override.chassisCodes || [])
    .concat(extractCodes(slug, name, override.aliases || []))
    .map(function (c) {
      return String(c).toUpperCase();
    })
    .filter(function (c, idx, arr) {
      return c && arr.indexOf(c) === idx;
    });

  var model = override.model || deriveModel(slug, brand, name);
  var generation = override.generation || generationFromCodes(chassis);
  var ledColor = product.ledColor || '';
  var keywords = []
    .concat(override.keywords || [])
    .concat(override.aliases || [])
    .concat(slug.split('-'))
    .concat(String(name).split(/\s+/))
    .concat(chassis)
    .concat([brand, model, generation, ledColor])
    .map(function (v) {
      return String(v || '').trim();
    })
    .filter(Boolean);

  var uniqueKeywords = keywords.filter(function (v, i, arr) {
    return arr.findIndex(function (x) {
      return x.toLowerCase() === v.toLowerCase();
    }) === i;
  });

  return {
    brand: brand,
    model: model,
    chassisCodes: chassis,
    generation: generation,
    ledColor: ledColor,
    keywords: uniqueKeywords,
    searchText: uniqueKeywords.join(' ').toLowerCase()
  };
}

module.exports = {
  buildSearchMetadata: buildSearchMetadata,
  detectBrand: detectBrand,
  extractCodes: extractCodes
};
