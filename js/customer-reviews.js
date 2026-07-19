/**
 * PDP social proof — reuse homepage "Customers are saying" + "In the wild" look exactly.
 * Also keeps a minimal dark write-review form under those sections.
 */
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

  function safeParse(value, fallback) {
    try {
      return JSON.parse(value);
    } catch (_) {
      return fallback;
    }
  }

  function escapeText(value) {
    var text = String(value || "").trim();
    text = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    return text;
  }

  function loadScriptOnce(src) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[src="' + src + '"]');
      if (existing) {
        resolve();
        return;
      }
      var script = document.createElement("script");
      script.src = src;
      script.defer = true;
      script.onload = function () {
        resolve();
      };
      script.onerror = function () {
        reject(new Error("Failed to load " + src));
      };
      document.body.appendChild(script);
    });
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

  async function postRemoteReview(payload) {
    var response = await fetch("/api/reviews", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    var data = await response.json().catch(function () {
      return {};
    });
    if (!response.ok) {
      throw new Error(data && data.error ? data.error : "Could not submit review.");
    }
    return data && data.review ? data.review : null;
  }

  function saveLocalReview(slug, review) {
    var existing = safeParse(window.localStorage.getItem(getStorageKey(slug)) || "[]", []);
    if (!Array.isArray(existing)) existing = [];
    existing.unshift(review);
    window.localStorage.setItem(getStorageKey(slug), JSON.stringify(existing.slice(0, 60)));
  }

  function ensurePlayfairFont() {
    if (document.getElementById("zybar-playfair-font")) return;
    var link = document.createElement("link");
    link.id = "zybar-playfair-font";
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;0,700;1,500;1,600&display=swap";
    document.head.appendChild(link);
  }

  function buildSection() {
    var slug = getProductSlug();
    if (!slug) return;
    if (document.getElementById("customers-saying") || document.getElementById("pdp-social-proof")) {
      return;
    }

    ensurePlayfairFont();

    var anchor =
      document.querySelector(".pdp-customization") || document.querySelector(".product-showcase");
    var main = document.querySelector("main");
    if (!main || !anchor) return;

    var titleEl = document.querySelector(".product-showcase-details h1");
    var productTitle = titleEl
      ? escapeText(titleEl.textContent).slice(0, 80)
      : "LED Wall Art";

    var wrap = document.createElement("div");
    wrap.id = "pdp-social-proof";
    wrap.className = "pdp-social-proof";
    wrap.innerHTML = [
      '<section class="customers-saying" id="customers-saying" aria-labelledby="customers-saying-title">',
      '  <div class="container customers-saying-inner">',
      '    <h2 class="customers-saying-title" id="customers-saying-title">Customers are saying</h2>',
      '    <div class="customers-saying-meta">',
      '      <div class="customers-saying-stars" aria-hidden="true">',
      "        <span>★</span><span>★</span><span>★</span><span>★</span><span>★</span>",
      "      </div>",
      '      <p class="customers-saying-score">',
      '        <span data-saying-avg>5.00</span> ★ (<span data-saying-count>0</span>)',
      "      </p>",
      '      <span class="customers-saying-verified">',
      '        <span class="customers-saying-verified-icon" aria-hidden="true">',
      '          <svg viewBox="0 0 16 16" width="12" height="12" focusable="false">',
      '            <path fill="currentColor" d="M6.2 11.4 2.8 8l1.1-1.1 2.3 2.3 5-5L12.3 5.3z" />',
      "          </svg>",
      "        </span>",
      "        Verified",
      "      </span>",
      "    </div>",
      '    <div class="customers-saying-carousel" data-saying-carousel>',
      '      <button type="button" class="customers-saying-nav customers-saying-prev" data-saying-prev aria-label="Previous review">',
      '        <span aria-hidden="true">‹</span>',
      "      </button>",
      '      <div class="customers-saying-viewport">',
      '        <div class="customers-saying-track" data-saying-track></div>',
      "      </div>",
      '      <button type="button" class="customers-saying-nav customers-saying-next" data-saying-next aria-label="Next review">',
      '        <span aria-hidden="true">›</span>',
      "      </button>",
      "    </div>",
      "  </div>",
      "</section>",
      '<section class="lifestyle-gallery" id="lifestyle-gallery" aria-label="Lifestyle gallery">',
      '  <div class="lifestyle-gallery-shell">',
      '    <header class="lifestyle-gallery-intro">',
      '      <h2 class="lifestyle-gallery-heading" data-lifestyle-title>In the wild</h2>',
      '      <p class="lifestyle-gallery-subtitle" data-lifestyle-subtitle hidden></p>',
      "    </header>",
      '    <div class="lifestyle-grid" data-lifestyle-grid></div>',
      "  </div>",
      "</section>",
      '<section class="pdp-review-write" aria-labelledby="pdp-review-write-title">',
      '  <div class="container pdp-review-write-inner">',
      '    <h3 id="pdp-review-write-title">Write a review</h3>',
      '    <form class="pdp-review-write-form" id="reviewForm">',
      '      <div class="pdp-review-write-grid">',
      '        <label><span>Customer name</span><input type="text" name="name" maxlength="40" required /></label>',
      '        <label><span>Purchased product</span><input type="text" name="productName" maxlength="80" required /></label>',
      '        <label><span>Rating</span>',
      '          <select name="rating" required>',
      '            <option value="5">5 - Excellent</option>',
      '            <option value="4">4 - Very good</option>',
      '            <option value="3">3 - Good</option>',
      '            <option value="2">2 - Fair</option>',
      '            <option value="1">1 - Poor</option>',
      "          </select>",
      "        </label>",
      '        <label><span>Upload image (optional)</span><input type="file" name="image" accept="image/*" /></label>',
      "      </div>",
      '      <label class="pdp-review-write-comment"><span>Your review</span>',
      '        <textarea name="comment" maxlength="560" required placeholder="Share your experience with this artwork..."></textarea>',
      "      </label>",
      '      <div class="review-upload-preview" id="reviewUploadPreview" hidden><img alt="Selected review image preview" /></div>',
      '      <div class="pdp-review-write-actions">',
      '        <button type="submit" class="btn pdp-review-write-btn">Submit review</button>',
      '        <p class="review-form-status" id="reviewFormStatus" aria-live="polite"></p>',
      "      </div>",
      "    </form>",
      "  </div>",
      "</section>"
    ].join("");

    anchor.insertAdjacentElement("afterend", wrap);

    Promise.all([
      loadScriptOnce("/js/home-reviews-carousel.js?v=pdp1"),
      loadScriptOnce("/js/lifestyle-gallery.js?v=pdp1")
    ]).catch(function () {});

    var form = wrap.querySelector("#reviewForm");
    var status = wrap.querySelector("#reviewFormStatus");
    var previewWrap = wrap.querySelector("#reviewUploadPreview");
    var previewImg = previewWrap ? previewWrap.querySelector("img") : null;
    if (!form || !status) return;

    var nameInput = form.querySelector('input[name="name"]');
    var productInput = form.querySelector('input[name="productName"]');
    var ratingInput = form.querySelector('select[name="rating"]');
    var commentInput = form.querySelector('textarea[name="comment"]');
    var imageInput = form.querySelector('input[name="image"]');
    if (!nameInput || !productInput || !ratingInput || !commentInput || !imageInput) return;
    productInput.value = productTitle;

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
          return postRemoteReview(draft).catch(function () {
            saveLocalReview(slug, {
              productName: reviewProductName,
              name: name,
              rating: rating,
              comment: comment,
              imageUrl: imageDataUrl || "",
              date: new Date().toISOString()
            });
            return "local";
          });
        })
        .then(function () {
          form.reset();
          ratingInput.value = "5";
          productInput.value = productTitle;
          if (previewWrap) previewWrap.hidden = true;
          if (previewImg) previewImg.removeAttribute("src");
          status.textContent = "Thanks! Your review was added.";
          status.className = "review-form-status is-success";
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
