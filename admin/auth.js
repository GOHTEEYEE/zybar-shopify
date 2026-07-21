/**
 * Admin auth — server-validated code + signed, short-lived bearer session.
 */
(function () {
  'use strict';

  var SUPABASE_URL = window.ADMIN_SUPABASE_URL;
  var SUPABASE_ANON_KEY = window.ADMIN_SUPABASE_ANON_KEY;
  var STORAGE_KEY = 'adminCodeVerified';
  var STORAGE_EMAIL = 'adminEmail';
  var STORAGE_TOKEN = 'adminSessionToken';
  var requireLoginEveryTime = !!(window.ADMIN_REQUIRE_LOGIN_EVERY_TIME);
  var authState = {
    _user: null,
    _isAdmin: false,
    showLogin: true
  };
  var nativeFetch = window.fetch.bind(window);

  function clearSession() {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(STORAGE_EMAIL);
      sessionStorage.removeItem(STORAGE_TOKEN);
    }
    authState._user = null;
    authState._isAdmin = false;
    authState.showLogin = true;
  }

  function storeSession(body) {
    if (!body || !body.token) return false;
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(STORAGE_KEY, '1');
      sessionStorage.setItem(STORAGE_EMAIL, body.email || '');
      sessionStorage.setItem(STORAGE_TOKEN, body.token);
    }
    authState._user = { email: body.email || '' };
    authState._isAdmin = true;
    authState.showLogin = false;
    return true;
  }

  function getToken() {
    return typeof sessionStorage !== 'undefined'
      ? sessionStorage.getItem(STORAGE_TOKEN) || ''
      : '';
  }

  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : input && input.url ? input.url : '';
    var options = Object.assign({}, init || {});
    if (/^\/api\/admin(?:\/|-)/.test(url)) {
      var headers = new Headers(options.headers || (input && input.headers) || {});
      var token = getToken();
      if (token && !headers.has('Authorization')) {
        headers.set('Authorization', 'Bearer ' + token);
      }
      options.headers = headers;
    }
    return nativeFetch(input, options).then(function (response) {
      if (
        response.status === 401 &&
        /^\/api\/admin(?:\/|-)/.test(url) &&
        url.indexOf('/api/admin/auth/login') !== 0
      ) {
        clearSession();
      }
      return response;
    });
  };

  function validateStoredSession() {
    if (requireLoginEveryTime && typeof sessionStorage !== 'undefined') {
      clearSession();
    }
    var token = getToken();
    if (!token) return Promise.resolve(false);
    return window
      .fetch('/api/admin/auth/session')
      .then(function (response) {
        if (!response.ok) {
          clearSession();
          return false;
        }
        return response.json().then(function (body) {
          authState._user = { email: body.email || '' };
          authState._isAdmin = true;
          authState.showLogin = false;
          return true;
        });
      })
      .catch(function () {
        clearSession();
        return false;
      });
  }

  function createTestSession() {
    return nativeFetch('/api/admin/auth/test-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    })
      .then(function (response) {
        if (!response.ok) return false;
        return response.json().then(storeSession);
      })
      .catch(function () {
        return false;
      });
  }

  function checkAdmin() {
    if (window.ZYBAR_MY_TEST) {
      return validateStoredSession().then(function (valid) {
        return valid ? true : createTestSession();
      });
    }
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return Promise.resolve(false);
    return validateStoredSession();
  }

  var authReady = checkAdmin();

  window.adminAuth = {
    get ready() { return authReady; },
    configReady: !!SUPABASE_URL && !!SUPABASE_ANON_KEY,
    get user() { return authState._user || null; },
    get isAdmin() { return !!authState._isAdmin; },
    get unauthorized() { return false; },
    get error() { return ''; },
    get showLogin() { return authState.showLogin; },
    set showLogin(v) { authState.showLogin = v; },
    storeSession: storeSession,
    signOut: function () {
      clearSession();
      window.location.reload();
    }
  };
})();
