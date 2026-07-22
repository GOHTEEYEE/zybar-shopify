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

  function noResultsHtml() {
    return (
      '<div class="zybar-search-empty">' +
      '<p class="zybar-search-empty-title">Can\'t find your car?</p>' +
      '<p class="zybar-search-empty-copy">We\'ll build it for you. Turn your own car into handcrafted LED wall art.</p>' +
      '<a class="zybar-search-empty-cta" href="' +
      CUSTOM_HREF +
      '">Customize Yours</a>' +
      '</div>'
    );
  }

  function render(query) {
    var engine = getEngine();
    if (!engine || !bodyEl) return;
    var q = String(query || '').trim();

    if (!q) {
      var recent = engine.readRecent();
      var popular = engine.POPULAR || [];
      bodyEl.innerHTML =
        chipsHtml('Popular searches', popular, 'data-popular-search') +
        (recent.length ? chipsHtml('Recent searches', recent, 'data-recent-search') : '') +
        '<div class="zybar-search-section"><p class="zybar-search-section-title">Browse the garage</p><div class="zybar-search-results">' +
        engine
          .getItems()
          .slice(0, 8)
          .map(resultCard)
          .join('') +
        '</div></div>';
      wireChips();
      return;
    }

    var results = engine.search(q, 24);
    if (!results.length) {
      bodyEl.innerHTML = noResultsHtml();
      return;
    }

    bodyEl.innerHTML =
      '<div class="zybar-search-section"><p class="zybar-search-section-title">' +
      results.length +
      ' result' +
      (results.length === 1 ? '' : 's') +
      '</p><div class="zybar-search-results">' +
      results.map(resultCard).join('') +
      '</div></div>';
    bodyEl.querySelectorAll('[data-search-result]').forEach(function (link) {
      link.addEventListener('click', function () {
        engine.rememberRecent(q);
        if (window.ZYBAR && window.ZYBAR.Analytics && window.ZYBAR.Analytics.trackSearch) {
          window.ZYBAR.Analytics.trackSearch(q);
        }
      });
    });
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
    bodyEl.querySelectorAll('[data-search-result]').forEach(function (link) {
      link.addEventListener('click', function () {
        var engine = getEngine();
        if (engine && inputEl && inputEl.value.trim()) engine.rememberRecent(inputEl.value.trim());
      });
    });
  }

  function open() {
    ensureOverlay();
    var engine = getEngine();
    if (!engine) return;

    engine.loadIndex().then(function () {
      overlay.hidden = false;
      overlay.setAttribute('aria-hidden', 'false');
      document.body.classList.add('zybar-search-open');
      render(inputEl.value || '');
      toggleClear();
      window.requestAnimationFrame(function () {
        overlay.classList.add('is-visible');
        inputEl.focus();
        inputEl.select();
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
