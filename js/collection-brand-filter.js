/**
 * Filter /collections/all/ by ?brand= slug from premium search.
 */
(function () {
  'use strict';

  var BRAND_SLUG_TO_LABEL = {
    bmw: 'BMW',
    audi: 'Audi',
    'mercedes-benz': 'Mercedes-Benz',
    porsche: 'Porsche',
    nissan: 'Nissan',
    toyota: 'Toyota',
    honda: 'Honda',
    ford: 'Ford',
    dodge: 'Dodge',
    ferrari: 'Ferrari',
    lamborghini: 'Lamborghini',
    bugatti: 'Bugatti',
    maserati: 'Maserati',
    yamaha: 'Yamaha',
    mclaren: 'McLaren'
  };

  function getBrandSlug() {
    if (window.location.pathname.indexOf('/collections/all') === -1) return '';
    try {
      return String(new URLSearchParams(window.location.search).get('brand') || '')
        .toLowerCase()
        .trim();
    } catch (_) {
      return '';
    }
  }

  function brandsMatch(itemBrand, brandSlug) {
    var label = BRAND_SLUG_TO_LABEL[brandSlug] || brandSlug;
    var a = String(itemBrand || '').toLowerCase();
    var b = String(label || '').toLowerCase();
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.indexOf(b) !== -1 || b.indexOf(a) !== -1) return true;
    return a.split(/[\s-]+/)[0] === b.split(/[\s-]+/)[0];
  }

  function slugFromCard(card) {
    var link = card.querySelector('a[href*="/products/"]');
    if (!link) return '';
    var match = String(link.getAttribute('href') || '').match(/\/products\/([^/]+)/);
    return match ? match[1] : '';
  }

  function applyFilter(allowedSlugs, label) {
    var grid = document.querySelector('.products-grid');
    var heading = document.querySelector('.section-head h1');
    if (!grid) return;

    var cards = grid.querySelectorAll('.product-card');
    var visible = 0;

    cards.forEach(function (card) {
      var slug = slugFromCard(card);
      var show = allowedSlugs.has(slug);
      card.hidden = !show;
      card.style.display = show ? '' : 'none';
      if (show) visible += 1;
    });

    if (heading && label) {
      heading.textContent = label + ' Collection';
    }

    var sub = document.getElementById('collectionBrandMeta');
    if (!sub && heading && label) {
      sub = document.createElement('p');
      sub.id = 'collectionBrandMeta';
      sub.className = 'collection-brand-meta';
      heading.parentNode.insertBefore(sub, heading.nextSibling);
    }
    if (sub) {
      sub.textContent =
        visible + ' Product' + (visible === 1 ? '' : 's') + ' · Explore all ' + label + ' artwork.';
    }
  }

  function init() {
    var brandSlug = getBrandSlug();
    if (!brandSlug) return;

    var label = BRAND_SLUG_TO_LABEL[brandSlug] || brandSlug.replace(/-/g, ' ').replace(/\b\w/g, function (c) {
      return c.toUpperCase();
    });

    fetch('/api/search-index')
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (data) {
        var items = (data && data.items) || [];
        var allowed = new Set();
        items.forEach(function (item) {
          if (item.productType === 'custom') return;
          if (brandsMatch(item.brand, brandSlug)) allowed.add(item.slug);
        });
        if (!allowed.size) {
          items.forEach(function (item) {
            if (item.slug && item.slug.indexOf(brandSlug.split('-')[0]) === 0) {
              allowed.add(item.slug);
            }
          });
        }
        applyFilter(allowed, label);
      })
      .catch(function () {
        /* keep full catalog visible on failure */
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
