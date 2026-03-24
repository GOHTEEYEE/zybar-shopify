/**
 * Admin auth - email + admin code only (no password, no Supabase Auth).
 * Code is validated against Supabase admin_codes table; you set ADMIN_CODE in config only if not using DB.
 * By default, login is stored in sessionStorage so refresh keeps you logged in until you close the tab or sign out.
 * Set window.ADMIN_REQUIRE_LOGIN_EVERY_TIME = true in admin/config.js to require the admin code on every page load/refresh.
 */
(function () {
  'use strict';

  if (window.ZYBAR_MY_TEST) {
    window.adminAuth = {
      ready: Promise.resolve(true),
      configReady: true,
      user: { email: 'test@zybar.my' },
      isAdmin: true,
      unauthorized: false,
      error: '',
      showLogin: false,
      signOut: function () { window.location.reload(); }
    };
    return;
  }

  var SUPABASE_URL = window.ADMIN_SUPABASE_URL;
  var SUPABASE_ANON_KEY = window.ADMIN_SUPABASE_ANON_KEY;

  var STORAGE_KEY = 'adminCodeVerified';
  var STORAGE_EMAIL = 'adminEmail';

  var requireLoginEveryTime = !!(window.ADMIN_REQUIRE_LOGIN_EVERY_TIME);

  var authState = {
    _user: null,
    _isAdmin: false,
    showLogin: true
  };

  function checkAdmin() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return Promise.resolve(false);
    }
    if (requireLoginEveryTime && typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(STORAGE_EMAIL);
    }
    var verified = typeof sessionStorage !== 'undefined' && sessionStorage.getItem(STORAGE_KEY);
    var email = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(STORAGE_EMAIL) : null;
    if (verified) {
      authState._user = email ? { email: email } : { email: '' };
      authState._isAdmin = true;
      authState.showLogin = false;
      return Promise.resolve(true);
    }
    authState._user = null;
    authState._isAdmin = false;
    authState.showLogin = true;
    return Promise.resolve(true);
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
    signOut: function () {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(STORAGE_KEY);
        sessionStorage.removeItem(STORAGE_EMAIL);
      }
      window.location.reload();
    }
  };
})();
