/**
 * Loads real order data from Stripe Checkout Session (session_id in URL).
 */
(function () {
  "use strict";

  function getSessionId() {
    try {
      var params = new URLSearchParams(window.location.search);
      return (params.get("session_id") || "").trim();
    } catch (_) {
      return "";
    }
  }

  function getApiBase() {
    var config = window.ZYBAR_STRIPE_CONFIG || {};
    return config.apiBaseUrl || window.location.origin;
  }

  function escapeHtml(text) {
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
    var status = document.getElementById("pc-status");
    var card = document.querySelector(".pc-card");
    if (status) {
      status.hidden = !message;
      status.textContent = message || "";
    }
    if (card) card.classList.toggle("is-loading", !!message);
  }

  function showError(message) {
    var err = document.getElementById("pc-error");
    if (err) {
      err.hidden = !message;
      err.textContent = message || "";
    }
    showStatus("");
  }

  function buildItemRow(item) {
    var qty = Number(item.quantity) || 1;
    var sizePart = item.sizeLabel ? "Size: " + item.sizeLabel : "";
    var meta = "Quantity: " + qty + (sizePart ? " &nbsp;•&nbsp; " + sizePart : "");
    var imageUrl = item.imageUrl || "";
    var alt = escapeHtml(item.name) + " - LED Wall Art";

    return [
      '<section class="pc-item-row" aria-label="Purchased item">',
      '<div>',
      imageUrl
        ? '<img src="' +
          escapeHtml(imageUrl) +
          '" alt="' +
          alt +
          '" class="pc-item-thumb" loading="lazy" width="990" height="990" />'
        : "",
      "</div>",
      '<div>',
      '<div class="pc-item-name">' + escapeHtml(item.name).toUpperCase() + "</div>",
      '<div class="pc-item-meta">' + meta + "</div>",
      "</div>",
      '<div class="pc-item-price">' + escapeHtml(item.amountFormatted || "") + "</div>",
      "</section>"
    ].join("");
  }

  function renderOrder(data) {
    setText("pc-order-number", "#" + (data.orderNumber || "ORDER"));
    setText("pc-ship-name", (data.shipping && data.shipping.name) || "—");
    setText("pc-ship-address", (data.shipping && data.shipping.address) || "—");
    setText("pc-ship-phone", (data.shipping && data.shipping.phone) || "—");
    setText("pc-payment-method", data.paymentMethod || "—");
    setText("pc-subtotal", data.subtotalFormatted || "—");
    setText("pc-shipping", data.shippingFormatted || "FREE");
    setText("pc-total", data.totalFormatted || "—");

    var itemsHost = document.getElementById("pc-items");
    var items = Array.isArray(data.items) ? data.items : [];
    if (itemsHost) {
      itemsHost.innerHTML = items.length
        ? items.map(buildItemRow).join("")
        : '<p class="pc-meta-line-value">No line items found for this order.</p>';
    }
  }

  function fetchOrder(sessionId, attempt) {
    var apiBase = getApiBase();
    showStatus(attempt > 0 ? "Confirming payment…" : "Loading your order details…");
    showError("");

    return fetch(
      apiBase + "/api/checkout-session?session_id=" + encodeURIComponent(sessionId)
    )
      .then(function (res) {
        return res.json().then(function (body) {
          return { ok: res.ok, status: res.status, body: body };
        });
      })
      .then(function (result) {
        if (result.ok && result.body) {
          renderOrder(result.body);
          showStatus("");
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
          (result.body && result.body.error) || "Could not load your order. Please contact support."
        );
      });
  }

  function init() {
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
