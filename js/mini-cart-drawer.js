/**
 * Premium slide-in mini cart drawer (vanilla JS).
 */
(function () {
  "use strict";

  var DRAWER_ID = "zybar-mini-cart";
  /** Rows shown before the list collapses behind "+N More Items". */
  var VISIBLE_ROW_LIMIT = 3;
  var catalogCache = null;
  var catalogPromise = null;
  var state = {
    isOpen: false,
    lastFocus: null,
    options: null,
    expanded: false
  };

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatUsd(amount) {
    var pricing = window.ZYBAR && window.ZYBAR.Pricing;
    if (pricing && typeof pricing.formatUsd === "function") {
      return pricing.formatUsd(amount);
    }
    var n = Number(amount);
    if (!Number.isFinite(n)) return "$0.00";
    return "$" + n.toFixed(2);
  }

  function lineSubtotal(item) {
    var qty = Number(item && item.quantity);
    var safeQty = Number.isFinite(qty) && qty > 0 ? qty : 1;
    var unit = Number(item && item.unitPriceUSD);
    var safeUnit = Number.isFinite(unit) && unit >= 0 ? unit : 0;
    return safeUnit * safeQty;
  }

  function loadCatalog() {
    if (catalogCache) return Promise.resolve(catalogCache);
    if (catalogPromise) return catalogPromise;
    catalogPromise = fetch("/data/products.json", { headers: { accept: "application/json" } })
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .then(function (data) {
        var map = Object.create(null);
        var products = data && Array.isArray(data.products) ? data.products : [];
        products.forEach(function (product) {
          if (product && product.slug) map[product.slug] = product;
        });
        catalogCache = map;
        return map;
      })
      .catch(function () {
        catalogCache = Object.create(null);
        return catalogCache;
      });
    return catalogPromise;
  }

  function formatSizeLabel(item) {
    var label = item && item.sizeLabel ? String(item.sizeLabel) : item && item.size ? String(item.size) : "";
    if (!label) return "—";
    return label.replace(/x/gi, "×");
  }

  function lockScroll() {
    document.documentElement.classList.add("zybar-mini-cart-open");
    document.body.classList.add("zybar-mini-cart-open");
  }

  function unlockScroll() {
    document.documentElement.classList.remove("zybar-mini-cart-open");
    document.body.classList.remove("zybar-mini-cart-open");
  }

  function getDrawer() {
    return document.getElementById(DRAWER_ID);
  }

  function getFocusable(container) {
    if (!container) return [];
    return Array.prototype.slice
      .call(
        container.querySelectorAll(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        )
      )
      .filter(function (el) {
        return !el.hasAttribute("hidden");
      });
  }

  function onKeyDown(event) {
    if (!state.isOpen) return;
    var drawer = getDrawer();
    if (!drawer) return;

    if (event.key === "Escape") {
      event.preventDefault();
      closeMiniCartDrawer();
      return;
    }

    if (event.key !== "Tab") return;
    var panel = drawer.querySelector(".mini-cart-panel");
    var focusable = getFocusable(panel);
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function ensureDrawerDom() {
    var existing = getDrawer();
    if (existing) return existing;

    var root = document.createElement("div");
    root.id = DRAWER_ID;
    root.className = "mini-cart-drawer";
    root.setAttribute("role", "presentation");
    root.hidden = true;
    root.innerHTML =
      '<div class="mini-cart-backdrop" data-mini-cart-close aria-hidden="true"></div>' +
      '<aside class="mini-cart-panel" role="dialog" aria-modal="true" aria-labelledby="mini-cart-title">' +
      '<header class="mini-cart-header">' +
      '<div class="mini-cart-header-main">' +
      '<span class="mini-cart-check" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>' +
      "</span>" +
      '<div class="mini-cart-header-copy">' +
      '<h2 class="mini-cart-title" id="mini-cart-title" data-mini-cart-confirm>Added to your cart</h2>' +
      "</div>" +
      "</div>" +
      '<button type="button" class="mini-cart-close" aria-label="Close">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>' +
      "</button>" +
      "</header>" +
      '<div class="mini-cart-scroll">' +
      '<div class="mini-cart-body" data-mini-cart-body></div>' +
      '<footer class="mini-cart-footer" data-mini-cart-footer></footer>' +
      "</div>" +
      "</aside>";

    document.body.appendChild(root);

    root.querySelector(".mini-cart-close").addEventListener("click", closeMiniCartDrawer);
    root.querySelector("[data-mini-cart-close]").addEventListener("click", closeMiniCartDrawer);
    document.addEventListener("keydown", onKeyDown);

    return root;
  }

  /** Total quantity across all rows. */
  function countCartItems(items) {
    return (items || []).reduce(function (sum, row) {
      var qty = Number(row && row.quantity);
      return sum + (Number.isFinite(qty) && qty > 0 ? qty : 0);
    }, 0);
  }

  /** Just-added row first, everything else in stored order. */
  function orderItemsForDisplay(items, addedKey) {
    if (!addedKey) return (items || []).slice();
    var added = [];
    var rest = [];
    (items || []).forEach(function (row) {
      if (row && row.key === addedKey) added.push(row);
      else rest.push(row);
    });
    return added.concat(rest);
  }

  var ICONS = {
    handmade:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M12 3v2M5.6 5.6l1.4 1.4M3 12h2M18.4 5.6 17 7M21 12h-2"/>' +
      '<path d="M7 21v-4a5 5 0 0 1 10 0v4"/><path d="M9 21v-3M15 21v-3"/></svg>',
    lock:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15" r="1.4"/></svg>',
    globe:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
    shield:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M12 3 5 6v6c0 4.4 3 7.4 7 9 4-1.6 7-4.6 7-9V6l-7-3z"/><path d="m9 12 2 2 4-4"/></svg>',
    truck:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M3 7h11v10H3V7zm11 3h4l3 3v4h-7V10z"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/></svg>',
    check:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.2 2.4 2.4 4.6-5"/></svg>'
  };

  function renderTrustSection() {
    function badge(icon, label) {
      return (
        '<li class="mini-cart-trust-badge">' +
        '<span class="mini-cart-trust-badge-icon" aria-hidden="true">' + icon + "</span>" +
        '<span class="mini-cart-trust-badge-label">' + label + "</span>" +
        "</li>"
      );
    }
    return (
      '<ul class="mini-cart-trust" aria-label="Purchase assurances">' +
      badge(ICONS.handmade, 'Handmade in Japan <span aria-hidden="true">🇯🇵</span>') +
      badge(ICONS.lock, "Secure Checkout") +
      badge(ICONS.globe, "Ships Worldwide") +
      badge(ICONS.shield, "30-Day Guarantee") +
      "</ul>"
    );
  }

  function renderSocialProof() {
    return (
      '<div class="mini-cart-social" aria-label="Customer rating">' +
      '<div class="mini-cart-social-main">' +
      '<span class="mini-cart-stars" aria-hidden="true">★★★★★</span>' +
      '<span class="mini-cart-social-copy">Trusted by Car Enthusiasts Worldwide</span>' +
      "</div>" +
      '<div class="mini-cart-social-rating">' +
      '<strong>4.9/5</strong>' +
      "<span>Average Rating</span>" +
      "</div>" +
      "</div>"
    );
  }

  function renderDeliveryCard() {
    var summary = getPricingSummary();
    if (!summary) return "";
    var delivery = summary.estimateDeliveryRange();
    return (
      '<div class="mini-cart-delivery" aria-label="Estimated delivery">' +
      '<span class="mini-cart-delivery-icon" aria-hidden="true">' + ICONS.truck + "</span>" +
      '<span class="mini-cart-delivery-label">Estimated Delivery</span>' +
      '<span class="mini-cart-delivery-value">' + escapeHtml(delivery.label) + "</span>" +
      "</div>"
    );
  }

  function getPricingSummary() {
    return window.ZYBAR && window.ZYBAR.PricingSummary ? window.ZYBAR.PricingSummary : null;
  }

  function getCartItems(options) {
    if (options && Array.isArray(options.items)) return options.items;
    var cart = window.ZYBAR && window.ZYBAR.Cart;
    if (cart && typeof cart.readCartItems === "function") return cart.readCartItems();
    return options && options.item ? [options.item] : [];
  }

  function getPricing() {
    return window.ZYBAR && window.ZYBAR.Pricing ? window.ZYBAR.Pricing : null;
  }

  function renderQuantityStepper(item) {
    var qty = Number(item && item.quantity);
    var safeQty = Number.isFinite(qty) && qty > 0 ? qty : 1;
    return (
      '<span class="mini-cart-qty" role="group" aria-label="Quantity">' +
      '<button type="button" class="mini-cart-qty-btn" data-mini-cart-qty="-1" aria-label="Decrease quantity"' +
      (safeQty <= 1 ? " disabled" : "") +
      ">\u2212</button>" +
      '<span class="mini-cart-qty-value" aria-live="polite">' + safeQty + "</span>" +
      '<button type="button" class="mini-cart-qty-btn" data-mini-cart-qty="1" aria-label="Increase quantity">+</button>' +
      "</span>"
    );
  }

  /** Compare-at unit price for a row (0 when none). */
  function rowCompareAtUnit(row) {
    var pricing = getPricing();
    if (!pricing || typeof pricing.calculateProductCompareAtPrice !== "function") return 0;
    var slug = (row && (row.slug || row.productSlug)) || "";
    return pricing.calculateProductCompareAtPrice({
      slug: slug,
      productSlug: slug,
      size: row && row.size,
      powerType: row && row.powerType
    });
  }

  function renderCartRow(row, isJustAdded, index) {
    var slug = row && row.slug ? row.slug : "";
    var name = (row && row.name) || "Product";
    var imageUrl = row && row.imageUrl ? row.imageUrl : slug ? "/Image/" + slug + "-1.webp" : "";
    var qty = Number(row && row.quantity);
    var safeQty = Number.isFinite(qty) && qty > 0 ? qty : 1;
    var unit = Number(row && row.unitPriceUSD);
    var safeUnit = Number.isFinite(unit) && unit >= 0 ? unit : 0;
    var compareUnit = rowCompareAtUnit(row);
    var hasCompare = compareUnit > safeUnit && safeUnit > 0;
    var meta = [formatSizeLabel(row), (row && row.powerTypeLabel) || ""].filter(Boolean).join(" · ");

    return (
      '<li class="mini-cart-item' +
      (isJustAdded ? " mini-cart-item--added" : "") +
      '" data-item-key="' +
      escapeHtml(row && row.key ? row.key : "") +
      '" style="--item-index:' +
      index +
      '">' +
      (isJustAdded ? '<span class="mini-cart-item-badge">Just Added</span>' : "") +
      '<div class="mini-cart-item-thumb-wrap">' +
      '<img class="mini-cart-thumb" src="' +
      escapeHtml(imageUrl) +
      '" alt="" width="64" height="64" loading="lazy" onerror="if(window.ZYBAR&amp;&amp;ZYBAR.Cart&amp;&amp;ZYBAR.Cart.onProductThumbError)ZYBAR.Cart.onProductThumbError(this)" />' +
      "</div>" +
      '<div class="mini-cart-item-info">' +
      '<p class="mini-cart-item-name">' + escapeHtml(name) + "</p>" +
      '<p class="mini-cart-item-meta">' + escapeHtml(meta) + "</p>" +
      renderQuantityStepper(row) +
      "</div>" +
      '<div class="mini-cart-item-price">' +
      (hasCompare
        ? '<s class="mini-cart-item-compare">' + escapeHtml(formatUsd(compareUnit * safeQty)) + "</s>"
        : "") +
      '<span class="mini-cart-item-amount">' + escapeHtml(formatUsd(safeUnit * safeQty)) + "</span>" +
      "</div>" +
      "</li>"
    );
  }

  function renderCartList(items, addedKey) {
    var ordered = orderItemsForDisplay(items, addedKey);
    var totalCount = countCartItems(ordered);
    var collapsed = !state.expanded && ordered.length > VISIBLE_ROW_LIMIT;
    var visible = collapsed ? ordered.slice(0, VISIBLE_ROW_LIMIT) : ordered;
    var hiddenCount = ordered.length - visible.length;

    var rows = visible
      .map(function (row, index) {
        return renderCartRow(row, !!(addedKey && row && row.key === addedKey), index);
      })
      .join("");

    return (
      '<section class="mini-cart-list-section" aria-label="Cart contents">' +
      '<div class="mini-cart-cart-head">' +
      '<h3 class="mini-cart-cart-title">Your Cart</h3>' +
      '<span class="mini-cart-cart-count">' +
      totalCount +
      (totalCount === 1 ? " Item" : " Items") +
      "</span>" +
      "</div>" +
      '<ul class="mini-cart-items">' +
      rows +
      "</ul>" +
      (hiddenCount > 0
        ? '<button type="button" class="mini-cart-more-btn" data-mini-cart-expand>+' +
          hiddenCount +
          " More " +
          (hiddenCount === 1 ? "Item" : "Items") +
          "</button>"
        : "") +
      (ordered.length > 1
        ? '<a class="mini-cart-cart-link" href="/cart/">View Full Cart <span aria-hidden="true">→</span></a>'
        : "") +
      "</section>"
    );
  }

  function renderPricingBreakdown(items) {
    var summary = getPricingSummary();
    if (!summary) {
      // Component missing — fall back to a plain subtotal so nothing breaks.
      var subtotal = (items || []).reduce(function (sum, row) {
        return sum + lineSubtotal(row);
      }, 0);
      return (
        '<div class="mini-cart-subtotal-row">' +
        '<span class="mini-cart-subtotal-label">Subtotal</span>' +
        '<span class="mini-cart-subtotal-value">' +
        escapeHtml(formatUsd(subtotal)) +
        "</span>" +
        "</div>"
      );
    }
    var breakdown = summary.computeCartBreakdown(items);
    var guaranteeNote = "";
    if (breakdown.memberSavings > 0) {
      guaranteeNote = "Best price guaranteed. Your member discount is already applied.";
    } else if (breakdown.totalSavings > 0) {
      guaranteeNote = "Best price guaranteed. No coupon needed.";
    }
    return (
      '<section class="mini-cart-pricing" aria-label="Order value">' +
      summary.renderBreakdownHtml(breakdown, {
        totalLabel: "Total",
        showDelivery: false,
        showShipping: true,
        note: ""
      }) +
      (guaranteeNote
        ? '<p class="mini-cart-guarantee">' +
          '<span class="mini-cart-guarantee-icon" aria-hidden="true">' + ICONS.check + "</span>" +
          escapeHtml(guaranteeNote) +
          "</p>"
        : "") +
      "</section>"
    );
  }

  function renderBody(item, options) {
    var items = getCartItems(options);
    var addedKey = item && item.key ? item.key : "";

    return (
      renderCartList(items, addedKey) +
      renderPricingBreakdown(items) +
      renderDeliveryCard() +
      renderTrustSection() +
      renderSocialProof()
    );
  }

  function renderPaymentMarks() {
    return (
      '<ul class="mini-cart-payments" aria-label="Accepted payment methods">' +
      '<li class="mini-cart-pay mini-cart-pay--apple">' +
      '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.05 12.54c-.03-2.5 2.04-3.7 2.13-3.76-1.16-1.7-2.97-1.93-3.61-1.96-1.54-.16-3 .9-3.78.9-.78 0-1.98-.88-3.26-.86-1.68.03-3.22.98-4.08 2.48-1.74 3.02-.44 7.49 1.25 9.94.83 1.2 1.82 2.55 3.12 2.5 1.25-.05 1.72-.81 3.23-.81 1.5 0 1.93.81 3.25.79 1.35-.03 2.2-1.22 3.02-2.43.95-1.39 1.34-2.74 1.36-2.81-.03-.01-2.61-1-2.63-3.98zM14.56 5.2c.69-.83 1.15-1.99 1.02-3.14-.99.04-2.18.66-2.89 1.49-.63.73-1.19 1.91-1.04 3.04 1.1.09 2.23-.56 2.91-1.39z"/></svg>' +
      " Pay</li>" +
      '<li class="mini-cart-pay mini-cart-pay--google">G Pay</li>' +
      '<li class="mini-cart-pay mini-cart-pay--visa">VISA</li>' +
      '<li class="mini-cart-pay mini-cart-pay--mc" aria-label="Mastercard">' +
      '<svg viewBox="0 0 38 24" aria-hidden="true"><circle cx="15" cy="12" r="8" fill="#EB001B"/><circle cx="23" cy="12" r="8" fill="#F79E1B" fill-opacity="0.9"/></svg>' +
      "</li>" +
      '<li class="mini-cart-pay mini-cart-pay--amex">AMEX</li>' +
      "</ul>"
    );
  }

  function renderFooter(options) {
    var summary = getPricingSummary();
    var valueNote = "";
    if (summary) {
      var breakdown = summary.computeCartBreakdown(getCartItems(options));
      if (breakdown.totalSavings > 0) {
        valueNote =
          '<p class="mini-cart-value-note"><span aria-hidden="true">\u2713</span> You saved ' +
          escapeHtml(formatUsd(breakdown.totalSavings)) +
          " today — best available price applied.</p>";
      }
    }
    return (
      '<div class="mini-cart-actions">' +
      valueNote +
      '<button type="button" class="mini-cart-btn mini-cart-btn--primary" data-mini-cart-checkout>' +
      '<span class="mini-cart-btn-icon" aria-hidden="true">' + ICONS.lock + "</span>" +
      "Checkout Securely</button>" +
      renderPaymentMarks() +
      '<button type="button" class="mini-cart-continue" data-mini-cart-continue>Continue Shopping <span aria-hidden="true">\u2192</span></button>' +
      "</div>"
    );
  }

  function wireFooterActions(drawer, options) {
    var checkoutBtn = drawer.querySelector("[data-mini-cart-checkout]");
    var continueBtn = drawer.querySelector("[data-mini-cart-continue]");

    if (checkoutBtn) {
      checkoutBtn.onclick = function () {
        closeMiniCartDrawer();
        if (options && typeof options.onCheckout === "function") {
          options.onCheckout(checkoutBtn);
        }
      };
    }
    if (continueBtn) {
      continueBtn.onclick = function () {
        closeMiniCartDrawer();
        if (options && typeof options.onContinueShopping === "function") {
          options.onContinueShopping();
        }
      };
    }
  }

  /** Quantity stepper — updates the persisted cart, then re-renders in place. */
  function handleQuantityClick(button) {
    var delta = Number(button.getAttribute("data-mini-cart-qty"));
    if (!Number.isFinite(delta) || !delta) return;
    var rowEl = button.closest("[data-item-key]");
    var key = rowEl ? rowEl.getAttribute("data-item-key") : "";
    var options = state.options;
    if (!key || !options) return;

    var current = getCartItems(options).filter(function (row) {
      return row && row.key === key;
    })[0];
    if (!current) return;
    if (delta < 0 && Number(current.quantity) <= 1) return;

    var cart = window.ZYBAR && window.ZYBAR.Cart;
    var nextItems;
    if (cart && typeof cart.updateCartItemQuantity === "function") {
      nextItems = cart.updateCartItemQuantity(key, delta);
    } else {
      current.quantity = Math.max(1, (Number(current.quantity) || 1) + delta);
      nextItems = getCartItems(options);
    }
    var nextRow = (nextItems || []).filter(function (row) {
      return row && row.key === key;
    })[0];
    if (!nextRow) return;

    options.items = nextItems;
    if (options.item && options.item.key === key) options.item = nextRow;
    renderDrawer(options.item, options, false);
  }

  function wireBodyActions(drawer) {
    var body = drawer.querySelector("[data-mini-cart-body]");
    if (!body || body.getAttribute("data-qty-wired")) return;
    body.setAttribute("data-qty-wired", "1");
    body.addEventListener("click", function (event) {
      var qtyBtn = event.target && event.target.closest("[data-mini-cart-qty]");
      if (qtyBtn) {
        handleQuantityClick(qtyBtn);
        return;
      }
      var expandBtn = event.target && event.target.closest("[data-mini-cart-expand]");
      if (expandBtn && state.options) {
        state.expanded = true;
        renderDrawer(state.options.item, state.options, false);
      }
    });
  }

  function renderDrawer(item, options, shouldAnimate) {
    var drawer = ensureDrawerDom();
    var body = drawer.querySelector("[data-mini-cart-body]");
    var footer = drawer.querySelector("[data-mini-cart-footer]");
    var scroll = drawer.querySelector(".mini-cart-scroll");
    if (!body || !footer || !scroll) return;

    var confirm = drawer.querySelector("[data-mini-cart-confirm]");
    if (confirm) {
      var name = item && item.name ? String(item.name) : "";
      confirm.innerHTML = name
        ? "<strong>" + escapeHtml(name) + "</strong> has been added to your cart."
        : "Added to your cart";
    }

    body.innerHTML = renderBody(item, options);
    footer.innerHTML = renderFooter(options);
    wireFooterActions(drawer, options);
    wireBodyActions(drawer);

    scroll.classList.remove("is-animated");
    if (shouldAnimate) {
      void scroll.offsetWidth;
      scroll.classList.add("is-animated");
    }
  }

  function whenPricingReady() {
    var pricing = getPricing();
    if (pricing && typeof pricing.load === "function") {
      return pricing.load().catch(function () {});
    }
    return Promise.resolve();
  }

  function openMiniCartDrawer(options) {
    if (!options || !options.item) return;

    var run = function () {
      state.options = options;
      var drawer = ensureDrawerDom();
      var wasOpen = state.isOpen;
      if (!wasOpen) state.expanded = false;

      renderDrawer(options.item, options, !wasOpen);

      if (!wasOpen) {
        drawer.hidden = false;
        requestAnimationFrame(function () {
          drawer.classList.add("is-open");
        });
        state.isOpen = true;
        state.lastFocus = document.activeElement;
        lockScroll();
        var closeBtn = drawer.querySelector(".mini-cart-close");
        if (closeBtn) closeBtn.focus();
      }
    };

    Promise.all([loadCatalog(), whenPricingReady()]).then(run);
  }

  function updateMiniCartDrawer(options) {
    if (!state.isOpen) {
      openMiniCartDrawer(options);
      return;
    }
    if (!options || !options.item) return;
    state.options = options;
    Promise.all([loadCatalog(), whenPricingReady()]).then(function () {
      renderDrawer(options.item, options, false);
    });
  }

  function closeMiniCartDrawer() {
    var drawer = getDrawer();
    if (!drawer || !state.isOpen) return;

    drawer.classList.remove("is-open");
    state.isOpen = false;
    unlockScroll();

    window.setTimeout(function () {
      if (!state.isOpen) drawer.hidden = true;
    }, 320);

    if (state.lastFocus && typeof state.lastFocus.focus === "function") {
      state.lastFocus.focus();
    }
    state.lastFocus = null;
  }

  window.ZYBAR = window.ZYBAR || {};
  window.ZYBAR.MiniCartDrawer = {
    open: openMiniCartDrawer,
    update: updateMiniCartDrawer,
    close: closeMiniCartDrawer,
    isOpen: function () {
      return state.isOpen;
    }
  };
})();
