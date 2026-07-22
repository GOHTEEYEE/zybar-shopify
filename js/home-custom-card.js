(function () {
  'use strict';

  function insertCustomCard() {
    var grid = document.querySelector('[data-lifestyle-grid]');
    if (!grid || document.getElementById('zybar-custom-made-card')) return;

    var card = document.createElement('article');
    card.id = 'zybar-custom-made-card';
    card.className = 'lifestyle-custom-card';
    card.innerHTML =
      '<a class="lifestyle-custom-card-link" href="/products/custom-led-car-wall-art/">' +
      '<div class="lifestyle-custom-card-media">' +
      '<img src="/CLA012-Light.jpeg" alt="Custom LED car wall art handcrafted by ZYBAR" loading="lazy" width="990" height="990" />' +
      '<span class="lifestyle-custom-card-badge">Custom Made</span>' +
      '</div>' +
      '<div class="lifestyle-custom-card-body">' +
      '<p class="lifestyle-custom-card-kicker">CUSTOM MADE</p>' +
      '<h3 class="lifestyle-custom-card-title">Turn Your Dream Car Into Light.</h3>' +
      '<p class="lifestyle-custom-card-copy">Can\'t find your car in our collection? We\'ll handcraft a custom LED artwork using your own vehicle.</p>' +
      '<span class="lifestyle-custom-card-cta">Customize Yours</span>' +
      '</div>' +
      '</a>';

    grid.parentNode.insertBefore(card, grid.nextSibling);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', insertCustomCard);
  } else {
    insertCustomCard();
  }
})();
