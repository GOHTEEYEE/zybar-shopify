/**
 * Premium full-screen search overlay for ZYBAR storefront.
 */
(function () {
  'use strict';

  if (window.location.pathname.indexOf('/admin/') === 0) return;

  var CUSTOM_HREF = '/products/custom-led-car-wall-art/';
  var overlay = null;
  var inputEl = null;
  var bodyEl = null;
  var debouncedSearch = null;

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getEngine() {
    return window.ZYBAR && window.ZYBAR.Search;
  }

  function ensureOverlay() {
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'zybar-search-overlay';
    overlay.className = 'zybar-search-overlay';
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML =
      '<div class="zybar-search-shell" role="dialog" aria-modal="true" aria-label="Search ZYBAR">' +
      '<div class="zybar-search-top">' +
      '<div class="zybar-search-bar-wrap">' +
      '<svg class="zybar-search-bar-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><line x1="16.5" y1="16.5" x2="21" y2="21"></line></svg>' +
      '<input id="zybarSearchInput" class="zybar-search-input" type="search" inputmode="search" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="Search by car brand, model or chassis code..." aria-label="Search by car brand, model or chassis code" />' +
      '<button type="button" class="zybar-search-clear" id="zybarSearchClear" hidden aria-label="Clear search">×</button>' +
      '</div>' +
      '<button type="button" class="zybar-search-close icon-btn" id="zybarSearchClose" aria-label="Close search">×</button>' +
      '</div>' +
      '<div class="zybar-search-examples" aria-hidden="true">BMW · Audi RS6 · Porsche GT3 RS · E36 · G80 · FK8 · R35</div>' +
      '<div class="zybar-search-body" id="zybarSearchBody"></div>' +
      '</div>';

    document.body.appendChild(overlay);
    inputEl = overlay.querySelector('#zybarSearchInput');
    bodyEl = overlay.querySelector('#zybarSearchBody');

    overlay.querySelector('#zybarSearchClose').addEventListener('click', close);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });
    overlay.querySelector('#zybarSearchClear').addEventListener('click', function () {
      if (!inputEl) return;
      inputEl.value = '';
      inputEl.focus();
      render('');
      toggleClear();
    });

    inputEl.addEventListener('input', function () {
      toggleClear();
      debouncedSearch(inputEl.value);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay && !overlay.hidden) {
        e.preventDefault();
        close();
      }
    });

    var engine = getEngine();
    debouncedSearch = engine
      ? engine.debounce(function (value) {
          render(value);
        }, engine.DEBOUNCE_MS)
      : function (value) {
          render(value);
        };

    return overlay;
  }

  function toggleClear() {
    var clearBtn = overlay && overlay.querySelector('#zybarSearchClear');
    if (!clearBtn || !inputEl) return;
    clearBtn.hidden = !inputEl.value;
  }

  function chipsHtml(title, items, attr) {
    if (!items.length) return '';
    return (
      '<div class="zybar-search-section">' +
      '<p class="zybar-search-section-title">' +
      esc(title) +
      '</p>' +
      '<div class="zybar-search-chips">' +
      items
        .map(function (item) {
          return (
            '<button type="button" class="zybar-search-chip" ' +
            attr +
            '="' +
            esc(item) +
            '">' +
            esc(item) +
            '</button>'
          );
        })
        .join('') +
      '</div></div>'
    );
  }

  function resultCard(item) {
    return (
      '<a class="zybar-search-result" href="' +
      esc(item.href) +
      '" data-search-result="1">' +
      '<div class="zybar-search-result-thumb">' +
      '<img src="' +
      esc(item.imageUrl) +
      '" alt="" loading="lazy" onerror="this.onerror=null;this.src=this.src.replace(/-on\\.webp$/i,\'.webp\').replace(/\\.webp$/i,\'.jpg\');" />' +
      '</div>' +
      '<div class="zybar-search-result-meta">' +
      '<p class="zybar-search-result-name">' +
      esc(item.name) +
      '</p>' +
      '<p class="zybar-search-result-sub">' +
      esc(item.ledColor || 'LED') +
      (item.brand ? ' · ' + esc(item.brand) : '') +
      '</p>' +
      (item.priceLabel ? '<p class="zybar-search-result-price">' + esc(item.priceLabel) + '</p>' : '') +
      '</div>' +
      '</a>'
    );
  }

  function customizeHtml() {
    return (
      '<div class="zybar-search-custom-offer">' +
      '<p class="zybar-search-custom-title">Can\'t find your car?</p>' +
      '<p class="zybar-search-custom-copy">We\'ll build it for you.</p>' +
      '<a class="zybar-search-custom-cta" href="' +
      CUSTOM_HREF +
      '" data-search-custom-cta="1">Customize Yours</a>' +
      '</div>'
    );
  }

  function collectionCardHtml(collection) {
    if (!collection) return '';
    var countLabel = collection.count + ' Product' + (collection.count === 1 ? '' : 's');
    return (
      '<a class="zybar-search-collection" href="' +
      esc(collection.href) +
      '" data-search-collection="1">' +
      '<div class="zybar-search-collection-media">' +
      (collection.imageUrl
        ? '<img src="' + esc(collection.imageUrl) + '" alt="" loading="lazy" onerror="this.onerror=null;this.src=this.src.replace(/-on\\.webp$/i,\'.webp\').replace(/\\.webp$/i,\'.jpg\');" />'
        : '') +
      '<span class="zybar-search-collection-glow" aria-hidden="true"></span>' +
      '</div>' +
      '<div class="zybar-search-collection-body">' +
      '<p class="zybar-search-collection-kicker">Collection</p>' +
      '<h3 class="zybar-search-collection-title">' +
      esc(collection.label) +
      ' Collection</h3>' +
      '<p class="zybar-search-collection-count">' +
      esc(countLabel) +
      '</p>' +
      '<p class="zybar-search-collection-copy">Explore all ' +
      esc(collection.label) +
      ' artwork.</p>' +
      '<span class="zybar-search-collection-cta">View Collection</span>' +
      '</div>' +
      '</a>'
    );
  }

  function resultsSectionHtml(results, title) {
    if (!results.length) return '';
    return (
      '<div class="zybar-search-section zybar-search-section--results">' +
      (title
        ? '<p class="zybar-search-section-title">' + esc(title) + '</p>'
        : '') +
      '<div class="zybar-search-results">' +
      results.map(resultCard).join('') +
      '</div></div>'
    );
  }

  function renderDefault(engine) {
    var recent = engine.readRecent();
    var popular = engine.POPULAR || [];
    bodyEl.innerHTML =
      chipsHtml('Popular Searches', popular, 'data-popular-search') +
      (recent.length ? chipsHtml('Recent Searches', recent, 'data-recent-search') : '');
    wireChips();
  }

  function render(query) {
    var engine = getEngine();
    if (!engine || !bodyEl) return;
    var q = String(query || '').trim();

    if (!q) {
      renderDefault(engine);
      return;
    }

    var intent = engine.analyzeQuery(q);
    var results = engine.search(q, 24);
    var parts = [];

    if (intent.type === 'brand' && intent.brand) {
      var collection = engine.getBrandCollection(intent.brand);
      if (collection) {
        parts.push('<div class="zybar-search-section zybar-search-section--collection">' + collectionCardHtml(collection) + '</div>');
      }
      if (results.length) {
        parts.push(resultsSectionHtml(results, 'Matching Artwork'));
      }
    } else if (results.length) {
      parts.push(resultsSectionHtml(results, 'Matching Artwork'));
    }

    if (!results.length) {
      parts.push('<div class="zybar-search-section zybar-search-section--custom">' + customizeHtml() + '</div>');
    }

    bodyEl.innerHTML = parts.join('');
    wireInteractions(q);
  }

  function trackSearch(query) {
    if (window.ZYBAR && window.ZYBAR.Analytics && window.ZYBAR.Analytics.trackSearch) {
      window.ZYBAR.Analytics.trackSearch(query);
    }
  }

  function wireChips() {
    if (!bodyEl) return;
    bodyEl.querySelectorAll('[data-popular-search],[data-recent-search]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var value = btn.getAttribute('data-popular-search') || btn.getAttribute('data-recent-search') || '';
        if (!inputEl) return;
        inputEl.value = value;
        toggleClear();
        render(value);
        inputEl.focus();
      });
    });
  }

  function wireInteractions(query) {
    if (!bodyEl) return;
    var engine = getEngine();

    bodyEl.querySelectorAll('[data-search-result]').forEach(function (link) {
      link.addEventListener('click', function () {
        if (engine && query) engine.rememberRecent(query);
        trackSearch(query);
      });
    });

    bodyEl.querySelectorAll('[data-search-collection]').forEach(function (link) {
      link.addEventListener('click', function () {
        if (engine && query) engine.rememberRecent(query);
        trackSearch(query);
      });
    });

    bodyEl.querySelectorAll('[data-search-custom-cta]').forEach(function (link) {
      link.addEventListener('click', function () {
        if (engine && query) engine.rememberRecent(query);
        trackSearch(query);
      });
    });

    wireChips();
  }

  function open() {
    ensureOverlay();
    var engine = getEngine();
    if (!engine) return;

    engine.loadIndex().then(function () {
      overlay.hidden = false;
      overlay.setAttribute('aria-hidden', 'false');
      document.body.classList.add('zybar-search-open');
      if (inputEl) inputEl.value = '';
      render('');
      toggleClear();
      window.requestAnimationFrame(function () {
        overlay.classList.add('is-visible');
        inputEl.focus();
      });
    });
  }

  function close() {
    if (!overlay) return;
    overlay.classList.remove('is-visible');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('zybar-search-open');
    window.setTimeout(function () {
      overlay.hidden = true;
    }, 180);
  }

  function loadScripts(done) {
    if (window.ZYBAR && window.ZYBAR.Search && window.ZYBAR.SearchOverlay) {
      done();
      return;
    }
    function loadEngine(next) {
      if (window.ZYBAR && window.ZYBAR.Search) {
        next();
        return;
      }
      if (document.querySelector('script[src="/js/search-engine.js"]')) {
        next();
        return;
      }
      var s = document.createElement('script');
      s.src = '/js/search-engine.js';
      s.defer = true;
      s.onload = next;
      s.onerror = next;
      document.head.appendChild(s);
    }
    loadEngine(function () {
      if (document.querySelector('script[src="/js/search-overlay.js"]')) {
        done();
        return;
      }
      done();
    });
  }

  window.ZYBAR = window.ZYBAR || {};
  window.ZYBAR.SearchOverlay = {
    open: open,
    close: close,
    init: function () {
      loadScripts(function () {
        ensureOverlay();
        var engine = getEngine();
        if (engine) engine.loadIndex();
      });
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      window.ZYBAR.SearchOverlay.init();
    });
  } else {
    window.ZYBAR.SearchOverlay.init();
  }
})();
