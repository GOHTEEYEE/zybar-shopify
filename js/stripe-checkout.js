/**
 * ZYBAR Stripe Checkout handler.
 * Uses Stripe Price IDs from window.ZYBAR_STRIPE_CONFIG.
 */
(function () {
  "use strict";

  function getProductSlug() {
    var path = (window.location && window.location.pathname) || "";
    var match = path.match(/\/products\/([^/]+)\//);
    return match ? match[1] : "";
  }

  function getSelectedSize() {
    var selected = document.querySelector(".product-size-options .size-option.selected");
    if (selected && selected.getAttribute("data-size")) return selected.getAttribute("data-size");
    return "30x45";
  }

  function getQuantity() {
    var qtyEl = document.querySelector(".product-quantity span");
    var qty = qtyEl ? parseInt(qtyEl.textContent, 10) : 1;
    return Number.isFinite(qty) && qty > 0 ? qty : 1;
  }

  function getConfig() {
    return window.ZYBAR_STRIPE_CONFIG || {};
  }

  function formatUsd(amount) {
    return "$" + Number(amount || 0).toFixed(2);
  }

  function getSizePriceUSD(config, size) {
    var map = (config && config.sizePricesUSD) || {};
    if (typeof map[size] === "number") return map[size];
    if (size === "40x60") return 150;
    return 110;
  }

  function getPriceId(config, slug, size) {
    if (!config) return "";
    if (config.prices && config.prices[slug] && config.prices[slug][size]) {
      return config.prices[slug][size] || "";
    }
    if (config.sharedPriceIdsBySize && config.sharedPriceIdsBySize[size]) {
      return config.sharedPriceIdsBySize[size] || "";
    }
    return "";
  }

  function sizeToLabel(size) {
    if (size === "40x60") return "40 x 60 cm";
    return "30 x 45 cm";
  }

  function applySizePriceToUi(config) {
    var size = getSelectedSize();
    var amount = getSizePriceUSD(config, size);
    var priceText = formatUsd(amount);

    var mainPrice = document.querySelector(".product-price");
    if (mainPrice) mainPrice.textContent = priceText;

    var stickyPrice = document.querySelector(".pdp-sticky-price");
    if (stickyPrice) stickyPrice.textContent = priceText;

    var stickyMeta = document.querySelector(".pdp-sticky-meta");
    if (stickyMeta) stickyMeta.textContent = sizeToLabel(size);
  }

  function makeCheckout(stripe) {
    return function (event) {
      event.preventDefault();

      var config = getConfig();
      var slug = getProductSlug();
      var size = getSelectedSize();
      var quantity = getQuantity();
      var priceId = getPriceId(config, slug, size);

      if (!priceId || priceId.indexOf("REPLACE_ME") !== -1) {
        alert("Stripe is not fully configured yet. Please add your real Stripe price IDs in /js/stripe-config.js");
        return;
      }

      var successUrl = config.successUrl || (window.location.origin + "/collections/all/?checkout=success");
      var cancelUrl = config.cancelUrl || window.location.href;

      var apiBase = config.apiBaseUrl || window.location.origin;
      var btn = event.target && event.target.closest("[data-stripe-action='checkout']");
      if (btn) btn.disabled = true;

      fetch(apiBase + "/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          priceId: priceId,
          quantity: quantity,
          successUrl: successUrl,
          cancelUrl: cancelUrl,
          productSlug: slug || undefined,
          size: size || undefined
        })
      })
        .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
        .then(function (result) {
          if (btn) btn.disabled = false;
          if (result.ok && result.data && result.data.url) {
            window.location.href = result.data.url;
            return;
          }
          var msg = (result.data && result.data.error) ? result.data.error : "Checkout could not be started.";
          alert(msg);
        })
        .catch(function (err) {
          if (btn) btn.disabled = false;
          console.error(err);
          alert("Something went wrong. Please try again.");
        });
    };
  }

  function wireButtons(stripe) {
    var slug = getProductSlug();
    var buttons = document.querySelectorAll("[data-stripe-action='checkout']");
    var onCheckout = makeCheckout(stripe);

    buttons.forEach(function (button) {
      // Reuse analytics pipeline for checkout clicks.
      if (!button.hasAttribute("data-analytics-add-to-cart")) {
        button.setAttribute("data-analytics-add-to-cart", "");
      }
      if (!button.hasAttribute("data-product-id")) {
        button.setAttribute("data-product-id", slug);
      }
      button.addEventListener("click", onCheckout);
    });
  }

  function wireSizePriceUi(config) {
    // Keep displayed price synced with selected size (30x45 / 40x60).
    applySizePriceToUi(config);
    var sizeBtns = document.querySelectorAll(".product-size-options .size-option");
    sizeBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        setTimeout(function () {
          applySizePriceToUi(config);
        }, 0);
      });
    });
  }

  function init() {
    var config = getConfig();
    wireSizePriceUi(config);

    // Wire checkout buttons: they call the backend API, so Stripe.js is optional for redirect flow
    var stripe = (window.Stripe && config.publishableKey && config.publishableKey.indexOf("REPLACE_ME") === -1)
      ? window.Stripe(config.publishableKey) : null;
    wireButtons(stripe);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
