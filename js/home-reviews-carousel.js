(function () {
  'use strict';

  var section = document.getElementById('customers-saying');
  if (!section) return;

  var AUTO_MS = 5500;

  var FALLBACK_SLIDES = [
    {
      name: 'SK Moon',
      comment:
        'As a car enthusiast, this is easily one of my favorite wall pieces. The craftsmanship is excellent, and the working headlights make it feel alive.',
      rating: 5,
      imageUrl: '/Image/bmw-classic-3-0-1-on.webp'
    },
    {
      name: 'Olivia',
      comment:
        'This piece completely upgraded the look of my room. The car design is stunning, and the light-up effect adds such a cool atmosphere at night.',
      rating: 5,
      imageUrl: '/Image/audi-r8-white-1-on.webp'
    },
    {
      name: 'Nick B',
      comment:
        'Got this for my boyfriend and he couldn’t stop smiling when he turned the lights on. The whole car just pops on the wall.',
      rating: 5,
      imageUrl: '/Image/b-ferrari-f40-1.webp'
    },
    {
      name: 'R3negade',
      comment:
        'I absolutely loved how this car light wall art turned out. It looks amazing and feels very premium in person.',
      rating: 5,
      imageUrl: '/Image/bmw-m4-1-on.webp'
    }
  ];

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function truncate(text, max) {
    var clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (clean.length <= max) return clean;
    return clean.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
  }

  function starRow(rating, className) {
    var safe = Math.max(1, Math.min(5, Number(rating) || 5));
    var html = '';
    for (var i = 1; i <= 5; i += 1) {
      html +=
        '<span class="' +
        className +
        (i <= safe ? ' is-on' : '') +
        '" aria-hidden="true">★</span>';
    }
    return html;
  }

  function normalizeReview(row) {
    var name = String((row && (row.customer_name || row.name)) || '').trim();
    var comment = String((row && (row.review_text || row.comment)) || '').trim();
    var imageUrl = String((row && (row.image_data_url || row.imageUrl)) || '').trim();
    var rating = Math.max(1, Math.min(5, Number(row && row.rating) || 5));
    if (name.length < 2 || comment.length < 24 || !imageUrl) return null;
    if (/^(sex|test|asdf)/i.test(name) || comment.length < 24) return null;
    return {
      name: name.slice(0, 40),
      comment: truncate(comment, 160),
      rating: rating,
      imageUrl: imageUrl
    };
  }

  function fetchJson(url) {
    return fetch(url, { headers: { accept: 'application/json' } }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error((data && data.error) || 'Failed to load reviews');
        return data;
      });
    });
  }

  function renderStats(avg, count) {
    var avgEl = section.querySelector('[data-saying-avg]');
    var countEl = section.querySelector('[data-saying-count]');
    if (avgEl) avgEl.textContent = avg.toFixed(2);
    if (countEl) countEl.textContent = String(count);
  }

  function buildCard(slide) {
    return (
      '<article class="saying-card">' +
      '<div class="saying-card-media">' +
      '<img src="' +
      escapeHtml(slide.imageUrl) +
      '" alt="Customer photo from ' +
      escapeHtml(slide.name) +
      '" loading="lazy" decoding="async" />' +
      '</div>' +
      '<div class="saying-card-body">' +
      '<p class="saying-card-quote">' +
      escapeHtml(slide.comment) +
      '</p>' +
      '<div class="saying-card-stars" aria-label="' +
      slide.rating +
      ' out of 5 stars">' +
      starRow(slide.rating, 'saying-card-star') +
      '</div>' +
      '<p class="saying-card-name">' +
      escapeHtml(slide.name) +
      '</p>' +
      '</div></article>'
    );
  }

  function initCarousel(slides) {
    var track = section.querySelector('[data-saying-track]');
    var prevBtn = section.querySelector('[data-saying-prev]');
    var nextBtn = section.querySelector('[data-saying-next]');
    if (!track || !slides.length) return;

    var index = 0;
    var timer = null;
    var reduced =
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    track.innerHTML = slides
      .map(function (slide, i) {
        return (
          '<div class="saying-slide' +
          (i === 0 ? ' is-active' : '') +
          '" data-saying-slide="' +
          i +
          '">' +
          buildCard(slide) +
          '</div>'
        );
      })
      .join('');

    function goTo(nextIndex) {
      var items = track.querySelectorAll('[data-saying-slide]');
      if (!items.length) return;
      index = ((nextIndex % items.length) + items.length) % items.length;
      for (var i = 0; i < items.length; i += 1) {
        items[i].classList.toggle('is-active', i === index);
      }
    }

    function next() {
      goTo(index + 1);
    }

    function prev() {
      goTo(index - 1);
    }

    function stopAuto() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }

    function startAuto() {
      stopAuto();
      if (reduced || slides.length < 2) return;
      timer = setInterval(next, AUTO_MS);
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', function () {
        prev();
        startAuto();
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        next();
        startAuto();
      });
    }

    section.addEventListener('mouseenter', stopAuto);
    section.addEventListener('mouseleave', startAuto);
    section.addEventListener('focusin', stopAuto);
    section.addEventListener('focusout', startAuto);

    var touchX = null;
    track.addEventListener(
      'touchstart',
      function (event) {
        touchX = event.changedTouches[0].clientX;
        stopAuto();
      },
      { passive: true }
    );
    track.addEventListener(
      'touchend',
      function (event) {
        if (touchX == null) return;
        var delta = event.changedTouches[0].clientX - touchX;
        touchX = null;
        if (Math.abs(delta) < 40) {
          startAuto();
          return;
        }
        if (delta < 0) next();
        else prev();
        startAuto();
      },
      { passive: true }
    );

    startAuto();
    section.classList.add('is-ready');
  }

  function boot() {
    Promise.all([
      fetchJson('/api/reviews?limit=120&includeImages=0').catch(function () {
        return null;
      }),
      fetchJson('/api/reviews?withImages=1&includeImages=1&limit=12').catch(function () {
        return null;
      })
    ]).then(function (results) {
      var metaPayload = results[0];
      var imagePayload = results[1];
      var metaRows =
        metaPayload && Array.isArray(metaPayload.data) ? metaPayload.data : [];
      var imageRows =
        imagePayload && Array.isArray(imagePayload.data) ? imagePayload.data : [];

      var total = 0;
      var sum = 0;
      metaRows.forEach(function (row) {
        var rating = Number(row && row.rating) || 0;
        if (rating >= 1 && rating <= 5) {
          total += 1;
          sum += rating;
        }
      });

      var slides = imageRows
        .map(normalizeReview)
        .filter(Boolean)
        .slice(0, 10);

      if (!slides.length) slides = FALLBACK_SLIDES.slice();
      if (!total) {
        total = slides.length;
        sum = slides.reduce(function (acc, slide) {
          return acc + slide.rating;
        }, 0);
      }

      renderStats(total ? sum / total : 5, total || slides.length);
      initCarousel(slides);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
