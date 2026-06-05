(function () {
  'use strict';

  var productSlugs = [
    'audi-r8-white',
    'audi-r8-yellow',
    'audi-r8-gt3',
    'audi-rs6',
    'b-dodge-hellcat-02',
    'b-dodge-hellcat-03',
    'b-ferrari-f40',
    'b-maserati-mc20'
  ];

  function stars(rating) {
    var safe = Math.max(1, Math.min(5, Number(rating) || 0));
    return '★★★★★'.slice(0, safe) + '☆☆☆☆☆'.slice(0, 5 - safe);
  }

  function formatDate(value) {
    if (!value) return '';
    var d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function safeText(value) {
    return String(value || '').trim();
  }

  /** When Cloudflare Pages has no SUPABASE_* env, the API returns 503 with this phrase. */
  function formatReviewsPageLoadError(raw) {
    var s = raw && String(raw);
    if (s && s.indexOf('Supabase is not configured') !== -1) {
      return (
        'Reviews are not loading on this live domain yet: add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY ' +
        'in Cloudflare Pages → your project → Settings → Environment variables (Production), save, then redeploy. ' +
        'Your rows in Supabase are fine; the site just cannot reach them until those variables are set.'
      );
    }
    return s || 'Unable to load reviews right now.';
  }

  function productPathFromSlug(slug) {
    var safe = safeText(slug);
    return safe ? ('/products/' + safe + '/') : '/collections/all/';
  }

  /** Stay under server import limit (see REVIEW_IMPORT_IMAGE_MAX_DATA_URL_LENGTH on server). */
  var MAX_SYNC_IMAGE_DATA_URL = 2550000;
  var REVIEW_IMAGE_DATA_URL_RE = /^data:image\/(png|jpe?g|pjpeg|webp|gif);base64,/i;

  /** localStorage / copy-paste sometimes inserts newlines inside the base64 part. */
  function normalizeReviewImageDataUrl(s) {
    if (typeof s !== 'string') return '';
    return s.trim().replace(/\s+/g, '');
  }

  function dataUrlLooksImportable(dataUrl) {
    var s = normalizeReviewImageDataUrl(dataUrl);
    return !!s && REVIEW_IMAGE_DATA_URL_RE.test(s) && s.length <= MAX_SYNC_IMAGE_DATA_URL;
  }

  /**
   * Re-encode review photos as JPEG and shrink them so cloud import accepts the payload.
   * Returns '' if there was no image, load failed, or it could not be shrunk enough.
   */
  function compressImageDataUrlForSync(dataUrl) {
    return new Promise(function (resolve) {
      var raw = normalizeReviewImageDataUrl(dataUrl);
      if (!raw) return resolve('');
      if (dataUrlLooksImportable(raw)) return resolve(raw);
      if (raw.length > 35 * 1024 * 1024) return resolve('');

      var img = new Image();
      img.onload = function () {
        try {
          var w0 = img.naturalWidth;
          var h0 = img.naturalHeight;
          if (!w0 || !h0) return resolve('');

          function encodeAt(cw, ch, quality) {
            var canvas = document.createElement('canvas');
            canvas.width = cw;
            canvas.height = ch;
            var ctx = canvas.getContext('2d');
            if (!ctx) return '';
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, cw, ch);
            ctx.drawImage(img, 0, 0, cw, ch);
            return canvas.toDataURL('image/jpeg', quality);
          }

          var maxSide = 1600;
          var scale = Math.min(1, maxSide / Math.max(w0, h0));
          var cw = Math.max(1, Math.round(w0 * scale));
          var ch = Math.max(1, Math.round(h0 * scale));

          var q;
          var out;
          for (q = 0.92; q >= 0.38; q -= 0.08) {
            out = encodeAt(cw, ch, q);
            if (out && out.length <= MAX_SYNC_IMAGE_DATA_URL) return resolve(out);
          }

          var s;
          for (s = 0.82; s >= 0.42; s -= 0.1) {
            var cw2 = Math.max(360, Math.round(w0 * scale * s));
            var ch2 = Math.max(360, Math.round(h0 * scale * s));
            out = encodeAt(cw2, ch2, 0.72);
            if (out && out.length <= MAX_SYNC_IMAGE_DATA_URL) return resolve(out);
          }

          out = encodeAt(Math.max(320, Math.round(w0 * scale * 0.45)), Math.max(320, Math.round(h0 * scale * 0.45)), 0.62);
          if (out && out.length <= MAX_SYNC_IMAGE_DATA_URL) return resolve(out);

          resolve('');
        } catch (_) {
          resolve('');
        }
      };
      img.onerror = function () {
        resolve('');
      };
      img.src = raw;
    });
  }

  function prepareLocalRowsForSync(rows) {
    return Promise.all(
      rows.map(function (row) {
        return compressImageDataUrlForSync(row.image_data_url).then(function (imageUrl) {
          return {
            product_slug: row.product_slug,
            product_name: row.product_name,
            customer_name: row.customer_name,
            rating: row.rating,
            review_text: row.review_text,
            image_data_url: imageUrl,
            created_at: row.created_at
          };
        });
      })
    );
  }

  function getCardVariant(row, index) {
    var seed = safeText(row.customer_name || row.product_name || row.created_at || String(index));
    var total = index;
    var i;
    for (i = 0; i < seed.length; i += 1) total += seed.charCodeAt(i);
    var variants = [
      { className: 'review-card--feature', ratio: '4 / 5' },
      { className: 'review-card--standard', ratio: '1 / 1' },
      { className: 'review-card--portrait', ratio: '3 / 4' },
      { className: 'review-card--compact', ratio: '5 / 4' },
      { className: 'review-card--feature', ratio: '7 / 8' },
      { className: 'review-card--compact', ratio: '6 / 5' }
    ];
    return variants[Math.abs(total) % variants.length];
  }

  function updateSummary(rows) {
    var averageEl = document.getElementById('customerReviewsAverage');
    var starsEl = document.getElementById('customerReviewsStars');
    var countEl = document.getElementById('customerReviewsCount');
    var counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    var total = rows.length;
    var average = 0;

    rows.forEach(function (row) {
      var rating = Math.max(1, Math.min(5, Number(row.rating) || 0));
      counts[rating] = (counts[rating] || 0) + 1;
      average += rating;
    });

    average = total ? (average / total) : 0;
    if (averageEl) averageEl.textContent = total ? average.toFixed(2) : '0.00';
    if (starsEl) starsEl.textContent = total ? stars(Math.round(average)) : '☆☆☆☆☆';
    if (countEl) countEl.textContent = String(total);

    [5, 4, 3, 2, 1].forEach(function (star) {
      var count = counts[star] || 0;
      var pct = total ? (count / total) * 100 : 0;
      var fill = document.querySelector('[data-star-fill="' + star + '"]');
      var countNode = document.querySelector('[data-star-count="' + star + '"]');
      if (fill) fill.style.width = pct.toFixed(2) + '%';
      if (countNode) countNode.textContent = String(count);
    });
  }

  function safeParse(value, fallback) {
    try {
      return JSON.parse(value);
    } catch (_) {
      return fallback;
    }
  }

  /** Avoid raw response.json() rejections; always surface a normal Error. */
  function readJsonFromResponse(response) {
    return response.text().then(function (text) {
      if (!text || !text.trim()) {
        return {};
      }
      try {
        return JSON.parse(text);
      } catch (_) {
        if (!response.ok) {
          throw new Error('Bad response from server (' + response.status + ').');
        }
        throw new Error('Server returned invalid JSON.');
      }
    });
  }

  /** After a successful import (new or duplicate), drop matching rows from localStorage so sync does not repeat forever. */
  function removeLocalReviewsMatchingPrepared(preparedRows) {
    if (!preparedRows || !preparedRows.length) return;
    try {
      preparedRows.forEach(function (prepared) {
        var slug = safeText(prepared.product_slug);
        if (!slug) return;
        var key = 'zybar.reviews.local.' + slug;
        var raw = window.localStorage.getItem(key);
        var parsed = safeParse(raw || '[]', []);
        if (!Array.isArray(parsed)) return;
        var next = parsed.filter(function (item) {
          if (!item) return true;
          var sameProduct = safeText(item.productName || slug) === safeText(prepared.product_name);
          var sameName = safeText(item.name) === safeText(prepared.customer_name);
          var sameText = safeText(item.comment) === safeText(prepared.review_text);
          var sameRating = Number(item.rating || 0) === Number(prepared.rating || 0);
          return !(sameProduct && sameName && sameText && sameRating);
        });
        if (next.length !== parsed.length) {
          window.localStorage.setItem(key, JSON.stringify(next));
        }
      });
    } catch (_) {
      /* storage blocked or quota */
    }
  }

  function loadLocalReviews() {
    var rows = [];
    productSlugs.forEach(function (slug) {
      var raw = window.localStorage.getItem('zybar.reviews.local.' + slug);
      var parsed = safeParse(raw || '[]', []);
      if (!Array.isArray(parsed)) return;
      parsed.forEach(function (item) {
        if (!item) return;
        rows.push({
          product_slug: slug,
          product_name: safeText(item.productName || slug),
          customer_name: safeText(item.name || 'Customer'),
          rating: Number(item.rating || 0),
          review_text: safeText(item.comment || ''),
          image_data_url: safeText(item.imageUrl || ''),
          created_at: item.date || new Date().toISOString()
        });
      });
    });
    rows.sort(function (a, b) {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return rows;
  }

  function buildReviewFingerprint(row) {
    if (!row) return '';
    return [
      safeText(row.product_slug).toLowerCase(),
      safeText(row.product_name).toLowerCase(),
      safeText(row.customer_name).toLowerCase(),
      String(Number(row.rating || 0)),
      safeText(row.review_text).toLowerCase(),
      safeText(row.created_at)
    ].join('||');
  }

  function dedupeReviews(rows) {
    var seen = {};
    return (rows || []).filter(function (row) {
      var key = buildReviewFingerprint(row);
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function renderReviews(target, rows, onSelect, imageLoader) {
    if (!target) return;
    target.innerHTML = '';

    if (!rows.length) {
      var empty = document.createElement('p');
      empty.className = 'contact-subtitle';
      empty.textContent = 'No reviews yet. Be the first to review from any product page.';
      target.appendChild(empty);
      return;
    }

    rows.forEach(function (row, index) {
      var variant = getCardVariant(row, index);
      var card = document.createElement('article');
      card.className = 'review-card is-clickable ' + variant.className;
      card.style.setProperty('--review-photo-ratio', variant.ratio);
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', 'Open full review by ' + (safeText(row.customer_name) || 'Customer'));

      var imageUrl = safeText(row.image_data_url);
      if (imageUrl) {
        var media = document.createElement('div');
        media.className = 'review-photo-wrap';
        var img = document.createElement('img');
        img.className = 'review-photo';
        img.loading = 'lazy';
        img.alt = 'Customer review photo';
        img.src = imageUrl;
        media.appendChild(img);
        card.appendChild(media);
      } else if (row.id && imageLoader) {
        var pendingMedia = document.createElement('div');
        pendingMedia.className = 'review-photo-wrap review-photo-wrap--pending';
        pendingMedia.setAttribute('data-review-photo', String(row.id));
        pendingMedia.setAttribute('aria-hidden', 'true');
        card.appendChild(pendingMedia);
        imageLoader.observeCard(card, row);
      }

      var body = document.createElement('div');
      body.className = 'review-card-body';
      body.innerHTML =
        '<p class="review-customer"><strong></strong><span class="review-verified" title="Verified purchase">✔</span></p>' +
        '<p class="review-stars"></p>' +
        '<p class="review-product"></p>' +
        '<p class="review-comment"></p>' +
        '<p class="review-meta"></p>';
      body.querySelector('.review-customer strong').textContent = safeText(row.customer_name) || 'Customer';
      body.querySelector('.review-stars').textContent = stars(row.rating);
      body.querySelector('.review-product').textContent = 'Purchased: ' + (safeText(row.product_name) || safeText(row.product_slug));
      body.querySelector('.review-comment').textContent = safeText(row.review_text);
      body.querySelector('.review-meta').textContent = formatDate(row.created_at) || 'Recent review';
      card.appendChild(body);
      card.addEventListener('click', function () {
        if (onSelect) onSelect(row);
      });
      card.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          if (onSelect) onSelect(row);
        }
      });
      target.appendChild(card);
    });
  }

  function fetchReviewsFromApi(query) {
    return fetch('/api/reviews?' + query, { headers: { accept: 'application/json' } })
      .then(function (response) {
        return readJsonFromResponse(response).then(function (data) {
          if (!response.ok) {
            throw new Error(data && data.error ? data.error : 'Unable to load reviews.');
          }
          return data;
        });
      });
  }

  function createReviewImageLoader(onImageLoaded) {
    var queue = [];
    var queuedIds = {};
    var loadingIds = {};
    var noImageIds = {};
    var flushTimer = null;
    var observer = null;
    var rowByCard = typeof WeakMap === 'function' ? new WeakMap() : null;

    function markNoImage(id) {
      noImageIds[id] = true;
    }

    function applyImageToCard(card, row, imageUrl) {
      var pending = card.querySelector('[data-review-photo="' + row.id + '"]');
      if (!pending) return;
      if (!imageUrl) {
        pending.remove();
        return;
      }
      row.image_data_url = imageUrl;
      pending.className = 'review-photo-wrap';
      pending.removeAttribute('data-review-photo');
      pending.removeAttribute('aria-hidden');
      var img = document.createElement('img');
      img.className = 'review-photo';
      img.loading = 'lazy';
      img.alt = 'Customer review photo';
      img.src = imageUrl;
      pending.appendChild(img);
      if (onImageLoaded) onImageLoaded(row);
    }

    function flushQueue() {
      flushTimer = null;
      var batch = queue.splice(0, 8);
      batch.forEach(function (item) {
        delete queuedIds[item.row.id];
      });
      if (!batch.length) return;

      var ids = batch.map(function (item) {
        loadingIds[item.row.id] = true;
        return item.row.id;
      });

      fetchReviewsFromApi('reviewIds=' + ids.join(',') + '&includeImages=1')
        .then(function (payload) {
          var imageById = {};
          (payload && Array.isArray(payload.data) ? payload.data : []).forEach(function (item) {
            if (item && item.id) {
              imageById[item.id] = safeText(item.image_data_url);
            }
          });
          batch.forEach(function (item) {
            delete loadingIds[item.row.id];
            var imageUrl = imageById[item.row.id] || '';
            if (!imageUrl) markNoImage(item.row.id);
            applyImageToCard(item.card, item.row, imageUrl);
          });
        })
        .catch(function () {
          batch.forEach(function (item) {
            delete loadingIds[item.row.id];
          });
        });
    }

    function scheduleFlush() {
      if (flushTimer) return;
      flushTimer = window.setTimeout(flushQueue, 60);
    }

    function enqueue(card, row) {
      var id = row && row.id;
      if (!id || row.image_data_url || noImageIds[id] || queuedIds[id] || loadingIds[id]) return;
      queuedIds[id] = true;
      queue.push({ card: card, row: row });
      scheduleFlush();
    }

    function observeCard(card, row) {
      if (!row || !row.id) return;
      if (rowByCard) rowByCard.set(card, row);
      if (!window.IntersectionObserver) {
        enqueue(card, row);
        return;
      }
      if (!observer) {
        observer = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            var node = entry.target;
            observer.unobserve(node);
            var matchedRow = rowByCard ? rowByCard.get(node) : null;
            if (!matchedRow || !node.querySelector('[data-review-photo]')) return;
            enqueue(node, matchedRow);
          });
        }, { rootMargin: '240px 0px' });
      }
      observer.observe(card);
    }

    function fetchOne(row) {
      if (!row || !row.id) return Promise.resolve('');
      if (row.image_data_url) return Promise.resolve(row.image_data_url);
      if (noImageIds[row.id]) return Promise.resolve('');
      if (loadingIds[row.id]) {
        return new Promise(function (resolve) {
          var tries = 0;
          var timer = window.setInterval(function () {
            tries += 1;
            if (row.image_data_url || noImageIds[row.id] || tries > 40) {
              window.clearInterval(timer);
              resolve(row.image_data_url || '');
            }
          }, 100);
        });
      }
      loadingIds[row.id] = true;
      return fetchReviewsFromApi('reviewIds=' + row.id + '&includeImages=1')
        .then(function (payload) {
          var match = (payload && Array.isArray(payload.data) ? payload.data : []).find(function (item) {
            return item && item.id === row.id;
          });
          var imageUrl = safeText(match && match.image_data_url);
          if (!imageUrl) markNoImage(row.id);
          row.image_data_url = imageUrl;
          return imageUrl;
        })
        .catch(function () {
          return '';
        })
        .then(function (imageUrl) {
          delete loadingIds[row.id];
          return imageUrl;
        });
    }

    return {
      observeCard: observeCard,
      fetchOne: fetchOne
    };
  }

  function boot() {
    var grid = document.getElementById('customerReviewsGrid');
    var status = document.getElementById('customerReviewsStatus');
    var isLiveDomain = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
    var modal = document.getElementById('reviewModal');
    var modalClose = document.getElementById('reviewModalClose');
    var modalMedia = document.getElementById('reviewModalMedia');
    var modalImage = document.getElementById('reviewModalImage');
    var modalProduct = document.getElementById('reviewModalProduct');
    var modalCustomer = document.getElementById('reviewModalCustomer');
    var modalStars = document.getElementById('reviewModalStars');
    var modalDate = document.getElementById('reviewModalDate');
    var modalComment = document.getElementById('reviewModalComment');
    var modalProductLink = document.getElementById('reviewModalProductLink');
    if (!grid || !status || !modal || !modalClose || !modalMedia || !modalImage || !modalProduct || !modalCustomer || !modalStars || !modalDate || !modalComment || !modalProductLink) return;

    var activeModalReviewId = null;
    var imageLoader = createReviewImageLoader(function () {});

    function openModal(row) {
      activeModalReviewId = row && row.id ? row.id : null;
      var imageUrl = safeText(row.image_data_url);
      modalProduct.textContent = safeText(row.product_name) || safeText(row.product_slug);
      modalCustomer.textContent = safeText(row.customer_name) || 'Customer';
      modalStars.textContent = stars(row.rating);
      modalDate.textContent = formatDate(row.created_at) || 'Recent review';
      modalComment.textContent = safeText(row.review_text);
      modalProductLink.href = productPathFromSlug(row.product_slug);
      modal.hidden = false;
      document.body.classList.add('review-modal-open');

      if (imageUrl) {
        modalImage.src = imageUrl;
        modalImage.alt = 'Customer review photo by ' + (safeText(row.customer_name) || 'Customer');
        modalMedia.hidden = false;
        modalClose.focus();
        return;
      }

      modalImage.removeAttribute('src');
      modalMedia.hidden = true;
      modalClose.focus();

      if (!row.id || !imageLoader) return;
      imageLoader.fetchOne(row).then(function (loadedUrl) {
        if (modal.hidden || activeModalReviewId !== row.id) return;
        if (!loadedUrl) return;
        modalImage.src = loadedUrl;
        modalImage.alt = 'Customer review photo by ' + (safeText(row.customer_name) || 'Customer');
        modalMedia.hidden = false;
      });
    }

    function closeModal() {
      modal.hidden = true;
      activeModalReviewId = null;
      document.body.classList.remove('review-modal-open');
    }

    Array.prototype.forEach.call(modal.querySelectorAll('[data-review-modal-close]'), function (node) {
      node.addEventListener('click', closeModal);
    });
    modalClose.addEventListener('click', closeModal);
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !modal.hidden) {
        closeModal();
      }
    });

    status.textContent = 'Loading reviews...';

    function showRows(rows) {
      updateSummary(rows);
      renderReviews(grid, rows, openModal, imageLoader);
      status.textContent = rows.length ? ('Showing ' + rows.length + ' customer reviews') : 'No reviews found yet.';
    }

    fetchReviewsFromApi('limit=120&includeImages=0')
      .then(function (payload) {
        var rows = payload && Array.isArray(payload.data) ? payload.data : [];
        var localRows = isLiveDomain ? [] : loadLocalReviews();
        if (!isLiveDomain && localRows.length) {
          rows = localRows.concat(rows);
        }
        showRows(rows);
      })
      .catch(function (err) {
        if (isLiveDomain) {
          updateSummary([]);
          status.textContent = formatReviewsPageLoadError(err && err.message);
          return;
        }
        var localRows = loadLocalReviews();
        if (localRows.length) {
          showRows(localRows);
          return;
        }
        updateSummary([]);
        status.textContent = formatReviewsPageLoadError(err && err.message);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
