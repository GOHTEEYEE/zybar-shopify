(function () {
  'use strict';

  var CARD_HTML =
    '<a class="lifestyle-custom-card-link" href="/products/custom-led-car-wall-art/" aria-label="Custom Made — turn your dream car into LED wall art">' +
    '<div class="lifestyle-custom-card-media">' +
    '<img src="/Image/custom-led-car-wall-art-1-on.jpg" alt="Custom LED car wall art glowing on a garage wall" loading="lazy" width="990" height="990" />' +
    '<div class="lifestyle-custom-card-media-glow" aria-hidden="true"></div>' +
    '<span class="lifestyle-custom-card-badge">Bespoke</span>' +
    '</div>' +
    '<div class="lifestyle-custom-card-body">' +
    '<p class="lifestyle-custom-card-kicker">Custom Made</p>' +
    '<h3 class="lifestyle-custom-card-title">Turn Your Dream Car Into Light.</h3>' +
    '<p class="lifestyle-custom-card-copy">Can\'t find your car in our collection? Upload your vehicle and we\'ll handcraft a one-of-one illuminated artwork.</p>' +
    '<ul class="lifestyle-custom-card-features" aria-label="Custom order highlights">' +
    '<li>Your photos</li>' +
    '<li>Any make &amp; model</li>' +
    '<li>Hand-finished LED</li>' +
    '</ul>' +
    '<div class="lifestyle-custom-card-footer">' +
    '<span class="lifestyle-custom-card-price">From <strong>$148</strong></span>' +
    '<span class="lifestyle-custom-card-cta">Customize Yours<span class="lifestyle-custom-card-cta-arrow" aria-hidden="true">→</span></span>' +
    '</div>' +
    '</div>' +
    '</a>';

  function insertCustomCard() {
    var shell = document.querySelector('.lifestyle-gallery-shell');
    if (!shell || document.getElementById('zybar-custom-made-card')) return;

    var card = document.createElement('article');
    card.id = 'zybar-custom-made-card';
    card.className = 'lifestyle-custom-card';
    card.innerHTML = CARD_HTML;

    var grid = shell.querySelector('[data-lifestyle-grid]');
    if (grid) {
      shell.insertBefore(card, grid.nextSibling);
    } else {
      shell.appendChild(card);
    }

    if (window.IntersectionObserver) {
      var observer = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add('is-visible');
              observer.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
      );
      observer.observe(card);
    } else {
      card.classList.add('is-visible');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', insertCustomCard);
  } else {
    insertCustomCard();
  }
})();
