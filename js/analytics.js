/**
 * ZYBAR Analytics — Shopify-style event-based tracking.
 * Permanent visitor_id (localStorage UUID), session_id (sessionStorage + 30min timeout).
 */
(function () {
  'use strict';

  var SUPABASE_URL = window.ZYBAR_ANALYTICS_URL || '';
  var SUPABASE_ANON_KEY = window.ZYBAR_ANALYTICS_ANON_KEY || '';
  var SESSION_TIMEOUT_MS = 30 * 60 * 1000;

  var STORAGE = {
    visitorId: 'zybar_visitor_id',
    visitorFirstSeen: 'zybar_visitor_first_seen',
    cartId: 'zybar_cart_analytics_id',
    country: 'zybar_geo_country',
    sessionDedup: 'zybar_session_dedup'
  };

  var SESSION_KEYS = {
    sessionId: 'zybar_session_id',
    lastActivity: 'zybar_session_activity',
    isNew: 'zybar_session_is_new'
  };

  var recentDedupCache = {};
  var contextCache = null;
  var sessionStarted = false;

  function enabled() {
    return !!(SUPABASE_URL && SUPABASE_ANON_KEY);
  }

  function getApiBase() {
    var cfg = window.ZYBAR_STRIPE_CONFIG || {};
    if (cfg.apiBaseUrl) return cfg.apiBaseUrl;
    try {
      return window.location && window.location.origin ? window.location.origin : '';
    } catch (e) {
      return '';
    }
  }

  function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    var hex = '0123456789abcdef';
    var s = '';
    for (var i = 0; i < 36; i++) {
      if (i === 8 || i === 13 || i === 18 || i === 23) s += '-';
      else if (i === 14) s += '4';
      else if (i === 19) s += hex[(Math.random() * 4) | 8];
      else s += hex[(Math.random() * 16) | 0];
    }
    return s;
  }

  function storageGet(store, key) {
    try { return store.getItem(key); } catch (e) { return null; }
  }

  function storageSet(store, key, value) {
    try { store.setItem(key, value); } catch (e) {}
  }

  function getVisitorId() {
    var existing = storageGet(localStorage, STORAGE.visitorId);
    var isFirstVisit = !existing;
    var id = existing;
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      id = generateUUID();
      storageSet(localStorage, STORAGE.visitorId, id);
      if (isFirstVisit) {
        storageSet(localStorage, STORAGE.visitorFirstSeen, new Date().toISOString());
      }
    }
    return id;
  }

  function isNewVisitor() {
    var firstSeen = storageGet(localStorage, STORAGE.visitorFirstSeen);
    if (!firstSeen) return true;
    var seenMs = Date.parse(firstSeen);
    return !Number.isFinite(seenMs) || (Date.now() - seenMs < 60000);
  }

  function parseUtm() {
    try {
      var params = new URLSearchParams(window.location.search || '');
      return {
        utm_source: params.get('utm_source') || null,
        utm_medium: params.get('utm_medium') || null,
        utm_campaign: params.get('utm_campaign') || null,
        utm_term: params.get('utm_term') || null,
        utm_content: params.get('utm_content') || null
      };
    } catch (e) {
      return { utm_source: null, utm_medium: null, utm_campaign: null, utm_term: null, utm_content: null };
    }
  }

  function getBrowser() {
    var ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    if (/Edg\//i.test(ua)) return 'edge';
    if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) return 'chrome';
    if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return 'safari';
    if (/Firefox\//i.test(ua)) return 'firefox';
    return 'other';
  }

  function getDeviceType() {
    var ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    if (/tablet|ipad|playbook|silk/i.test(ua)) return 'tablet';
    if (/mobile|iphone|ipod|android.*mobile|blackberry/i.test(ua)) return 'mobile';
    return 'desktop';
  }

  function classifyTrafficSource(referrer, utm) {
    utm = utm || {};
    var source = (utm.utm_source || '').toLowerCase();
    var medium = (utm.utm_medium || '').toLowerCase();

    if (source) {
      if (source.indexOf('google') !== -1) return 'google';
      if (source.indexOf('facebook') !== -1 || source === 'fb') return 'facebook';
      if (source.indexOf('instagram') !== -1 || source === 'ig') return 'instagram';
      if (source.indexOf('tiktok') !== -1) return 'tiktok';
      if (source.indexOf('youtube') !== -1 || source === 'yt') return 'youtube';
      if (medium === 'email') return 'email';
      return source;
    }

    if (!referrer) return 'direct';
    try {
      var host = new URL(referrer).hostname.toLowerCase();
      if (host.indexOf('google.') !== -1) return 'google';
      if (host.indexOf('facebook.') !== -1 || host.indexOf('fb.') !== -1) return 'facebook';
      if (host.indexOf('instagram.') !== -1) return 'instagram';
      if (host.indexOf('tiktok.') !== -1) return 'tiktok';
      if (host.indexOf('youtube.') !== -1 || host.indexOf('youtu.be') !== -1) return 'youtube';
      if (host.indexOf(window.location.hostname) !== -1) return 'direct';
      return 'referral';
    } catch (e) {
      return referrer ? 'referral' : 'direct';
    }
  }

  function getReferrer() {
    try { return document.referrer || ''; } catch (e) { return ''; }
  }

  function getPageUrl() {
    try { return (location.pathname || '/') + (location.search || ''); } catch (e) { return '/'; }
  }

  function getCountry() {
    return storageGet(localStorage, STORAGE.country) || null;
  }

  function setCountry(code) {
    if (!code) return;
    storageSet(localStorage, STORAGE.country, String(code).toUpperCase().slice(0, 2));
  }

  function getTrackingContext() {
    if (contextCache) return contextCache;
    var utm = parseUtm();
    var referrer = getReferrer();
    contextCache = {
      utm_source: utm.utm_source,
      utm_medium: utm.utm_medium,
      utm_campaign: utm.utm_campaign,
      utm_term: utm.utm_term,
      utm_content: utm.utm_content,
      referrer: referrer,
      traffic_source: classifyTrafficSource(referrer, utm),
      browser: getBrowser(),
      device_type: getDeviceType(),
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      page_url: getPageUrl(),
      country: getCountry()
    };
    return contextCache;
  }

  function touchSession() {
    storageSet(sessionStorage, SESSION_KEYS.lastActivity, String(Date.now()));
  }

  function isSessionExpired() {
    var last = parseInt(storageGet(sessionStorage, SESSION_KEYS.lastActivity) || '0', 10);
    if (!last) return true;
    return Date.now() - last > SESSION_TIMEOUT_MS;
  }

  function getOrCreateSessionId() {
    var sid = storageGet(sessionStorage, SESSION_KEYS.sessionId);
    var expired = isSessionExpired();

    if (!sid || !/^[0-9a-f-]{36}$/i.test(sid) || expired) {
      sid = generateUUID();
      storageSet(sessionStorage, SESSION_KEYS.sessionId, sid);
      storageSet(sessionStorage, SESSION_KEYS.isNew, '1');
      sessionStarted = false;
    }
    touchSession();
    return sid;
  }

  function isNewSession() {
    return storageGet(sessionStorage, SESSION_KEYS.isNew) === '1';
  }

  function markSessionRegistered() {
    storageSet(sessionStorage, SESSION_KEYS.isNew, '0');
    sessionStarted = true;
  }

  function getCartId() {
    var id = storageGet(localStorage, STORAGE.cartId);
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      id = generateUUID();
      storageSet(localStorage, STORAGE.cartId, id);
    }
    return id;
  }

  function setCartId(id) {
    if (id) storageSet(localStorage, STORAGE.cartId, id);
  }

  function getProductIdFromPath() {
    try {
      var m = (location.pathname || '').match(/\/products\/([^/]+)/);
      return m ? m[1] : null;
    } catch (e) { return null; }
  }

  function getCollectionIdFromPath() {
    try {
      var path = location.pathname || '';
      if (path.indexOf('/luneva') === 0) return 'luneva';
      var m = path.match(/\/collections\/([^/]+)/);
      return m ? m[1] : null;
    } catch (e) { return null; }
  }

  function buildDedupKey(eventType, extra) {
    return eventType + ':' + getOrCreateSessionId() + ':' + (extra || '');
  }

  function shouldSkipDedup(dedupKey) {
    if (!dedupKey) return false;
    if (recentDedupCache[dedupKey]) return true;
    recentDedupCache[dedupKey] = 1;
    try {
      var stored = JSON.parse(storageGet(sessionStorage, STORAGE.sessionDedup) || '{}');
      if (stored[dedupKey]) return true;
      stored[dedupKey] = 1;
      storageSet(sessionStorage, STORAGE.sessionDedup, JSON.stringify(stored));
    } catch (e) {}
    return false;
  }

  function postApi(path, body) {
    var apiBase = getApiBase();
    if (!apiBase) return Promise.resolve(null);
    return fetch(apiBase + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true
    }).catch(function () { return null; });
  }

  function buildEventPayload(eventType, data) {
    data = data || {};
    var ctx = getTrackingContext();
    var qty = Number(data.quantity);
    return {
      event_type: eventType,
      page_url: data.page_url || ctx.page_url,
      product_id: data.product_id || data.productId || null,
      collection_id: data.collection_id || data.collectionId || null,
      visitor_id: getVisitorId(),
      session_id: getOrCreateSessionId(),
      cart_id: data.cart_id || getCartId(),
      customer_id: data.customer_id || null,
      referrer: ctx.referrer,
      user_agent: ctx.user_agent,
      device_type: ctx.device_type,
      browser: ctx.browser,
      traffic_source: ctx.traffic_source,
      utm_source: ctx.utm_source,
      utm_medium: ctx.utm_medium,
      utm_campaign: ctx.utm_campaign,
      utm_term: ctx.utm_term,
      utm_content: ctx.utm_content,
      country: data.country || ctx.country,
      quantity: Number.isFinite(qty) && qty > 0 ? Math.round(qty) : 1,
      metadata: data.metadata || {},
      dedup_key: data.dedup_key || null,
      created_at: new Date().toISOString()
    };
  }

  function insertEvent(payload) {
    if (!enabled()) return;
    if (payload.dedup_key && shouldSkipDedup(payload.dedup_key)) return;
    postApi('/api/analytics/track', { type: 'event', event: payload });
  }

  function track(eventType, data) {
    if (!enabled()) return;
    touchSession();
    var payload = buildEventPayload(eventType, data || {});

    if (!payload.dedup_key) {
      var dedupExtra = payload.product_id || payload.collection_id || payload.page_url || '';
      if (eventType === 'page_view' || eventType === 'product_view' || eventType === 'collection_view') {
        payload.dedup_key = buildDedupKey(eventType, dedupExtra);
      }
    }

    insertEvent(payload);
    updateSessionActivity();
  }

  function identifyVisitor() {
    if (!enabled()) return;
    var ctx = getTrackingContext();
    postApi('/api/analytics/identify', {
      visitor_id: getVisitorId(),
      session_id: getOrCreateSessionId(),
      is_new_visitor: isNewVisitor() || isNewSession(),
      first_seen_at: storageGet(localStorage, STORAGE.visitorFirstSeen),
      country: ctx.country,
      device_type: ctx.device_type,
      browser: ctx.browser,
      traffic_source: ctx.traffic_source,
      referrer: ctx.referrer,
      utm_source: ctx.utm_source,
      utm_medium: ctx.utm_medium,
      utm_campaign: ctx.utm_campaign,
      landing_page: ctx.page_url
    });
    if (isNewVisitor()) {
      storageSet(localStorage, STORAGE.visitorFirstSeen, new Date().toISOString());
    }
  }

  function startSession() {
    if (!enabled() || sessionStarted) return;
    var ctx = getTrackingContext();
    var sessionId = getOrCreateSessionId();
    postApi('/api/analytics/track', {
      type: 'session_start',
      session: {
        id: sessionId,
        visitor_id: getVisitorId(),
        is_new_visitor: isNewVisitor() || isNewSession(),
        referrer: ctx.referrer,
        user_agent: ctx.user_agent,
        device_type: ctx.device_type,
        browser: ctx.browser,
        traffic_source: ctx.traffic_source,
        utm_source: ctx.utm_source,
        utm_medium: ctx.utm_medium,
        utm_campaign: ctx.utm_campaign,
        landing_page: ctx.page_url,
        country: ctx.country
      }
    });
    markSessionRegistered();
    identifyVisitor();
  }

  function updateSessionActivity() {
    if (!enabled()) return;
    postApi('/api/analytics/track', {
      type: 'session_ping',
      session_id: getOrCreateSessionId(),
      visitor_id: getVisitorId()
    });
  }

  function usdToCents(amount) {
    var n = Number(amount);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  }

  function syncCartSession(options) {
    if (!enabled()) return;
    options = options || {};
    var items = Array.isArray(options.items) ? options.items : [];
    var cartValue = Number(options.cartValueUSD);
    var cartValueCents = Number.isFinite(cartValue)
      ? usdToCents(cartValue)
      : items.reduce(function (sum, item) {
          return sum + usdToCents((Number(item.unitPriceUSD) || 0) * (Number(item.quantity) || 1));
        }, 0);

    postApi('/api/analytics/track', {
      type: 'cart_sync',
      cart: {
        id: getCartId(),
        visitor_id: getVisitorId(),
        session_id: getOrCreateSessionId(),
        customer_id: options.customer_id || null,
        status: options.status || 'active',
        currency: 'USD',
        cart_value_cents: cartValueCents,
        item_count: items.reduce(function (s, i) { return s + (Number(i.quantity) || 0); }, 0),
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
    });
  }

  // ---- Shopify-style event helpers ----

  function fireMetaPixel(method, args) {
    try {
      var mp = window.ZYBAR && window.ZYBAR.MetaPixel;
      if (mp && typeof mp[method] === 'function') {
        mp[method].apply(mp, args || []);
      }
    } catch (e) {}
  }

  function trackPageView() {
    track('page_view', { page_url: getPageUrl() });
  }

  function trackProductView(productId) {
    if (!productId) return;
    track('product_view', { product_id: productId });
    fireMetaPixel('trackViewContent', [productId]);
  }

  function trackCollectionView(collectionId) {
    if (!collectionId) collectionId = getCollectionIdFromPath() || 'all';
    track('collection_view', { collection_id: collectionId });
  }

  function trackSearch(query) {
    track('search', { metadata: { query: String(query || '').slice(0, 200) } });
  }

  function trackAddToCart(item, cartItems) {
    var productId = (item && (item.slug || item.product_id)) || getProductIdFromPath() || '';
    var qty = Number(item && item.quantity) || 1;
    track('add_to_cart', {
      product_id: productId,
      collection_id: (item && (item.collection_id || item.collection)) || getCollectionIdFromPath() || null,
      quantity: qty,
      metadata: {
        product_name: item && item.name,
        size: item && item.size,
        power_type: item && item.powerType,
        led_color: item && (item.ledColor || item.led_color),
        unit_price_usd: item && item.unitPriceUSD,
        collection: (item && item.collection) || getCollectionIdFromPath() || null
      }
    });
    syncCartSession({ items: cartItems || [], status: 'active' });
    fireMetaPixel('trackAddToCart', [item]);
  }

  function trackRemoveFromCart(item, cartItems, cartValueUSD) {
    var productId = (item && (item.slug || item.product_id)) || '';
    track('remove_from_cart', {
      product_id: productId,
      quantity: Number(item && item.quantity) || 1,
      metadata: {
        product_name: item && item.name,
        size: item && item.size,
        power_type: item && item.powerType
      }
    });
    syncCartSession({ items: cartItems || [], cartValueUSD: cartValueUSD, status: 'active' });
  }

  function trackViewCart(items, cartValueUSD) {
    track('view_cart', { metadata: { item_count: (items || []).length } });
    syncCartSession({ items: items || [], cartValueUSD: cartValueUSD, status: 'active' });
  }

  function trackBeginCheckout(items, cartValueUSD) {
    track('begin_checkout', {
      collection_id: getCollectionIdFromPath() || null,
      metadata: {
        item_count: (items || []).length,
        collection: getCollectionIdFromPath() || null,
        cart_value_usd: cartValueUSD
      }
    });
    syncCartSession({ items: items || [], cartValueUSD: cartValueUSD, status: 'checkout_started' });
    fireMetaPixel('trackInitiateCheckout', [items, cartValueUSD]);
  }

  function trackShippingSelected(method, cartValueUSD) {
    track('shipping_selected', { metadata: { shipping_method: method, cart_value_usd: cartValueUSD } });
    syncCartSession({ status: 'checkout_started', shippingMethod: method, cartValueUSD: cartValueUSD });
  }

  function trackPaymentStarted(method, cartValueUSD) {
    track('payment_started', { metadata: { payment_method: method || 'card', cart_value_usd: cartValueUSD } });
    syncCartSession({ status: 'checkout_started', paymentMethod: method || 'card', cartValueUSD: cartValueUSD });
    fireMetaPixel('trackAddPaymentInfo', [cartValueUSD]);
  }

  function trackPurchase(orderData) {
    orderData = orderData || {};
    track('purchase', {
      metadata: orderData,
      dedup_key: orderData.session_id ? 'purchase:' + orderData.session_id : buildDedupKey('purchase', orderData.order_id || '')
    });
    track('checkout_completed', {
      metadata: Object.assign({ source: 'storefront' }, orderData)
    });
    postApi('/api/analytics/track', {
      type: 'purchase',
      cart_id: getCartId(),
      visitor_id: getVisitorId(),
      session_id: getOrCreateSessionId(),
      stripe_session_id: orderData.session_id || null,
      amount_cents: orderData.amount_cents || null
    });
    fireMetaPixel('trackPurchase', [orderData]);
  }

  function trackWishlistAdd(productId) {
    track('wishlist_add', { product_id: productId || getProductIdFromPath() });
  }

  function trackWishlistRemove(productId) {
    track('wishlist_remove', { product_id: productId || getProductIdFromPath() });
  }

  function trackContactSubmit(meta) {
    track('contact_submit', { metadata: meta || {} });
  }

  function trackNewsletterSignup(email) {
    track('newsletter_signup', { metadata: { email_domain: String(email || '').split('@')[1] || '' } });
  }

  function trackPopupViewed(meta) {
    track('popup_viewed', { metadata: meta || {} });
  }

  function trackPopupClosed(meta) {
    track('popup_closed', { metadata: meta || {} });
  }

  function trackEmailSubmitted(meta) {
    track('email_submitted', { metadata: meta || {} });
  }

  function trackDiscountClaimed(meta) {
    track('discount_claimed', { metadata: meta || {} });
  }

  function trackVariantSelection(productId, variant) {
    track('variant_selected', { product_id: productId, metadata: variant || {} });
  }

  function trackPaymentFailed(reason) {
    track('payment_failed', { metadata: { reason: reason || 'unknown' } });
  }

  function getAttribution() {
    return {
      visitorId: getVisitorId(),
      sessionId: getOrCreateSessionId(),
      cartId: getCartId(),
      country: getCountry(),
      deviceType: getDeviceType(),
      browser: (function () {
        try {
          var ua = navigator.userAgent || '';
          if (/edg/i.test(ua)) return 'edge';
          if (/chrome|crios/i.test(ua)) return 'chrome';
          if (/safari/i.test(ua) && !/chrome|crios|android/i.test(ua)) return 'safari';
          if (/firefox|fxios/i.test(ua)) return 'firefox';
          return 'other';
        } catch (e) {
          return null;
        }
      })(),
      trafficSource: (function () {
        try {
          var params = new URLSearchParams(window.location.search || '');
          var utm = params.get('utm_source');
          if (utm) return utm;
          var ref = document.referrer || '';
          if (!ref) return 'direct';
          var host = '';
          try {
            host = new URL(ref).hostname || '';
          } catch (e2) {
            host = ref;
          }
          return host || 'referral';
        } catch (e) {
          return null;
        }
      })(),
      referrer: typeof document !== 'undefined' ? document.referrer || null : null
    };
  }

  function initPageEvents() {
    var path = getPageUrl();
    var productId = getProductIdFromPath();
    var collectionId = getCollectionIdFromPath();

    trackPageView();
    if (productId) trackProductView(productId);
    if (collectionId || path.indexOf('/luneva') === 0) {
      trackCollectionView(collectionId || 'luneva');
    } else if (path.indexOf('/collections/') === 0) {
      trackCollectionView(collectionId || 'all');
    }
    if (path.indexOf('/cart') === 0) {
      track('view_cart', { dedup_key: buildDedupKey('view_cart', path) });
    }
  }

  function init() {
    if (!enabled()) {
      console.warn('[Analytics] Tracking disabled — missing Supabase config.');
      return;
    }

    getVisitorId();
    getOrCreateSessionId();
    startSession();
    initPageEvents();

    setInterval(function () {
      touchSession();
      updateSessionActivity();
    }, 45000);

    document.addEventListener('click', function (e) {
      var wishBtn = e.target && e.target.closest && e.target.closest('[data-wishlist-toggle], .pdp-wishlist-btn, [aria-label="Add to wishlist"]');
      if (wishBtn) {
        var pid = wishBtn.getAttribute('data-product-id') || getProductIdFromPath();
        if (wishBtn.classList.contains('is-active')) trackWishlistRemove(pid);
        else trackWishlistAdd(pid);
      }
    }, true);
  }

  window.ZYBAR = window.ZYBAR || {};
  window.ZYBAR.Analytics = {
    enabled: enabled,
    getVisitorId: getVisitorId,
    getSessionId: getOrCreateSessionId,
    getCartId: getCartId,
    setCartId: setCartId,
    setCountry: setCountry,
    getAttribution: getAttribution,
    track: track,
    trackPageView: trackPageView,
    trackProductView: trackProductView,
    trackCollectionView: trackCollectionView,
    trackSearch: trackSearch,
    trackAddToCart: trackAddToCart,
    trackRemoveFromCart: trackRemoveFromCart,
    trackViewCart: trackViewCart,
    trackBeginCheckout: trackBeginCheckout,
    trackShippingSelected: trackShippingSelected,
    trackPaymentStarted: trackPaymentStarted,
    trackPurchase: trackPurchase,
    trackPaymentSuccess: trackPurchase,
    trackPaymentFailed: trackPaymentFailed,
    trackWishlistAdd: trackWishlistAdd,
    trackWishlistRemove: trackWishlistRemove,
    trackContactSubmit: trackContactSubmit,
    trackNewsletterSignup: trackNewsletterSignup,
    trackPopupViewed: trackPopupViewed,
    trackPopupClosed: trackPopupClosed,
    trackEmailSubmitted: trackEmailSubmitted,
    trackDiscountClaimed: trackDiscountClaimed,
    trackVariantSelection: trackVariantSelection,
    syncCartSession: syncCartSession
  };

  if (typeof document !== 'undefined' && document.readyState === 'complete') {
    setTimeout(init, 0);
  } else if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', init);
  }
})();
