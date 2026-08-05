(function () {
  "use strict";

  var KIT_IMAGES = {
    "luneva-dreamy-garden": "/luneva/assets/dreamy-garden/hero.png",
    "luneva-cyan-blue": "/luneva/assets/cyan-blue/hero.png",
    "luneva-glowing-garden": "/luneva/assets/glowing-garden/hero.png",
    "luneva-starlit-garden": "/luneva/assets/starlit-garden/hero.png"
  };

  function getSessionId() {
    try {
      return (new URLSearchParams(window.location.search).get("session_id") || "").trim();
    } catch (_) {
      return "";
    }
  }

  function getPayPalOrderId() {
    try {
      return (new URLSearchParams(window.location.search).get("paypal_order_id") || "").trim();
    } catch (_) {
      return "";
    }
  }

  function getApiBase() {
    var config = window.ZYBAR_STRIPE_CONFIG || {};
    return config.apiBaseUrl || window.location.origin;
  }

  function esc(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value || "—";
  }

  function showStatus(message) {
    var status = document.getElementById("lv-confirm-status");
    var card = document.getElementById("lv-confirm-card");
    if (status) {
      status.hidden = !message;
      status.textContent = message || "";
    }
    if (card && message) card.hidden = true;
  }

  function showError(message) {
    var err = document.getElementById("lv-confirm-error");
    if (err) {
      err.hidden = !message;
      err.textContent = message || "";
    }
    showStatus("");
  }

  function kitLabel(item) {
    if (item.sizeLabel) return item.sizeLabel;
    var size = String(item.size || "");
    if (size === "30x45") return "Lighting effects";
    if (size === "40x60") return "Lighting + Mechanical butterfly";
    return size || "LUNEVA kit";
  }

  function kitImage(item) {
    var slug = String(item.slug || "");
    if (KIT_IMAGES[slug]) return KIT_IMAGES[slug];
    if (slug.indexOf("luneva-") === 0) {
      return "/luneva/assets/" + slug.replace(/^luneva-/, "") + "/hero.png";
    }
    return item.imageUrl || "";
  }

  function clearLunevaCheckout() {
    try {
      window.localStorage.removeItem("luneva.cart.items");
      window.sessionStorage.removeItem("luneva.checkout.pending");
      window.dispatchEvent(new Event("luneva:cart-updated"));
    } catch (_) {}
  }

  function buildItemRow(item) {
    var qty = Number(item.quantity) || 1;
    var imageUrl = kitImage(item);
    return (
      '<article class="lv-confirm__item">' +
      (imageUrl
        ? '<img class="lv-confirm__thumb" src="' +
          esc(imageUrl) +
          '" alt="' +
          esc(item.name || "LUNEVA kit") +
          '" loading="lazy" />'
        : '<div class="lv-confirm__thumb lv-confirm__thumb--empty" aria-hidden="true"></div>') +
      '<div class="lv-confirm__item-body">' +
      '<h3>' +
      esc(item.name || "LUNEVA kit") +
      "</h3>" +
      "<p>" +
      esc(kitLabel(item)) +
      (qty > 1 ? " · Qty " + qty : "") +
      "</p>" +
      "</div>" +
      '<div class="lv-confirm__item-price">' +
      esc(item.amountFormatted || "") +
      "</div>" +
      "</article>"
    );
  }

  function renderOrder(data) {
    setText("lv-confirm-order", "#" + (data.orderNumber || "ORDER"));
    setText("lv-confirm-email", data.email || "—");
    setText("lv-confirm-ship-name", (data.shipping && data.shipping.name) || "—");
    setText("lv-confirm-ship-address", (data.shipping && data.shipping.address) || "—");
    setText("lv-confirm-ship-phone", (data.shipping && data.shipping.phone) || "—");
    setText("lv-confirm-payment", data.paymentMethod || "Card payment");
    setText("lv-confirm-subtotal", data.subtotalFormatted || "—");
    setText("lv-confirm-shipping", data.shippingFormatted || "FREE");
    setText("lv-confirm-total", data.totalFormatted || "—");

    var itemsHost = document.getElementById("lv-confirm-items");
    var items = Array.isArray(data.items) ? data.items : [];
    if (itemsHost) {
      itemsHost.innerHTML = items.length
        ? items.map(buildItemRow).join("")
        : '<p class="lv-confirm__muted">No line items found for this order.</p>';
    }

    var card = document.getElementById("lv-confirm-card");
    if (card) card.hidden = false;
    showStatus("");
  }

  function fetchOrder(sessionId, attempt) {
    showStatus(attempt > 0 ? "Confirming payment…" : "Loading your order…");
    showError("");

    return fetch(
      getApiBase() + "/api/checkout-session?session_id=" + encodeURIComponent(sessionId)
    )
      .then(function (res) {
        return res.json().then(function (body) {
          return { ok: res.ok, status: res.status, body: body };
        });
      })
      .then(function (result) {
        if (result.ok && result.body) {
          renderOrder(result.body);
          clearLunevaCheckout();
          if (window.ZYBAR && window.ZYBAR.Analytics) {
            window.ZYBAR.Analytics.trackPaymentSuccess({
              session_id: sessionId,
              amount_cents: result.body.totalCents,
              order_number: result.body.orderNumber,
              collection: "luneva"
            });
          }
          return;
        }
        if (result.status === 402 && attempt < 8) {
          return new Promise(function (resolve) {
            window.setTimeout(resolve, 1500);
          }).then(function () {
            return fetchOrder(sessionId, attempt + 1);
          });
        }
        throw new Error(
          (result.body && result.body.error) ||
            "Could not load your order. Please contact support@zybar.shop."
        );
      });
  }

  function fetchPayPalOrder(orderId) {
    showStatus("Loading your order…");
    showError("");
    return fetch(
      getApiBase() + "/api/paypal/order?order_id=" + encodeURIComponent(orderId)
    )
      .then(function (res) {
        return res.json().then(function (body) {
          return { ok: res.ok, body: body };
        });
      })
      .then(function (result) {
        if (result.ok && result.body) {
          renderOrder(result.body);
          clearLunevaCheckout();
          if (window.ZYBAR && window.ZYBAR.Analytics) {
            window.ZYBAR.Analytics.trackPaymentSuccess({
              session_id: "paypal:" + orderId,
              amount_cents: result.body.totalCents,
              order_number: result.body.orderNumber,
              collection: "luneva",
              payment_method: "paypal"
            });
          }
          return;
        }
        throw new Error(
          (result.body && result.body.error) ||
            "Could not load your order. Please contact support@zybar.shop."
        );
      });
  }

  function init() {
    var paypalOrderId = getPayPalOrderId();
    if (paypalOrderId) {
      fetchPayPalOrder(paypalOrderId).catch(function (err) {
        console.error(err);
        showError((err && err.message) || "Could not load order details.");
      });
      return;
    }
    var sessionId = getSessionId();
    if (!sessionId) {
      showError("Missing order reference. If you just paid, wait a moment and refresh this page.");
      return;
    }
    fetchOrder(sessionId, 0).catch(function (err) {
      console.error(err);
      showError((err && err.message) || "Could not load order details.");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
