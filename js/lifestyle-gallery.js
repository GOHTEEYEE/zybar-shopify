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

  function flattenPayload(payload) {
    if (!payload) return [];
    if (Array.isArray(payload.items)) return payload.items.slice();

    var sections = payload.sections || {};
    var styled = (sections.styledSpaces && sections.styledSpaces.items) || [];
    var wild = (sections.inTheWild && sections.inTheWild.items) || [];
    return styled.concat(wild);
  }

  function buildFigure(item, index) {
    return (
      '<figure class="lifestyle-item">' +
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

  function bindLightbox(items) {
    root.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-lifestyle-open]');
      if (!btn || !root.contains(btn)) return;
      var index = parseInt(btn.getAttribute('data-lifestyle-open'), 10);
      var item = items[index];
      if (!item) return;
      openLightbox(item.src, item.alt);
    });
  }

  function boot(payload) {
    var titleEl = root.querySelector('[data-lifestyle-title]');
    var subtitleEl = root.querySelector('[data-lifestyle-subtitle]');
    var gridEl = root.querySelector('[data-lifestyle-grid]');
    if (!gridEl) return;

    if (titleEl && payload.title) titleEl.textContent = payload.title;
    if (subtitleEl) {
      if (payload.subtitle) {
        subtitleEl.textContent = payload.subtitle;
        subtitleEl.hidden = false;
      } else {
        subtitleEl.hidden = true;
      }
    }

    var items = sortByPriority(flattenPayload(payload));
    gridEl.innerHTML = items.map(buildFigure).join('');
    bindLightbox(items);
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
