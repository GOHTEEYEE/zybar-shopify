(function () {
  "use strict";

  function isProductPage() {
    var path = window.location && window.location.pathname ? window.location.pathname : "";
    return path.indexOf("/products/") === 0;
  }

  function getShortDescription() {
    var seo = window.ZYBAR_SEO && window.ZYBAR_SEO.description;
    if (seo) {
      var first = String(seo).split(/(?<=[.!?])\s+/)[0];
      if (first && first.length > 24) return first;
    }
    var meta = document.querySelector('meta[name="description"]');
    if (meta && meta.getAttribute("content")) {
      var content = String(meta.getAttribute("content")).trim();
      var sentence = content.split(/(?<=[.!?])\s+/)[0];
      if (sentence.length > 200) sentence = sentence.slice(0, 197) + "…";
      if (sentence) return sentence;
    }
    return "Handcrafted LED automotive wall art with precision internal illumination and a museum-grade finish—designed for the discerning collector.";
  }

  function getSpecsListHtml() {
    var section = document.querySelector('section.pdp-section[aria-labelledby="pdp-features-heading"]');
    if (!section) return "";
    var items = section.querySelectorAll(".product-features li");
    if (!items.length) return "";
    return (
      "<ul class=\"pdp-accordion-list\">" +
      Array.prototype.map
        .call(items, function (li) {
          return "<li>" + li.innerHTML + "</li>";
        })
        .join("") +
      "</ul>"
    );
  }

  function iconSvg(name) {
    var icons = {
      globe:
        '<svg class="pdp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.8 4 6 4 9s-1.5 6.2-4 9M12 3C9.5 5.8 8 9 8 12s1.5 6.2 4 9"/></svg>',
      craft:
        '<svg class="pdp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" aria-hidden="true"><path d="M12 3l2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 8.2l5-.7L12 3z"/></svg>',
      shield:
        '<svg class="pdp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" aria-hidden="true"><path d="M12 3l7 3v6c0 4.2-2.8 7.8-7 9-4.2-1.2-7-4.8-7-9V6l7-3z"/><path d="M9 12l2 2 4-4"/></svg>',
      lock:
        '<svg class="pdp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
      order:
        '<svg class="pdp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="1.5"/><path d="M8 3v4M16 3v4M4 10h16"/></svg>',
      craftStep:
        '<svg class="pdp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" aria-hidden="true"><path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"/></svg>',
      ship:
        '<svg class="pdp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" aria-hidden="true"><path d="M3 8h11v9H3z"/><path d="M14 10h4l3 4v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>'
    };
    return icons[name] || icons.globe;
  }

  function getProductSlug() {
    var path = window.location && window.location.pathname ? window.location.pathname : "";
    var trimmed = path.replace(/\/+$/, "");
    var parts = trimmed.split("/");
    return parts.length >= 3 ? parts[2] : "";
  }

  /** Stable random stock count (2–8) per product for the session. */
  function getLowStockCount(slug) {
    var key = "zybar.lowStock." + (slug || "default");
    try {
      var stored = window.sessionStorage.getItem(key);
      var n = stored ? parseInt(stored, 10) : NaN;
      if (n >= 2 && n <= 8) return n;
      n = 2 + Math.floor(Math.random() * 7);
      window.sessionStorage.setItem(key, String(n));
      return n;
    } catch (_) {
      return 2 + Math.floor(Math.random() * 7);
    }
  }

  function loadLocalReviews(slug) {
    if (!slug) return [];
    try {
      var parsed = JSON.parse(window.localStorage.getItem("zybar.reviews.local." + slug) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function computeReviewStats(list) {
    if (!Array.isArray(list) || !list.length) return null;
    var total = list.length;
    var sum = list.reduce(function (acc, item) {
      return acc + (Number(item && item.rating) || 0);
    }, 0);
    return {
      count: total,
      average: sum / total
    };
  }

  function buildStarsHtml(rating) {
    var filled = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
    var html = "";
    for (var i = 0; i < 5; i += 1) {
      html += '<span class="pdp-star' + (i < filled ? " is-filled" : "") + '"></span>';
    }
    return html;
  }

  function buildRatingBlock(stats) {
    if (!stats || !stats.count) return null;
    var block = document.createElement("div");
    block.className = "pdp-luxury-rating";
    block.setAttribute("data-pdp-rating-block", "");
    var reviewLabel = stats.count === 1 ? "Review" : "Reviews";
    block.innerHTML =
      '<div class="pdp-luxury-stars" data-pdp-rating-stars aria-hidden="true">' +
      buildStarsHtml(stats.average) +
      "</div>" +
      '<p class="pdp-luxury-rating-text">' +
      '<span data-pdp-rating-value>' +
      stats.average.toFixed(1) +
      "</span>" +
      ' <span class="pdp-luxury-rating-sep">·</span> ' +
      '<a href="#pdp-reviews-title" class="pdp-luxury-reviews-link"><span data-pdp-rating-count>' +
      stats.count +
      '</span> <span data-pdp-rating-label>' +
      reviewLabel +
      "</span></a>" +
      "</p>";
    return block;
  }

  function updatePdpLuxuryRating(reviews) {
    var details = document.querySelector(".product-showcase-details.pdp-luxury-ready");
    if (!details) return;

    var stats = computeReviewStats(reviews);
    var existing = details.querySelector("[data-pdp-rating-block]");
    var lede = details.querySelector(".pdp-luxury-lede");

    if (!stats || !stats.count) {
      if (existing) existing.remove();
      return;
    }

    if (existing) {
      var starsEl = existing.querySelector("[data-pdp-rating-stars]");
      var valueEl = existing.querySelector("[data-pdp-rating-value]");
      var countEl = existing.querySelector("[data-pdp-rating-count]");
      var labelEl = existing.querySelector("[data-pdp-rating-label]");
      if (starsEl) starsEl.innerHTML = buildStarsHtml(stats.average);
      if (valueEl) valueEl.textContent = stats.average.toFixed(1);
      if (countEl) countEl.textContent = String(stats.count);
      if (labelEl) labelEl.textContent = stats.count === 1 ? "Review" : "Reviews";
      return;
    }

    var block = buildRatingBlock(stats);
    if (!block) return;
    if (lede) {
      details.insertBefore(block, lede);
    } else {
      details.appendChild(block);
    }
  }

  function buildTrustBlock() {
    var list = document.createElement("ul");
    list.className = "pdp-luxury-trust";
    list.setAttribute("aria-label", "Purchase assurances");
    var items = [
      { icon: "globe", text: "Worldwide Shipping" },
      { icon: "craft", text: "Handcrafted in Japan" },
      { icon: "shield", text: "30-Day Satisfaction Guarantee" },
      { icon: "lock", text: "Secure Checkout" }
    ];
    items.forEach(function (item) {
      var li = document.createElement("li");
      li.innerHTML = iconSvg(item.icon) + '<span>' + item.text + "</span>";
      list.appendChild(li);
    });
    return list;
  }

  function deliveryIconSvg(name) {
    var attrs =
      'class="pdp-delivery-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    var icons = {
      order:
        "<svg " + attrs + "><path d=\"M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z\"/><path d=\"M3 6h18\"/><path d=\"M16 10a4 4 0 0 1-8 0\"/></svg>",
      production:
        "<svg " + attrs + "><path d=\"M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2\"/><path d=\"M15 18H9\"/><path d=\"M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14\"/><circle cx=\"17\" cy=\"18\" r=\"2\"/><circle cx=\"7\" cy=\"18\" r=\"2\"/></svg>",
      delivery:
        "<svg " + attrs + "><path d=\"M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0\"/><circle cx=\"12\" cy=\"10\" r=\"3\"/></svg>"
    };
    return icons[name] || icons.order;
  }

  function addDays(baseDate, days) {
    var next = new Date(baseDate.getTime());
    next.setDate(next.getDate() + days);
    return next;
  }

  function formatTimelineDate(date) {
    var month = date.toLocaleDateString(undefined, { month: "short" });
    var day = date.getDate();
    var dayText = day < 10 ? "0" + day : String(day);
    return month + " " + dayText;
  }

  function formatTimelineRange(startDate, endDate) {
    return formatTimelineDate(startDate) + " – " + formatTimelineDate(endDate);
  }

  function getDeliveryTimelineDates() {
    var today = new Date();
    today.setHours(12, 0, 0, 0);
    return {
      order: today,
      handcraftedStart: addDays(today, 2),
      handcraftedEnd: addDays(today, 4),
      deliveryStart: addDays(today, 9),
      deliveryEnd: addDays(today, 12)
    };
  }

  function buildDeliveryMilestone(icon, dateText, label, index, isDestination) {
    var destinationClass = isDestination ? " is-destination" : "";
    return (
      '<div class="pdp-delivery-milestone' +
      destinationClass +
      '" role="listitem" style="--milestone-index:' +
      index +
      '">' +
      '<div class="pdp-delivery-marker">' +
      deliveryIconSvg(icon) +
      '<span class="pdp-delivery-dot" aria-hidden="true"></span>' +
      (isDestination ? '<span class="pdp-delivery-halo" aria-hidden="true"></span>' : "") +
      "</div>" +
      '<p class="pdp-delivery-date">' +
      dateText +
      "</p>" +
      '<p class="pdp-delivery-label">' +
      label +
      "</p>" +
      "</div>"
    );
  }

  function buildEnergyConduit() {
    return (
      '<div class="pdp-energy-conduit" aria-hidden="true">' +
      '<div class="pdp-energy-track">' +
      '<div class="pdp-energy-base"></div>' +
      '<div class="pdp-energy-glow"></div>' +
      '<div class="pdp-energy-gradient"></div>' +
      '<div class="pdp-energy-pulse"></div>' +
      "</div></div>"
    );
  }

  function buildDeliveryTimeline() {
    var dates = getDeliveryTimelineDates();
    var wrap = document.createElement("div");
    wrap.className = "pdp-luxury-delivery";
    wrap.setAttribute("aria-label", "Craft and fulfillment journey");
    wrap.innerHTML =
      '<div class="pdp-delivery-timeline">' +
      '<div class="pdp-delivery-rail" role="list">' +
      buildEnergyConduit() +
      buildDeliveryMilestone("order", formatTimelineDate(dates.order), "ORDER", 0, false) +
      buildDeliveryMilestone(
        "production",
        formatTimelineRange(dates.handcraftedStart, dates.handcraftedEnd),
        "PRODUCTION",
        1,
        false
      ) +
      buildDeliveryMilestone(
        "delivery",
        formatTimelineRange(dates.deliveryStart, dates.deliveryEnd),
        "DELIVERY",
        2,
        true
      ) +
      "</div>" +
      "</div>";
    return wrap;
  }

  function buildAccordion() {
    var specsHtml = getSpecsListHtml();
    var wrap = document.createElement("div");
    wrap.className = "pdp-luxury-accordion";
    wrap.setAttribute("role", "presentation");

    var sections = [
      {
        id: "included",
        title: "What's Included",
        body:
          "<ul class=\"pdp-accordion-list\">" +
          "<li>Handcrafted LED wall art panel</li>" +
          "<li>Remote control with brightness &amp; speed adjustment</li>" +
          "<li>USB power cable</li>" +
          "<li>Premium gift-ready packaging</li>" +
          "<li>Wall mounting hardware (no drilling required)</li>" +
          "</ul>"
      },
      {
        id: "specs",
        title: "Specifications",
        body:
          specsHtml ||
          "<ul class=\"pdp-accordion-list\">" +
          "<li><strong>Panel:</strong> High-transparency acrylic with matte-backed diffusion</li>" +
          "<li><strong>Illumination:</strong> Integrated LED strips, multiple modes with memory</li>" +
          "<li><strong>Power:</strong> USB powered with optional battery support</li>" +
          "<li><strong>Sizes:</strong> 30×45 cm and 40×60 cm</li>" +
          "</ul>"
      },
      {
        id: "shipping",
        title: "Shipping & Delivery",
        body:
          "<p class=\"pdp-accordion-text\">Each piece is carefully handcrafted before shipping. Standard Shipping: 14–18 business days. Priority Shipping: 7–14 business days. You’ll receive a tracking number by email once your order ships.</p>"
      },
      {
        id: "warranty",
        title: "Warranty",
        body:
          "<p class=\"pdp-accordion-text\">Every ZYBAR piece is backed by a 30-day easy returns policy for eligible products, and we carefully inspect every piece before shipping. If your order arrives damaged, contact us within 48 hours of delivery with photos.</p>"
      },
      {
        id: "installation",
        title: "Installation Guide",
        body:
          "<ol class=\"pdp-accordion-steps\">" +
          "<li>Select your preferred wall location with access to power (or use Dual Power / battery mode).</li>" +
          "<li>Mount using the included hardware—ready to hang out of the box.</li>" +
          "<li>Connect USB power, or use batteries if you chose Dual Power.</li>" +
          "<li>Use the remote to adjust brightness, speed, and lighting modes.</li>" +
          "</ol>"
      },
      {
        id: "faqs",
        title: "FAQs",
        body:
          "<div class=\"pdp-accordion-faq\">" +
          "<p><strong>Where are products made?</strong><br>Handcrafted in Japan by our team and shipped worldwide from Tokyo.</p>" +
          "<p><strong>Can I customize my own car?</strong><br>Yes — upload a photo on our Custom Made page and we’ll handcraft a one-of-one piece.</p>" +
          "<p><strong>Can I use it in my country?</strong><br>Yes. Worldwide shipping and standard USB power compatibility.</p>" +
          "<p><a href=\"/policies/faq.html\">View full FAQ →</a></p>" +
          "</div>"
      }
    ];

    sections.forEach(function (section, index) {
      var panel = document.createElement("div");
      panel.className = "pdp-accordion-item";
      if (index === 0) panel.classList.add("is-open");
      panel.innerHTML =
        '<button type="button" class="pdp-accordion-trigger" aria-expanded="' +
        (index === 0 ? "true" : "false") +
        '" aria-controls="pdp-acc-' +
        section.id +
        '">' +
        '<span>' +
        section.title +
        "</span>" +
        '<svg class="pdp-accordion-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>' +
        "</button>" +
        '<div class="pdp-accordion-panel" id="pdp-acc-' +
        section.id +
        '">' +
        '<div class="pdp-accordion-panel-inner">' +
        section.body +
        "</div></div>";
      wrap.appendChild(panel);
    });

    wrap.addEventListener("click", function (event) {
      var trigger = event.target && event.target.closest(".pdp-accordion-trigger");
      if (!trigger) return;
      var item = trigger.closest(".pdp-accordion-item");
      if (!item) return;
      var isOpen = item.classList.contains("is-open");
      wrap.querySelectorAll(".pdp-accordion-item").forEach(function (el) {
        el.classList.remove("is-open");
        var btn = el.querySelector(".pdp-accordion-trigger");
        if (btn) btn.setAttribute("aria-expanded", "false");
      });
      if (!isOpen) {
        item.classList.add("is-open");
        trigger.setAttribute("aria-expanded", "true");
      }
    });

    return wrap;
  }

  function getMemberCtaState() {
    var member = window.ZYBAR && window.ZYBAR.MemberPricing;
    if (!member || typeof member.isActive !== "function" || !member.isActive()) return null;
    var state = typeof member.getState === "function" ? member.getState() : {};
    var percent = Number(state.percent) || 15;
    return { percent: percent };
  }

  /**
   * Dynamic Add to Cart CTA: members see their extra savings baked into the
   * button and a "Member Pricing Active" note above it. Non-members see the
   * plain CTA. Re-runs whenever member status changes.
   */
  function syncMemberCta() {
    if (!isProductPage()) return;
    var memberState = getMemberCtaState();

    var mainCta = document.querySelector(".pdp-luxury-buy .product-add-cart.pdp-luxury-cta");
    if (mainCta) {
      mainCta.textContent = memberState
        ? "Add to Cart \u00B7 Save Extra " + memberState.percent + "%"
        : "Add to Cart";
      mainCta.classList.toggle("pdp-luxury-cta--member", !!memberState);
    }

    var stickyCta = document.querySelector(".pdp-sticky-cta");
    if (stickyCta) {
      stickyCta.textContent = memberState
        ? "\uD83D\uDED2 Add to Cart \u00B7 Extra " + memberState.percent + "% Off"
        : "\uD83D\uDED2 Add to cart";
    }

    var buy = document.querySelector(".pdp-luxury-buy");
    var note = document.querySelector(".pdp-member-note");
    if (memberState && buy && mainCta) {
      if (!note) {
        note = document.createElement("p");
        note.className = "pdp-member-note";
        note.setAttribute("aria-live", "polite");
        buy.insertBefore(note, mainCta);
      }
      note.innerHTML =
        '<span class="pdp-member-note-check" aria-hidden="true">\u2713</span>' +
        '<span class="pdp-member-note-copy"><strong>Member Pricing Active</strong>' +
        "<small>Extra " + memberState.percent + "% will be applied automatically.</small></span>";
    } else if (note) {
      note.remove();
    }
  }

  function watchMemberCta() {
    window.addEventListener("zybar:member-pricing-change", syncMemberCta);
    var member = window.ZYBAR && window.ZYBAR.MemberPricing;
    if (member && member.ready && typeof member.ready.then === "function") {
      member.ready.then(syncMemberCta);
    }
  }

  function initPdpLuxuryUi() {
    if (!isProductPage()) return;
    var details = document.querySelector(".product-showcase-details");
    if (!details || details.classList.contains("pdp-luxury-ready")) return;

    var h1 = details.querySelector("h1");
    var price = details.querySelector(".product-price");
    var actions = details.querySelector(".product-showcase-actions");
    var featureList = details.querySelector(":scope > .product-features");
    var sizeLabel = details.querySelector(".product-option-label");
    var sizeOptions = details.querySelector(".product-size-options");
    var cartRow = details.querySelector(".product-cart-row");
    var paypal = details.querySelector(".product-paypal");
    var morePayment = details.querySelector(".product-more-payment");

    details.classList.add("pdp-luxury", "pdp-luxury-ready");

    var top = document.createElement("div");
    top.className = "pdp-luxury-top";
    if (h1) top.appendChild(h1);
    if (actions) top.appendChild(actions);

    var lede = document.createElement("p");
    lede.className = "pdp-luxury-lede";
    lede.textContent = getShortDescription();

    var optionsWrap = document.createElement("div");
    optionsWrap.className = "pdp-luxury-options";

    var sizeGroup = document.createElement("div");
    sizeGroup.className = "pdp-luxury-size-group";
    if (sizeLabel) {
      sizeLabel.textContent = "Size";
      sizeGroup.appendChild(sizeLabel);
    }
    if (sizeOptions) sizeGroup.appendChild(sizeOptions);
    optionsWrap.appendChild(sizeGroup);

    var stockLeft = getLowStockCount(getProductSlug());
    var lowStock = document.createElement("p");
    lowStock.className = "pdp-low-stock";
    lowStock.setAttribute("aria-live", "polite");
    lowStock.innerHTML =
      '<span class="pdp-low-stock-dot" aria-hidden="true"></span>' +
      '<span class="pdp-low-stock-text">Low Stock: ' +
      stockLeft +
      " Left</span>";

    var buy = document.createElement("div");
    buy.className = "pdp-luxury-buy";

    var priceRow = document.createElement("div");
    priceRow.className = "pdp-price-row";

    var compareEl = document.createElement("span");
    compareEl.className = "pdp-price-compare";
    compareEl.hidden = true;

    if (price) {
      price.classList.add("pdp-luxury-price", "pdp-price-sale", "product-price");
      if (!/USD/i.test(price.textContent || "")) {
        price.textContent = String(price.textContent || "").trim() + " USD";
      }
    } else {
      price = document.createElement("span");
      price.className = "product-price pdp-luxury-price pdp-price-sale";
      price.textContent = "$0.00 USD";
    }

    var saleBadge = document.createElement("span");
    saleBadge.className = "pdp-sale-badge";
    saleBadge.textContent = "SALE";
    saleBadge.hidden = true;

    priceRow.appendChild(compareEl);
    priceRow.appendChild(price);
    priceRow.appendChild(saleBadge);
    buy.appendChild(priceRow);

    var shippingNote = document.createElement("p");
    shippingNote.className = "pdp-shipping-note";
    shippingNote.innerHTML =
      '<span class="pdp-shipping-underline">Shipping</span> calculated at checkout.';
    buy.appendChild(shippingNote);

    if (cartRow) {
      var qty = cartRow.querySelector(".product-quantity");
      if (qty) qty.classList.add("pdp-luxury-qty-hidden");
      var addBtn = cartRow.querySelector(".product-add-cart");
      if (addBtn) {
        if (addBtn.tagName === "A") {
          var cartButton = document.createElement("button");
          cartButton.type = "button";
          cartButton.className = addBtn.className + " pdp-luxury-cta";
          cartButton.setAttribute("data-stripe-action", "checkout");
          cartButton.textContent = "Add to Cart";
          addBtn = cartButton;
        } else {
          addBtn.classList.add("pdp-luxury-cta");
          addBtn.textContent = "Add to Cart";
        }
        buy.appendChild(addBtn);
      }
      cartRow.classList.add("pdp-luxury-cart-row-hidden");
      buy.appendChild(cartRow);
    }

    details.innerHTML = "";
    details.appendChild(top);
    details.appendChild(lede);
    details.appendChild(optionsWrap);
    details.appendChild(lowStock);
    details.appendChild(buy);
    details.appendChild(buildTrustBlock());
    details.appendChild(buildDeliveryTimeline());
    details.appendChild(buildAccordion());

    if (featureList) featureList.remove();
    if (paypal) paypal.classList.add("pdp-luxury-hidden");
    if (morePayment) morePayment.classList.add("pdp-luxury-hidden");
    if (paypal && paypal.parentNode === details) details.appendChild(paypal);
    if (morePayment && morePayment.parentNode === details) details.appendChild(morePayment);

    var duplicateFeatures = document.querySelector('section.pdp-section[aria-labelledby="pdp-features-heading"]');
    if (duplicateFeatures) duplicateFeatures.classList.add("pdp-luxury-hidden");

    updatePdpLuxuryRating(loadLocalReviews(getProductSlug()));
    syncMemberCta();
    watchMemberCta();
  }

  window.ZYBAR = window.ZYBAR || {};
  window.ZYBAR.initPdpLuxuryUi = initPdpLuxuryUi;
  window.ZYBAR.updatePdpLuxuryRating = updatePdpLuxuryRating;
})();
