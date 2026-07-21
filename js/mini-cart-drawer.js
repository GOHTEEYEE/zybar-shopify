/**
 * Premium slide-in mini cart drawer (vanilla JS).
 */
(function () {
  "use strict";

  var DRAWER_ID = "zybar-mini-cart";
  var catalogCache = null;
  var catalogPromise = null;
  var state = {
    isOpen: false,
    lastFocus: null,
    options: null
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

  function getLedColorForSlug(slug) {
    if (!catalogCache || !slug) return "";
    var product = catalogCache[slug];
    return product && product.ledColor ? String(product.ledColor) : "";
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
      '<h2 class="mini-cart-title" id="mini-cart-title">Added to Your Cart</h2>' +
      '<p class="mini-cart-subtitle">Reserved for you — checkout takes less than a minute.</p>' +
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

  function buildSpecRow(label, value, index) {
    if (!value && value !== 0) return "";
    return (
      '<div class="mini-cart-spec-row" style="--spec-index:' +
      index +
      '">' +
      '<span class="mini-cart-spec-label">' +
      escapeHtml(label) +
      "</span>" +
      '<span class="mini-cart-spec-value">' +
      escapeHtml(value) +
      "</span>" +
      "</div>"
    );
  }

  function renderTrustSection() {
    return (
      '<ul class="mini-cart-trust" aria-label="Purchase assurances">' +
      '<li><span class="mini-cart-trust-icon" aria-hidden="true">✓</span> Handmade in Japan <span aria-hidden="true">🇯🇵</span></li>' +
      '<li><span class="mini-cart-trust-icon" aria-hidden="true">✓</span> Secure Checkout</li>' +
      '<li><span class="mini-cart-trust-icon" aria-hidden="true">✓</span> Ships Worldwide</li>' +
      '<li><span class="mini-cart-trust-icon" aria-hidden="true">✓</span> 30-Day Satisfaction Guarantee</li>' +
      "</ul>"
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

  /** Compare-at unit price for the just-added line (0 when none). */
  function lineCompareAtUnit(item) {
    var pricing = getPricing();
    if (!pricing || typeof pricing.calculateProductCompareAtPrice !== "function") return 0;
    var slug = (item && (item.slug || item.productSlug)) || "";
    return pricing.calculateProductCompareAtPrice({
      slug: slug,
      productSlug: slug,
      size: item && item.size,
      powerType: item && item.powerType
    });
  }

  function renderLinePriceRow(item) {
    var qty = Number(item && item.quantity);
    var safeQty = Number.isFinite(qty) && qty > 0 ? qty : 1;
    var unit = Number(item && item.unitPriceUSD);
    var safeUnit = Number.isFinite(unit) && unit >= 0 ? unit : 0;
    var compareUnit = lineCompareAtUnit(item);
    var hasCompare = compareUnit > safeUnit && safeUnit > 0;

    return (
      '<div class="mini-cart-subtotal-row">' +
      '<span class="mini-cart-subtotal-label">' +
      (safeQty > 1 ? "Subtotal" : "Price") +
      "</span>" +
      '<span class="mini-cart-subtotal-value">' +
      (hasCompare
        ? '<s class="mini-cart-line-compare">' + escapeHtml(formatUsd(compareUnit * safeQty)) + "</s> "
        : "") +
      escapeHtml(formatUsd(safeUnit * safeQty)) +
      "</span>" +
      "</div>"
    );
  }

  function renderCartMetaLink(items, item) {
    var totalCount = (items || []).reduce(function (sum, row) {
      var qty = Number(row && row.quantity);
      return sum + (Number.isFinite(qty) && qty > 0 ? qty : 0);
    }, 0);
    var addedQty = Number(item && item.quantity);
    if (!Number.isFinite(addedQty) || addedQty < 1) addedQty = 1;
    if (totalCount <= addedQty) return "";
    return (
      '<a class="mini-cart-cart-link" href="/cart/">' +
      "Your cart · " + totalCount + " items" +
      '<span aria-hidden="true"> →</span>' +
      "</a>"
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
    var memberNote = "";
    if (breakdown.memberSavings > 0) {
      memberNote =
        '<p class="mini-cart-member-note">' +
        '<span aria-hidden="true">✓</span> Your Welcome Discount has already been applied.' +
        "</p>";
    }
    return (
      '<section class="mini-cart-pricing" aria-label="Order value">' +
      summary.renderBreakdownHtml(breakdown, { totalLabel: "Total" }) +
      memberNote +
      "</section>"
    );
  }

  function renderBody(item, options) {
    var slug = item && item.slug ? item.slug : "";
    var size = formatSizeLabel(item);
    var power =
      (item && item.powerTypeLabel) ||
      (item && item.powerType ? String(item.powerType) : "") ||
      "—";
    var qty = Number(item && item.quantity);
    var safeQty = Number.isFinite(qty) && qty > 0 ? qty : 1;
    var imageUrl = item && item.imageUrl ? item.imageUrl : slug ? "/Image/" + slug + "-1.webp" : "";
    var name = (item && item.name) || "Product";
    var items = getCartItems(options);

    return (
      '<article class="mini-cart-product">' +
      '<div class="mini-cart-thumb-wrap">' +
      '<img class="mini-cart-thumb" src="' +
      escapeHtml(imageUrl) +
      '" alt="" width="120" height="120" loading="lazy" onerror="if(window.ZYBAR&amp;&amp;ZYBAR.Cart&amp;&amp;ZYBAR.Cart.onProductThumbError)ZYBAR.Cart.onProductThumbError(this)" />' +
      "</div>" +
      '<div class="mini-cart-product-info">' +
      '<h3 class="mini-cart-product-name">' +
      escapeHtml(name) +
      "</h3>" +
      '<div class="mini-cart-spec">' +
      buildSpecRow("Size", size, 0) +
      buildSpecRow("Power", power, 1) +
      buildSpecRow("Quantity", String(safeQty), 2) +
      "</div>" +
      renderLinePriceRow(item) +
      "</div>" +
      "</article>" +
      renderCartMetaLink(items, item) +
      renderPricingBreakdown(items) +
      renderTrustSection()
    );
  }

  function renderFooter(options) {
    var summary = getPricingSummary();
    var valueNote = "";
    if (summary) {
      var breakdown = summary.computeCartBreakdown(getCartItems(options));
      if (breakdown.memberSavings > 0) {
        valueNote =
          '<p class="mini-cart-value-note">You save ' +
          escapeHtml(formatUsd(breakdown.totalSavings)) +
          " today — your discount is already applied.</p>";
      } else if (breakdown.totalSavings > 0) {
        valueNote =
          '<p class="mini-cart-value-note">You save ' +
          escapeHtml(formatUsd(breakdown.totalSavings)) +
          " today.</p>";
      }
    }
    return (
      '<div class="mini-cart-actions">' +
      valueNote +
      '<button type="button" class="mini-cart-btn mini-cart-btn--primary" data-mini-cart-checkout>Checkout Securely</button>' +
      '<button type="button" class="mini-cart-continue" data-mini-cart-continue>Continue Shopping</button>' +
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

  function renderDrawer(item, options, shouldAnimate) {
    var drawer = ensureDrawerDom();
    var body = drawer.querySelector("[data-mini-cart-body]");
    var footer = drawer.querySelector("[data-mini-cart-footer]");
    var scroll = drawer.querySelector(".mini-cart-scroll");
    if (!body || !footer || !scroll) return;

    body.innerHTML = renderBody(item, options);
    footer.innerHTML = renderFooter(options);
    wireFooterActions(drawer, options);

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
