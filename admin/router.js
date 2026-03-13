/**
 * Admin router - hash-based navigation; runs after auth check.
 */
(function () {
  'use strict';

  var contentEl = document.getElementById('adminContent');
  var loadingEl = document.getElementById('adminLoading');
  function bindLoginForm() {
    var form = document.getElementById('adminLoginForm');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var errEl = document.getElementById('loginError');
      var btn = form.querySelector('button[type="submit"]');
      errEl.classList.remove('visible');
      errEl.textContent = '';
      var email = document.getElementById('adminEmail') && document.getElementById('adminEmail').value.trim();
      var codeInput = document.getElementById('adminCodeInput');
      var code = codeInput ? codeInput.value.trim() : '';
      if (!email) {
        errEl.textContent = 'Enter your email.';
        errEl.classList.add('visible');
        return;
      }
      if (!code) {
        errEl.textContent = 'Enter the admin code.';
        errEl.classList.add('visible');
        return;
      }
      if (btn) { btn.disabled = true; btn.textContent = 'Signing in…'; }
      if (!window.supabase) {
        if (btn) { btn.disabled = false; btn.textContent = 'Sign in'; }
        errEl.textContent = 'Supabase client not loaded. Refresh the page and try again.';
        errEl.classList.add('visible');
        return;
      }
      window.supabase.rpc('validate_and_use_admin_code', { p_code: code, p_email: email })
        .then(function (res) {
          var ok = res.data === true;
          if (!ok) {
            if (btn) { btn.disabled = false; btn.textContent = 'Sign in'; }
            errEl.textContent = 'Invalid or already used code. Check the code or use a different one.';
            errEl.classList.add('visible');
            return;
          }
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem('adminCodeVerified', '1');
            sessionStorage.setItem('adminEmail', email);
          }
          window.location.reload();
        })
        .catch(function (err) {
          if (btn) { btn.disabled = false; btn.textContent = 'Sign in'; }
          errEl.textContent = (err && err.message) ? err.message : 'Could not validate code. Try again.';
          errEl.classList.add('visible');
        });
    });
  }

  function renderLogin(noteHtml, showSignOut) {
    if (!contentEl) return;
    var signOutHtml = showSignOut
      ? '<button type="button" id="adminSignOutBtn" class="admin-btn-secondary">Sign out</button>'
      : '';
    var projectRef = '';
    try {
      var u = window.ADMIN_SUPABASE_URL || '';
      var m = u.match(/https:\/\/([^.]+)\.supabase\.co/);
      projectRef = m ? m[1] : (u ? 'configured' : 'not set');
    } catch (e) { projectRef = '?'; }
    contentEl.innerHTML =
      '<div class="admin-login-wrap">' +
      (noteHtml ? '<p class="admin-login-note">' + noteHtml + '</p>' : '') +
      '<div class="admin-login-card" id="loginCard">' +
      '<h2>Sign in</h2>' +
      '<p class="admin-connection" id="adminConnection">Supabase project: <strong>' + projectRef + '</strong> — <span id="adminConnectionStatus">checking…</span></p>' +
      '<form id="adminLoginForm">' +
      '<div class="admin-form-group"><label for="adminEmail">Email</label><input type="email" id="adminEmail" placeholder="you@example.com" required /></div>' +
      '<div class="admin-form-group"><label for="adminCodeInput">Admin code</label><input type="password" id="adminCodeInput" placeholder="Code from Supabase admin_codes table" autocomplete="off" /></div>' +
      '<button type="submit" class="admin-btn-primary">Sign in</button>' +
      signOutHtml +
      '</form>' +
      '<p id="loginError" class="admin-login-error" role="alert"></p>' +
      '</div></div>';
    contentEl.style.display = '';
    bindLoginForm();
    var statusEl = document.getElementById('adminConnectionStatus');
    if (statusEl && window.supabase) {
      window.supabase.auth.getSession()
        .then(function () { statusEl.textContent = 'connected'; statusEl.className = 'admin-connection-ok'; })
        .catch(function () { statusEl.textContent = 'connection failed'; statusEl.className = 'admin-connection-fail'; });
    } else if (statusEl) {
      statusEl.textContent = 'Supabase client not loaded';
      statusEl.className = 'admin-connection-fail';
    }
    if (showSignOut) {
      var btn = document.getElementById('adminSignOutBtn');
      if (btn) {
        btn.addEventListener('click', function () {
          if (!window.adminAuth || !window.adminAuth.signOut) return;
          window.adminAuth.signOut().finally(function () { window.location.reload(); });
        });
      }
    }
  }

  function setPage(name) {
    if (window.adminAuth && window.adminAuth.showLogin) {
      renderLogin('', false);
      return;
    }
    var links = document.querySelectorAll('.admin-nav a[data-page]');
    links.forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('data-page') === name);
    });
    if (contentEl) contentEl.style.display = '';
    if (loadingEl) loadingEl.style.display = 'none';
    if (window['renderAdmin' + name]) {
      window['renderAdmin' + name](contentEl);
    }
  }

  function route() {
    if (window.adminAuth && window.adminAuth.showLogin) {
      renderLogin('', false);
      return;
    }
    var hash = (window.location.hash || '#dashboard').slice(1) || 'dashboard';
    setPage(hash);
  }

  window.addEventListener('hashchange', route);
  document.querySelectorAll('.admin-nav a[data-page]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      if (window.adminAuth && window.adminAuth.showLogin) {
        e.preventDefault();
        renderLogin('', false);
      }
    });
  });

  window.adminAuth.ready.then(function (ok) {
    if (!ok) {
      var configReady = window.adminAuth && window.adminAuth.configReady;
      var unauthorized = window.adminAuth && window.adminAuth.unauthorized;
      var noteHtml = '';
      if (!configReady) {
        noteHtml = 'Set <code>ADMIN_SUPABASE_URL</code> and <code>ADMIN_SUPABASE_ANON_KEY</code> in <code>admin/config.js</code> (or admin/index.html), then sign in.';
      }
      renderLogin(noteHtml, !!unauthorized);
      if (loadingEl) loadingEl.style.display = 'none';
      return;
    }
    if (window.adminAuth.showLogin) {
      renderLogin('', false);
      if (loadingEl) loadingEl.style.display = 'none';
      return;
    }
    route();
  });
})();
