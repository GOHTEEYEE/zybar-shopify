(function () {
  var path = window.location && window.location.pathname ? window.location.pathname : "";
  if (!path || path.indexOf("/products/") !== 0) return;

  function getProductSlug() {
    var trimmed = path.replace(/\/+$/, "");
    var parts = trimmed.split("/");
    return parts.length >= 3 ? parts[2] : "";
  }

  function getStorageKey(slug) {
    return "zybar.reviews.local." + slug;
  }

  function getSessionCacheKey(slug) {
    return "zybar.reviews.remote.cache." + slug;
  }

  function safeParse(value, fallback) {
    try {
      return JSON.parse(value);
    } catch (_) {
      return fallback;
    }
  }

  function stars(rating) {
    var safeRating = Math.max(1, Math.min(5, Number(rating) || 0));
    return "★★★★★".slice(0, safeRating) + "☆☆☆☆☆".slice(0, 5 - safeRating);
  }

  function escapeText(value) {
    var text = String(value || "").trim();
    // Normalize user input for display: remove tag-like content and collapse spaces.
    text = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    return text;
  }

  function formatDate(input) {
    if (!input) return "";
    var d = new Date(input);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  /** Same social-proof slides as homepage "Customers are saying". */
  var HOME_FALLBACK_REVIEWS = [
    {
      name: "SK Moon",
      comment:
        "As a car enthusiast, this is easily one of my favorite wall pieces. The craftsmanship is excellent, and the working headlights make it feel alive.",
      rating: 5,
      imageUrl: "/Image/bmw-classic-3-0-1-on.webp",
      productName: "BMW Classic 3.0"
    },
    {
      name: "Olivia",
      comment:
        "This piece completely upgraded the look of my room. The car design is stunning, and the light-up effect adds such a cool atmosphere at night.",
      rating: 5,
      imageUrl: "/Image/audi-r8-white-1-on.webp",
      productName: "Audi R8 – White"
    },
    {
      name: "Nick B",
      comment:
        "Got this for my boyfriend and he couldn’t stop smiling when he turned the lights on. The whole car just pops on the wall.",
      rating: 5,
      imageUrl: "/Image/b-ferrari-f40-1.webp",
      productName: "B Ferrari F40"
    },
    {
      name: "R3negade",
      comment:
        "I absolutely loved how this car light wall art turned out. It looks amazing and feels very premium in person.",
      rating: 5,
      imageUrl: "/Image/bmw-m4-1-on.webp",
      productName: "BMW M4"
    }
  ];

  var defaultReviewsBySlug = {};

  function sanitizeReview(item, defaultProductName) {
    var name = escapeText(item.name).slice(0, 40);
    if (/^(sex|test|asdf|xxx)/i.test(name)) return null;
    var comment = escapeText(item.comment).slice(0, 560);
    return {
      name: name,
      productName: escapeText(item.productName || defaultProductName).slice(0, 80),
      comment: comment,
      rating: Math.max(1, Math.min(5, Number(item.rating) || 5)),
      date: item.date,
      imageUrl: typeof item.imageUrl === "string" ? item.imageUrl : "",
      source: item.source || "review"
    };
  }

  function reviewKey(review) {
    return [
      String(review.name || "").toLowerCase(),
      String(review.imageUrl || "").slice(0, 120),
      String(review.comment || "").slice(0, 80).toLowerCase()
    ].join("|");
  }

  function mergeUniqueReviews(lists) {
    var seen = {};
    var out = [];
    (lists || []).forEach(function (list) {
      (list || []).forEach(function (item) {
        if (!item || !item.name) return;
        var key = reviewKey(item);
        if (seen[key]) return;
        seen[key] = true;
        out.push(item);
      });
    });
    return out;
  }

  function loadLocalReviews(slug, productTitle) {
    var raw = window.localStorage.getItem(getStorageKey(slug));
    var parsed = safeParse(raw || "[]", []);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(function (item) {
        return sanitizeReview(item || {}, productTitle);
      })
      .filter(Boolean);
  }

  function saveLocalReview(slug, review) {
    var existing = safeParse(window.localStorage.getItem(getStorageKey(slug)) || "[]", []);
    if (!Array.isArray(existing)) existing = [];
    existing.unshift(review);
    window.localStorage.setItem(getStorageKey(slug), JSON.stringify(existing.slice(0, 60)));
  }

  function normalizeApiReview(item, productTitle) {
    return sanitizeReview({
      name: item && (item.name || item.customer_name),
      productName: item && (item.productName || item.product_name),
      comment: item && (item.comment || item.review_text),
      rating: item && item.rating,
      imageUrl: item && (item.imageUrl || item.image_data_url),
      date: item && (item.date || item.created_at),
      source: "review"
    }, productTitle);
  }

  async function fetchRemoteReviews(slug, productTitle) {
    // Store-wide feed (same source as homepage "Customers are saying"),
    // then pin this product's reviews to the top.
    var [allRes, productRes] = await Promise.all([
      fetch("/api/reviews?limit=120&includeImages=1", {
        headers: { accept: "application/json" }
      }),
      fetch(
        "/api/reviews?productSlug=" + encodeURIComponent(slug) + "&limit=40&includeImages=1",
        { headers: { accept: "application/json" } }
      )
    ]);

    if (!allRes.ok && !productRes.ok) {
      throw new Error("Could not load reviews from Supabase.");
    }

    var allPayload = allRes.ok ? await allRes.json() : { data: [] };
    var productPayload = productRes.ok ? await productRes.json() : { data: [] };
    var allRows = allPayload && Array.isArray(allPayload.data) ? allPayload.data : [];
    var productRows =
      productPayload && Array.isArray(productPayload.data) ? productPayload.data : [];

    var productReviews = productRows
      .map(function (row) {
        return normalizeApiReview(row, productTitle);
      })
      .filter(Boolean);
    var storeReviews = allRows
      .map(function (row) {
        return normalizeApiReview(row, row.product_name || productTitle);
      })
      .filter(Boolean);

    return mergeUniqueReviews([productReviews, storeReviews]);
  }

  function flattenLifestyleItems(payload) {
    if (!payload) return [];
    if (Array.isArray(payload.items)) return payload.items.slice();
    var sections = payload.sections || {};
    var styled = (sections.styledSpaces && sections.styledSpaces.items) || [];
    var wild = (sections.inTheWild && sections.inTheWild.items) || [];
    return styled.concat(wild);
  }

  async function fetchLifestyleReviews() {
    try {
      var response = await fetch("/data/lifestyle-gallery.json", { cache: "no-cache" });
      if (!response.ok) return [];
      var payload = await response.json();
      var items = flattenLifestyleItems(payload)
        .slice()
        .sort(function (a, b) {
          return (Number(b.priority) || 0) - (Number(a.priority) || 0);
        });
      return items
        .map(function (item, index) {
          if (!item || !item.src) return null;
          var alt = escapeText(item.alt || "ZYBAR LED artwork in a customer space");
          return sanitizeReview(
            {
              name: "In the wild",
              productName: alt.slice(0, 80),
              comment: alt,
              rating: 5,
              imageUrl: item.src,
              date: payload.updatedAt || null,
              source: "lifestyle"
            },
            "ZYBAR LED Wall Art"
          );
        })
        .filter(Boolean);
    } catch (_) {
      return [];
    }
  }

  async function postRemoteReview(payload) {
    var response = await fetch("/api/reviews", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    var data = await response.json().catch(function () { return {}; });
    if (!response.ok) {
      throw new Error(data && data.error ? data.error : "Could not submit review.");
    }
    return data && data.review ? data.review : null;
  }

  function makeStatRow(star) {
    var row = document.createElement("div");
    row.className = "review-stats-row";
    row.innerHTML =
      '<span class="review-stats-label">' + star + ' ★</span>' +
      '<div class="review-stats-track"><div class="review-stats-fill"></div></div>' +
      '<span class="review-stats-count">0</span>';
    return row;
  }

  var MAX_REVIEW_IMAGE_BYTES = 1300 * 1024;

  function readImageFile(file) {
    return new Promise(function (resolve, reject) {
      if (!file) return resolve("");
      if (file.size > MAX_REVIEW_IMAGE_BYTES) {
        reject(new Error("Image is too large. Please upload one under 1.3MB."));
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        resolve(typeof reader.result === "string" ? reader.result : "");
      };
      reader.onerror = function () {
        reject(new Error("Failed to read image file."));
      };
      reader.readAsDataURL(file);
    });
  }

  function renderReviews(container, list, onSelect) {
    var total = list.length;
    var average = total
      ? (list.reduce(function (sum, item) { return sum + (Number(item.rating) || 0); }, 0) / total).toFixed(2)
      : "0.00";
    var counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    list.forEach(function (item) {
      counts[item.rating] = (counts[item.rating] || 0) + 1;
    });

    var summaryCount = container.querySelector("[data-reviews-count]");
    var summaryRating = container.querySelector("[data-reviews-rating]");
    var summaryStars = container.querySelector("[data-reviews-stars]");
    var statsRows = container.querySelectorAll(".review-stats-row");
    var listWrap = container.querySelector("[data-reviews-list]");

    if (summaryCount) summaryCount.textContent = String(total);
    if (summaryRating) summaryRating.textContent = average;
    if (summaryStars) summaryStars.textContent = stars(Math.round(Number(average)));

    Array.prototype.forEach.call(statsRows || [], function (row) {
      var label = row.querySelector(".review-stats-label");
      var fill = row.querySelector(".review-stats-fill");
      var countEl = row.querySelector(".review-stats-count");
      var star = Number(String((label && label.textContent) || "").trim().charAt(0)) || 0;
      var count = counts[star] || 0;
      var pct = total ? (count / total) * 100 : 0;
      if (fill) fill.style.width = pct.toFixed(2) + "%";
      if (countEl) countEl.textContent = String(count);
    });

    if (!listWrap) return;
    listWrap.innerHTML = "";
    list.slice(0, 24).forEach(function (review) {
      var card = document.createElement("article");
      card.className = "review-card is-clickable";
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", "Open full review by " + review.name);

      if (review.imageUrl) {
        var photoWrap = document.createElement("div");
        photoWrap.className = "review-photo-wrap";
        var img = document.createElement("img");
        img.className = "review-photo";
        img.alt = "Customer review photo from " + review.name;
        img.loading = "lazy";
        img.src = review.imageUrl;
        photoWrap.appendChild(img);
        card.appendChild(photoWrap);
      }

      var body = document.createElement("div");
      body.className = "review-card-body";
      body.innerHTML =
        '<p class="review-customer"><strong></strong><span class="review-verified" title="Verified purchase">✔</span></p>' +
        '<p class="review-stars"></p>' +
        '<p class="review-product"></p>' +
        '<p class="review-comment"></p>' +
        '<p class="review-meta"></p>';
      body.querySelector(".review-customer strong").textContent = review.name;
      body.querySelector(".review-stars").textContent = stars(review.rating);
      body.querySelector(".review-stars").setAttribute("aria-label", review.rating + " out of 5 stars");
      body.querySelector(".review-product").textContent = "Purchased: " + review.productName;
      body.querySelector(".review-comment").textContent = review.comment;
      body.querySelector(".review-meta").textContent = formatDate(review.date) || "Recent review";
      card.appendChild(body);
      card.addEventListener("click", function () {
        if (onSelect) onSelect(review);
      });
      card.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (onSelect) onSelect(review);
        }
      });
      listWrap.appendChild(card);
    });
  }

  function buildSection() {
    var slug = getProductSlug();
    if (!slug) return;

    var anchor = document.querySelector(".pdp-customization")
      || document.querySelector(".product-showcase");
    var main = document.querySelector("main");
    if (!main || !anchor) return;

    var titleEl = document.querySelector(".product-showcase-details h1");
    var productTitle = titleEl ? escapeText(titleEl.textContent).slice(0, 80) : "LED Wall Art";

    var section = document.createElement("section");
    section.className = "pdp-section pdp-reviews";
    section.setAttribute("aria-labelledby", "pdp-reviews-title");
    var statsRowsHtml = [5, 4, 3, 2, 1].map(function (n) {
      return makeStatRow(n).outerHTML;
    }).join("");
    section.innerHTML = [
      '<div class="reviews-head">',
      '  <h2 id="pdp-reviews-title">WE ALWAYS PUT OUR CUSTOMERS FIRST</h2>',
      '  <p class="reviews-head-subtitle">Customers from all over the world love our products.</p>',
      "</div>",
      '<div class="reviews-overview">',
      '  <div class="reviews-score-panel">',
      '    <p class="reviews-score" data-reviews-rating>0.00</p>',
      '    <p class="reviews-stars-big" data-reviews-stars>☆☆☆☆☆</p>',
      '    <p class="reviews-total"><span data-reviews-count>0</span> reviews</p>',
      "  </div>",
      '  <div class="reviews-stats">' + statsRowsHtml + "</div>",
      "</div>",
      '<div class="reviews-grid" data-reviews-list></div>',
      '<form class="review-form" id="reviewForm">',
      '  <h3>Write a review</h3>',
      '  <div class="review-form-grid">',
      '    <label><span>Customer name</span><input type="text" name="name" maxlength="40" required /></label>',
      '    <label><span>Purchased product</span><input type="text" name="productName" maxlength="80" required /></label>',
      '    <label><span>Rating</span>',
      '      <select name="rating" required>',
      '        <option value="5">5 - Excellent</option>',
      '        <option value="4">4 - Very good</option>',
      '        <option value="3">3 - Good</option>',
      '        <option value="2">2 - Fair</option>',
      '        <option value="1">1 - Poor</option>',
      "      </select>",
      "    </label>",
      '    <label><span>Upload image (optional)</span><input type="file" name="image" accept="image/*" /></label>',
      "  </div>",
      '  <label><span>Your review</span><textarea name="comment" maxlength="560" required placeholder="Share your experience with this artwork..."></textarea></label>',
      '  <div class="review-upload-preview" id="reviewUploadPreview" hidden><img alt="Selected review image preview" /></div>',
      '  <div class="review-form-actions">',
      '    <button type="submit" class="btn">Submit review</button>',
      '    <p class="review-form-status" id="reviewFormStatus" aria-live="polite"></p>',
      "  </div>",
      "</form>",
      '<div class="review-modal" id="pdpReviewModal" hidden>',
      '  <div class="review-modal-backdrop" data-review-modal-close></div>',
      '  <div class="review-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="pdpReviewModalCustomer">',
      '    <button type="button" class="review-modal-close" id="pdpReviewModalClose" aria-label="Close review">×</button>',
      '    <div class="review-modal-grid">',
      '      <div class="review-modal-media" id="pdpReviewModalMedia">',
      '        <img id="pdpReviewModalImage" alt="Customer review photo" />',
      '      </div>',
      '      <div class="review-modal-content">',
      '        <p class="review-modal-product" id="pdpReviewModalProduct"></p>',
      '        <p class="review-customer"><strong id="pdpReviewModalCustomer"></strong><span class="review-verified" title="Verified purchase">✔</span></p>',
      '        <p class="review-stars" id="pdpReviewModalStars"></p>',
      '        <p class="review-meta" id="pdpReviewModalDate"></p>',
      '        <p class="review-modal-comment" id="pdpReviewModalComment"></p>',
      '      </div>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join("");

    anchor.insertAdjacentElement("afterend", section);

    var state = {
      remoteEnabled: false,
      remoteReviews: [],
      lifestyleReviews: [],
      localReviews: []
    };

    function getCurrentList() {
      var homeFallback = HOME_FALLBACK_REVIEWS.map(function (r) {
        return sanitizeReview(r, productTitle);
      }).filter(Boolean);
      if (state.remoteEnabled) {
        return mergeUniqueReviews([
          state.remoteReviews,
          state.lifestyleReviews,
          homeFallback,
          state.localReviews
        ]);
      }
      var fallback = state.localReviews
        .concat(defaultReviewsBySlug[slug] || [])
        .concat(HOME_FALLBACK_REVIEWS)
        .concat(state.lifestyleReviews || []);
      return mergeUniqueReviews([
        fallback.map(function (r) {
          return sanitizeReview(r, productTitle);
        }).filter(Boolean)
      ]);
    }

    var form = section.querySelector("#reviewForm");
    var status = section.querySelector("#reviewFormStatus");
    var previewWrap = section.querySelector("#reviewUploadPreview");
    var previewImg = previewWrap ? previewWrap.querySelector("img") : null;
    var modal = section.querySelector("#pdpReviewModal");
    var modalClose = section.querySelector("#pdpReviewModalClose");
    var modalMedia = section.querySelector("#pdpReviewModalMedia");
    var modalImage = section.querySelector("#pdpReviewModalImage");
    var modalProduct = section.querySelector("#pdpReviewModalProduct");
    var modalCustomer = section.querySelector("#pdpReviewModalCustomer");
    var modalStars = section.querySelector("#pdpReviewModalStars");
    var modalDate = section.querySelector("#pdpReviewModalDate");
    var modalComment = section.querySelector("#pdpReviewModalComment");
    if (!form || !status) return;
    var nameInput = form.querySelector('input[name="name"]');
    var productInput = form.querySelector('input[name="productName"]');
    var ratingInput = form.querySelector('select[name="rating"]');
    var commentInput = form.querySelector('textarea[name="comment"]');
    var imageInput = form.querySelector('input[name="image"]');
    if (!nameInput || !productInput || !ratingInput || !commentInput || !imageInput) return;
    productInput.value = productTitle;

    function openModal(review) {
      if (!modal || !modalClose || !modalMedia || !modalImage || !modalProduct || !modalCustomer || !modalStars || !modalDate || !modalComment) return;
      modalProduct.textContent = review.productName || productTitle;
      modalCustomer.textContent = review.name || "Customer";
      modalStars.textContent = stars(review.rating);
      modalDate.textContent = formatDate(review.date) || "Recent review";
      modalComment.textContent = review.comment || "";

      if (review.imageUrl) {
        modalImage.src = review.imageUrl;
        modalImage.alt = "Customer review photo by " + (review.name || "Customer");
        modalMedia.hidden = false;
      } else {
        modalImage.removeAttribute("src");
        modalMedia.hidden = true;
      }

      modal.hidden = false;
      document.body.classList.add("review-modal-open");
      modalClose.focus();
    }

    function closeModal() {
      if (!modal) return;
      modal.hidden = true;
      document.body.classList.remove("review-modal-open");
    }

    function refresh() {
      var list = getCurrentList();
      renderReviews(section, list, openModal);
      if (window.ZYBAR && typeof window.ZYBAR.updatePdpLuxuryRating === "function") {
        window.ZYBAR.updatePdpLuxuryRating(list);
      }
    }

    function readSessionCachedReviews() {
      try {
        var raw = window.sessionStorage.getItem(getSessionCacheKey(slug));
        var parsed = safeParse(raw || "[]", []);
        if (!Array.isArray(parsed)) return [];
        return parsed.map(function (item) { return sanitizeReview(item, productTitle); });
      } catch (_) {
        return [];
      }
    }

    function writeSessionCachedReviews(reviews) {
      try {
        var subset = Array.isArray(reviews) ? reviews.slice(0, 24) : [];
        window.sessionStorage.setItem(getSessionCacheKey(slug), JSON.stringify(subset));
      } catch (_) {}
    }

    if (modal) {
      Array.prototype.forEach.call(modal.querySelectorAll("[data-review-modal-close]"), function (node) {
        node.addEventListener("click", closeModal);
      });
    }
    if (modalClose) {
      modalClose.addEventListener("click", closeModal);
    }
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && modal && !modal.hidden) {
        closeModal();
      }
    });

    state.localReviews = loadLocalReviews(slug, productTitle);
    refresh();

    var cached = readSessionCachedReviews();
    if (cached.length) {
      state.remoteEnabled = true;
      state.remoteReviews = cached;
      refresh();
    }

    Promise.all([
      fetchRemoteReviews(slug, productTitle).catch(function () {
        return null;
      }),
      fetchLifestyleReviews()
    ]).then(function (results) {
      var reviews = results[0];
      var lifestyle = results[1] || [];
      state.lifestyleReviews = lifestyle;
      if (reviews && reviews.length) {
        state.remoteEnabled = true;
        state.remoteReviews = reviews;
        writeSessionCachedReviews(reviews);
      } else if (!cached.length) {
        state.remoteEnabled = false;
      }
      refresh();
    });

    imageInput.addEventListener("change", function () {
      var file = imageInput.files && imageInput.files[0];
      if (!file) {
        if (previewWrap) previewWrap.hidden = true;
        if (previewImg) previewImg.removeAttribute("src");
        return;
      }
      readImageFile(file)
        .then(function (dataUrl) {
          if (!previewWrap || !previewImg || !dataUrl) return;
          previewImg.src = dataUrl;
          previewWrap.hidden = false;
        })
        .catch(function (err) {
          imageInput.value = "";
          if (previewWrap) previewWrap.hidden = true;
          if (previewImg) previewImg.removeAttribute("src");
          status.textContent = err.message || "Unable to preview image.";
          status.className = "review-form-status is-error";
        });
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var name = escapeText(nameInput.value).slice(0, 40);
      var reviewProductName = escapeText(productInput.value).slice(0, 80);
      var comment = escapeText(commentInput.value).slice(0, 560);
      var rating = Math.max(1, Math.min(5, Number(ratingInput.value || 5)));
      var file = imageInput.files && imageInput.files[0];

      if (name.length < 2 || reviewProductName.length < 2 || comment.length < 8) {
        status.textContent = "Please complete name, purchased product, and a short review.";
        status.className = "review-form-status is-error";
        return;
      }
      status.textContent = "Submitting your review...";
      status.className = "review-form-status";

      readImageFile(file)
        .then(function (imageDataUrl) {
          var draft = {
            productSlug: slug,
            productName: reviewProductName,
            name: name,
            rating: rating,
            comment: comment,
            imageDataUrl: imageDataUrl || ""
          };

          if (state.remoteEnabled) {
            return postRemoteReview(draft).then(function (created) {
              if (created) {
                state.remoteReviews.unshift(normalizeApiReview(created, productTitle));
              }
              return "remote";
            });
          }

          saveLocalReview(slug, {
            productName: reviewProductName,
            name: name,
            rating: rating,
            comment: comment,
            imageUrl: imageDataUrl || "",
            date: new Date().toISOString()
          });
          state.localReviews = loadLocalReviews(slug, productTitle);
          return "local";
        })
        .then(function () {
          form.reset();
          ratingInput.value = "5";
          productInput.value = productTitle;
          if (previewWrap) previewWrap.hidden = true;
          if (previewImg) previewImg.removeAttribute("src");
          status.textContent = "Thanks! Your review was added.";
          status.className = "review-form-status is-success";
          refresh();
        })
        .catch(function (err) {
          status.textContent = err && err.message ? err.message : "Unable to submit review.";
          status.className = "review-form-status is-error";
        });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildSection);
  } else {
    buildSection();
  }
})();
