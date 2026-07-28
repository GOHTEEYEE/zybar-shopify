/**
 * LUNEVA admin auth — separate session storage from ZYBAR /admin.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'luneva.admin.verified';
  var STORAGE_EMAIL = 'luneva.admin.email';
  var STORAGE_TOKEN = 'luneva.admin.token';
  var nativeFetch = window.fetch.bind(window);

  function clearSession() {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(STORAGE_EMAIL);
      sessionStorage.removeItem(STORAGE_TOKEN);
    } catch (_) {}
  }

  function storeSession(body) {
    if (!body || !body.token) return false;
    try {
      sessionStorage.setItem(STORAGE_KEY, '1');
      sessionStorage.setItem(STORAGE_EMAIL, body.email || '');
      sessionStorage.setItem(STORAGE_TOKEN, body.token);
    } catch (_) {
      return false;
    }
    return true;
  }

  function getToken() {
    try {
      return sessionStorage.getItem(STORAGE_TOKEN) || '';
    } catch (_) {
      return '';
    }
  }

  function getEmail() {
    try {
      return sessionStorage.getItem(STORAGE_EMAIL) || '';
    } catch (_) {
      return '';
    }
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

  function validateSession() {
    var token = getToken();
    if (!token) return Promise.resolve(false);
    return fetch('/api/admin/auth/session')
      .then(function (res) {
        if (!res.ok) {
          clearSession();
          return false;
        }
        return res.json().then(function () {
          return true;
        });
      })
      .catch(function () {
        clearSession();
        return false;
      });
  }

  function login(email, code) {
    return fetch('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, code: code })
    }).then(function (res) {
      return res.json().then(function (body) {
        return { ok: res.ok, body: body };
      });
    });
  }

  window.LunevaAdminAuth = {
    clearSession: clearSession,
    storeSession: storeSession,
    getToken: getToken,
    getEmail: getEmail,
    validateSession: validateSession,
    login: login,
    isSignedIn: function () {
      return !!getToken();
    }
  };
})();
