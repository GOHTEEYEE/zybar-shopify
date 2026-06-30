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
    paymentMode: "custom",
    returnUrl: "",
    pending: null
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
    });
  }

  function persistShippingSelection(method) {
    var pricing = getPricing();
    var normalized = pricing ? pricing.normalizeShippingMethod(method) : method || "standard";
    if (pricing) pricing.writeShippingMethod(normalized);
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
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.textContent = formatUsd(to);
      el.setAttribute("data-value", String(to));
      return;
    }
    el.classList.add("is-updating");
    var start = performance.now();
    function frame(now) {
      var t = Math.min(1, (now - start) / (duration || ANIM_MS));
      var val = from + (to - from) * moneyEase(t);
      el.textContent = formatUsd(val);
      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        el.textContent = formatUsd(to);
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
      el.textContent = formatUsd(cost);
    });
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
    var variant = sizePart && powerPart ? sizePart + " · " + powerPart : sizePart || powerPart || "";

    return [
      '<article class="checkout-line-item">',
      '<div class="checkout-line-thumb-wrap">',
      '<img class="checkout-line-thumb" src="' + escapeHtml(imageUrl) + '" alt="" width="64" height="64" loading="eager" />',
      '<span class="checkout-line-qty" aria-label="Quantity">' + safeQty + "</span>",
      "</div>",
      '<div class="checkout-line-details">',
      '<p class="checkout-line-name">' + escapeHtml(titles.title) + "</p>",
      '<p class="checkout-line-variant">' +
        escapeHtml(variant || titles.subtitle) +
        (variant && titles.subtitle && variant !== titles.subtitle
          ? "<br>" + escapeHtml(titles.subtitle)
          : "") +
        "</p>",
      "</div>",
      '<p class="checkout-line-price">' + formatUsd(lineTotal) + "</p>",
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
        ? '<div class="checkout-total-row"><span>Taxes</span><span>' + formatUsd(state.tax) + "</span></div>"
        : "";

    return [
      '<div class="checkout-total-row"><span>Subtotal</span><span class="checkout-money" data-total="subtotal" data-value="' +
        state.subtotal +
        '">' +
        formatUsd(state.subtotal) +
        "</span></div>",
      '<div class="checkout-total-row"><span>Shipping</span><span class="checkout-money" data-total="shipping" data-value="' +
        state.shipping +
        '">' +
        formatUsd(state.shipping) +
        "</span></div>",
      taxRow,
      state.discount > 0
        ? '<div class="checkout-total-row"><span>Discount</span><span>-' + formatUsd(state.discount) + "</span></div>"
        : "",
      '<div class="checkout-total-row checkout-total-row--grand"><span>Total</span><span class="checkout-money" data-total="grand" data-value="' +
        state.total +
        '">' +
        formatUsd(state.total) +
        "</span></div>"
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
      mobileTotal.textContent = formatUsd(state.total);
    }

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
    }
  }

  function hideLoading() {
    var loading = document.getElementById("checkout-loading");
    if (loading) loading.classList.add("is-hidden");
    var payBtn = document.getElementById("checkout-pay-btn");
    if (payBtn) payBtn.disabled = false;
  }

  function getAppearance() {
    return {
      theme: "night",
      variables: {
        colorPrimary: "#d9ff00",
        colorBackground: "#1a1a1a",
        colorText: "#ffffff",
        colorDanger: "#f87171",
        fontFamily: "Inter, system-ui, sans-serif",
        borderRadius: "8px"
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
        returnUrl: returnUrl
      })
    }).then(function (res) {
      return res.json().then(function (data) {
        return { ok: res.ok, data: data };
      });
    });
  }

  function mountStripeFromSessionResult(result) {
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

    if (result.data.checkoutMode !== "custom") {
      return mountEmbeddedCheckout(stripe, result.data.clientSecret);
    }

    return mountCustomCheckout(result.data.clientSecret).catch(function () {
      return mountEmbeddedCheckout(stripe, result.data.clientSecret);
    });
  }

  function refreshCheckoutSession() {
    if (!state.pending) return Promise.resolve();
    var pricing = getPricing();
    var shippingMethod = getSelectedShippingMethod();
    persistShippingSelection(shippingMethod);
    try {
      window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(state.pending));
    } catch (_) {}

    var payBtn = document.getElementById("checkout-pay-btn");
    if (payBtn) payBtn.disabled = true;

    var paymentMount = document.getElementById("checkout-payment-element");
    if (paymentMount) paymentMount.innerHTML = "";
    var expressMount = document.getElementById("checkout-express-element");
    if (expressMount) expressMount.innerHTML = "";
    state.stripeCheckout = null;

    return createCheckoutSession(state.pending)
      .then(mountStripeFromSessionResult)
      .catch(function (err) {
        console.error(err);
        showError((err && err.message) || "Could not update shipping. Please refresh and try again.");
        if (payBtn) payBtn.disabled = false;
      });
  }

  function mountCustomCheckout(clientSecret) {
    var config = getConfig();
    var publishableKey = config.publishableKey || "";
    if (!publishableKey || !window.Stripe) {
      return Promise.reject(new Error("Stripe is not configured."));
    }

    var stripe = window.Stripe(publishableKey);
    state.clientSecret = clientSecret;

    if (typeof stripe.initCheckout !== "function") {
      return mountEmbeddedFallback(stripe, clientSecret);
    }

    try {
      var checkout = stripe.initCheckout({
        clientSecret: clientSecret,
        elementsOptions: { appearance: getAppearance() }
      });
      state.stripeCheckout = checkout;
      state.paymentMode = "custom";

      var paymentMount = document.getElementById("checkout-payment-element");
      if (paymentMount && typeof checkout.createPaymentElement === "function") {
        var paymentElement = checkout.createPaymentElement();
        paymentElement.mount("#checkout-payment-element");
      }

      var expressMount = document.getElementById("checkout-express-element");
      if (expressMount && typeof checkout.createExpressCheckoutElement === "function") {
        try {
          var expressElement = checkout.createExpressCheckoutElement();
          expressElement.mount("#checkout-express-element");
        } catch (_) {}
      }

      return checkout.loadActions().then(function (result) {
        hideLoading();
        if (result.type !== "success") {
          var errMsg =
            result.error && result.error.message
              ? result.error.message
              : "Could not initialize payment.";
          showError(errMsg);
        }
      });
    } catch (err) {
      return mountEmbeddedFallback(stripe, clientSecret);
    }
  }

  function mountEmbeddedCheckout(stripe, clientSecret) {
    state.paymentMode = "embedded";
    var expressSection = document.querySelector(".checkout-block--express");
    if (expressSection) expressSection.hidden = true;

    var embeddedHost = document.getElementById("checkout-stripe-embedded");
    var paymentSlot = document.getElementById("checkout-payment-element");
    if (paymentSlot) paymentSlot.hidden = true;
    if (embeddedHost) embeddedHost.hidden = false;

    if (typeof stripe.initEmbeddedCheckout !== "function") {
      return Promise.reject(new Error("Stripe Checkout is not available in this browser."));
    }

    return stripe.initEmbeddedCheckout({ clientSecret: clientSecret }).then(function (checkout) {
      hideLoading();
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
        showError((err && err.message) || "Payment could not be completed. Please try again.");
        if (payBtn) {
          payBtn.disabled = false;
          payBtn.textContent = "Complete order";
        }
      });
  }

  function scheduleShippingRefresh() {
    if (shippingRefreshTimer) clearTimeout(shippingRefreshTimer);
    shippingRefreshTimer = setTimeout(function () {
      shippingRefreshTimer = null;
      refreshCheckoutSession();
    }, 350);
  }

  function handleShippingChange(method) {
    persistShippingSelection(method);
    syncShippingCardStates();
    updateOrderTotalsAnimated();
    scheduleShippingRefresh();
  }

  function wireShippingMethod() {
    updateShippingPriceLabels();
    syncShippingCardStates();

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
      var method = pending.shippingMethod || pricing.readShippingMethod();
      pricing.writeShippingMethod(method);
      setShippingRadio(method);
      if (Array.isArray(pending.displayItems)) {
        pending.displayItems = pending.displayItems.map(function (item) {
          var copy = Object.assign({}, item);
          copy.unitPriceUSD = pricing.calculateProductUnitPrice({
            size: copy.size,
            powerType: copy.powerType
          });
          return copy;
        });
      }
    }

    renderOrderSummary(pending.displayItems);
    wireBillingToggle();
    wireMobileSummary();
    wireDiscount();
    wireShippingMethod();

    var form = document.getElementById("checkout-form");
    if (form) form.addEventListener("submit", handlePaySubmit);

    createCheckoutSession(pending)
      .then(mountStripeFromSessionResult)
      .catch(function (err) {
        console.error(err);
        showError((err && err.message) || "Something went wrong. Please refresh and try again.");
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
