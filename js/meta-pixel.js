/**
 * Meta Pixel — PageView, ViewContent, AddToCart, InitiateCheckout, AddPaymentInfo, Purchase.
 * Loads only when ZYBAR_META_PIXEL_ID is set in meta-pixel-config.js.
 */
(function () {
  'use strict';

  var PIXEL_ID = String(window.ZYBAR_META_PIXEL_ID || '').trim();
  var PURCHASE_DEDUP_KEY = 'zybar_meta_pixel_purchases';
  var initialized = false;

  function enabled() {
    return /^\d{5,20}$/.test(PIXEL_ID);
  }

  function loadFbq() {
    if (typeof window.fbq === 'function') return;
    var n;
    window.fbq = function () {
      if (window.fbq.callMethod) {
        window.fbq.callMethod.apply(window.fbq, arguments);
      } else {
        window.fbq.queue.push(arguments);
      }
    };
    if (!window._fbq) window._fbq = window.fbq;
    window.fbq.push = window.fbq;
    window.fbq.loaded = true;
    window.fbq.version = '2.0';
    window.fbq.queue = [];
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    var first = document.getElementsByTagName('script')[0];
    if (first && first.parentNode) first.parentNode.insertBefore(script, first);
  }

  function init() {
    if (!enabled() || initialized) return;
    initialized = true;
    loadFbq();
    window.fbq('init', PIXEL_ID);
    window.fbq('track', 'PageView');
  }

  function track(eventName, params, options) {
    if (!enabled()) return;
    init();
    try {
      if (options && options.eventID) {
        window.fbq('track', eventName, params || {}, { eventID: String(options.eventID) });
      } else {
        window.fbq('track', eventName, params || {});
      }
    } catch (e) {}
  }

  function num(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function cartContents(items) {
    return (items || []).map(function (item) {
      var price = num(item.unitPriceUSD || item.unit_price_usd);
      var qty = Math.max(1, Math.round(num(item.quantity) || 1));
      return {
        id: String(item.slug || item.product_id || ''),
        quantity: qty,
        item_price: price
      };
    }).filter(function (row) { return row.id; });
  }

  function cartValue(items, fallback) {
    if (Number.isFinite(fallback) && fallback > 0) return fallback;
    return cartContents(items).reduce(function (sum, row) {
      return sum + row.item_price * row.quantity;
    }, 0);
  }

  function purchaseDeduped(sessionId) {
    if (!sessionId) return false;
    try {
      var stored = JSON.parse(window.localStorage.getItem(PURCHASE_DEDUP_KEY) || '{}');
      if (stored[sessionId]) return true;
      stored[sessionId] = 1;
      window.localStorage.setItem(PURCHASE_DEDUP_KEY, JSON.stringify(stored));
      return false;
    } catch (e) {
      return false;
    }
  }

  function trackViewContent(productId, meta) {
    meta = meta || {};
    if (!productId) return;
    track('ViewContent', {
      content_ids: [String(productId)],
      content_type: 'product',
      content_name: meta.product_name || undefined,
      value: meta.unit_price_usd != null ? num(meta.unit_price_usd) : undefined,
      currency: 'USD'
    });
  }

  function trackAddToCart(item) {
    item = item || {};
    var productId = String(item.slug || item.product_id || '');
    if (!productId) return;
    var qty = Math.max(1, Math.round(num(item.quantity) || 1));
    var price = num(item.unitPriceUSD || item.unit_price_usd);
    track('AddToCart', {
      content_ids: [productId],
      content_type: 'product',
      content_name: item.name || undefined,
      value: price * qty,
      currency: 'USD',
      contents: [{ id: productId, quantity: qty, item_price: price }]
    });
  }

  function trackInitiateCheckout(items, cartValueUSD) {
    var contents = cartContents(items);
    track('InitiateCheckout', {
      value: cartValue(items, cartValueUSD),
      currency: 'USD',
      num_items: contents.reduce(function (sum, row) { return sum + row.quantity; }, 0),
      contents: contents
    });
  }

  function trackAddPaymentInfo(cartValueUSD) {
    track('AddPaymentInfo', {
      value: num(cartValueUSD),
      currency: 'USD'
    });
  }

  function trackPurchase(orderData) {
    orderData = orderData || {};
    var sessionId = orderData.session_id || orderData.stripe_session_id || '';
    if (sessionId && purchaseDeduped(sessionId)) return;
    var value = num(orderData.amount_cents) / 100;
    track('Purchase', {
      value: value,
      currency: 'USD'
    }, sessionId ? { eventID: 'purchase:' + sessionId } : null);
  }

  window.ZYBAR = window.ZYBAR || {};
  window.ZYBAR.MetaPixel = {
    enabled: enabled,
    init: init,
    track: track,
    trackViewContent: trackViewContent,
    trackAddToCart: trackAddToCart,
    trackInitiateCheckout: trackInitiateCheckout,
    trackAddPaymentInfo: trackAddPaymentInfo,
    trackPurchase: trackPurchase
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
