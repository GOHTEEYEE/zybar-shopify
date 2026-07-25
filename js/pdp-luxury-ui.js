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
        '<svg class="pdp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" aria-hidden="true"><path d="M3 8h11v9H3z"/><path d="M14 10h4l3 4v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
      handmade:
        '<svg class="pdp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 13V7.5a1.5 1.5 0 0 1 3 0V12"/><path d="M11 11.5V6.5a1.5 1.5 0 0 1 3 0V12"/><path d="M14 10.5V7a1.5 1.5 0 0 1 3 0v8.2a4.8 4.8 0 0 1-4.3 4.8H12a5 5 0 0 1-4.6-3L5.2 12.4A1.6 1.6 0 0 1 8 11.2"/></svg>',
      japan:
        '<svg class="pdp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.25"/></svg>',
      built:
        '<svg class="pdp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5v-7Z"/><path d="M12 12v8M4 8.5l8 3.5 8-3.5"/></svg>',
      led:
        '<svg class="pdp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.55 1.1 1.3 1.2 2.2h4.8c.1-.9.5-1.65 1.2-2.2A6 6 0 0 0 12 3Z"/></svg>'
    };
    return icons[name] || icons.globe;
  }

  function buildValueHighlights() {
    var list = document.createElement("ul");
    list.className = "pdp-value-highlights";
    list.setAttribute("aria-label", "Value highlights");
    var items = [
      {
        icon: "handmade",
        title: "Handmade",
        text: "Crafted by skilled artisans."
      },
      {
        icon: "japan",
        title: "Made in Japan",
        text: "Premium quality craftsmanship."
      },
      {
        icon: "built",
        title: "Built to Order",
        text: "Every artwork is made just for you."
      },
      {
        icon: "led",
        title: "LED Included",
        text: "Ready to display out of the box."
      }
    ];
    items.forEach(function (item) {
      var li = document.createElement("li");
      li.className = "pdp-value-highlight";
      li.innerHTML =
        '<span class="pdp-value-highlight-icon" aria-hidden="true">' +
        iconSvg(item.icon) +
        "</span>" +
        '<span class="pdp-value-highlight-copy">' +
        '<span class="pdp-value-highlight-title">' +
        item.title +
        "</span>" +
        '<span class="pdp-value-highlight-text">' +
        item.text +
        "</span>" +
        "</span>";
      list.appendChild(li);
    });
    return list;
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
      { icon: "shield", text: "30-Day Returns" },
      { icon: "craft", text: "Damage Replacement within 48h" },
      { icon: "lock", text: "2-Year LED Warranty" }
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

  /** Ready-made vs Custom Made stage labels + day offsets from today. */
  var DELIVERY_TIMELINE_MODES = {
    ready: {
      midLabel: "PRODUCTION",
      midStart: 2,
      midEnd: 4,
      deliveryStart: 9,
      deliveryEnd: 12
    },
    custom: {
      midLabel: "CUSTOM ARTWORK",
      midStart: 5,
      midEnd: 10,
      deliveryStart: 14,
      deliveryEnd: 18
    }
  };

  function isCustomMadeProduct() {
    return getProductSlug() === "custom-led-car-wall-art";
  }

  function getDeliveryTimelineMode() {
    return isCustomMadeProduct() ? "custom" : "ready";
  }

  function getDeliveryTimelineDates(mode) {
    var config = DELIVERY_TIMELINE_MODES[mode] || DELIVERY_TIMELINE_MODES.ready;
    var today = new Date();
    today.setHours(12, 0, 0, 0);
    return {
      order: today,
      midStart: addDays(today, config.midStart),
      midEnd: addDays(today, config.midEnd),
      deliveryStart: addDays(today, config.deliveryStart),
      deliveryEnd: addDays(today, config.deliveryEnd),
      midLabel: config.midLabel
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

  function buildDeliveryTimeline(mode) {
    mode = mode || getDeliveryTimelineMode();
    var dates = getDeliveryTimelineDates(mode);
    var wrap = document.createElement("div");
    wrap.className = "pdp-luxury-delivery";
    if (mode === "custom") wrap.classList.add("is-custom-made");
    wrap.setAttribute(
      "aria-label",
      mode === "custom" ? "Custom artwork and fulfillment journey" : "Craft and fulfillment journey"
    );
    wrap.setAttribute("data-timeline-mode", mode);
    wrap.innerHTML =
      '<div class="pdp-delivery-timeline">' +
      '<div class="pdp-delivery-rail" role="list">' +
      buildEnergyConduit() +
      buildDeliveryMilestone("order", formatTimelineDate(dates.order), "ORDER", 0, false) +
      buildDeliveryMilestone(
        "production",
        formatTimelineRange(dates.midStart, dates.midEnd),
        dates.midLabel,
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
        title: "Warranty & Returns",
        body:
          "<p class=\"pdp-accordion-text\">Every ZYBAR piece includes a <strong>2-year LED warranty</strong> covering manufacturing defects in the lighting system. You also have a <strong>30-day satisfaction return</strong> for eligible ready-made products. If your order arrives damaged, contact us within <strong>48 hours</strong> of delivery with photos and we will arrange a replacement.</p>"
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
   * button and a "Member Pricing Active" note above it. Non-members see a soft
   * invite to unlock 7-day welcome pricing (works even if the popup was closed).
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
    var invite = document.querySelector(".pdp-member-invite");
    if (memberState && buy && mainCta) {
      if (invite) invite.remove();
      if (!note) {
        note = document.createElement("p");
        note.className = "pdp-member-note";
        note.setAttribute("aria-live", "polite");
        buy.insertBefore(note, mainCta);
      }
      note.innerHTML =
        '<span class="pdp-member-note-check" aria-hidden="true">\u2713</span>' +
        '<span class="pdp-member-note-copy"><strong>Member Pricing Active</strong>' +
        "<small>Extra " +
        memberState.percent +
        "% · valid 7 days after signup.</small></span>";
    } else if (buy && mainCta) {
      if (note) note.remove();
      if (!invite) {
        invite = document.createElement("button");
        invite.type = "button";
        invite.className = "pdp-member-invite";
        invite.addEventListener("click", function () {
          var popup = window.ZYBAR && window.ZYBAR.PremiumPopup;
          if (popup && typeof popup.show === "function") {
            popup.show("pdp_cta", { force: true });
          }
        });
        buy.insertBefore(invite, mainCta);
      }
      invite.textContent = "Unlock 15% Member Pricing · valid 7 days";
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

    var valueHighlights = buildValueHighlights();

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
    details.appendChild(priceRow);
    details.appendChild(valueHighlights);
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

    ensureWhyBuySection();
    updatePdpLuxuryRating(loadLocalReviews(getProductSlug()));
    syncMemberCta();
    watchMemberCta();
  }

  function buildWhyBuySection() {
    var section = document.createElement("section");
    section.className = "pdp-why-buy section";
    section.id = "pdp-why-buy";
    section.setAttribute("aria-labelledby", "pdp-why-buy-title");
    section.innerHTML =
      '<div class="container pdp-why-buy-inner">' +
      '<p class="pdp-why-buy-badge">' +
      '<span class="pdp-why-buy-badge-icon" aria-hidden="true">' +
      '<svg width="18" height="18" viewBox="0 0 18 18" fill="none">' +
      '<rect x="1.75" y="1.75" width="5.5" height="5.5" rx="0.7" stroke="currentColor" stroke-width="1.35"/>' +
      '<circle cx="12.75" cy="4.5" r="2.55" stroke="currentColor" stroke-width="1.35"/>' +
      '<path d="M2.4 15.1 4.5 11.05 6.6 15.1Z" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round"/>' +
      '<path d="M12.75 10.15 15.55 12.95 12.75 15.75 9.95 12.95Z" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round"/>' +
      "</svg></span>" +
      "<span>HANDCRAFTED IN TOKYO</span>" +
      "</p>" +
      '<h2 class="pdp-why-buy-title" id="pdp-why-buy-title">' +
      '<span class="pdp-why-buy-title-mark">Why buy</span> from ZYBAR?' +
      "</h2>" +
      '<div class="pdp-why-buy-copy">' +
      "<p>Every piece is composed and finished in our Tokyo studio—from lighting layout to acrylic assembly. Because we handle the craft in-house, you get sharper contrast, cleaner internal glow, and a collector-grade finish—not mass-market edge lighting.</p>" +
      "<p>Browse ready-made models, or upload your own car for a one-of-one Custom Made artwork. The best part? " +
      "<strong>2-year LED warranty · 30-day returns · damage replacement within 48 hours.</strong> " +
      "Focus on the car you love—we handle the rest.</p>" +
      "</div>" +
      '<ul class="pdp-why-buy-points" aria-label="ZYBAR purchase benefits">' +
      "<li>Studio craft in Japan</li>" +
      "<li>Lights from within</li>" +
      "<li>Worldwide shipping</li>" +
      "</ul>" +
      "</div>";
    return section;
  }

  function ensureWhyBuySection() {
    if (document.getElementById("pdp-why-buy")) return;
    var core = document.getElementById("product-feature");
    if (!core || !core.parentNode) return;
    core.parentNode.insertBefore(buildWhyBuySection(), core);
  }

  window.ZYBAR = window.ZYBAR || {};
  window.ZYBAR.initPdpLuxuryUi = initPdpLuxuryUi;
  window.ZYBAR.updatePdpLuxuryRating = updatePdpLuxuryRating;
})();
