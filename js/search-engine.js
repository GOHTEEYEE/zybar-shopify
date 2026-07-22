/**
 * ZYBAR storefront search engine — reusable across pages.
 */
(function (global) {
  'use strict';

  var DEBOUNCE_MS = 200;
  var RECENT_KEY = 'zybar.search.recent';
  var MAX_RECENT = 8;
  var POPULAR = ['BMW', 'Audi', 'Porsche', 'Mercedes', 'Nissan', 'Toyota'];

  var BRAND_CATALOG = [
    { label: 'BMW', slug: 'bmw', aliases: ['bmw'] },
    { label: 'Audi', slug: 'audi', aliases: ['audi'] },
    { label: 'Mercedes-Benz', slug: 'mercedes-benz', aliases: ['mercedes', 'benz', 'mercedes-benz', 'mercedes benz'] },
    { label: 'Porsche', slug: 'porsche', aliases: ['porsche'] },
    { label: 'Nissan', slug: 'nissan', aliases: ['nissan'] },
    { label: 'Toyota', slug: 'toyota', aliases: ['toyota'] },
    { label: 'Honda', slug: 'honda', aliases: ['honda'] },
    { label: 'Ford', slug: 'ford', aliases: ['ford'] },
    { label: 'Dodge', slug: 'dodge', aliases: ['dodge'] },
    { label: 'Ferrari', slug: 'ferrari', aliases: ['ferrari'] },
    { label: 'Lamborghini', slug: 'lamborghini', aliases: ['lamborghini', 'lambo'] },
    { label: 'Bugatti', slug: 'bugatti', aliases: ['bugatti'] },
    { label: 'Maserati', slug: 'maserati', aliases: ['maserati'] },
    { label: 'Yamaha', slug: 'yamaha', aliases: ['yamaha'] },
    { label: 'McLaren', slug: 'mclaren', aliases: ['mclaren'] }
  ];

  var MODEL_SIGNAL_RE =
    /^(e\d{2}|g\d{2}|fk\d|r35|gt3|rs6|f40|f8|svj|amg|gtr|gt-?r|hellcat|supra|fk8|g80|m[1-9]\d{0,2}|r8|488|mc20|urus|svj|gt350|mustang|challenger|charger|nsx|s2000|rx-?7|rx-?8|silvia|skyline|corvette|camaro|viper|i8|z4|z8|i4|cls|amg63|gt-?r35)$/i;

  var state = {
    items: [],
    loaded: false,
    loading: null
  };

  function normalizeQuery(query) {
    return String(query || '')
      .toLowerCase()
      .replace(/[^\w\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tokenize(query) {
    var q = normalizeQuery(query);
    if (!q) return [];
    return q.split(' ').filter(Boolean);
  }

  function brandsMatch(itemBrand, brandLabel) {
    var a = String(itemBrand || '').toLowerCase().trim();
    var b = String(brandLabel || '').toLowerCase().trim();
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.indexOf(b) !== -1 || b.indexOf(a) !== -1) return true;
    var aToken = a.split(/[\s-]+/)[0];
    var bToken = b.split(/[\s-]+/)[0];
    return aToken === bToken;
  }

  function findBrandEntry(query) {
    var raw = normalizeQuery(query);
    var tokens = tokenize(query);
    if (!raw) return null;

    var joined = tokens.join(' ');

    for (var i = 0; i < BRAND_CATALOG.length; i++) {
      var entry = BRAND_CATALOG[i];
      var aliases = [entry.label.toLowerCase(), entry.slug].concat(entry.aliases || []);
      for (var j = 0; j < aliases.length; j++) {
        if (raw === aliases[j] || joined === aliases[j]) {
          return entry;
        }
      }
    }

    if (tokens.length === 1) {
      for (var k = 0; k < BRAND_CATALOG.length; k++) {
        var brand = BRAND_CATALOG[k];
        if ((brand.aliases || []).indexOf(tokens[0]) !== -1) return brand;
      }
    }

    return null;
  }

  function hasModelSignal(tokens) {
    if (!tokens.length) return false;
    if (tokens.length > 1) return true;
    return MODEL_SIGNAL_RE.test(tokens[0]);
  }

  function analyzeQuery(query) {
    var raw = normalizeQuery(query);
    var tokens = tokenize(query);
    if (!raw) return { type: 'idle' };

    var brandEntry = findBrandEntry(query);

    if (brandEntry && tokens.length === 1 && !hasModelSignal(tokens)) {
      return { type: 'brand', brand: brandEntry };
    }

    if (brandEntry && tokens.length === 2 && tokens[1] === 'benz' && tokens[0] === 'mercedes') {
      return { type: 'brand', brand: brandEntry };
    }

    return {
      type: 'model',
      brand: brandEntry
    };
  }

  function scoreItem(item, tokens, rawQuery) {
    if (!item || !tokens.length) return 0;
    if (item.productType === 'custom') return 0;
    var text = item.searchText || '';
    var name = String(item.name || '').toLowerCase();
    var slug = String(item.slug || '').toLowerCase();
    var score = 0;

    if (rawQuery && slug === rawQuery) score += 120;
    if (rawQuery && name === rawQuery) score += 100;
    if (rawQuery && name.indexOf(rawQuery) === 0) score += 70;
    if (rawQuery && text.indexOf(rawQuery) !== -1) score += 40;

    tokens.forEach(function (token) {
      if (!token) return;
      if (slug.indexOf(token) !== -1) score += 24;
      if (name.indexOf(token) !== -1) score += 20;
      if (String(item.brand || '').toLowerCase().indexOf(token) !== -1) score += 18;
      if (String(item.model || '').toLowerCase().indexOf(token) !== -1) score += 16;
      (item.chassisCodes || []).forEach(function (code) {
        if (String(code).toLowerCase() === token) score += 28;
      });
      if (String(item.ledColor || '').toLowerCase().indexOf(token) !== -1) score += 10;
      if (text.indexOf(token) !== -1) score += 8;
    });

    return score;
  }

  function loadIndex(force) {
    if (state.loaded && !force) return Promise.resolve(state.items);
    if (state.loading && !force) return state.loading;

    state.loading = fetch('/api/search-index')
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (data) {
        state.items = (data && data.items) || [];
        state.loaded = true;
        state.loading = null;
        return state.items;
      })
      .catch(function () {
        state.loading = null;
        return fallbackIndex();
      });

    return state.loading;
  }

  function fallbackIndex() {
    return fetch('/data/products.json')
      .then(function (r) {
        return r.ok ? r.json() : { products: [] };
      })
      .then(function (json) {
        state.items = (json.products || []).map(function (p) {
          var slug = p.slug;
          return {
            slug: slug,
            name: p.name || slug,
            href: '/products/' + slug + '/',
            imageUrl: '/Image/' + slug + '-1-on.webp',
            ledColor: p.ledColor || '',
            brand: '',
            model: '',
            chassisCodes: [],
            searchText: [p.name, slug.replace(/-/g, ' '), p.ledColor].join(' ').toLowerCase(),
            priceLabel: '',
            productType: p.productType || 'standard'
          };
        });
        state.loaded = true;
        return state.items;
      })
      .catch(function () {
        state.items = [];
        state.loaded = true;
        return state.items;
      });
  }

  function search(query, limit) {
    var raw = normalizeQuery(query);
    var tokens = tokenize(query);
    if (!raw) return [];

    var intent = analyzeQuery(query);
    if (intent.type === 'brand' && intent.brand) {
      return searchByBrand(intent.brand.label, limit);
    }

    var max = limit || 24;
    var ranked = state.items
      .map(function (item) {
        return { item: item, score: scoreItem(item, tokens, raw) };
      })
      .filter(function (row) {
        return row.score > 0 && row.item.productType !== 'custom';
      })
      .sort(function (a, b) {
        return b.score - a.score || String(a.item.name).localeCompare(String(b.item.name));
      })
      .slice(0, max)
      .map(function (row) {
        return row.item;
      });

    return ranked;
  }

  function searchByBrand(brandLabel, limit) {
    var max = limit || 48;
    return state.items
      .filter(function (item) {
        return item.productType !== 'custom' && brandsMatch(item.brand, brandLabel);
      })
      .sort(function (a, b) {
        return String(a.name).localeCompare(String(b.name));
      })
      .slice(0, max);
  }

  function getBrandCollection(brandEntry) {
    if (!brandEntry) return null;
    var products = searchByBrand(brandEntry.label, 999);
    if (!products.length) return null;
    return {
      label: brandEntry.label,
      slug: brandEntry.slug,
      count: products.length,
      href: '/collections/all/?brand=' + encodeURIComponent(brandEntry.slug),
      imageUrl: products[0].imageUrl || '',
      sampleName: products[0].name || brandEntry.label
    };
  }

  function readRecent() {
    try {
      var parsed = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT) : [];
    } catch (_) {
      return [];
    }
  }

  function rememberRecent(query) {
    var q = String(query || '').trim();
    if (!q) return;
    var list = readRecent().filter(function (item) {
      return item.toLowerCase() !== q.toLowerCase();
    });
    list.unshift(q);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
    } catch (_) {}
  }

  function clearRecent() {
    try {
      localStorage.removeItem(RECENT_KEY);
    } catch (_) {}
  }

  function debounce(fn, wait) {
    var timer;
    return function () {
      var ctx = this;
      var args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(ctx, args);
      }, wait);
    };
  }

  var api = {
    DEBOUNCE_MS: DEBOUNCE_MS,
    POPULAR: POPULAR,
    loadIndex: loadIndex,
    search: search,
    analyzeQuery: analyzeQuery,
    getBrandCollection: getBrandCollection,
    searchByBrand: searchByBrand,
    readRecent: readRecent,
    rememberRecent: rememberRecent,
    clearRecent: clearRecent,
    debounce: debounce,
    getItems: function () {
      return state.items.slice();
    }
  };

  global.ZYBAR = global.ZYBAR || {};
  global.ZYBAR.Search = api;
})(typeof window !== 'undefined' ? window : globalThis);
