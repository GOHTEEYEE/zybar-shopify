/**
 * ZYBAR Analytics — visitor sessions, funnel events, cart sessions, conversion tracking.
 * Exposes window.ZYBAR.Analytics for cart/checkout hooks.
 */
(function () {
  'use strict';

  var SUPABASE_URL = window.ZYBAR_ANALYTICS_URL || '';
  var SUPABASE_ANON_KEY = window.ZYBAR_ANALYTICS_ANON_KEY || '';
  var SESSION_TIMEOUT_MS = 30 * 60 * 1000;
  function getApiBase() {
    var cfg = window.ZYBAR_STRIPE_CONFIG || {};
    if (cfg.apiBaseUrl) return cfg.apiBaseUrl;
    try {
      return window.location && window.location.origin ? window.location.origin : '';
    } catch (e) {
      return '';
    }
  }

  var STORAGE = {
    visitorId: 'zybar_visitor_id',
    sessionId: 'zybar_session_id',
    cartId: 'zybar_cart_analytics_id',
    lastActivity: 'zybar_last_activity',
    recentDedup: 'zybar_analytics_dedup'
  };

  var recentDedupCache = {};

  function enabled() {
    return !!(SUPABASE_URL && SUPABASE_ANON_KEY);
  }

  function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    var hex = '0123456789abcdef';
    var s = '';
    for (var i = 0; i < 36; i++) {
      if (i === 8 || i === 13 || i === 18 || i === 23) s += '-';
      else if (i === 14) s += '4';
      else if (i === 19) s += hex[(Math.random() * 4) | 0 + 8];
      else s += hex[(Math.random() * 16) | 0];
    }
    return s;
  }

  function getVisitorId() {
    try {
      var id = localStorage.getItem(STORAGE.visitorId);
      if (!id) {
        id = 'v_' + Math.random().toString(36).slice(2) + '_' + Date.now().toString(36);
        localStorage.setItem(STORAGE.visitorId, id);
      }
      return id;
    } catch (e) {
      return 'v_anon_' + Date.now();
    }
  }

  function isSessionExpired() {
    try {
      var last = localStorage.getItem(STORAGE.lastActivity);
      if (!last) return true;
      return Date.now() - parseInt(last, 10) > SESSION_TIMEOUT_MS;
    } catch (e) {
      return true;
    }
  }

  function touchSession() {
    try {
      localStorage.setItem(STORAGE.lastActivity, String(Date.now()));
    } catch (e) {}
  }

  function getOrCreateSessionId() {
    if (isSessionExpired()) {
      try {
        localStorage.removeItem(STORAGE.sessionId);
      } catch (e) {}
    }
    touchSession();
    try {
      var sid = localStorage.getItem(STORAGE.sessionId);
      if (!sid || !/^[0-9a-f-]{36}$/i.test(sid)) {
        sid = generateUUID();
        localStorage.setItem(STORAGE.sessionId, sid);
      }
      return sid;
    } catch (e) {
      return generateUUID();
    }
  }

  function getCartId() {
    try {
      var id = localStorage.getItem(STORAGE.cartId);
      if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
        id = generateUUID();
        localStorage.setItem(STORAGE.cartId, id);
      }
      return id;
    } catch (e) {
      return generateUUID();
    }
  }

  function setCartId(id) {
    if (!id) return;
    try {
      localStorage.setItem(STORAGE.cartId, id);
    } catch (e) {}
  }

  function getDeviceType() {
    var ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    if (/tablet|ipad|playbook|silk/i.test(ua)) return 'tablet';
    if (/mobile|iphone|ipod|android.*mobile|blackberry/i.test(ua)) return 'mobile';
    return 'desktop';
  }

  function getReferrer() {
    try {
      return document.referrer || '';
    } catch (e) {
      return '';
    }
  }

  function getPageUrl() {
    try {
      return (location.pathname || '/') + (location.search || '');
    } catch (e) {
      return '/';
    }
  }

  function getProductIdFromPath() {
    try {
      var match = (location.pathname || '').match(/\/products\/([^/]+)/);
      return match ? match[1] : null;
    } catch (e) {
      return null;
    }
  }

  function getCountry() {
    try {
      return localStorage.getItem('zybar_geo_country') || null;
    } catch (e) {
      return null;
    }
  }

  function buildDedupKey(eventType, extra) {
    extra = extra || '';
    return eventType + ':' + getOrCreateSessionId() + ':' + extra;
  }

  function shouldSkipDedup(dedupKey) {
    if (!dedupKey) return false;
    if (recentDedupCache[dedupKey]) return true;
    recentDedupCache[dedupKey] = Date.now();
    return false;
  }

  function supabaseHeaders() {
    return {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
      Prefer: 'return=minimal'
    };
  }

  function postApi(path, body) {
    var apiBase = getApiBase();
    if (!apiBase) return Promise.resolve();
    return fetch(apiBase + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true
    }).catch(function () {});
  }

  function toRestEventPayload(payload) {
    return {
      event_type: payload.event_type,
      page_url: payload.page_url || null,
      product_id: payload.product_id || null,
      visitor_id: payload.visitor_id,
      session_id: payload.session_id || null,
      referrer: payload.referrer || null,
      user_agent: payload.user_agent || null,
      device_type: payload.device_type || null,
      country: payload.country || null,
      created_at: payload.created_at || new Date().toISOString()
    };
  }

  function insertEventDirect(payload) {
    fetch(SUPABASE_URL + '/rest/v1/events', {
      method: 'POST',
      headers: Object.assign({}, supabaseHeaders(), {
        Prefer: 'return=minimal'
      }),
      body: JSON.stringify(toRestEventPayload(payload)),
      keepalive: true
    }).catch(function () {});
  }

  function insertEvent(payload) {
    if (!enabled()) return;
    if (payload.dedup_key && shouldSkipDedup(payload.dedup_key)) return;

    var apiBase = getApiBase();
    if (apiBase) {
      postApi('/api/analytics/track', { type: 'event', event: payload }).catch(function () {
        insertEventDirect(payload);
      });
      return;
    }

    insertEventDirect(payload);
  }

  function buildEventPayload(eventType, data) {
    data = data || {};
    var sessionId = getOrCreateSessionId();
    var visitorId = getVisitorId();
    return {
      event_type: eventType,
      page_url: data.page_url || getPageUrl(),
      product_id: data.product_id || data.productId || null,
      visitor_id: visitorId,
      session_id: sessionId,
      cart_id: data.cart_id || getCartId(),
      customer_id: data.customer_id || null,
      referrer: getReferrer(),
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      device_type: getDeviceType(),
      country: data.country || getCountry(),
      metadata: data.metadata || {},
      dedup_key: data.dedup_key || null,
      created_at: new Date().toISOString()
    };
  }

  function track(eventType, data) {
    if (!enabled()) return;
    touchSession();
    var payload = buildEventPayload(eventType, data || {});
    if (!payload.dedup_key) {
      var dedupExtra = payload.product_id || payload.page_url || '';
      if (
        eventType === 'page_view' ||
        eventType === 'checkout_started' ||
        eventType === 'view_cart'
      ) {
        payload.dedup_key = buildDedupKey(eventType, dedupExtra);
      }
    }
    insertEvent(payload);
    updateSessionActivity(getOrCreateSessionId());
  }

  function usdToCents(amount) {
    var n = Number(amount);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100);
  }

  function syncCartSession(options) {
    if (!enabled()) return;
    options = options || {};
    var items = Array.isArray(options.items) ? options.items : [];
    var cartValue = Number(options.cartValueUSD);
    var cartValueCents = Number.isFinite(cartValue)
      ? usdToCents(cartValue)
      : items.reduce(function (sum, item) {
          var qty = Number(item.quantity) || 1;
          var unit = Number(item.unitPriceUSD) || 0;
          return sum + usdToCents(unit * qty);
        }, 0);

    var payload = {
      type: 'cart_sync',
      cart: {
        id: getCartId(),
        visitor_id: getVisitorId(),
        session_id: getOrCreateSessionId(),
        customer_id: options.customer_id || null,
        status: options.status || 'active',
        currency: 'USD',
        cart_value_cents: cartValueCents,
        item_count: items.reduce(function (s, i) {
          return s + (Number(i.quantity) || 0);
        }, 0),
        country: getCountry(),
        device_type: getDeviceType(),
        referrer: getReferrer(),
        last_shipping_method: options.shippingMethod || null,
        last_payment_method: options.paymentMethod || null,
        items: items.map(function (item) {
          return {
            product_id: item.slug || item.product_id || '',
            product_name: item.name || '',
            variant: [item.size, item.powerType].filter(Boolean).join(' / '),
            size: item.size || null,
            led_color: item.ledColor || item.led_color || null,
            power_type: item.powerType || item.power_type || null,
            quantity: Number(item.quantity) || 1,
            unit_price_cents: usdToCents(item.unitPriceUSD || item.unit_price_usd)
          };
        })
      }
    };

    var apiBase = getApiBase();
    if (apiBase) {
      postApi('/api/analytics/track', payload);
      return;
    }
  }

  function ensureSessionRow(sessionId) {
    if (!enabled()) return;
    var visitorId = getVisitorId();
    var now = new Date().toISOString();
    fetch(SUPABASE_URL + '/rest/v1/sessions', {
      method: 'POST',
      headers: Object.assign({}, supabaseHeaders(), {
        Prefer: 'return=minimal,resolution=merge-duplicates'
      }),
      body: JSON.stringify({
        id: sessionId,
        visitor_id: visitorId,
        started_at: now,
        last_activity_at: now,
        referrer: getReferrer(),
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        device_type: getDeviceType(),
        country: getCountry()
      }),
      keepalive: true
    }).catch(function () {});
  }

  function updateSessionActivity(sessionId) {
    if (!enabled() || !sessionId) return;
    fetch(SUPABASE_URL + '/rest/v1/sessions?id=eq.' + encodeURIComponent(sessionId), {
      method: 'PATCH',
      headers: supabaseHeaders(),
      body: JSON.stringify({ last_activity_at: new Date().toISOString() }),
      keepalive: true
    }).catch(function () {});
  }

  function sendPageView() {
    if (!enabled()) return;
    var sessionId = getOrCreateSessionId();
    var visitorId = getVisitorId();
    var pageUrl = getPageUrl();

    fetch(SUPABASE_URL + '/rest/v1/page_views', {
      method: 'POST',
      headers: supabaseHeaders(),
      body: JSON.stringify({
        session_id: sessionId,
        visitor_id: visitorId,
        page_url: pageUrl,
        referrer: getReferrer(),
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        device_type: getDeviceType(),
        country: getCountry(),
        created_at: new Date().toISOString()
      }),
      keepalive: true
    }).catch(function () {});

    track('page_view', { page_url: pageUrl });
  }

  function trackProductView(productId) {
    if (!productId) return;
    track('product_view', { product_id: productId });
  }

  function trackVariantSelection(productId, variant) {
    track('variant_selected', {
      product_id: productId,
      metadata: variant || {}
    });
  }

  function trackAddToCart(item, cartItems) {
    var productId = (item && (item.slug || item.product_id)) || getProductIdFromPath() || '';
    track('add_to_cart', {
      product_id: productId,
      metadata: {
        product_name: item && item.name,
        size: item && item.size,
        power_type: item && item.powerType,
        led_color: item && (item.ledColor || item.led_color),
        quantity: item && item.quantity,
        unit_price_usd: item && item.unitPriceUSD
      }
    });
    syncCartSession({ items: cartItems || [], status: 'active' });
  }

  function trackRemoveFromCart(item, cartItems, cartValueUSD) {
    var productId = (item && (item.slug || item.product_id)) || '';
    track('remove_from_cart', {
      product_id: productId,
      metadata: {
        product_name: item && item.name,
        size: item && item.size,
        power_type: item && item.powerType,
        quantity: item && item.quantity
      }
    });
    syncCartSession({
      items: cartItems || [],
      cartValueUSD: cartValueUSD,
      status: 'active'
    });
  }

  function trackViewCart(items, cartValueUSD) {
    track('view_cart', { metadata: { item_count: (items || []).length } });
    syncCartSession({ items: items || [], cartValueUSD: cartValueUSD, status: 'active' });
  }

  function trackBeginCheckout(items, cartValueUSD) {
    track('begin_checkout', { metadata: { item_count: (items || []).length } });
    syncCartSession({ items: items || [], cartValueUSD: cartValueUSD, status: 'checkout_started' });
  }

  function trackCheckoutStarted(items, cartValueUSD) {
    track('checkout_started', { metadata: { item_count: (items || []).length } });
    syncCartSession({ items: items || [], cartValueUSD: cartValueUSD, status: 'checkout_started' });
  }

  function trackShippingSelected(method, cartValueUSD) {
    track('shipping_selected', {
      metadata: { shipping_method: method, cart_value_usd: cartValueUSD }
    });
    syncCartSession({ status: 'checkout_started', shippingMethod: method, cartValueUSD: cartValueUSD });
  }

  function trackPaymentStarted(method, cartValueUSD) {
    track('payment_started', {
      metadata: { payment_method: method || 'card', cart_value_usd: cartValueUSD }
    });
    syncCartSession({
      status: 'checkout_started',
      paymentMethod: method || 'card',
      cartValueUSD: cartValueUSD
    });
  }

  function trackPaymentSuccess(orderData) {
    orderData = orderData || {};
    track('payment_success', {
      metadata: orderData,
      dedup_key: orderData.session_id
        ? 'payment_success:' + orderData.session_id
        : buildDedupKey('payment_success', orderData.order_id || '')
    });
    postApi('/api/analytics/track', {
      type: 'purchase',
      cart_id: getCartId(),
      visitor_id: getVisitorId(),
      session_id: getOrCreateSessionId(),
      stripe_session_id: orderData.session_id || null,
      amount_cents: orderData.amount_cents || null
    });
  }

  function trackPaymentFailed(reason) {
    track('payment_failed', { metadata: { reason: reason || 'unknown' } });
  }

  function trackCheckoutAbandoned() {
    track('checkout_abandoned', { dedup_key: buildDedupKey('checkout_abandoned', getCartId()) });
    syncCartSession({ status: 'abandoned' });
  }

  function getAttribution() {
    return {
      visitorId: getVisitorId(),
      sessionId: getOrCreateSessionId(),
      cartId: getCartId()
    };
  }

  function init() {
    if (!enabled()) {
      console.warn('[Analytics] SUPABASE_URL or SUPABASE_ANON_KEY not set. Tracking disabled.');
      return;
    }

    var sessionId = getOrCreateSessionId();
    ensureSessionRow(sessionId);
    sendPageView();

    var productId = getProductIdFromPath();
    if (productId) trackProductView(productId);

    setInterval(function () {
      updateSessionActivity(getOrCreateSessionId());
    }, 45 * 1000);

    window.addEventListener('beforeunload', function () {
      var path = getPageUrl();
      if (path.indexOf('/checkout') === 0) {
        trackCheckoutAbandoned();
      }
    });
  }

  window.ZYBAR = window.ZYBAR || {};
  window.ZYBAR.Analytics = {
    enabled: enabled,
    getVisitorId: getVisitorId,
    getSessionId: getOrCreateSessionId,
    getCartId: getCartId,
    setCartId: setCartId,
    getAttribution: getAttribution,
    track: track,
    trackProductView: trackProductView,
    trackVariantSelection: trackVariantSelection,
    trackAddToCart: trackAddToCart,
    trackRemoveFromCart: trackRemoveFromCart,
    trackViewCart: trackViewCart,
    trackBeginCheckout: trackBeginCheckout,
    trackCheckoutStarted: trackCheckoutStarted,
    trackShippingSelected: trackShippingSelected,
    trackPaymentStarted: trackPaymentStarted,
    trackPaymentSuccess: trackPaymentSuccess,
    trackPaymentFailed: trackPaymentFailed,
    trackCheckoutAbandoned: trackCheckoutAbandoned,
    syncCartSession: syncCartSession
  };

  if (typeof document !== 'undefined' && document.readyState === 'complete') {
    setTimeout(init, 0);
  } else if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', init);
  }
})();
