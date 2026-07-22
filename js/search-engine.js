/**
 * ZYBAR storefront search engine — reusable across pages.
 */
(function (global) {
  'use strict';

  var DEBOUNCE_MS = 200;
  var RECENT_KEY = 'zybar.search.recent';
  var MAX_RECENT = 8;
  var POPULAR = ['BMW', 'Audi', 'Mercedes', 'Porsche', 'Nissan', 'Honda', 'Toyota'];

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

  function scoreItem(item, tokens, rawQuery) {
    if (!item || !tokens.length) return 0;
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

    var max = limit || 24;
    var ranked = state.items
      .map(function (item) {
        return { item: item, score: scoreItem(item, tokens, raw) };
      })
      .filter(function (row) {
        return row.score > 0;
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
