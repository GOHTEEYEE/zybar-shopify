/**
 * ZYBAR storefront search engine — live prefix, suggestions, brand collections.
 */
(function (global) {
  'use strict';

  var DEBOUNCE_MS = 90;
  var RECENT_KEY = 'zybar.search.recent';
  var MAX_RECENT = 8;
  var MIN_QUERY_LEN = 1;
  var POPULAR = ['BMW', 'Audi', 'Porsche', 'Mercedes', 'Nissan', 'Toyota'];

  var BRAND_CATALOG = [
    { label: 'BMW', slug: 'bmw', aliases: ['bmw'] },
    { label: 'Audi', slug: 'audi', aliases: ['audi'] },
    { label: 'Mercedes-Benz', slug: 'mercedes-benz', aliases: ['mercedes', 'benz', 'mercedes-benz', 'mercedes benz', 'amg'] },
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
    /^(e\d{0,2}|g\d{0,2}|fk\d|r35|gt\d|rs\d|f\d{1,2}|svj|amg|gtr|gt-?r|hellcat|supra|fk8|g80|m[1-9]\d{0,2}|r8|488|mc20|urus|gt350|mustang|challenger|charger|nsx|s2000|rx-?7|rx-?8|silvia|skyline|corvette|camaro|viper|i8|z4|z8|i4|cls|amg63|gt-?r35|911|gt3|rs6)$/i;

  var state = {
    items: [],
    suggestions: [],
    suggestionsReady: false,
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
    return a.split(/[\s-]+/)[0] === b.split(/[\s-]+/)[0];
  }

  function prefixMatch(haystack, needle) {
    if (!haystack || !needle) return false;
    return String(haystack).toLowerCase().indexOf(String(needle).toLowerCase()) === 0;
  }

  function partialMatch(haystack, needle) {
    if (!haystack || !needle) return false;
    return String(haystack).toLowerCase().indexOf(String(needle).toLowerCase()) !== -1;
  }

  function findBrandExact(query) {
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

  function findBrandPartial(query) {
    var exact = findBrandExact(query);
    if (exact) return exact;

    var tokens = tokenize(query);
    if (tokens.length !== 1) return null;

    var token = tokens[0];
    if (token.length < 2) return null;

    var best = null;
    var bestScore = 0;

    BRAND_CATALOG.forEach(function (entry) {
      var candidates = [entry.label, entry.slug].concat(entry.aliases || []);
      candidates.forEach(function (candidate) {
        var c = String(candidate).toLowerCase();
        var score = 0;
        if (c === token) score = 200;
        else if (prefixMatch(c, token)) score = 140 - (c.length - token.length);
        else if (partialMatch(c, token)) score = 60;
        if (score > bestScore) {
          bestScore = score;
          best = entry;
        }
      });
    });

    return bestScore >= 60 ? best : null;
  }

  function hasModelSignal(tokens) {
    if (!tokens.length) return false;
    if (tokens.length > 1) return true;
    var t = tokens[0];
    if (MODEL_SIGNAL_RE.test(t)) return true;
    if (/^\d/.test(t)) return true;
    if (t.length <= 3 && !findBrandExact(t) && !findBrandPartial(t)) {
      return /[a-z]*\d|[a-z]{1,2}\d/i.test(t);
    }
    return false;
  }

  function analyzeQuery(query) {
    var raw = normalizeQuery(query);
    var tokens = tokenize(query);
    if (!raw) return { type: 'idle' };

    if (tokens.length === 2 && tokens[0] === 'mercedes' && tokens[1] === 'benz') {
      return { type: 'brand', brand: findBrandExact('mercedes') || findBrandPartial('mercedes') };
    }

    if (tokens.length === 1 && !hasModelSignal(tokens)) {
      var brandOnly = findBrandExact(query) || findBrandPartial(query);
      if (brandOnly) {
        return { type: 'brand', brand: brandOnly };
      }
    }

    return { type: 'model', brand: findBrandExact(query) || findBrandPartial(query) };
  }

  function scoreItem(item, tokens, rawQuery) {
    if (!item || item.productType === 'custom') return 0;
    if (!rawQuery || rawQuery.length < MIN_QUERY_LEN) return 0;

    var text = item.searchText || '';
    var name = String(item.name || '').toLowerCase();
    var slug = String(item.slug || '').toLowerCase();
    var brand = String(item.brand || '').toLowerCase();
    var model = String(item.model || '').toLowerCase();
    var score = 0;

    if (slug === rawQuery) score += 140;
    if (name === rawQuery) score += 130;
    if (prefixMatch(name, rawQuery)) score += 95;
    if (prefixMatch(brand, rawQuery)) score += 88;
    if (prefixMatch(model, rawQuery)) score += 82;
    if (prefixMatch(slug.replace(/-/g, ' '), rawQuery)) score += 75;
    if (partialMatch(name, rawQuery)) score += 48;
    if (partialMatch(text, rawQuery)) score += 36;

    (item.chassisCodes || []).forEach(function (code) {
      var c = String(code).toLowerCase();
      if (c === rawQuery) score += 110;
      else if (prefixMatch(c, rawQuery)) score += 92;
      else if (partialMatch(c, rawQuery)) score += 55;
    });

    tokens.forEach(function (token) {
      if (!token) return;
      if (prefixMatch(name, token)) score += 28;
      if (prefixMatch(brand, token)) score += 24;
      if (prefixMatch(model, token)) score += 22;
      if (slug.indexOf(token) !== -1) score += 18;
      if (partialMatch(text, token)) score += 10;
      (item.chassisCodes || []).forEach(function (code) {
        var c = String(code).toLowerCase();
        if (c === token) score += 32;
        else if (prefixMatch(c, token)) score += 26;
      });
      if (String(item.ledColor || '').toLowerCase().indexOf(token) !== -1) score += 8;
    });

    return score;
  }

  function buildSuggestionsIndex() {
    if (state.suggestionsReady) return;

    var seen = {};
    var list = [];

    function add(label, kind, meta) {
      var key = String(label || '').toLowerCase().trim();
      if (!key || seen[key]) return;
      seen[key] = true;
      list.push({
        label: String(label).trim(),
        kind: kind || 'term',
        meta: meta || null
      });
    }

    BRAND_CATALOG.forEach(function (b) {
      add(b.label, 'brand', b);
    });

    var modelPairs = {};
    state.items.forEach(function (item) {
      if (!item || item.productType === 'custom') return;

      if (item.brand) {
        add(item.brand, 'brand');
      }

      if (item.brand && item.model) {
        var pair = item.brand + ' ' + item.model;
        if (!modelPairs[pair.toLowerCase()]) {
          modelPairs[pair.toLowerCase()] = true;
          add(pair, 'model', item);
        }
      }

      if (item.brand && item.chassisCodes && item.chassisCodes.length) {
        item.chassisCodes.forEach(function (code) {
          add(item.brand + ' ' + code, 'chassis', item);
          add(code, 'chassis', item);
        });
      }

      if (item.name) {
        var shortName = String(item.name)
          .replace(/\s*NEON.*$/i, '')
          .replace(/\s*Poster.*$/i, '')
          .trim();
        if (shortName.length >= 4 && shortName.length <= 42) {
          add(shortName, 'product', item);
        }
      }
    });

    [
      'Porsche GT3 RS',
      'Porsche 911',
      'BMW M4',
      'BMW E46',
      'BMW E36',
      'Audi RS6',
      'Audi R8',
      'Nissan GT-R',
      'Toyota Supra',
      'Mercedes AMG'
    ].forEach(function (seed) {
      add(seed, 'seed');
    });

    state.suggestions = list;
    state.suggestionsReady = true;
  }

  function scoreSuggestion(suggestion, raw) {
    var label = String(suggestion.label || '').toLowerCase();
    if (!label || !raw) return 0;

    if (label === raw) return 220;
    if (prefixMatch(label, raw)) return 180 - Math.min(40, label.length - raw.length);

    var words = label.split(/\s+/);
    var wordPrefix = false;
    for (var i = 0; i < words.length; i++) {
      if (prefixMatch(words[i], raw)) {
        wordPrefix = true;
        break;
      }
    }
    if (wordPrefix) return 130;

    if (partialMatch(label, raw)) return 70;
    return 0;
  }

  function getSuggestions(query, limit) {
    buildSuggestionsIndex();
    var raw = normalizeQuery(query);
    if (!raw || raw.length < MIN_QUERY_LEN) return [];

    return state.suggestions
      .map(function (s) {
        return { suggestion: s, score: scoreSuggestion(s, raw) };
      })
      .filter(function (row) {
        return row.score > 0;
      })
      .sort(function (a, b) {
        return (
          b.score - a.score ||
          String(a.suggestion.label).length - String(b.suggestion.label).length ||
          String(a.suggestion.label).localeCompare(String(b.suggestion.label))
        );
      })
      .slice(0, limit || 6)
      .map(function (row) {
        return row.suggestion;
      });
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
        state.suggestionsReady = false;
        buildSuggestionsIndex();
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
        state.suggestionsReady = false;
        buildSuggestionsIndex();
        return state.items;
      })
      .catch(function () {
        state.items = [];
        state.loaded = true;
        buildSuggestionsIndex();
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
    var minScore = raw.length <= 2 ? 8 : 4;

    return state.items
      .map(function (item) {
        return { item: item, score: scoreItem(item, tokens, raw) };
      })
      .filter(function (row) {
        return row.score >= minScore && row.item.productType !== 'custom';
      })
      .sort(function (a, b) {
        return b.score - a.score || String(a.item.name).localeCompare(String(b.item.name));
      })
      .slice(0, max)
      .map(function (row) {
        return row.item;
      });
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

  function searchRun(query) {
    var raw = normalizeQuery(query);
    if (!raw) {
      return { suggestions: [], collection: null, results: [], intent: { type: 'idle' } };
    }

    var intent = analyzeQuery(query);
    var suggestions = getSuggestions(query, 6);
    var collection = null;
    var results = [];

    if (intent.type === 'brand' && intent.brand) {
      collection = getBrandCollection(intent.brand);
      results = searchByBrand(intent.brand.label, 24);
    } else {
      results = search(query, 24);
    }

    return {
      suggestions: suggestions,
      collection: collection,
      results: results,
      intent: intent
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
    searchRun: searchRun,
    getSuggestions: getSuggestions,
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
