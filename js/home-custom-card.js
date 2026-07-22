(function () {
  'use strict';

  var SHOWCASE_IMAGES = [
    { src: '/Image/custom-led-car-wall-art-1.jpg', alt: 'Maybach custom LED wall art on a garage pegboard' },
    { src: '/Image/custom-led-car-wall-art-2.jpg', alt: 'BMW M3 custom LED wall art with red taillights' },
    { src: '/Image/custom-led-car-wall-art-3.jpg', alt: 'Porsche GT3 custom LED rear wall art' },
    { src: '/Image/custom-led-car-wall-art-4.jpg', alt: 'Mercedes-AMG GT custom LED wall art' },
    { src: '/Image/custom-led-car-wall-art-5.jpg', alt: 'Rolls-Royce custom LED wall art' },
    { src: '/Image/custom-led-car-wall-art-6.jpg', alt: 'Mercedes CLS custom LED art styled on a sideboard' },
    { src: '/Image/custom-led-car-wall-art-7.jpg', alt: 'Nissan GT-R and BMW custom LED art display' },
    { src: '/Image/custom-led-car-wall-art-8.jpg', alt: 'Mercedes custom LED art with cherry blossom street scene' }
  ];

  var CARD_HTML =
    '<a class="lifestyle-custom-card-link" href="/products/custom-led-car-wall-art/" aria-label="Custom Made — turn your dream car into LED wall art">' +
    '<div class="lifestyle-custom-card-media">' +
    '<img src="/Image/custom-led-car-wall-art-1.jpg" alt="Maybach custom LED wall art glowing on a garage pegboard" loading="lazy" width="990" height="990" />' +
    '<div class="lifestyle-custom-card-media-glow" aria-hidden="true"></div>' +
    '<span class="lifestyle-custom-card-badge">Bespoke</span>' +
    '<div class="lifestyle-custom-card-samples" aria-label="Recent custom LED artwork examples">' +
    SHOWCASE_IMAGES.slice(1, 5).map(function (photo) {
      return '<img src="' + photo.src + '" alt="" loading="lazy" width="240" height="240" />';
    }).join('') +
    '</div>' +
    '</div>' +
    '<div class="lifestyle-custom-card-body">' +
    '<p class="lifestyle-custom-card-kicker">Custom Made</p>' +
    '<h3 class="lifestyle-custom-card-title">Turn Your Dream Car Into Light.</h3>' +
    '<p class="lifestyle-custom-card-copy">Can\'t find your car in our collection? Upload one photo and we\'ll handcraft a one-of-one illuminated artwork.</p>' +
    '<ul class="lifestyle-custom-card-features" aria-label="Custom order highlights">' +
    '<li>One photo upload</li>' +
    '<li>Any make &amp; model</li>' +
    '<li>Hand-finished LED</li>' +
    '</ul>' +
    '<div class="lifestyle-custom-card-footer">' +
    '<span class="lifestyle-custom-card-price">From <strong>$148</strong></span>' +
    '<span class="lifestyle-custom-card-cta">Customize Yours<span class="lifestyle-custom-card-cta-arrow" aria-hidden="true">→</span></span>' +
    '</div>' +
    '</div>' +
    '</a>';

  var PROCESS_HTML =
    '<section class="home-custom-process" aria-labelledby="home-custom-process-title">' +
    '<h2 id="home-custom-process-title" class="home-custom-process-title">Custom Process</h2>' +
    '<ol class="home-custom-process-steps">' +
    '<li><span class="home-custom-process-num">1</span><span class="home-custom-process-label">Upload Your Car</span></li>' +
    '<li><span class="home-custom-process-num">2</span><span class="home-custom-process-label">Enter Your Car Model</span></li>' +
    '<li><span class="home-custom-process-num">3</span><span class="home-custom-process-label">Choose Your Lighting Style</span></li>' +
    '<li><span class="home-custom-process-num">4</span><span class="home-custom-process-label">We Handcraft It</span></li>' +
    '<li><span class="home-custom-process-num">5</span><span class="home-custom-process-label">Delivered Worldwide</span></li>' +
    '</ol>' +
    '</section>';

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
      var process = document.createElement('div');
      process.className = 'home-custom-process-wrap';
      process.innerHTML = PROCESS_HTML;
      shell.insertBefore(process, card.nextSibling);
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
