(function () {
  'use strict';

  var root = document.getElementById('lifestyle-gallery');
  if (!root) return;

  var DATA_URL = '/data/lifestyle-gallery.json';

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function sortByPriority(items) {
    return (items || []).slice().sort(function (a, b) {
      return (Number(b.priority) || 0) - (Number(a.priority) || 0);
    });
  }

  /**
   * Editorial rhythm:
   * Large / Small / Small
   * Small / Large / Small
   */
  function assignEditorialSizes(items) {
    return items.map(function (item, index) {
      var pattern = index % 6;
      var size = pattern === 0 || pattern === 4 ? 'feature' : 'standard';
      return Object.assign({}, item, { size: size });
    });
  }

  function buildFigure(item, index) {
    var sizeClass =
      item.size === 'feature' ? ' lifestyle-item--feature' : ' lifestyle-item--standard';
    return (
      '<figure class="lifestyle-item' +
      sizeClass +
      '" data-lifestyle-item>' +
      '<button type="button" class="lifestyle-item-hit" data-lifestyle-open="' +
      index +
      '" aria-label="View ' +
      escapeHtml(item.alt || 'lifestyle image') +
      '">' +
      '<img src="' +
      escapeHtml(item.src) +
      '" alt="' +
      escapeHtml(item.alt || 'ZYBAR lifestyle artwork') +
      '" loading="lazy" decoding="async" />' +
      '</button>' +
      '</figure>'
    );
  }

  function renderSection(sectionKey, sectionData, startIndex) {
    var mount = root.querySelector('[data-lifestyle-section="' + sectionKey + '"]');
    if (!mount || !sectionData) return startIndex;

    var titleEl = mount.querySelector('[data-lifestyle-title]');
    var subtitleEl = mount.querySelector('[data-lifestyle-subtitle]');
    var gridEl = mount.querySelector('[data-lifestyle-grid]');
    if (titleEl) titleEl.textContent = sectionData.title || '';
    if (subtitleEl) subtitleEl.textContent = sectionData.subtitle || '';
    if (!gridEl) return startIndex;

    var prepared = assignEditorialSizes(sortByPriority(sectionData.items || []));
    gridEl.innerHTML = prepared
      .map(function (item, i) {
        return buildFigure(item, startIndex + i);
      })
      .join('');

    return startIndex + prepared.length;
  }

  function collectFlatItems(payload) {
    var sections = (payload && payload.sections) || {};
    var styled = sortByPriority((sections.styledSpaces && sections.styledSpaces.items) || []);
    var wild = sortByPriority((sections.inTheWild && sections.inTheWild.items) || []);
    return assignEditorialSizes(styled).concat(assignEditorialSizes(wild));
  }

  function ensureLightbox() {
    var existing = document.getElementById('lifestyle-lightbox');
    if (existing) return existing;

    var overlay = document.createElement('div');
    overlay.id = 'lifestyle-lightbox';
    overlay.className = 'lifestyle-lightbox';
    overlay.hidden = true;
    overlay.innerHTML =
      '<button type="button" class="lifestyle-lightbox-close" data-lifestyle-close aria-label="Close">' +
      '&times;</button>' +
      '<img class="lifestyle-lightbox-image" alt="" />';
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function (event) {
      if (event.target === overlay || event.target.hasAttribute('data-lifestyle-close')) {
        closeLightbox();
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !overlay.hidden) closeLightbox();
    });

    return overlay;
  }

  function openLightbox(src, alt) {
    var overlay = ensureLightbox();
    var img = overlay.querySelector('.lifestyle-lightbox-image');
    if (img) {
      img.src = src;
      img.alt = alt || '';
    }
    overlay.hidden = false;
    requestAnimationFrame(function () {
      overlay.classList.add('is-open');
    });
    document.body.classList.add('lifestyle-lightbox-open');
  }

  function closeLightbox() {
    var overlay = document.getElementById('lifestyle-lightbox');
    if (!overlay) return;
    overlay.classList.remove('is-open');
    document.body.classList.remove('lifestyle-lightbox-open');
    setTimeout(function () {
      overlay.hidden = true;
    }, 200);
  }

  function bindLightbox(flatItems) {
    root.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-lifestyle-open]');
      if (!btn || !root.contains(btn)) return;
      var index = parseInt(btn.getAttribute('data-lifestyle-open'), 10);
      var item = flatItems[index];
      if (!item) return;
      openLightbox(item.src, item.alt);
    });
  }

  function boot(payload) {
    var sections = (payload && payload.sections) || {};
    renderSection('styledSpaces', sections.styledSpaces, 0);
    var styledCount = sortByPriority((sections.styledSpaces && sections.styledSpaces.items) || []).length;
    renderSection('inTheWild', sections.inTheWild, styledCount);
    bindLightbox(collectFlatItems(payload));
    root.classList.add('is-ready');
  }

  fetch(DATA_URL, { cache: 'no-cache' })
    .then(function (res) {
      if (!res.ok) throw new Error('Unable to load lifestyle gallery');
      return res.json();
    })
    .then(boot)
    .catch(function () {
      root.classList.add('is-empty');
    });
})();
