/**
 * Shopify Checkout structure — CARLIGHT CLUB custom layout + Stripe payment.
 */
(function () {
  "use strict";

  var PENDING_KEY = "zybar.checkout.pending";
  var CART_KEY = "zybar.cart.items";
  var ANIM_MS = 200;
  var shippingRefreshTimer = null;

  var state = {
    subtotal: 0,
    shipping: 0,
    tax: 0,
    discount: 0,
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
    sessionFetchByShipping: {}
  };

  function getConfig() {
    return window.ZYBAR_STRIPE_CONFIG || {};
  }

  function getPricing() {
    return window.ZYBAR && window.ZYBAR.Pricing ? window.ZYBAR.Pricing : null;
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
    return {
      isPriority: isPriority,
      windowLabel: isPriority ? "7–14 Business Days" : "14–18 Business Days"
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

    return [
      '<article class="checkout-line-item">',
      '<div class="checkout-line-thumb-wrap">',
      '<img class="checkout-line-thumb" src="' +
        escapeHtml(imageUrl) +
        '" alt="" width="72" height="72" loading="eager" onerror="if(window.ZYBAR&amp;&amp;ZYBAR.Cart&amp;&amp;ZYBAR.Cart.onProductThumbError)ZYBAR.Cart.onProductThumbError(this)" />',
      '<span class="checkout-line-qty" aria-label="Quantity">' + safeQty + "</span>",
      "</div>",
      '<div class="checkout-line-details">',
      '<p class="checkout-line-name">' + escapeHtml(titles.title) + "</p>",
      '<p class="checkout-line-variant">' +
      metaLines.join("<br>") +
      (safeQty > 1 ? "<br>Qty " + safeQty : "<br>Qty 1") +
      "</p>",
      "</div>",
      '<p class="checkout-line-price">' + formatUsdLuxury(lineTotal) + "</p>",
      "</article>"
    ].join("");
  }

  function calcTotals(displayItems) {
    var pricing = getPricing();
    var shippingMethod = getSelectedShippingMethod();
    if (pricing) {
      var order = pricing.calculateOrderTotals({
        items: displayItems || [],
        shippingMethod: shippingMethod,
        taxUSD: state.tax,
        discountUSD: state.discount
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
    state.total = Math.max(0, subtotal + state.shipping + state.tax - state.discount);
    return state;
  }

  function renderTotalsHtml() {
    var taxRow =
      state.tax > 0
        ? '<div class="checkout-total-row"><span>Taxes</span><span>' +
          formatUsdLuxury(state.tax) +
          "</span></div>"
        : "";

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
        ? '<div class="checkout-total-row"><span>Discount</span><span>-' +
          formatUsdLuxury(state.discount) +
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

  function createCheckoutSession(pending) {
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

    return fetch(apiBase + "/api/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embedded: true,
        custom: true,
        lineItems: pending.lineItems,
        shippingMethod: shippingMethod,
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

  function mountStripeFromSessionResult(result, token) {
    if (!result.ok || !result.data) {
      showError(
        (result.data && result.data.error) ||
          "Could not start checkout. Please go back and try again."
      );
      return Promise.resolve();
    }
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
      return mountEmbeddedCheckout(stripe, result.data.clientSecret, token);
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
    state.sessionByShipping[shippingMethod] = result;
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
      var stripeMinor =
        checkout &&
        checkout.total &&
        checkout.total.total &&
        checkout.total.total.minorUnitsAmount;
      var stripeLabel =
        checkout && checkout.total && checkout.total.total && checkout.total.total.amount;
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
      return mountEmbeddedCheckout(stripe, clientSecret, token);
    }

    try {
      var checkout = stripe.initCheckout({
        clientSecret: clientSecret,
        elementsOptions: { appearance: getAppearance() }
      });
      if (token !== state.mountToken) {
        try {
          if (typeof checkout.destroy === "function") checkout.destroy();
        } catch (_) {}
        return Promise.resolve();
      }
      state.stripeCheckout = checkout;
      state.paymentMode = "custom";

      var paymentMount = document.getElementById("checkout-payment-element");
      if (paymentMount && typeof checkout.createPaymentElement === "function") {
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
            var methods = (event && event.paymentMethods) || [];
            if (expressSection) expressSection.hidden = !methods.length;
          });
        } catch (_) {
          if (expressSection) expressSection.hidden = true;
        }
      } else if (expressSection) {
        expressSection.hidden = true;
      }

      return checkout.loadActions().then(function (result) {
        if (token !== state.mountToken) return;
        hideLoading();
        clearError();
        if (result.type !== "success") {
          var errMsg =
            result.error && result.error.message
              ? result.error.message
              : "Could not initialize payment.";
          showError(errMsg);
          return;
        }

        var actions = result.actions;

        // Sync page TOTAL with the live Checkout Session amount (includes shipping).
        syncTotalsFromStripeCheckout(checkout);

        // Required for Apple Pay / Google Pay / Link express buttons to complete.
        if (expressElement && typeof expressElement.on === "function") {
          expressElement.on("confirm", function (event) {
            if (window.ZYBAR && window.ZYBAR.Analytics) {
              window.ZYBAR.Analytics.trackPaymentStarted(
                (event && event.expressPaymentType) || "express",
                state.total
              );
            }
            actions
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
      });
    } catch (err) {
      teardownStripeCheckout();
      return mountEmbeddedCheckout(stripe, clientSecret, token);
    }
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

  function buildStripeShippingAddress(values) {
    var name = [values.firstName, values.lastName].filter(Boolean).join(" ").trim();
    var shipping = {
      name: name,
      line1: values.address,
      city: values.city,
      postal_code: values.postcode,
      country: values.country
    };
    if (values.apartment) shipping.line2 = values.apartment;
    if (values.state) shipping.state = values.state;
    return shipping;
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

    checkout
      .loadActions()
      .then(function (result) {
        if (result.type !== "success") {
          throw new Error(
            (result.error && result.error.message) || "Could not complete checkout."
          );
        }
        var actions = result.actions;
        var updates = [];
        if (values.email && typeof actions.updateEmail === "function") {
          updates.push(actions.updateEmail(values.email));
        }
        if (typeof actions.updateShippingAddress === "function") {
          updates.push(actions.updateShippingAddress(shippingAddress));
        }
        if (values.phone && typeof actions.updatePhoneNumber === "function") {
          updates.push(actions.updatePhoneNumber(values.phone));
        }
        return Promise.all(updates).then(function () {
          return actions.confirm({
            email: values.email,
            phoneNumber: values.phone || undefined,
            shippingAddress: shippingAddress,
            returnUrl: returnUrl
          });
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

  function wireDiscount() {
    var applyBtn = document.getElementById("checkout-discount-apply");
    var msg = document.getElementById("checkout-discount-msg");
    if (!applyBtn) return;

    applyBtn.addEventListener("click", function () {
      var code = ((document.getElementById("checkout-discount-code") || {}).value || "")
        .trim()
        .toUpperCase();
      if (!msg) return;
      msg.hidden = false;
      if (!code) {
        msg.textContent = "Enter a discount code.";
        msg.className = "checkout-discount-msg is-error";
        return;
      }
      var pricing = getPricing();
      if (!pricing || typeof pricing.applyDiscountUSD !== "function") {
        msg.textContent = "Discount codes are temporarily unavailable.";
        msg.className = "checkout-discount-msg is-error";
        return;
      }
      var discount = pricing.applyDiscountUSD(code, state.subtotal);
      if (discount > 0) {
        state.discount = discount;
        if (state.pending) state.pending.discountCode = code;
        updateOrderTotalsAnimated();
        msg.textContent = "Discount applied.";
        msg.className = "checkout-discount-msg is-success";
        invalidateSessionCache();
        scheduleShippingRefresh();
        return;
      }
      state.discount = 0;
      updateOrderTotalsAnimated();
      msg.textContent = "This discount code is not valid for this order.";
      msg.className = "checkout-discount-msg is-error";
    });
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

    renderOrderSummary(pending.displayItems);
    // begin_checkout already tracked when leaving cart — avoid double-counting checkout_started
    wireBillingToggle();
    wireMobileSummary();
    wireDiscount();
    wireCountrySelector();
    wireShippingMethod();

    var form = document.getElementById("checkout-form");
    if (form) form.addEventListener("submit", handlePaySubmit);

    createCheckoutSession(pending)
      .then(function (result) {
        rememberSession(getSelectedShippingMethod(), result);
        return mountStripeFromSessionResult(result);
      })
      .then(function () {
        prefetchOtherShippingSessions();
      })
      .catch(function (err) {
        console.error(err);
        showError((err && err.message) || "Something went wrong. Please refresh and try again.");
      });
  }

  function start() {
    var pricing = getPricing();
    if (pricing && typeof pricing.load === "function") {
      pricing.load().then(init).catch(function (err) {
        console.error(err);
        init();
      });
      return;
    }
    init();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
