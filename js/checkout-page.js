/**
 * Shopify Checkout structure — CARLIGHT CLUB custom layout + Stripe payment.
 */
(function () {
  "use strict";

  var PENDING_KEY = "zybar.checkout.pending";
  var CART_KEY = "zybar.cart.items";
  var ANIM_MS = 200;
  var DEVTEST_CODE = "DEVTEST99";
  var DEVTEST_PERCENT = 99;
  var shippingRefreshTimer = null;
  var emailDiscountTimer = null;

  var state = {
    subtotal: 0,
    shipping: 0,
    tax: 0,
    discount: 0,
    discountCode: "",
    discountPercent: 0,
    total: 0,
    displayItems: [],
    clientSecret: "",
    stripeCheckout: null,
    embeddedCheckout: null,
    paymentMode: "custom",
    returnUrl: "",
    pending: null,
    mountToken: 0,
    /** Cached Stripe session results by shipping method for instant swaps. */
    sessionByShipping: {},
    sessionFetchByShipping: {},
    /** True when the active Stripe session was created with customer_email set. */
    sessionCustomerEmailSet: false,
    /** Hidden internal test code from ?code=DEVTEST99 (not shown as a promo field). */
    requestedDevtestCode: "",
    customerEmail: ""
  };

  function getConfig() {
    return window.ZYBAR_STRIPE_CONFIG || {};
  }

  function getPricing() {
    return window.ZYBAR && window.ZYBAR.Pricing ? window.ZYBAR.Pricing : null;
  }

  function getPricingSummary() {
    return window.ZYBAR && window.ZYBAR.PricingSummary ? window.ZYBAR.PricingSummary : null;
  }

  function isWelcomeCode(code) {
    var summary = getPricingSummary();
    if (!summary || !code) return false;
    return String(code).toLowerCase() === String(summary.WELCOME_CODE).toLowerCase();
  }

  function isDevtestCode(code) {
    return String(code || "").trim().toUpperCase() === DEVTEST_CODE;
  }

  function readRequestedDevtestCode() {
    try {
      var params = new URLSearchParams(window.location.search || "");
      var fromQuery = String(params.get("code") || params.get("discount") || "").trim();
      if (isDevtestCode(fromQuery)) return DEVTEST_CODE;
      var stored = String(window.sessionStorage.getItem("zybar.devtest.code") || "").trim();
      if (isDevtestCode(stored)) return DEVTEST_CODE;
    } catch (_) {}
    return "";
  }

  function persistRequestedDevtestCode(code) {
    if (!isDevtestCode(code)) return;
    try {
      window.sessionStorage.setItem("zybar.devtest.code", DEVTEST_CODE);
    } catch (_) {}
  }

  function applyDiscountFromSessionResult(result) {
    var payload = result && result.data && result.data.appliedDiscount;
    if (payload && payload.code) {
      state.discountCode = String(payload.code);
      state.discountPercent = Number(payload.percentOff) || 0;
      state.discount =
        typeof payload.amountUSD === "number"
          ? payload.amountUSD
          : Number(payload.amountUSD) || 0;
      if (state.pending) {
        state.pending.discountCode = state.discountCode;
      }
      return;
    }
    if (state.requestedDevtestCode) {
      // Server silently ignored an unauthorized / incomplete DEVTEST attempt.
      if (isDevtestCode(state.discountCode)) {
        state.discountCode = "";
        state.discountPercent = 0;
        state.discount = 0;
        if (state.pending) delete state.pending.discountCode;
      }
    }
  }

  function applySessionFlagsFromResult(result) {
    var data = result && result.data;
    state.sessionCustomerEmailSet = !!(data && data.customerEmailSet);
  }

  function sessionHasServerCustomerEmail() {
    return !!state.sessionCustomerEmailSet;
  }

  function computeDevtestDiscountUSD(subtotal, shipping, tax) {
    var base =
      (Number(subtotal) || 0) + (Number(shipping) || 0) + (Number(tax) || 0);
    return Math.round(base * (DEVTEST_PERCENT / 100) * 100) / 100;
  }

  function formatUsd(amount) {
    var pricing = getPricing();
    if (pricing) return pricing.formatUsd(amount);
    var n = Number(amount);
    if (!Number.isFinite(n)) return "$0.00";
    return "$" + n.toFixed(2);
  }

  /** Luxury total display: US$184 or US$184.50 */
  function formatUsdLuxury(amount) {
    var n = Number(amount);
    if (!Number.isFinite(n)) return "US$0";
    var rounded = Math.round(n * 100) / 100;
    if (rounded % 1 === 0) return "US$" + String(Math.round(rounded));
    return "US$" + rounded.toFixed(2);
  }

  function formatDeliveryRange(shippingMethod) {
    var method = String(shippingMethod || "priority").toLowerCase();
    var isPriority =
      method.indexOf("express") !== -1 || method.indexOf("priority") !== -1;
    var summary = getPricingSummary();
    var label = "7–10 Business Days";
    if (summary && typeof summary.estimateDeliveryRange === "function") {
      label = summary.estimateDeliveryRange(method).label;
    }
    return {
      isPriority: isPriority,
      windowLabel: label
    };
  }

  function renderDeliveryEstimate() {
    var el = document.getElementById("checkout-delivery-estimate");
    if (!el) return;
    var info = formatDeliveryRange(getSelectedShippingMethod());
    var meta = info.isPriority
      ? "Priority Processing<br>Tracked Shipping Included<br>Worldwide Shipping"
      : "Tracked Shipping Included<br>Worldwide Shipping";
    el.innerHTML =
      '<p class="checkout-delivery-label">Estimated Delivery</p>' +
      '<p class="checkout-delivery-dates">' +
      escapeHtml(info.windowLabel) +
      "</p>" +
      '<p class="checkout-delivery-meta">' +
      meta +
      "</p>";
  }

  function formatShippingUsd(amount) {
    var pricing = getPricing();
    if (pricing && typeof pricing.formatShippingUsd === "function") {
      return pricing.formatShippingUsd(amount);
    }
    var n = Number(amount);
    if (!Number.isFinite(n)) return "$0";
    if (n % 1 === 0) return "$" + String(Math.round(n));
    return formatUsd(n);
  }

  function getSelectedShippingMethod() {
    var checked = document.querySelector('input[name="shippingMethod"]:checked');
    if (checked && checked.value) return checked.value;
    var pricing = getPricing();
    return pricing ? pricing.readShippingMethod() : "standard";
  }

  function setShippingRadio(method) {
    var pricing = getPricing();
    var normalized = pricing ? pricing.normalizeShippingMethod(method) : method || "standard";
    document.querySelectorAll('input[name="shippingMethod"]').forEach(function (radio) {
      radio.checked = radio.value === normalized;
    });
    syncShippingCardStates();
    updateShippingPriceLabels();
  }

  function syncShippingCardStates() {
    document.querySelectorAll(".checkout-shipping-option").forEach(function (card) {
      var radio = card.querySelector('input[name="shippingMethod"]');
      var selected = !!(radio && radio.checked);
      card.classList.toggle("is-selected", selected);
      card.setAttribute("tabindex", selected ? "0" : "-1");
    });
  }

  function persistShippingSelection(method) {
    var pricing = getPricing();
    var normalized = pricing ? pricing.normalizeShippingMethod(method) : method || "standard";
    if (pricing) pricing.writeShippingMethod(normalized);
    var cartApi = window.ZYBAR && window.ZYBAR.Cart;
    if (cartApi && typeof cartApi.writeShippingMethod === "function") {
      cartApi.writeShippingMethod(normalized);
    }
    if (state.pending) {
      state.pending.shippingMethod = normalized;
      try {
        window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(state.pending));
      } catch (_) {}
    }
  }

  function parseMoney(text) {
    var n = parseFloat(String(text || "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  function moneyEase(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function animateMoney(el, from, to, duration) {
    if (!el) return;
    var isGrand =
      el.getAttribute("data-total") === "grand" || el.id === "checkout-mobile-total";
    var format = isGrand ? formatUsdLuxury : formatUsd;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.textContent = format(to);
      el.setAttribute("data-value", String(to));
      return;
    }
    el.classList.add("is-updating");
    var start = performance.now();
    function frame(now) {
      var t = Math.min(1, (now - start) / (duration || ANIM_MS));
      var val = from + (to - from) * moneyEase(t);
      el.textContent = format(val);
      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        el.textContent = format(to);
        el.setAttribute("data-value", String(to));
        el.classList.remove("is-updating");
      }
    }
    requestAnimationFrame(frame);
  }

  function animateMoneyEl(el, to) {
    if (!el) return;
    var from = parseFloat(el.getAttribute("data-value") || "0");
    if (!Number.isFinite(from)) from = parseMoney(el.textContent);
    animateMoney(el, from, to, ANIM_MS);
  }

  function animateCheckoutTotals() {
    document.querySelectorAll('[data-total="shipping"]').forEach(function (el) {
      animateMoneyEl(el, state.shipping);
    });
    document.querySelectorAll('[data-total="grand"]').forEach(function (el) {
      animateMoneyEl(el, state.total);
    });
    var mobileTotal = document.getElementById("checkout-mobile-total");
    if (mobileTotal) animateMoneyEl(mobileTotal, state.total);
  }

  function updateShippingPriceLabels() {
    var pricing = getPricing();
    if (!pricing) return;
    document.querySelectorAll("[data-shipping-price]").forEach(function (el) {
      var option = el.closest(".checkout-shipping-option");
      var radio = option ? option.querySelector('input[name="shippingMethod"]') : null;
      if (!radio) return;
      var cost = pricing.getShippingCostUSD(radio.value);
      el.textContent = formatUsdLuxury(cost);
    });
  }

  function shippingIconSvg(code) {
    if (String(code).indexOf("priority") !== -1 || String(code).indexOf("express") !== -1) {
      return (
        '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
        '<path d="M13 2L4 14h7l-1 8 10-14h-7l1-6z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>' +
        "</svg>"
      );
    }
    return (
      '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<path d="M3 7h11v10H3V7zm11 3h4l3 3v4h-7V10z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>' +
      '<circle cx="7" cy="18" r="1.6" stroke="currentColor" stroke-width="1.5"/>' +
      '<circle cx="17" cy="18" r="1.6" stroke="currentColor" stroke-width="1.5"/>' +
      "</svg>"
    );
  }

  function shippingPerksHtml(code) {
    var isPriority =
      String(code).indexOf("priority") !== -1 || String(code).indexOf("express") !== -1;
    if (isPriority) {
      return (
        '<ul class="checkout-shipping-perks">' +
        "<li>Tracked Shipping</li>" +
        "<li>Priority Processing</li>" +
        "<li>Worldwide Shipping</li>" +
        "</ul>"
      );
    }
    return (
      '<ul class="checkout-shipping-perks">' +
      "<li>Tracked Shipping</li>" +
      "<li>Worldwide Shipping</li>" +
      "</ul>"
    );
  }

  function renderShippingOptionsFromCatalog() {
    var container = document.getElementById("checkout-shipping-options");
    if (!container) return;
    var pricing = getPricing();
    if (!pricing || typeof pricing.getShippingMethods !== "function") return;

    var methods = pricing.getShippingMethods();
    if (!methods.length) {
      container.innerHTML = '<p class="checkout-shipping-empty">Loading delivery options…</p>';
      return;
    }

    // CRO: Priority is the default delivery experience (+$5, higher AOV).
    var preferred = "priority";
    var hasPreferred = methods.some(function (m) {
      return m && m.code === preferred;
    });
    var selectedCode = hasPreferred ? preferred : methods[0] && methods[0].code;

    // Keep an in-session choice if the customer already switched on this page.
    if (
      state.pending &&
      state.pending._shippingChosen &&
      state.pending.shippingMethod &&
      methods.some(function (m) {
        return m && m.code === state.pending.shippingMethod;
      })
    ) {
      selectedCode = state.pending.shippingMethod;
    }

    container.innerHTML = methods
      .map(function (method) {
        if (!method || !method.code) return "";
        var code = method.code;
        var selected = code === selectedCode;
        var price = pricing.getShippingCostUSD(code);
        var isPriority =
          code.indexOf("priority") !== -1 || code.indexOf("express") !== -1;
        var days =
          method.description ||
          (isPriority ? "7–14 Business Days" : "14–18 Business Days");
        days = String(days)
          .replace(/^Estimated delivery:\s*/i, "")
          .trim();
        var badge = isPriority
          ? '<span class="checkout-shipping-badge">Most Popular</span>'
          : "";

        return (
          '<label class="checkout-shipping-option' +
          (selected ? " is-selected" : "") +
          '" data-shipping-option="' +
          escapeHtml(code) +
          '" tabindex="' +
          (selected ? "0" : "-1") +
          '">' +
          badge +
          '<input type="radio" name="shippingMethod" value="' +
          escapeHtml(code) +
          '" class="checkout-shipping-input"' +
          (selected ? " checked" : "") +
          " />" +
          '<span class="checkout-shipping-icon">' +
          shippingIconSvg(code) +
          "</span>" +
          '<span class="checkout-shipping-option-body">' +
          '<span class="checkout-shipping-option-name">' +
          escapeHtml(method.label || code) +
          "</span>" +
          '<span class="checkout-shipping-option-meta">' +
          escapeHtml(days) +
          "</span>" +
          shippingPerksHtml(code) +
          "</span>" +
          '<span class="checkout-shipping-option-price" data-shipping-price="' +
          escapeHtml(code) +
          '">' +
          formatUsdLuxury(price) +
          "</span>" +
          "</label>"
        );
      })
      .join("");

    if (selectedCode) {
      persistShippingSelection(selectedCode);
      if (state.pending) state.pending.shippingMethod = selectedCode;
    }
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function readPendingCheckout() {
    try {
      var raw = window.sessionStorage.getItem(PENDING_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.lineItems) || !parsed.lineItems.length) return null;
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function clearPendingCheckout() {
    try {
      window.sessionStorage.removeItem(PENDING_KEY);
    } catch (_) {}
  }

  function getCartCount() {
    try {
      var raw = window.localStorage.getItem(CART_KEY);
      if (!raw) return 0;
      var items = JSON.parse(raw);
      if (!Array.isArray(items)) return 0;
      return items.reduce(function (sum, item) {
        var q = Number(item && item.quantity);
        return sum + (Number.isFinite(q) && q > 0 ? q : 0);
      }, 0);
    } catch (_) {
      return 0;
    }
  }

  function splitProductTitle(name) {
    var raw = String(name || "").trim();
    if (!raw) return { title: "Product", subtitle: "LED Wall Art" };
    var parts = raw.split(/\s*[-–—]\s*/);
    if (parts.length >= 2) {
      return { title: parts[0].trim(), subtitle: parts.slice(1).join(" – ") };
    }
    return { title: raw, subtitle: "LED Wall Art" };
  }

  /**
   * Thumb fallback: .webp -> .jpg -> -on.webp. Lives here because the
   * checkout page does not load stripe-checkout.js (no ZYBAR.Cart).
   */
  function checkoutThumbError(img) {
    if (!img) return;
    var step = Number(img.getAttribute("data-fallback-step") || "0");
    var src = String(img.getAttribute("src") || "");
    var next = "";
    if (step === 0 && /\.webp$/i.test(src)) {
      next = src.replace(/\.webp$/i, ".jpg");
    } else if (step <= 1) {
      next = src.replace(/-(\d+)(?:-on)?\.(webp|jpe?g|png)$/i, "-$1-on.webp");
      if (next === src) next = "";
    }
    img.setAttribute("data-fallback-step", String(step + 1));
    if (next && next !== src) {
      img.src = next;
      return;
    }
    img.onerror = null;
  }
  window.ZYBAR = window.ZYBAR || {};
  window.ZYBAR.CheckoutThumbError = checkoutThumbError;

  function buildLineItemHtml(item) {
    var qty = Number(item.quantity);
    var safeQty = Number.isFinite(qty) && qty > 0 ? qty : 1;
    var unit = Number(item.unitPriceUSD);
    var safeUnit = Number.isFinite(unit) && unit >= 0 ? unit : 0;
    var lineTotal = safeQty * safeUnit;
    var imageUrl = item.imageUrl || (item.slug ? "/Image/" + item.slug + "-1.webp" : "");
    var titles = splitProductTitle(item.name);
    var sizePart = item.sizeLabel || item.size || "";
    var powerPart = item.powerTypeLabel || "";
    var metaLines = [];
    if (sizePart) metaLines.push(escapeHtml(sizePart));
    if (powerPart) metaLines.push(escapeHtml(powerPart));
    if (!metaLines.length && titles.subtitle) metaLines.push(escapeHtml(titles.subtitle));

    var customHtml = "";
    if (item.productType === "custom" || (item.customConfig && typeof item.customConfig === "object")) {
      var cfg = item.customConfig || {};
      var vehicle = [cfg.vehicleBrand, cfg.vehicleModel, cfg.vehicleYear].filter(Boolean).join(" ");
      if (vehicle) metaLines.push("Vehicle: " + escapeHtml(vehicle));
      if (cfg.specialRequests) metaLines.push("Lighting: " + escapeHtml(cfg.specialRequests));
      var fee = Number(item.customDesignFeeUSD);
      if (Number.isFinite(fee) && fee > 0) {
        metaLines.push("Custom Design Fee: +" + formatUsdLuxury(fee));
      }
      var photos = Array.isArray(cfg.photos) ? cfg.photos : [];
      if (photos.length) {
        customHtml =
          '<div class="checkout-line-custom-photos">' +
          photos
            .slice(0, 4)
            .map(function (photo) {
              var src = photo && (photo.url || photo.preview);
              if (!src) return "";
              return '<img src="' + escapeHtml(src) + '" alt="" width="40" height="40" loading="lazy" />';
            })
            .join("") +
          (photos.length > 4 ? '<span class="checkout-line-custom-more">+' + (photos.length - 4) + "</span>" : "") +
          "</div>";
      }
    }

    return [
      '<article class="checkout-line-item">',
      '<div class="checkout-line-thumb-wrap">',
      '<img class="checkout-line-thumb" src="' +
        escapeHtml(imageUrl) +
        '" alt="" width="72" height="72" loading="eager" onerror="if(window.ZYBAR&amp;&amp;ZYBAR.CheckoutThumbError)ZYBAR.CheckoutThumbError(this)" />',
      '<span class="checkout-line-qty" aria-label="Quantity">' + safeQty + "</span>",
      "</div>",
      '<div class="checkout-line-details">',
      '<p class="checkout-line-name">' + escapeHtml(titles.title) + "</p>",
      '<p class="checkout-line-variant">' +
      metaLines.join("<br>") +
      (safeQty > 1 ? "<br>Qty " + safeQty : "<br>Qty 1") +
      "</p>" +
      customHtml +
      "</div>",
      '<p class="checkout-line-price">' + formatUsdLuxury(lineTotal) + "</p>",
      "</article>"
    ].join("");
  }

  function calcTotals(displayItems) {
    var pricing = getPricing();
    var shippingMethod = getSelectedShippingMethod();
    if (pricing) {
      var provisional = pricing.calculateOrderTotals({
        items: displayItems || [],
        shippingMethod: shippingMethod,
        taxUSD: state.tax,
        discountUSD: 0
      });
      var discountUSD = state.discount;
      if (isDevtestCode(state.discountCode) || state.discountPercent === DEVTEST_PERCENT) {
        discountUSD = computeDevtestDiscountUSD(
          provisional.subtotal,
          provisional.shipping,
          provisional.tax
        );
      }
      var order = pricing.calculateOrderTotals({
        items: displayItems || [],
        shippingMethod: shippingMethod,
        taxUSD: state.tax,
        discountUSD: discountUSD
      });
      state.subtotal = order.subtotal;
      state.shipping = order.shipping;
      state.tax = order.tax;
      state.discount = order.discount;
      state.total = order.total;
      return state;
    }

    var subtotal = 0;
    (displayItems || []).forEach(function (item) {
      var qty = Number(item.quantity);
      var safeQty = Number.isFinite(qty) && qty > 0 ? qty : 1;
      var unit = Number(item.unitPriceUSD);
      var safeUnit = Number.isFinite(unit) && unit >= 0 ? unit : 0;
      subtotal += safeQty * safeUnit;
    });
    state.subtotal = subtotal;
    state.shipping = 0;
    state.tax = 0;
    if (isDevtestCode(state.discountCode)) {
      state.discount = computeDevtestDiscountUSD(state.subtotal, state.shipping, state.tax);
    }
    state.total = Math.max(0, subtotal + state.shipping + state.tax - state.discount);
    return state;
  }

  function calcLaunchSavings() {
    var summary = getPricingSummary();
    if (!summary) return 0;
    var breakdown = summary.computeCartBreakdown(state.displayItems);
    return breakdown.launchSavings || 0;
  }

  function renderTotalsHtml() {
    var taxRow =
      state.tax > 0
        ? '<div class="checkout-total-row"><span>Taxes</span><span>' +
          formatUsdLuxury(state.tax) +
          "</span></div>"
        : "";

    var member = window.ZYBAR && window.ZYBAR.MemberPricing;
    var discountLabel = isDevtestCode(state.discountCode)
      ? "Internal Test Discount"
      : (member && member.isActive()) || isWelcomeCode(state.discountCode)
        ? "Member Savings"
        : "Savings";
    var totalSavings = Math.round((calcLaunchSavings() + state.discount) * 100) / 100;

    return [
      '<div class="checkout-total-row"><span>Subtotal</span><span class="checkout-money" data-total="subtotal" data-value="' +
        state.subtotal +
        '">' +
        formatUsdLuxury(state.subtotal) +
        "</span></div>",
      '<div class="checkout-total-row"><span>Shipping</span><span class="checkout-money" data-total="shipping" data-value="' +
        state.shipping +
        '">' +
        formatUsdLuxury(state.shipping) +
        "</span></div>",
      taxRow,
      state.discount > 0
        ? '<div class="checkout-total-row checkout-total-row--discount"><span>' +
          escapeHtml(discountLabel) +
          "</span><span>\u2212" +
          formatUsdLuxury(state.discount) +
          "</span></div>"
        : "",
      totalSavings > 0
        ? '<div class="checkout-total-row checkout-total-row--savings"><span>You Saved Today</span><span>' +
          formatUsdLuxury(totalSavings) +
          "</span></div>"
        : "",
      '<div class="checkout-total-row checkout-total-row--grand"><span>TOTAL</span><span class="checkout-money" data-total="grand" data-value="' +
        state.total +
        '">' +
        formatUsdLuxury(state.total) +
        "</span></div>",
      '<p class="checkout-tax-note">Tax Included</p>'
    ].join("");
  }

  function updateOrderTotalsAnimated() {
    calcTotals(state.displayItems);
    animateCheckoutTotals();
  }

  function renderOrderSummary(displayItems) {
    state.displayItems = Array.isArray(displayItems) ? displayItems : [];
    calcTotals(state.displayItems);

    var html = state.displayItems.map(buildLineItemHtml).join("");
    var totalsHtml = renderTotalsHtml();

    var list = document.getElementById("checkout-product-list");
    var totals = document.getElementById("checkout-order-totals");
    var mobileList = document.getElementById("checkout-mobile-product-list");
    var mobileTotals = document.getElementById("checkout-mobile-totals");
    var mobileTotal = document.getElementById("checkout-mobile-total");

    if (list) list.innerHTML = html;
    if (totals) totals.innerHTML = totalsHtml;
    if (mobileList) mobileList.innerHTML = html;
    if (mobileTotals) mobileTotals.innerHTML = totalsHtml;
    if (mobileTotal) {
      mobileTotal.setAttribute("data-value", String(state.total));
      mobileTotal.textContent = formatUsdLuxury(state.total);
    }
    renderDeliveryEstimate();

    var cartCount = document.getElementById("checkout-cart-count");
    if (cartCount) {
      var count = getCartCount() || state.displayItems.reduce(function (s, i) {
        return s + (Number(i.quantity) || 1);
      }, 0);
      if (count > 0) {
        cartCount.textContent = String(count > 99 ? "99+" : count);
        cartCount.hidden = false;
      }
    }
  }

  function showError(message) {
    var errorEl = document.getElementById("checkout-error");
    var loading = document.getElementById("checkout-loading");
    if (loading) loading.classList.add("is-hidden");
    if (errorEl) {
      errorEl.hidden = false;
      errorEl.textContent = message;
    }
    var payBtn = document.getElementById("checkout-pay-btn");
    if (payBtn && state.paymentMode === "custom") {
      payBtn.disabled = false;
      payBtn.hidden = false;
      payBtn.textContent = "Complete Secure Order";
    }
  }

  function clearError() {
    var errorEl = document.getElementById("checkout-error");
    if (errorEl) {
      errorEl.hidden = true;
      errorEl.textContent = "";
    }
  }

  function hideLoading() {
    var loading = document.getElementById("checkout-loading");
    if (loading) loading.classList.add("is-hidden");
    var payBtn = document.getElementById("checkout-pay-btn");
    if (payBtn && state.paymentMode === "custom") {
      payBtn.disabled = false;
      payBtn.hidden = false;
    }
  }

  function getAppearance() {
    return {
      theme: "night",
      variables: {
        colorPrimary: "#D4AF37",
        colorBackground: "#111111",
        colorText: "#FFFFFF",
        colorDanger: "#D4AF37",
        fontFamily: "Outfit, system-ui, sans-serif",
        borderRadius: "12px",
        spacingUnit: "4px"
      },
      rules: {
        ".Input": {
          backgroundColor: "#111111",
          border: "1px solid rgba(255,255,255,0.12)"
        },
        ".Tab": {
          backgroundColor: "#111111",
          border: "1px solid rgba(255,255,255,0.12)"
        },
        ".Tab--selected": {
          borderColor: "#D4AF37",
          color: "#FFFFFF"
        }
      }
    };
  }

  function createCheckoutSession(pending, modeOptions) {
    var config = getConfig();
    var pricing = getPricing();
    var apiBase = config.apiBaseUrl || window.location.origin;
    var origin = window.location.origin;
    var shippingMethod =
      pending.shippingMethod ||
      getSelectedShippingMethod() ||
      (pricing ? pricing.readShippingMethod() : "standard");
    var successUrl =
      pending.successUrl ||
      config.successUrl ||
      origin + "/purchase-confirmation.html?session_id={CHECKOUT_SESSION_ID}";
    var returnUrl =
      successUrl.indexOf("{CHECKOUT_SESSION_ID}") !== -1
        ? successUrl
        : successUrl + (successUrl.indexOf("?") === -1 ? "?" : "&") + "session_id={CHECKOUT_SESSION_ID}";
    var modes = modeOptions || {};
    var wantCustom = modes.custom !== false;
    var wantEmbedded = modes.embedded !== false;

    return fetch(apiBase + "/api/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embedded: wantEmbedded,
        custom: wantCustom,
        lineItems: pending.lineItems,
        shippingMethod: shippingMethod,
        discountCode: pending.discountCode || state.discountCode || null,
        customerEmail:
          pending.customerEmail ||
          state.customerEmail ||
          ((document.getElementById("checkout-email") || {}).value || "").trim() ||
          null,
        memberCredential:
          pending.memberCredential ||
          (window.ZYBAR &&
          window.ZYBAR.MemberPricing &&
          window.ZYBAR.MemberPricing.getCredential
            ? window.ZYBAR.MemberPricing.getCredential()
            : null),
        priceId: pending.priceId,
        quantity: pending.quantity,
        productSlug: pending.productSlug,
        size: pending.size,
        powerType: pending.powerType,
        successUrl: successUrl,
        cancelUrl: pending.cancelUrl || origin + "/checkout/",
        returnUrl: returnUrl,
        visitorId: pending.visitorId || (window.ZYBAR && window.ZYBAR.Analytics ? window.ZYBAR.Analytics.getVisitorId() : null),
        sessionId: pending.sessionId || (window.ZYBAR && window.ZYBAR.Analytics ? window.ZYBAR.Analytics.getSessionId() : null),
        cartId: pending.cartId || (window.ZYBAR && window.ZYBAR.Analytics ? window.ZYBAR.Analytics.getCartId() : null),
        uploadSessionId: pending.uploadSessionId || null,
        fbp: (function () {
          try {
            var m = document.cookie.match(/(?:^|;\s*)_fbp=([^;]+)/);
            return m ? decodeURIComponent(m[1]) : null;
          } catch (e) {
            return null;
          }
        })(),
        fbc: (function () {
          try {
            var m = document.cookie.match(/(?:^|;\s*)_fbc=([^;]+)/);
            if (m) return decodeURIComponent(m[1]);
            var params = new URLSearchParams(window.location.search);
            var fbclid = params.get("fbclid");
            if (fbclid) return "fb.1." + Date.now() + "." + fbclid;
            return null;
          } catch (e) {
            return null;
          }
        })(),
        clientUserAgent: navigator.userAgent || null
      })
    }).then(function (res) {
      return res.json().then(function (data) {
        return { ok: res.ok, data: data };
      });
    });
  }

  function createCheckoutSessionForMode(modeOptions) {
    if (!state.pending) {
      return Promise.resolve({ ok: false, data: { error: "No checkout in progress." } });
    }
    return createCheckoutSession(state.pending, modeOptions);
  }

  function mountStripeFromSessionResult(result, token) {
    if (!result.ok || !result.data) {
      showError(
        (result.data && result.data.error) ||
          "Could not start checkout. Please go back and try again."
      );
      return Promise.resolve();
    }
    applySessionFlagsFromResult(result);
    if (result.data.url && !result.data.clientSecret) {
      window.location.href = result.data.url;
      return Promise.resolve();
    }
    if (!result.data.clientSecret) {
      showError("Could not start checkout. Please go back and try again.");
      return Promise.resolve();
    }

    var config = getConfig();
    var pk = config.publishableKey || "";
    if (!pk || !window.Stripe) {
      showError("Stripe is not configured.");
      return Promise.resolve();
    }
    var stripe = window.Stripe(pk);
    token = token || ++state.mountToken;

    if (result.data.checkoutMode !== "custom") {
      return mountEmbeddedCheckout(stripe, result.data.clientSecret, token);
    }

    return mountCustomCheckout(result.data.clientSecret, token).catch(function (err) {
      console.warn("Custom checkout unavailable, falling back to embedded:", err);
      if (token !== state.mountToken) return;
      teardownStripeCheckout();
      // Custom session secrets cannot be used with Embedded Checkout — mint a new session.
      return createCheckoutSessionForMode({ custom: false, embedded: true }).then(function (fallback) {
        if (token !== state.mountToken) return;
        if (!fallback.ok || !fallback.data || !fallback.data.clientSecret) {
          showError(
            (fallback.data && fallback.data.error) ||
              (err && err.message) ||
              "Could not start checkout. Please refresh and try again."
          );
          return;
        }
        rememberSession(getSelectedShippingMethod(), fallback);
        return mountEmbeddedCheckout(stripe, fallback.data.clientSecret, token);
      });
    });
  }

  function invalidateSessionCache() {
    state.sessionByShipping = {};
    state.sessionFetchByShipping = {};
  }

  function rememberSession(shippingMethod, result) {
    if (!shippingMethod || !result || !result.ok || !result.data || !result.data.clientSecret) {
      return;
    }
    applyDiscountFromSessionResult(result);
    applySessionFlagsFromResult(result);
    state.sessionByShipping[shippingMethod] = result;
    if (state.displayItems && state.displayItems.length) {
      renderOrderSummary(state.displayItems);
    }
  }

  function getOrCreateSession(shippingMethod) {
    var method = shippingMethod || getSelectedShippingMethod();
    if (state.sessionByShipping[method]) {
      return Promise.resolve(state.sessionByShipping[method]);
    }
    if (state.sessionFetchByShipping[method]) {
      return state.sessionFetchByShipping[method];
    }
    if (!state.pending) {
      return Promise.reject(new Error("Checkout is not ready."));
    }
    var pending = Object.assign({}, state.pending, { shippingMethod: method });
    var request = createCheckoutSession(pending)
      .then(function (result) {
        rememberSession(method, result);
        delete state.sessionFetchByShipping[method];
        return result;
      })
      .catch(function (err) {
        delete state.sessionFetchByShipping[method];
        throw err;
      });
    state.sessionFetchByShipping[method] = request;
    return request;
  }

  function prefetchOtherShippingSessions() {
    var pricing = getPricing();
    if (!pricing || typeof pricing.getShippingMethods !== "function" || !state.pending) return;
    var current = getSelectedShippingMethod();
    pricing.getShippingMethods().forEach(function (row) {
      if (!row || !row.code || row.code === current) return;
      getOrCreateSession(row.code).catch(function () {});
    });
  }

  function teardownStripeCheckout() {
    // Embedded Checkout is a Stripe singleton — must destroy() before creating another.
    try {
      if (state.embeddedCheckout && typeof state.embeddedCheckout.destroy === "function") {
        state.embeddedCheckout.destroy();
      }
    } catch (_) {}
    state.embeddedCheckout = null;

    try {
      if (state.stripeCheckout && typeof state.stripeCheckout.destroy === "function") {
        state.stripeCheckout.destroy();
      }
    } catch (_) {}
    state.stripeCheckout = null;
    state.clientSecret = "";
    state.sessionCustomerEmailSet = false;

    var paymentMount = document.getElementById("checkout-payment-element");
    if (paymentMount) {
      paymentMount.innerHTML = "";
      paymentMount.hidden = false;
    }
    var expressMount = document.getElementById("checkout-express-element");
    if (expressMount) expressMount.innerHTML = "";
    var expressSection = document.querySelector(".checkout-block--express");
    if (expressSection) expressSection.hidden = false;
    var embeddedHost = document.getElementById("checkout-stripe-embedded");
    if (embeddedHost) {
      embeddedHost.innerHTML = "";
      embeddedHost.hidden = true;
    }
    var payBtn = document.getElementById("checkout-pay-btn");
    if (payBtn) {
      payBtn.hidden = false;
      payBtn.textContent = "Complete Secure Order";
    }
  }

  function setPaymentRefreshing(isRefreshing) {
    document.documentElement.classList.toggle("checkout-updating-total", !!isRefreshing);
    var payBtn = document.getElementById("checkout-pay-btn");
    if (payBtn && state.paymentMode === "custom") {
      payBtn.disabled = !!isRefreshing;
    }
  }

  function syncTotalsFromStripeCheckout(checkout) {
    try {
      var session =
        checkout && typeof checkout.session === "function" ? checkout.session() : null;
      var totalObj =
        (session && session.total && session.total.total) ||
        (checkout && checkout.total && checkout.total.total) ||
        null;
      var stripeMinor = totalObj && totalObj.minorUnitsAmount;
      var stripeLabel = totalObj && totalObj.amount;
      if (!Number.isFinite(Number(stripeMinor))) return;
      var totalUsd = Number(stripeMinor) / 100;
      state.total = totalUsd;
      var grandEl = document.querySelector('[data-total="grand"]');
      if (grandEl) {
        grandEl.textContent = stripeLabel ? String(stripeLabel) : formatUsdLuxury(totalUsd);
        grandEl.setAttribute("data-value", String(totalUsd));
      }
      var mobileTotal = document.getElementById("checkout-mobile-total");
      if (mobileTotal) {
        mobileTotal.textContent = formatUsdLuxury(totalUsd);
        mobileTotal.setAttribute("data-value", String(totalUsd));
      }
    } catch (_) {}
  }

  function expressMethodsAvailable(paymentMethods) {
    if (!paymentMethods) return false;
    if (Array.isArray(paymentMethods)) return paymentMethods.length > 0;
    var keys = Object.keys(paymentMethods);
    for (var i = 0; i < keys.length; i++) {
      var entry = paymentMethods[keys[i]];
      if (entry && entry.available) return true;
    }
    return false;
  }

  /**
   * Swap Stripe to the selected shipping total.
   * Totals update instantly in the UI; payment remounts from a prefetched
   * session when available so the customer rarely waits on the network.
   */
  function refreshCheckoutSession() {
    if (!state.pending) return Promise.resolve();
    var shippingMethod = getSelectedShippingMethod();
    persistShippingSelection(shippingMethod);
    state.pending.shippingMethod = shippingMethod;
    try {
      window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(state.pending));
    } catch (_) {}

    clearError();
    setPaymentRefreshing(true);

    var cached = !!state.sessionByShipping[shippingMethod];

    return getOrCreateSession(shippingMethod)
      .then(function (result) {
        // User may have tapped another method while this request was in flight.
        if (getSelectedShippingMethod() !== shippingMethod) {
          setPaymentRefreshing(false);
          return;
        }
        var token = ++state.mountToken;
        teardownStripeCheckout();
        return mountStripeFromSessionResult(result, token);
      })
      .then(function () {
        if (getSelectedShippingMethod() !== shippingMethod) return;
        setPaymentRefreshing(false);
        clearError();
        if (!cached) prefetchOtherShippingSessions();
      })
      .catch(function (err) {
        console.error(err);
        setPaymentRefreshing(false);
        showError((err && err.message) || "Could not update shipping. Please refresh and try again.");
      });
  }

  function mountCustomCheckout(clientSecret, token) {
    token = token || ++state.mountToken;
    var config = getConfig();
    var publishableKey = config.publishableKey || "";
    if (!publishableKey || !window.Stripe) {
      return Promise.reject(new Error("Stripe is not configured."));
    }

    var stripe = window.Stripe(publishableKey);
    state.clientSecret = clientSecret;

    if (typeof stripe.initCheckout !== "function") {
      return Promise.reject(new Error("Stripe.initCheckout is not available in this browser."));
    }

    // Basil Stripe.js: initCheckout is async and takes fetchClientSecret (not clientSecret).
    // Confirm / update* live on the checkout object (no loadActions).
    var initResult = stripe.initCheckout({
      fetchClientSecret: function () {
        return Promise.resolve(clientSecret);
      },
      elementsOptions: { appearance: getAppearance() }
    });

    return Promise.resolve(initResult)
      .then(function (checkout) {
        if (token !== state.mountToken) return;
        if (!checkout || typeof checkout.createPaymentElement !== "function") {
          throw new Error("Stripe Custom Checkout failed to initialize.");
        }

        state.stripeCheckout = checkout;
        state.paymentMode = "custom";

        var paymentMount = document.getElementById("checkout-payment-element");
        if (paymentMount) {
          paymentMount.hidden = false;
          // Payment Element: cards + PayPal; hide Link; wallets stay in Express.
          var paymentElement = checkout.createPaymentElement({
            layout: "tabs",
            wallets: {
              applePay: "never",
              googlePay: "never",
              link: "never"
            },
            paymentMethodOrder: ["card", "paypal"]
          });
          paymentElement.mount("#checkout-payment-element");
        }

        var expressMount = document.getElementById("checkout-express-element");
        var expressSection = document.querySelector(".checkout-block--express");
        var expressElement = null;
        if (expressMount && typeof checkout.createExpressCheckoutElement === "function") {
          try {
            // Apple Pay / Google Pay first; hide Link from express row.
            expressElement = checkout.createExpressCheckoutElement({
              paymentMethods: {
                applePay: "always",
                googlePay: "always",
                link: "never",
                paypal: "auto",
                amazonPay: "never",
                klarna: "never"
              },
              paymentMethodOrder: ["applePay", "googlePay", "paypal"],
              layout: { maxColumns: 2, maxRows: 2, overflow: "auto" }
            });
            expressElement.mount("#checkout-express-element");
            expressElement.on("availablepaymentmethodschange", function (event) {
              var methods = (event && event.paymentMethods) || {};
              if (expressSection) expressSection.hidden = !expressMethodsAvailable(methods);
            });
          } catch (_) {
            if (expressSection) expressSection.hidden = true;
          }
        } else if (expressSection) {
          expressSection.hidden = true;
        }

        hideLoading();
        clearError();
        syncTotalsFromStripeCheckout(checkout);

        // Required for Apple Pay / Google Pay express buttons to complete.
        if (expressElement && typeof expressElement.on === "function") {
          expressElement.on("confirm", function (event) {
            if (window.ZYBAR && window.ZYBAR.Analytics) {
              window.ZYBAR.Analytics.trackPaymentStarted(
                (event && event.expressPaymentType) || "express",
                state.total
              );
            }
            checkout
              .confirm({
                expressCheckoutConfirmEvent: event,
                returnUrl: state.returnUrl
              })
              .then(function (confirmResult) {
                if (confirmResult && confirmResult.error) {
                  showError(
                    confirmResult.error.message || "Payment failed. Please try again."
                  );
                  return;
                }
                clearPendingCheckout();
              })
              .catch(function (err) {
                console.error(err);
                showError((err && err.message) || "Payment failed. Please try again.");
              });
          });
        }

        var payBtn = document.getElementById("checkout-pay-btn");
        if (payBtn) payBtn.hidden = false;
      })
      .catch(function (err) {
        teardownStripeCheckout();
        return Promise.reject(err);
      });
  }

  function mountEmbeddedCheckout(stripe, clientSecret, token) {
    token = token || ++state.mountToken;

    // Stripe only allows one Embedded Checkout instance per page.
    try {
      if (state.embeddedCheckout && typeof state.embeddedCheckout.destroy === "function") {
        state.embeddedCheckout.destroy();
      }
    } catch (_) {}
    state.embeddedCheckout = null;

    state.paymentMode = "embedded";
    var expressSection = document.querySelector(".checkout-block--express");
    if (expressSection) expressSection.hidden = true;

    var embeddedHost = document.getElementById("checkout-stripe-embedded");
    var paymentSlot = document.getElementById("checkout-payment-element");
    if (paymentSlot) paymentSlot.hidden = true;
    if (embeddedHost) {
      embeddedHost.innerHTML = "";
      embeddedHost.hidden = false;
    }

    if (typeof stripe.initEmbeddedCheckout !== "function") {
      return Promise.reject(new Error("Stripe Checkout is not available in this browser."));
    }

    return stripe.initEmbeddedCheckout({ clientSecret: clientSecret }).then(function (checkout) {
      if (token !== state.mountToken) {
        try {
          if (checkout && typeof checkout.destroy === "function") checkout.destroy();
        } catch (_) {}
        return;
      }
      state.embeddedCheckout = checkout;
      hideLoading();
      clearError();
      checkout.mount("#checkout-stripe-embedded");
      var payBtn = document.getElementById("checkout-pay-btn");
      if (payBtn) payBtn.hidden = true;
    });
  }

  function mountEmbeddedFallback(stripe, clientSecret) {
    return mountEmbeddedCheckout(stripe, clientSecret);
  }

  function getFormValues() {
    return {
      email: (document.getElementById("checkout-email") || {}).value || "",
      firstName: (document.getElementById("checkout-first-name") || {}).value || "",
      lastName: (document.getElementById("checkout-last-name") || {}).value || "",
      phone: (document.getElementById("checkout-phone") || {}).value || "",
      address: (document.getElementById("checkout-address") || {}).value || "",
      apartment: (document.getElementById("checkout-apartment") || {}).value || "",
      city: (document.getElementById("checkout-city") || {}).value || "",
      state: (document.getElementById("checkout-state") || {}).value || "",
      postcode: (document.getElementById("checkout-postcode") || {}).value || "",
      country:
        (window.ZYBAR &&
          window.ZYBAR.CountrySelector &&
          window.ZYBAR.CountrySelector.getValue()) ||
        (document.getElementById("checkout-country") || {}).value ||
        "MY"
    };
  }

  /**
   * Basil Custom Checkout expects shipping as { name, address: { line1, ... } }.
   * Flat Address fields at the top level are rejected (e.g. "line1 is not an accepted parameter").
   */
  function buildStripeShippingAddress(values) {
    var name = [values.firstName, values.lastName].filter(Boolean).join(" ").trim();
    var address = {
      line1: values.address,
      city: values.city,
      postal_code: values.postcode,
      country: values.country
    };
    if (values.apartment) address.line2 = values.apartment;
    if (values.state) address.state = values.state;
    return {
      name: name,
      address: address
    };
  }

  function validateForm() {
    var form = document.getElementById("checkout-form");
    if (!form) return false;
    if (!form.checkValidity()) {
      form.reportValidity();
      return false;
    }
    return true;
  }

  function handlePaySubmit(event) {
    event.preventDefault();
    if (state.paymentMode === "embedded") return;
    if (!validateForm()) return;

    var checkout = state.stripeCheckout;
    if (!checkout) {
      showError("Payment is not ready. Please wait or refresh the page.");
      return;
    }

    var payBtn = document.getElementById("checkout-pay-btn");
    if (payBtn) {
      payBtn.disabled = true;
      payBtn.textContent = "Processing…";
    }

    if (window.ZYBAR && window.ZYBAR.Analytics) {
      window.ZYBAR.Analytics.trackPaymentStarted("card", state.total);
    }

    var values = getFormValues();
    var returnUrl = state.returnUrl;

    var shippingAddress = buildStripeShippingAddress(values);

    syncDevtestFromEmail({ force: isDevtestCode(state.requestedDevtestCode) })
      .then(function () {
        checkout = state.stripeCheckout || checkout;
        if (!checkout) {
          throw new Error("Payment is not ready. Please wait or refresh the page.");
        }
        var emailAlreadySet = sessionHasServerCustomerEmail();
        var updates = [];
        // Only update email when the session was created without customer_email
        // (normal checkout). DEVTEST remints set customer_email server-side —
        // calling updateEmail again throws from Stripe.
        if (
          values.email &&
          !emailAlreadySet &&
          typeof checkout.updateEmail === "function"
        ) {
          updates.push(checkout.updateEmail(values.email));
        }
        if (typeof checkout.updateShippingAddress === "function") {
          updates.push(checkout.updateShippingAddress(shippingAddress));
        }
        if (values.phone && typeof checkout.updatePhoneNumber === "function") {
          updates.push(checkout.updatePhoneNumber(values.phone));
        }
        return Promise.all(updates).then(function () {
          var confirmOpts = {
            phoneNumber: values.phone || undefined,
            shippingAddress: shippingAddress,
            returnUrl: returnUrl
          };
          if (!emailAlreadySet && values.email) {
            confirmOpts.email = values.email;
          }
          return checkout.confirm(confirmOpts);
        });
      })
      .then(function (confirmResult) {
        if (confirmResult && confirmResult.error) {
          throw confirmResult.error;
        }
        clearPendingCheckout();
      })
      .catch(function (err) {
        console.error(err);
        if (window.ZYBAR && window.ZYBAR.Analytics) {
          window.ZYBAR.Analytics.trackPaymentFailed((err && err.message) || "unknown");
        }
        showError((err && err.message) || "Payment could not be completed. Please try again.");
        if (payBtn) {
          payBtn.disabled = false;
          payBtn.textContent = "Complete Secure Order";
        }
      });
  }

  function scheduleShippingRefresh() {
    if (shippingRefreshTimer) clearTimeout(shippingRefreshTimer);
    // Tiny coalesce only — UI totals already updated instantly.
    shippingRefreshTimer = setTimeout(function () {
      shippingRefreshTimer = null;
      refreshCheckoutSession();
    }, 40);
  }

  function handleShippingChange(method) {
    persistShippingSelection(method);
    if (state.pending) {
      state.pending.shippingMethod = method;
      state.pending._shippingChosen = true;
      try {
        window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(state.pending));
      } catch (_) {}
    }
    syncShippingCardStates();
    updateOrderTotalsAnimated();
    renderDeliveryEstimate();
    if (window.ZYBAR && window.ZYBAR.Analytics) {
      window.ZYBAR.Analytics.trackShippingSelected(method, state.total);
    }
    scheduleShippingRefresh();
  }

  function selectShippingMethod(method) {
    var pricing = getPricing();
    var normalized = pricing ? pricing.normalizeShippingMethod(method) : method || "standard";
    var radio = document.querySelector(
      'input[name="shippingMethod"][value="' + normalized + '"]'
    );
    if (!radio) return;
    if (radio.checked) return;
    radio.checked = true;
    handleShippingChange(normalized);
  }

  function wireCountrySelector() {
    var host = document.querySelector("[data-country-select]");
    if (!host) return;

    host.addEventListener("countrychange", function (event) {
      var detail = event && event.detail ? event.detail : {};
      var code = detail.code || "";

      if (window.ZYBAR && window.ZYBAR.Analytics && typeof window.ZYBAR.Analytics.trackEvent === "function") {
        window.ZYBAR.Analytics.trackEvent("checkout_country_selected", { country: code });
      }

      // Country can affect tax/shipping eligibility — rebuild session cache.
      invalidateSessionCache();
      scheduleShippingRefresh();
    });
  }

  function wireShippingMethod() {
    updateShippingPriceLabels();
    syncShippingCardStates();

    var cards = Array.prototype.slice.call(
      document.querySelectorAll(".checkout-shipping-option")
    );

    cards.forEach(function (card, index) {
      card.addEventListener("keydown", function (e) {
        if (e.key === "ArrowDown" || e.key === "ArrowRight") {
          e.preventDefault();
          var next = cards[(index + 1) % cards.length];
          var nextRadio = next.querySelector('input[name="shippingMethod"]');
          if (nextRadio) selectShippingMethod(nextRadio.value);
        } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
          e.preventDefault();
          var prev = cards[(index - 1 + cards.length) % cards.length];
          var prevRadio = prev.querySelector('input[name="shippingMethod"]');
          if (prevRadio) selectShippingMethod(prevRadio.value);
        } else if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          var radio = card.querySelector('input[name="shippingMethod"]');
          if (radio) selectShippingMethod(radio.value);
        }
      });
    });

    document.querySelectorAll('input[name="shippingMethod"]').forEach(function (radio) {
      radio.addEventListener("change", function () {
        if (!radio.checked) return;
        handleShippingChange(radio.value);
      });
    });
  }

  function wireBillingToggle() {
    var fields = document.getElementById("checkout-billing-fields");
    document.querySelectorAll('input[name="billingAddress"]').forEach(function (radio) {
      radio.addEventListener("change", function () {
        if (!fields) return;
        fields.hidden = radio.value !== "different" || !radio.checked;
      });
    });
  }

  function wireMobileSummary() {
    var toggle = document.getElementById("checkout-mobile-summary-toggle");
    var panel = document.getElementById("checkout-mobile-summary-panel");
    if (!toggle || !panel) return;

    toggle.addEventListener("click", function () {
      var open = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", open ? "false" : "true");
      panel.hidden = open;
    });
  }

  /**
   * Auto-apply the active tier benefit for a recognized member.
   * Must run before the first Stripe session is created.
   */
  function resolveAutoDiscount() {
    if (isDevtestCode(state.requestedDevtestCode) || isDevtestCode(state.discountCode)) {
      return;
    }
    var pricing = getPricing();
    if (!pricing || typeof pricing.applyDiscountUSD !== "function") return;
    var member = window.ZYBAR && window.ZYBAR.MemberPricing;
    var code = member && member.isActive() ? member.getDiscountCode() : "";
    if (!code) return;

    var subtotal = pricing.calculateCartSubtotal(state.pending && state.pending.displayItems || []);
    var discount = pricing.applyDiscountUSD(code, subtotal);
    if (!(discount > 0)) {
      if (state.pending) delete state.pending.discountCode;
      return;
    }
    state.discount = discount;
    state.discountCode = code;
    if (state.pending) {
      state.pending.discountCode = code;
      state.pending.memberCredential = member.getCredential();
    }
  }

  function syncDevtestFromEmail(options) {
    options = options || {};
    var emailInput = document.getElementById("checkout-email");
    var email = String((emailInput && emailInput.value) || "").trim();
    state.customerEmail = email;
    if (!state.pending) return Promise.resolve();

    if (!isDevtestCode(state.requestedDevtestCode)) return Promise.resolve();

    var emailLooksValid = email.indexOf("@") > 0 && email.indexOf(".") > email.indexOf("@");
    if (!emailLooksValid) return Promise.resolve();

    var prevEmail = String(state.pending.customerEmail || "").trim().toLowerCase();
    var nextEmail = email.toLowerCase();
    var already =
      isDevtestCode(state.pending.discountCode) &&
      prevEmail === nextEmail &&
      isDevtestCode(state.discountCode) &&
      !options.force;

    if (already) return Promise.resolve();

    state.pending.discountCode = DEVTEST_CODE;
    state.pending.customerEmail = email;
    persistRequestedDevtestCode(DEVTEST_CODE);
    try {
      window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(state.pending));
    } catch (_) {}

    invalidateSessionCache();
    return refreshCheckoutSession();
  }

  function wireDevtestDiscount() {
    state.requestedDevtestCode = readRequestedDevtestCode();
    if (!isDevtestCode(state.requestedDevtestCode)) return;

    persistRequestedDevtestCode(DEVTEST_CODE);
    // Keep the query param out of casual share screenshots after first load.
    try {
      var url = new URL(window.location.href);
      if (url.searchParams.has("code") || url.searchParams.has("discount")) {
        url.searchParams.delete("code");
        url.searchParams.delete("discount");
        window.history.replaceState({}, "", url.pathname + url.search + url.hash);
      }
    } catch (_) {}

    var emailInput = document.getElementById("checkout-email");
    if (!emailInput) return;

    function schedule() {
      if (emailDiscountTimer) clearTimeout(emailDiscountTimer);
      emailDiscountTimer = setTimeout(function () {
        syncDevtestFromEmail().catch(function (err) {
          console.warn("DEVTEST remint:", err && err.message);
        });
      }, 450);
    }

    emailInput.addEventListener("change", schedule);
    emailInput.addEventListener("blur", schedule);
    emailInput.addEventListener("input", schedule);
  }

  function init() {
    var pending = readPendingCheckout();
    if (!pending) {
      window.location.replace("/collections/all/");
      return;
    }

    var config = getConfig();
    var origin = window.location.origin;
    var successUrl =
      pending.successUrl ||
      config.successUrl ||
      origin + "/purchase-confirmation.html?session_id={CHECKOUT_SESSION_ID}";
    state.returnUrl =
      successUrl.indexOf("{CHECKOUT_SESSION_ID}") !== -1
        ? successUrl
        : successUrl +
          (successUrl.indexOf("?") === -1 ? "?" : "&") +
          "session_id={CHECKOUT_SESSION_ID}";

    state.pending = pending;
    wireDevtestDiscount();
    if (isDevtestCode(state.requestedDevtestCode)) {
      pending.discountCode = DEVTEST_CODE;
    }

    var pricing = getPricing();
    if (pricing) {
      // CRO default: Priority shipping (+$5) unless customer already chose on this checkout.
      if (!pending._shippingChosen) {
        pending.shippingMethod = "priority";
        pricing.writeShippingMethod("priority");
      }
      renderShippingOptionsFromCatalog();
      var method = pending.shippingMethod || "priority";
      pricing.writeShippingMethod(method);
      setShippingRadio(method);
      if (Array.isArray(pending.displayItems)) {
        pending.displayItems = pending.displayItems.map(function (item) {
          var copy = Object.assign({}, item);
          var slug = copy.slug || copy.productSlug || "";
          copy.unitPriceUSD = pricing.calculateProductUnitPrice({
            slug: slug,
            productSlug: slug,
            size: copy.size,
            powerType: copy.powerType
          });
          return copy;
        });
      }
    }

    resolveAutoDiscount();
    renderOrderSummary(pending.displayItems);
    // begin_checkout already tracked when leaving cart — avoid double-counting checkout_started
    wireBillingToggle();
    wireMobileSummary();
    wireCountrySelector();
    wireShippingMethod();
    window.addEventListener("zybar:member-pricing-change", function () {
      var member = window.ZYBAR && window.ZYBAR.MemberPricing;
      if (!member || !member.isActive() || state.discount > 0) return;
      if (isDevtestCode(state.requestedDevtestCode) || isDevtestCode(state.discountCode)) {
        return;
      }
      resolveAutoDiscount();
      renderOrderSummary(state.displayItems);
      invalidateSessionCache();
      scheduleShippingRefresh();
    });

    var form = document.getElementById("checkout-form");
    if (form) form.addEventListener("submit", handlePaySubmit);

    createCheckoutSession(pending)
      .then(function (result) {
        rememberSession(getSelectedShippingMethod(), result);
        return mountStripeFromSessionResult(result);
      })
      .then(function () {
        prefetchOtherShippingSessions();
        return syncDevtestFromEmail();
      })
      .catch(function (err) {
        console.error(err);
        showError((err && err.message) || "Something went wrong. Please refresh and try again.");
      });
  }

  function start() {
    var pricing = getPricing();
    var member = window.ZYBAR && window.ZYBAR.MemberPricing;
    var pricingReady =
      pricing && typeof pricing.load === "function" ? pricing.load() : Promise.resolve();
    var memberReady = member && member.ready ? member.ready : Promise.resolve();
    Promise.all([pricingReady, memberReady])
      .then(init)
      .catch(function (err) {
        console.error(err);
        init();
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
