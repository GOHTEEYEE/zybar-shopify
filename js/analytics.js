/**
 * ZYBAR Analytics - Frontend tracking script
 * Load asynchronously to avoid blocking page load.
 * Sends events to Supabase (anon key). Configure SUPABASE_URL and SUPABASE_ANON_KEY below.
 */
(function () {
  'use strict';

  // ---------- Configuration (replace with your Supabase project values) ----------
  var SUPABASE_URL = window.ZYBAR_ANALYTICS_URL || '';
  var SUPABASE_ANON_KEY = window.ZYBAR_ANALYTICS_ANON_KEY || '';
  var SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn('[Analytics] SUPABASE_URL or SUPABASE_ANON_KEY not set. Tracking disabled.');
    return;
  }

  var STORAGE_KEYS = {
    visitorId: 'zybar_visitor_id',
    sessionId: 'zybar_session_id',
    lastActivity: 'zybar_last_activity'
  };

  function getVisitorId() {
    try {
      var id = localStorage.getItem(STORAGE_KEYS.visitorId);
      if (!id) {
        id = 'v_' + Math.random().toString(36).slice(2) + '_' + Date.now().toString(36);
        localStorage.setItem(STORAGE_KEYS.visitorId, id);
      }
      return id;
    } catch (e) {
      return 'v_anon_' + Date.now();
    }
  }

  function isSessionExpired() {
    try {
      var last = localStorage.getItem(STORAGE_KEYS.lastActivity);
      if (!last) return true;
      return Date.now() - parseInt(last, 10) > SESSION_TIMEOUT_MS;
    } catch (e) {
      return true;
    }
  }

  function touchSession() {
    try {
      localStorage.setItem(STORAGE_KEYS.lastActivity, String(Date.now()));
    } catch (e) {}
  }

  /** Generate a valid UUID v4 so Supabase sessions.id (UUID) accepts it */
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

  function getOrCreateSessionId() {
    if (isSessionExpired()) {
      try {
        localStorage.removeItem(STORAGE_KEYS.sessionId);
      } catch (e) {}
    }
    touchSession();
    try {
      var sid = localStorage.getItem(STORAGE_KEYS.sessionId);
      if (!sid || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sid)) {
        sid = generateUUID();
        localStorage.setItem(STORAGE_KEYS.sessionId, sid);
      }
      return sid;
    } catch (e) {
      return generateUUID();
    }
  }

  function getDeviceType() {
    var ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    if (/tablet|ipad|playbook|silk/i.test(ua)) return 'tablet';
    if (/mobile|iphone|ipod|android.*mobile|blackberry/i.test(ua)) return 'mobile';
    return 'desktop';
  }

  function getReferrer() {
    try {
      return typeof document !== 'undefined' && document.referrer ? document.referrer : '';
    } catch (e) {
      return '';
    }
  }

  function getPageUrl() {
    try {
      return typeof location !== 'undefined' ? (location.pathname || '/') + (location.search || '') : '';
    } catch (e) {
      return '/';
    }
  }

  function getProductIdFromPath() {
    try {
      var path = typeof location !== 'undefined' ? location.pathname || '' : '';
      var match = path.match(/\/products\/([^/]+)/);
      return match ? match[1] : null;
    } catch (e) {
      return null;
    }
  }

  function sendToSupabase(payload) {
    var sessionId = getOrCreateSessionId();
    var visitorId = getVisitorId();
    var body = {
      visitor_id: visitorId,
      session_id: sessionId,
      page_url: getPageUrl(),
      referrer: getReferrer(),
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      device_type: getDeviceType(),
      created_at: new Date().toISOString()
    };
    Object.assign(body, payload);

    fetch(SUPABASE_URL + '/rest/v1/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(body),
      keepalive: true
    }).catch(function () {});
  }

  function sendPageView() {
    var sessionId = getOrCreateSessionId();
    var visitorId = getVisitorId();
    var pageUrl = getPageUrl();
    var referrer = getReferrer();
    var ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    var deviceType = getDeviceType();

    updateSessionActivity(sessionId);

    fetch(SUPABASE_URL + '/rest/v1/page_views', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        session_id: sessionId,
        visitor_id: visitorId,
        page_url: pageUrl,
        referrer: referrer,
        user_agent: ua,
        device_type: deviceType,
        created_at: new Date().toISOString()
      }),
      keepalive: true
    }).catch(function () {});

    sendToSupabase({
      event_type: 'page_view',
      page_url: pageUrl
    });
  }

  function trackProductView(productId) {
    if (!productId) return;
    touchSession();
    sendToSupabase({
      event_type: 'product_view',
      page_url: getPageUrl(),
      product_id: productId
    });
  }

  function trackAddToCart(productId) {
    touchSession();
    sendToSupabase({
      event_type: 'add_to_cart',
      page_url: getPageUrl(),
      product_id: productId || getProductIdFromPath() || ''
    });
  }

  function ensureSessionRow(sessionId) {
    var visitorId = getVisitorId();
    var now = new Date().toISOString();
    fetch(SUPABASE_URL + '/rest/v1/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        'Prefer': 'return=minimal,resolution=merge-duplicates'
      },
      body: JSON.stringify({
        id: sessionId,
        visitor_id: visitorId,
        started_at: now,
        last_activity_at: now,
        referrer: getReferrer(),
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        device_type: getDeviceType()
      }),
      keepalive: true
    }).then(function (r) {
      if (!r.ok && r.status !== 409) return;
      updateSessionActivity(sessionId);
    }).catch(function () {});
  }

  /** Update session last_activity_at so dashboard "live visitors" (last 5 min) works */
  function updateSessionActivity(sessionId) {
    if (!sessionId) return;
    fetch(SUPABASE_URL + '/rest/v1/sessions?id=eq.' + encodeURIComponent(sessionId), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ last_activity_at: new Date().toISOString() }),
      keepalive: true
    }).catch(function () {});
  }

  // ---------- Run after DOM ready, non-blocking ----------
  function init() {
    var sessionId = getOrCreateSessionId();
    ensureSessionRow(sessionId);
    sendPageView();

    var productId = getProductIdFromPath();
    if (productId) trackProductView(productId);

    setInterval(function () {
      var sid = getOrCreateSessionId();
      updateSessionActivity(sid);
    }, 45 * 1000);

    document.addEventListener('click', function (e) {
      var target = e.target && (e.target.closest ? e.target.closest('[data-analytics-add-to-cart]') : null) || (e.target.getAttribute && e.target.getAttribute('data-analytics-add-to-cart') !== null ? e.target : null);
      if (target) {
        var pid = (target.getAttribute && target.getAttribute('data-product-id')) || getProductIdFromPath();
        trackAddToCart(pid);
      }
    }, true);
  }

  if (typeof document !== 'undefined' && document.readyState === 'complete') {
    setTimeout(init, 0);
  } else if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', init);
  }
})();
