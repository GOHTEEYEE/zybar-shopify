/**
 * Premium full-page cart — instant updates, animated totals, undo remove.
 */
(function () {
  "use strict";

  var CART_STORAGE_KEY = "zybar.cart.items";
  var CHECKOUT_PENDING_KEY = "zybar.checkout.pending";
  var UNDO_MS = 5000;
  var ANIM_MS = 300;
  var EASE = function (t) {
    return 1 - Math.pow(1 - t, 3);
  };

  var catalogCache = null;
  var catalogPromise = null;
  var undoState = null;
  var undoTimer = null;
  var lastSubtotal = 0;

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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

  function powerTypeToLabel(powerType) {
    var pricing = getPricing();
    if (pricing) return pricing.powerTypeToLabel(powerType);
    if (powerType === "dual") return "USB + Battery";
    return "USB Only";
  }

  function repairCartItems(items) {
    var pricing = getPricing();
    if (!pricing) return items || [];
    var changed = false;
    var next = (items || []).map(function (item) {
      if (!item) return item;
      var before = item.unitPriceUSD;
      pricing.repairCartItem(item);
      if (before !== item.unitPriceUSD) changed = true;
      return item;
    });
    if (changed) writeCartItems(next);
    return next;
  }

  function calcOrderTotals(items) {
    var pricing = getPricing();
    if (!pricing) {
      var subtotal = (items || []).reduce(function (sum, item) {
        var qty = Number(item && item.quantity);
        var unit = Number(item && item.unitPriceUSD);
        var safeQty = Number.isFinite(qty) && qty > 0 ? qty : 0;
        var safeUnit = Number.isFinite(unit) && unit > 0 ? unit : 0;
        return sum + safeQty * safeUnit;
      }, 0);
      return { subtotal: subtotal, shipping: 0, tax: 0, discount: 0, total: subtotal };
    }
    return pricing.calculateOrderTotals({
      items: items,
      shippingMethod: pricing.readShippingMethod()
    });
  }

  function calcSubtotal(items) {
    var totals = calcOrderTotals(items);
    return totals.subtotal;
  }

  function parseMoney(text) {
    var n = parseFloat(String(text || "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  function formatSizeLabel(item) {
    var label = item && item.sizeLabel ? String(item.sizeLabel) : item && item.size ? String(item.size) : "";
    if (!label) return "—";
    return label.replace(/x/gi, "×");
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

  function getCartApi() {
    return window.ZYBAR && window.ZYBAR.Cart ? window.ZYBAR.Cart : null;
  }

  function readCartItems() {
    var api = getCartApi();
    if (api && typeof api.readCartItems === "function") return api.readCartItems();
    try {
      var raw = window.localStorage.getItem(CART_STORAGE_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function writeCartItems(items) {
    var api = getCartApi();
    if (api && typeof api.writeCartItems === "function") {
      api.writeCartItems(items);
      return;
    }
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items || []));
    } catch (_) {}
  }

  function refreshCartBadge() {
    var api = getCartApi();
    if (api && typeof api.refreshCartBadge === "function") api.refreshCartBadge();
  }

  function getCartItemImageUrl(item) {
    var api = getCartApi();
    if (api && typeof api.getCartItemImageUrl === "function") return api.getCartItemImageUrl(item);
    var slug = item && item.slug ? item.slug : "";
    if (item && item.imageUrl) return item.imageUrl;
    return slug ? "/Image/" + slug + "-1.webp" : "";
  }

  function getCartTotalCount(items) {
    return (items || readCartItems()).reduce(function (sum, item) {
      var qty = Number(item && item.quantity);
      return sum + (Number.isFinite(qty) && qty > 0 ? qty : 0);
    }, 0);
  }

  function calcSubtotal(items) {
    return (items || []).reduce(function (sum, item) {
      var qty = Number(item && item.quantity);
      var unit = Number(item && item.unitPriceUSD);
      var safeQty = Number.isFinite(qty) && qty > 0 ? qty : 0;
      var safeUnit = Number.isFinite(unit) && unit > 0 ? unit : 0;
      return sum + safeQty * safeUnit;
    }, 0);
  }

  function animateMoney(el, from, to, duration) {
    if (!el) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.textContent = formatUsd(to);
      el.setAttribute("data-value", String(to));
      return;
    }
    var start = performance.now();
    function frame(now) {
      var t = Math.min(1, (now - start) / (duration || ANIM_MS));
      var val = from + (to - from) * EASE(t);
      el.textContent = formatUsd(val);
      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        el.textContent = formatUsd(to);
        el.setAttribute("data-value", String(to));
      }
    }
    requestAnimationFrame(frame);
  }

  function animateMoneyEl(el, to) {
    var from = parseFloat(el.getAttribute("data-value") || "0");
    if (!Number.isFinite(from)) from = parseMoney(el.textContent);
    animateMoney(el, from, to, ANIM_MS);
  }

  function buildDisplayItemsFromCart(items) {
    return (items || []).map(function (item) {
      return {
        name: item && item.name ? item.name : "Product",
        imageUrl: getCartItemImageUrl(item),
        sizeLabel: formatSizeLabel(item),
        size: item && item.size ? item.size : "",
        powerType: item && item.powerType ? item.powerType : "usb",
        powerTypeLabel:
          item && item.powerTypeLabel ? item.powerTypeLabel : powerTypeToLabel(item && item.powerType),
        slug: item && item.slug ? item.slug : "",
        quantity: item && item.quantity ? item.quantity : 1,
        unitPriceUSD: item && item.unitPriceUSD ? item.unitPriceUSD : 0
      };
    });
  }

  function goToPremiumCheckout(payload) {
    try {
      window.sessionStorage.setItem(CHECKOUT_PENDING_KEY, JSON.stringify(payload));
    } catch (err) {
      console.error(err);
      alert("Could not start checkout. Please try again.");
      return;
    }
    window.location.href = "/checkout/";
  }

  function beginCartCheckout(items, button) {
    var api = getCartApi();
    if (api && typeof api.beginCartCheckout === "function") {
      api.beginCartCheckout(items, button);
      return;
    }

    var config = window.ZYBAR_STRIPE_CONFIG || {};
    var successUrl =
      config.successUrl ||
      window.location.origin + "/purchase-confirmation.html?session_id={CHECKOUT_SESSION_ID}";
    var cancelUrl = config.cancelUrl || window.location.href;
    var pricing = getPricing();
    if (!pricing) {
      alert("Pricing is not available. Please refresh the page.");
      return;
    }
    var shippingMethod = pricing.readShippingMethod();
    var validItems = (items || [])
      .map(function (item) {
        if (!item) return null;
        var size = pricing.normalizeSize(item.size);
        var powerType = pricing.normalizePowerType(item.powerType);
        var qty = Number(item.quantity);
        if (!Number.isFinite(qty) || qty < 1) return null;
        return {
          quantity: qty,
          productSlug: String(item.slug ? item.slug : ""),
          size: size,
          powerType: powerType,
          name: String(item.name ? item.name : "Product"),
          unitAmountUSD: pricing.calculateProductUnitPrice({
            slug: String(item.slug ? item.slug : ""),
            productSlug: String(item.slug ? item.slug : ""),
            size: size,
            powerType: powerType
          })
        };
      })
      .filter(Boolean);

    if (!validItems.length) {
      alert("Your cart is empty or has invalid items. Please re-add items and try again.");
      return;
    }

    if (button) {
      button.disabled = true;
      button.textContent = "Redirecting…";
    }

    goToPremiumCheckout({
      lineItems: validItems,
      shippingMethod: shippingMethod,
      displayItems: buildDisplayItemsFromCart(
        (items || []).filter(function (item) {
          return (
            item &&
            validItems.some(function (v) {
              return (
                v.productSlug === item.slug &&
                v.size === pricing.normalizeSize(item.size) &&
                v.powerType === pricing.normalizePowerType(item.powerType)
              );
            })
          );
        })
      ),
      successUrl: successUrl,
      cancelUrl: cancelUrl
    });
  }

  function emptyIllustrationSvg() {
    return (
      '<svg class="cart-empty-svg" viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<rect x="28" y="24" width="144" height="96" rx="8" stroke="currentColor" stroke-width="1.2" opacity="0.35"/>' +
      '<path d="M44 108 L156 108" stroke="currentColor" stroke-width="1" opacity="0.2"/>' +
      '<circle cx="72" cy="72" r="6" fill="currentColor" opacity="0.15"/>' +
      '<circle cx="100" cy="64" r="4" fill="currentColor" opacity="0.25"/>' +
      '<circle cx="128" cy="76" r="5" fill="currentColor" opacity="0.18"/>' +
      '<path d="M60 88 Q100 72 140 88" stroke="currentColor" stroke-width="1.5" opacity="0.3" stroke-linecap="round"/>' +
      '<rect x="88" y="120" width="24" height="4" rx="2" fill="currentColor" opacity="0.12"/>' +
      "</svg>"
    );
  }

  function summaryHtml(totals) {
    var subtotal = totals && typeof totals.subtotal === "number" ? totals.subtotal : 0;
    var shipping = totals && typeof totals.shipping === "number" ? totals.shipping : 0;
    var total = totals && typeof totals.total === "number" ? totals.total : subtotal + shipping;
    return (
      '<aside class="cart-summary" id="cart-summary" aria-label="Order summary">' +
      '<div class="cart-summary-inner">' +
      '<dl class="cart-summary-rows">' +
      '<div class="cart-summary-row">' +
      '<dt>Subtotal</dt>' +
      '<dd><span class="cart-money" id="cart-subtotal" data-value="' +
      subtotal +
      '">' +
      formatUsd(subtotal) +
      "</span></dd>" +
      "</div>" +
      '<div class="cart-summary-row cart-summary-row--muted">' +
      "<dt>Shipping</dt>" +
      '<dd><span class="cart-money" id="cart-shipping" data-value="' +
      shipping +
      '">' +
      formatUsd(shipping) +
      "</span></dd>" +
      "</div>" +
      '<div class="cart-summary-row cart-summary-row--muted">' +
      "<dt>Taxes</dt>" +
      '<dd><span class="cart-summary-note">Calculated at checkout</span></dd>' +
      "</div>" +
      '<div class="cart-summary-row cart-summary-row--total">' +
      "<dt>Total</dt>" +
      '<dd><span class="cart-money cart-money--large" id="cart-estimated-total" data-value="' +
      total +
      '">' +
      formatUsd(total) +
      "</span></dd>" +
      "</div>" +
      "</dl>" +
      '<div class="cart-summary-actions">' +
      '<button type="button" class="cart-checkout-btn" id="cart-checkout-btn">Checkout</button>' +
      '<a href="/collections/all/" class="cart-continue-btn">Continue Shopping</a>' +
      "</div>" +
      "</div>" +
      "</aside>"
    );
  }

  function itemRowHtml(item) {
    var qty = Number(item && item.quantity);
    var safeQty = Number.isFinite(qty) && qty > 0 ? qty : 1;
    var unit = Number(item && item.unitPriceUSD) || 0;
    var lineTotal = safeQty * unit;
    var key = item && item.key ? item.key : "";
    var imageUrl = escapeHtml(getCartItemImageUrl(item));
    var name = escapeHtml(item && item.name ? item.name : "Product");
    var finish = escapeHtml(item && item.finishLabel ? item.finishLabel : "Premium Matte Acrylic");
    var ledColor = escapeHtml(item && item.ledColor ? item.ledColor : getLedColorForSlug(item && item.slug));
    var size = escapeHtml(formatSizeLabel(item));
    var power = escapeHtml(
      item && item.powerTypeLabel ? item.powerTypeLabel : powerTypeToLabel(item && item.powerType)
    );

    return (
      '<li class="cart-item" data-item-key="' +
      escapeHtml(key) +
      '" style="--cart-item-delay:0ms">' +
      '<div class="cart-item-inner">' +
      '<a href="/products/' +
      escapeHtml(item && item.slug ? item.slug : "") +
      '/" class="cart-item-thumb-link" tabindex="-1" aria-hidden="true">' +
      '<img class="cart-item-thumb" src="' +
      imageUrl +
      '" alt="" width="120" height="120" loading="lazy" />' +
      "</a>" +
      '<div class="cart-item-body">' +
      '<a href="/products/' +
      escapeHtml(item && item.slug ? item.slug : "") +
      '/" class="cart-item-name">' +
      name +
      "</a>" +
      '<dl class="cart-item-specs">' +
      '<div class="cart-item-spec"><dt>Finish</dt><dd>' +
      finish +
      "</dd></div>" +
      '<div class="cart-item-spec"><dt>LED Color</dt><dd>' +
      (ledColor || "—") +
      "</dd></div>" +
      '<div class="cart-item-spec"><dt>Size</dt><dd>' +
      size +
      "</dd></div>" +
      '<div class="cart-item-spec"><dt>Power</dt><dd>' +
      power +
      "</dd></div>" +
      "</dl>" +
      '<div class="cart-item-unit-row">' +
      '<span class="cart-item-unit-label">Unit Price</span>' +
      '<span class="cart-money cart-item-unit-money" data-value="' +
      unit +
      '">' +
      formatUsd(unit) +
      "</span>" +
      "</div>" +
      '<div class="cart-item-actions">' +
      '<div class="cart-qty" role="group" aria-label="Quantity for ' +
      name +
      '">' +
      '<button type="button" class="cart-qty-btn" data-action="decrease" aria-label="Decrease quantity">−</button>' +
      '<span class="cart-qty-value" aria-live="polite" aria-atomic="true">' +
      safeQty +
      "</span>" +
      '<button type="button" class="cart-qty-btn" data-action="increase" aria-label="Increase quantity">+</button>' +
      "</div>" +
      '<button type="button" class="cart-item-remove" data-action="remove" aria-label="Remove ' +
      name +
      ' from cart">Remove</button>' +
      "</div>" +
      '<div class="cart-item-subtotal-row">' +
      '<span class="cart-item-subtotal-label">Subtotal</span>' +
      '<span class="cart-money cart-item-line-money" data-value="' +
      lineTotal +
      '">' +
      formatUsd(lineTotal) +
      "</span>" +
      "</div>" +
      "</div>" +
      "</div>" +
      "</li>"
    );
  }

  function updateDockHeight() {
    var summary = document.getElementById("cart-summary");
    if (!summary) {
      document.documentElement.style.setProperty("--cart-dock-h", "0px");
      return;
    }
    document.documentElement.style.setProperty("--cart-dock-h", summary.offsetHeight + "px");
  }

  function renderEmpty(root) {
    root.innerHTML =
      '<div class="cart-empty">' +
      '<div class="cart-empty-illustration">' +
      emptyIllustrationSvg() +
      "</div>" +
      "<h2 class=\"cart-empty-title\">Your cart is empty</h2>" +
      '<p class="cart-empty-subtitle">Discover handcrafted LED automotive artwork.</p>' +
      '<a href="/collections/all/" class="cart-explore-btn">Explore Collection</a>' +
      "</div>";
    updatePageCount(0);
    lastSubtotal = 0;
  }

  function renderFull(items, root) {
    var totals = calcOrderTotals(items);
    lastSubtotal = totals.subtotal;
    var listHtml = items.map(itemRowHtml).join("");

    root.innerHTML =
      '<div class="cart-layout">' +
      '<section class="cart-items-col" aria-label="Cart items">' +
      '<ul class="cart-items-list" id="cart-items-list">' +
      listHtml +
      "</ul>" +
      "</section>" +
      summaryHtml(totals) +
      "</div>";

    requestAnimationFrame(function () {
      var rows = root.querySelectorAll(".cart-item");
      rows.forEach(function (row, index) {
        row.style.setProperty("--cart-item-delay", String(index * 40) + "ms");
        row.classList.add("is-visible");
      });
    });

    wireSummaryActions(items);
    updatePageCount(getCartTotalCount(items));
    updateDockHeight();
  }

  function updatePageCount(count) {
    var el = document.getElementById("cart-page-count");
    if (!el) return;
    if (!count) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = count === 1 ? "1 item" : count + " items";
  }

  function updateTotals(items) {
    var totals = calcOrderTotals(items);
    var subEl = document.getElementById("cart-subtotal");
    var shipEl = document.getElementById("cart-shipping");
    var totalEl = document.getElementById("cart-estimated-total");
    animateMoneyEl(subEl, totals.subtotal);
    if (shipEl) animateMoneyEl(shipEl, totals.shipping);
    animateMoneyEl(totalEl, totals.total);
    lastSubtotal = totals.subtotal;
    updatePageCount(getCartTotalCount(items));
  }

  function updateLineTotal(row, item) {
    var qty = Number(item && item.quantity);
    var safeQty = Number.isFinite(qty) && qty > 0 ? qty : 1;
    var unit = Number(item && item.unitPriceUSD) || 0;
    var lineTotal = safeQty * unit;
    var moneyEl = row.querySelector(".cart-item-line-money");
    animateMoneyEl(moneyEl, lineTotal);
    var qtyEl = row.querySelector(".cart-qty-value");
    if (qtyEl) qtyEl.textContent = String(safeQty);
  }

  function updateItemQuantity(itemKey, delta) {
    var key = String(itemKey || "");
    if (!key) return readCartItems();
    var nextItems = readCartItems()
      .map(function (item) {
        if (!item || item.key !== key) return item;
        var nextQty = (Number(item.quantity) || 0) + Number(delta || 0);
        item.quantity = nextQty;
        return item;
      })
      .filter(function (item) {
        return item && Number(item.quantity) > 0;
      });
    writeCartItems(nextItems);
    refreshCartBadge();
    return nextItems;
  }

  function removeItemByKey(itemKey) {
    var key = String(itemKey || "");
    if (!key) return readCartItems();
    var nextItems = readCartItems().filter(function (item) {
      return item && item.key !== key;
    });
    writeCartItems(nextItems);
    refreshCartBadge();
    return nextItems;
  }

  function restoreRemovedItem() {
    if (!undoState) return;
    var items = readCartItems();
    var insertAt = Math.min(undoState.index, items.length);
    items.splice(insertAt, 0, undoState.item);
    writeCartItems(items);
    refreshCartBadge();
    clearUndo();
    render(readCartItems());
  }

  function clearUndo() {
    if (undoTimer) {
      clearTimeout(undoTimer);
      undoTimer = null;
    }
    undoState = null;
    hideToast();
  }

  function hideToast() {
    var toast = document.getElementById("cart-toast");
    if (!toast) return;
    toast.hidden = true;
    toast.classList.remove("is-visible");
    toast.innerHTML = "";
  }

  function showUndoToast() {
    var toast = document.getElementById("cart-toast");
    if (!toast) return;
    toast.innerHTML =
      '<span class="cart-toast-text">Item removed.</span>' +
      '<button type="button" class="cart-toast-undo" id="cart-toast-undo">Undo</button>';
    toast.hidden = false;
    requestAnimationFrame(function () {
      toast.classList.add("is-visible");
    });
    var undoBtn = document.getElementById("cart-toast-undo");
    if (undoBtn) {
      undoBtn.addEventListener("click", function () {
        restoreRemovedItem();
      });
    }
    if (undoTimer) clearTimeout(undoTimer);
    undoTimer = setTimeout(function () {
      undoState = null;
      hideToast();
    }, UNDO_MS);
  }

  function dismissUndoUi() {
    if (undoTimer) {
      clearTimeout(undoTimer);
      undoTimer = null;
    }
    hideToast();
  }

  function removeItemWithUndo(row, itemKey) {
    var items = readCartItems();
    var index = items.findIndex(function (item) {
      return item && item.key === itemKey;
    });
    if (index === -1) return;
    var removed = items[index];
    dismissUndoUi();
    undoState = { item: removed, index: index };

    row.classList.add("is-removing");
    var onEnd = function () {
      row.removeEventListener("transitionend", onEnd);
      removeItemByKey(itemKey);
      var next = readCartItems();
      if (!next.length) {
        render(next);
      } else {
        updateTotals(next);
      }
      showUndoToast();
      undoTimer = setTimeout(function () {
        undoState = null;
        hideToast();
      }, UNDO_MS);
    };
    row.addEventListener("transitionend", onEnd);
    setTimeout(function () {
      if (row.parentNode) onEnd();
    }, 400);
  }

  function wireSummaryActions(items) {
    var checkoutBtn = document.getElementById("cart-checkout-btn");
    if (checkoutBtn) {
      checkoutBtn.addEventListener("click", function () {
        beginCartCheckout(readCartItems(), checkoutBtn);
      });
    }
  }

  function handleListClick(event) {
    var button = event.target && event.target.closest("button[data-action]");
    if (!button) return;
    var row = button.closest(".cart-item");
    if (!row) return;
    var itemKey = row.getAttribute("data-item-key");
    if (!itemKey) return;
    var action = button.getAttribute("data-action");

    if (action === "increase" || action === "decrease") {
      var delta = action === "increase" ? 1 : -1;
      var next = updateItemQuantity(itemKey, delta);
      var item = next.find(function (i) {
        return i && i.key === itemKey;
      });
      if (!item) {
        row.classList.add("is-removing");
        var removedViaQty = function () {
          row.removeEventListener("transitionend", removedViaQty);
          removeItemByKey(itemKey);
          var next = readCartItems();
          if (!next.length) {
            render(next);
          } else {
            updateTotals(next);
          }
        };
        row.addEventListener("transitionend", removedViaQty);
        setTimeout(function () {
          if (row.parentNode) removedViaQty();
        }, 400);
        return;
      }
      updateLineTotal(row, item);
      updateTotals(next);
      return;
    }

    if (action === "remove") {
      removeItemWithUndo(row, itemKey);
    }
  }

  function render(items) {
    var root = document.getElementById("cart-root");
    if (!root) return;
    if (!items.length) {
      renderEmpty(root);
      return;
    }
    renderFull(items, root);
  }

  function init() {
    if (!document.body.classList.contains("cart-page")) return;

    function afterPricing() {
      loadCatalog().then(function () {
        var items = repairCartItems(readCartItems());
        render(items);
        updateDockHeight();
        if (window.ZYBAR && window.ZYBAR.Analytics) {
          var totals = calcOrderTotals(items);
          window.ZYBAR.Analytics.trackViewCart(items, totals.total);
        }
      });

      window.addEventListener("resize", updateDockHeight, { passive: true });

      var root = document.getElementById("cart-root");
      if (root) {
        root.addEventListener("click", handleListClick);
      }
    }

    var pricing = getPricing();
    if (pricing && typeof pricing.load === "function") {
      pricing.load().then(afterPricing).catch(function (err) {
        console.error(err);
        afterPricing();
      });
      return;
    }
    afterPricing();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
