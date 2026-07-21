/**
 * ZYBAR Pricing Summary — reusable cart/checkout price-breakdown component.
 *
 * Computes an honest value story from the live pricing catalog:
 *   Original Price (compare-at) → Launch Offer → Member Welcome Discount
 *   → You Saved Today → Total.
 *
 * Used by the mini cart drawer, the checkout page, and future campaigns.
 * All numbers come from ZYBAR.Pricing (Supabase catalog) — nothing hardcoded
 * except the welcome code constant, which is still validated against the
 * catalog before any discount is shown.
 */
(function (root) {
  "use strict";

  var MEMBER_STORAGE_KEY = "zybar_garage_popup_v1";
  var WELCOME_CODE = "ZYBAR15";

  function getPricing() {
    return root.ZYBAR && root.ZYBAR.Pricing ? root.ZYBAR.Pricing : null;
  }

  function roundMoney(amount) {
    return Math.round(Number(amount || 0) * 100) / 100;
  }

  function formatUsd(amount) {
    var pricing = getPricing();
    if (pricing && typeof pricing.formatUsd === "function") {
      return pricing.formatUsd(amount);
    }
    var n = Number(amount);
    if (!Number.isFinite(n)) return "$0.00";
    return "$" + n.toFixed(2);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** True when the customer's email is already known (popup signup completed). */
  function isMember() {
    try {
      var raw = root.localStorage.getItem(MEMBER_STORAGE_KEY);
      if (!raw) return false;
      var state = JSON.parse(raw);
      return !!(state && state.submitted);
    } catch (_) {
      return false;
    }
  }

  function getWelcomeDiscountEntry() {
    var pricing = getPricing();
    if (!pricing || typeof pricing.getCatalog !== "function") return null;
    var catalog = pricing.getCatalog();
    var codes = catalog && catalog.discountCodes ? catalog.discountCodes : null;
    if (!codes) return null;
    return codes[WELCOME_CODE.toLowerCase()] || null;
  }

  /**
   * Welcome discount for the current visitor.
   * Returns 0 unless the email is known AND the code is active in the catalog.
   */
  function computeWelcomeDiscountUSD(subtotalUSD) {
    if (!isMember()) return 0;
    var pricing = getPricing();
    if (!pricing || typeof pricing.applyDiscountUSD !== "function") return 0;
    return roundMoney(pricing.applyDiscountUSD(WELCOME_CODE, subtotalUSD));
  }

  function lineQuantity(item) {
    var qty = Number(item && item.quantity);
    return Number.isFinite(qty) && qty > 0 ? qty : 1;
  }

  /**
   * Full-cart breakdown.
   * items: cart rows ({ slug, size, powerType, quantity, unitPriceUSD }).
   */
  function computeCartBreakdown(items) {
    var pricing = getPricing();
    var rows = Array.isArray(items) ? items.filter(Boolean) : [];

    var subtotal = 0;
    var originalTotal = 0;
    var itemCount = 0;

    rows.forEach(function (item) {
      var qty = lineQuantity(item);
      itemCount += qty;
      var slug = item.slug || item.productSlug || "";
      var unit = Number(item.unitPriceUSD);
      if (!Number.isFinite(unit) || unit < 0) {
        unit = pricing
          ? pricing.calculateProductUnitPrice({
              slug: slug,
              productSlug: slug,
              size: item.size,
              powerType: item.powerType
            })
          : 0;
      }
      var compareUnit =
        pricing && typeof pricing.calculateProductCompareAtPrice === "function"
          ? pricing.calculateProductCompareAtPrice({
              slug: slug,
              productSlug: slug,
              size: item.size,
              powerType: item.powerType
            })
          : 0;
      if (!(compareUnit > unit)) compareUnit = unit;
      subtotal += unit * qty;
      originalTotal += compareUnit * qty;
    });

    subtotal = roundMoney(subtotal);
    originalTotal = roundMoney(originalTotal);

    var launchSavings = roundMoney(Math.max(0, originalTotal - subtotal));
    var member = isMember();
    var memberSavings = computeWelcomeDiscountUSD(subtotal);
    var totalSavings = roundMoney(launchSavings + memberSavings);
    var total = roundMoney(Math.max(0, subtotal - memberSavings));

    return {
      itemCount: itemCount,
      subtotal: subtotal,
      originalTotal: originalTotal,
      launchSavings: launchSavings,
      isMember: member,
      memberCode: memberSavings > 0 ? WELCOME_CODE : "",
      memberLabel: "Member Welcome Discount",
      memberSavings: memberSavings,
      totalSavings: totalSavings,
      total: total
    };
  }

  /* ----- Estimated delivery ----- */

  function addBusinessDays(startDate, businessDays) {
    var date = new Date(startDate.getTime());
    var added = 0;
    while (added < businessDays) {
      date.setDate(date.getDate() + 1);
      var day = date.getDay();
      if (day !== 0 && day !== 6) added += 1;
    }
    return date;
  }

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function formatShortDate(date) {
    return MONTHS[date.getMonth()] + " " + date.getDate();
  }

  function parseBusinessDayWindow(description, fallback) {
    var match = String(description || "").match(/(\d+)\s*[–—-]\s*(\d+)/);
    if (match) {
      var min = parseInt(match[1], 10);
      var max = parseInt(match[2], 10);
      if (Number.isFinite(min) && Number.isFinite(max) && max >= min) {
        return [min, max];
      }
    }
    return fallback;
  }

  /**
   * Date-range delivery estimate ("Aug 3 – Aug 10") for a shipping method.
   * Windows come from the catalog's shipping descriptions when available.
   */
  function estimateDeliveryRange(shippingMethod) {
    var pricing = getPricing();
    var method = shippingMethod;
    if (!method && pricing && typeof pricing.readShippingMethod === "function") {
      method = pricing.readShippingMethod();
    }
    method = String(method || "priority").toLowerCase();
    var isPriority = method.indexOf("priority") !== -1 || method.indexOf("express") !== -1;
    var window = isPriority ? [7, 14] : [14, 18];

    if (pricing && typeof pricing.getShippingMethods === "function") {
      var meta = pricing.getShippingMethods().filter(function (m) {
        return m && m.code === method;
      })[0];
      if (meta) window = parseBusinessDayWindow(meta.description, window);
    }

    var now = new Date();
    var from = addBusinessDays(now, window[0]);
    var to = addBusinessDays(now, window[1]);
    return {
      method: method,
      from: from,
      to: to,
      label: formatShortDate(from) + " – " + formatShortDate(to)
    };
  }

  /* ----- Render ----- */

  var GIFT_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/>' +
    '<line x1="12" y1="22" x2="12" y2="7"/>' +
    '<path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/>' +
    '<path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>';

  function rowHtml(className, label, value) {
    return (
      '<div class="zps-row ' + className + '">' +
      '<span class="zps-label">' + label + "</span>" +
      '<span class="zps-value">' + value + "</span>" +
      "</div>"
    );
  }

  /**
   * Renders the breakdown block. Options:
   *   showDelivery (default true) — Estimated Delivery row inside the block
   *   showShipping (default false) — "Shipping — Calculated at checkout" row
   *   shippingValue — custom shipping value text
   *   shippingMethod — override the persisted shipping selection
   *   totalLabel (default "Total")
   *   note — small print under the total (default shipping note; "" to omit)
   */
  function renderBreakdownHtml(breakdown, options) {
    options = options || {};
    var b = breakdown || computeCartBreakdown([]);
    var showDelivery = options.showDelivery !== false;
    var parts = [];

    parts.push('<div class="zps" aria-label="Price summary">');

    if (b.launchSavings > 0) {
      parts.push(
        rowHtml("zps-row--original", "Retail Price", '<s class="zps-strike">' + escapeHtml(formatUsd(b.originalTotal)) + "</s>")
      );
      parts.push(
        rowHtml("zps-row--discount", "Launch Discount", "\u2212 " + escapeHtml(formatUsd(b.launchSavings)))
      );
    } else {
      parts.push(rowHtml("zps-row--original", "Subtotal", escapeHtml(formatUsd(b.subtotal))));
    }

    if (b.memberSavings > 0) {
      parts.push(
        rowHtml(
          "zps-row--discount zps-row--member",
          escapeHtml(b.memberLabel),
          "\u2212 " + escapeHtml(formatUsd(b.memberSavings))
        )
      );
    }

    if (options.showShipping) {
      parts.push(
        rowHtml(
          "zps-row--shipping",
          "Shipping",
          '<span class="zps-shipping-note">' + escapeHtml(options.shippingValue || "Calculated at checkout") + "</span>"
        )
      );
    }

    if (showDelivery) {
      var delivery = estimateDeliveryRange(options.shippingMethod);
      parts.push(
        rowHtml("zps-row--delivery", "Estimated Delivery", escapeHtml(delivery.label))
      );
    }

    if (b.totalSavings > 0) {
      parts.push(
        '<div class="zps-savings-banner">' +
        '<span class="zps-savings-banner-label">' +
        GIFT_SVG +
        "You Saved Today</span>" +
        '<span class="zps-savings-banner-value">' +
        escapeHtml(formatUsd(b.totalSavings)) +
        "</span>" +
        "</div>"
      );
    }

    parts.push(
      rowHtml(
        "zps-row--total",
        escapeHtml(options.totalLabel || "Total"),
        escapeHtml(formatUsd(b.total))
      )
    );

    var note = options.note;
    if (note === undefined) note = "Shipping calculated at checkout";
    if (note) parts.push('<p class="zps-note">' + escapeHtml(note) + "</p>");

    parts.push("</div>");
    return parts.join("");
  }

  root.ZYBAR = root.ZYBAR || {};
  root.ZYBAR.PricingSummary = {
    WELCOME_CODE: WELCOME_CODE,
    MEMBER_STORAGE_KEY: MEMBER_STORAGE_KEY,
    isMember: isMember,
    getWelcomeDiscountEntry: getWelcomeDiscountEntry,
    computeWelcomeDiscountUSD: computeWelcomeDiscountUSD,
    computeCartBreakdown: computeCartBreakdown,
    estimateDeliveryRange: estimateDeliveryRange,
    renderBreakdownHtml: renderBreakdownHtml,
    formatUsd: formatUsd
  };
})(typeof window !== "undefined" ? window : globalThis);
