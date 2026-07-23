/**
 * PDP social proof — homepage "Customers are saying" + "In the wild".
 * Contact / inquiry form under those sections (saved to admin Inquiries).
 */
(function () {
  var path = window.location && window.location.pathname ? window.location.pathname : "";
  if (!path || path.indexOf("/products/") !== 0) return;

  function getProductSlug() {
    var trimmed = path.replace(/\/+$/, "");
    var parts = trimmed.split("/");
    return parts.length >= 3 ? parts[2] : "";
  }

  function escapeText(value) {
    var text = String(value || "").trim();
    text = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    return text;
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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
      '<section class="pdp-review-write pdp-contact-inquiry" aria-labelledby="pdp-contact-title">',
      '  <div class="container pdp-review-write-inner">',
      '    <h3 id="pdp-contact-title">Contact Us</h3>',
      '    <p class="pdp-contact-lede">Questions about this piece? Send an inquiry — we\'ll get back to you soon.</p>',
      '    <form class="pdp-review-write-form" id="pdpContactForm" novalidate>',
      '      <div class="pdp-review-write-grid">',
      '        <label><span>Name *</span><input type="text" name="name" id="pdpContactName" maxlength="120" required placeholder="Your full name" autocomplete="name" /></label>',
      '        <label><span>Email *</span><input type="email" name="email" id="pdpContactEmail" maxlength="190" required placeholder="you@example.com" autocomplete="email" /></label>',
      '        <label><span>Phone Number</span><input type="tel" name="phone" id="pdpContactPhone" maxlength="40" placeholder="+1 555 000 0000" autocomplete="tel" /></label>',
      '        <label><span>Car Model Interest *</span><input type="text" name="carModelInterest" id="pdpContactCarModel" maxlength="160" required /></label>',
      "      </div>",
      '      <label class="pdp-review-write-comment"><span>Message *</span>',
      '        <textarea name="message" id="pdpContactMessage" maxlength="4000" rows="5" required placeholder="Tell us your preferred size, power option, or any questions..."></textarea>',
      "      </label>",
      '      <div class="pdp-review-write-actions">',
      '        <button type="submit" class="btn pdp-review-write-btn">Send Inquiry</button>',
      '        <p class="review-form-status" id="pdpContactFormStatus" aria-live="polite"></p>',
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

    var form = wrap.querySelector("#pdpContactForm");
    var status = wrap.querySelector("#pdpContactFormStatus");
    if (!form || !status) return;

    var nameInput = form.querySelector("#pdpContactName");
    var emailInput = form.querySelector("#pdpContactEmail");
    var phoneInput = form.querySelector("#pdpContactPhone");
    var carModelInput = form.querySelector("#pdpContactCarModel");
    var messageInput = form.querySelector("#pdpContactMessage");
    if (!nameInput || !emailInput || !carModelInput || !messageInput) return;
    carModelInput.value = productTitle;

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var payload = {
        name: escapeText(nameInput.value).slice(0, 120),
        email: String(emailInput.value || "")
          .trim()
          .toLowerCase()
          .slice(0, 190),
        phone: escapeText(phoneInput ? phoneInput.value : "").slice(0, 40),
        carModelInterest: escapeText(carModelInput.value).slice(0, 160),
        message: escapeText(messageInput.value).slice(0, 4000)
      };

      if (!payload.name || !payload.email || !payload.carModelInterest || !payload.message) {
        status.textContent = "Please fill in all required fields.";
        status.className = "review-form-status is-error";
        return;
      }
      if (!isValidEmail(payload.email)) {
        status.textContent = "Please enter a valid email address.";
        status.className = "review-form-status is-error";
        return;
      }

      var submitBtn = form.querySelector('button[type="submit"]');
      var originalLabel = submitBtn ? submitBtn.textContent : "";
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Sending…";
      }
      status.textContent = "Sending your inquiry…";
      status.className = "review-form-status";

      fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
        .then(function (res) {
          return res.json().catch(function () {
            return {};
          }).then(function (json) {
            if (!res.ok) throw new Error(json.error || "Unable to submit inquiry.");
            return json;
          });
        })
        .then(function () {
          if (
            window.ZYBAR &&
            window.ZYBAR.Analytics &&
            typeof window.ZYBAR.Analytics.trackContactSubmit === "function"
          ) {
            window.ZYBAR.Analytics.trackContactSubmit({ car_model: payload.carModelInterest });
          }
          form.reset();
          carModelInput.value = productTitle;
          status.textContent = "Thank you! Your inquiry has been submitted.";
          status.className = "review-form-status is-success";
        })
        .catch(function (err) {
          status.textContent =
            err && err.message ? err.message : "Submission failed. Please try again.";
          status.className = "review-form-status is-error";
        })
        .finally(function () {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalLabel || "Send Inquiry";
          }
        });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildSection);
  } else {
    buildSection();
  }
})();
