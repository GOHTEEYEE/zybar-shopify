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
      window.fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, code: code })
      })
        .then(function (response) {
          return response.json().then(function (body) {
            return { ok: response.ok, body: body };
          });
        })
        .then(function (result) {
          if (!result.ok || !window.adminAuth.storeSession(result.body)) {
            if (btn) { btn.disabled = false; btn.textContent = 'Sign in'; }
            errEl.textContent =
              (result.body && result.body.error) ||
              'Invalid or already used code. Check the code or use a different one.';
            errEl.classList.add('visible');
            return;
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

  function initGlobalSearch() {
    var topbar = document.getElementById('adminTopbar');
    var input = document.getElementById('adminGlobalSearch');
    var results = document.getElementById('adminGlobalSearchResults');
    if (!topbar || !input || !results || input._bound) return;
    input._bound = true;
    topbar.hidden = false;

    var timer = null;
    function hide() {
      results.hidden = true;
      results.innerHTML = '';
    }

    input.addEventListener('input', function () {
      clearTimeout(timer);
      var q = input.value.trim().toLowerCase();
      if (q.length < 2) {
        hide();
        return;
      }
      timer = setTimeout(function () {
        runSearch(q);
      }, 220);
    });
    input.addEventListener('blur', function () {
      setTimeout(hide, 180);
    });

    function runSearch(q) {
      var sb = window.supabase;
      if (!sb) {
        results.innerHTML = '<div class="admin-search-empty">Connect Supabase to search</div>';
        results.hidden = false;
        return;
      }
      results.innerHTML = '<div class="admin-search-empty">Searching…</div>';
      results.hidden = false;

      Promise.all([
        sb
          .from('orders')
          .select('id,stripe_session_id,customer_name,customer_email,product_slug,created_at')
          .or(
            'customer_name.ilike.%' +
              q +
              '%,customer_email.ilike.%' +
              q +
              '%,stripe_session_id.ilike.%' +
              q +
              '%,product_slug.ilike.%' +
              q +
              '%'
          )
          .limit(8),
        sb
          .from('products')
          .select('id,name,slug,status')
          .or('name.ilike.%' + q + '%,slug.ilike.%' + q + '%')
          .limit(8)
          .then(function (res) {
            return res;
          })
          .catch(function () {
            return { data: [] };
          })
      ]).then(function (res) {
        var orders = (res[0] && res[0].data) || [];
        var products = (res[1] && res[1].data) || [];
        var customerKeys = {};
        var customerItems = [];
        orders.forEach(function (o) {
          var key = (o.customer_email || o.customer_name || '').toLowerCase();
          if (!key || customerKeys[key]) return;
          customerKeys[key] = true;
          customerItems.push(o);
        });

        var html = '';
        if (orders.length) {
          html += '<div class="admin-search-group"><div class="admin-search-group-title">Orders</div>';
          orders.forEach(function (o) {
            html +=
              '<a href="#orders/' +
              o.id +
              '">' +
              escapeHtml(o.customer_name || o.customer_email || o.stripe_session_id || 'Order') +
              '<span>' +
              escapeHtml(o.customer_email || '') +
              '</span></a>';
          });
          html += '</div>';
        }
        if (customerItems.length) {
          html += '<div class="admin-search-group"><div class="admin-search-group-title">Customers</div>';
          customerItems.forEach(function (o) {
            var key = encodeURIComponent((o.customer_email || o.customer_name || '').toLowerCase());
            html +=
              '<a href="#customers/' +
              key +
              '">' +
              escapeHtml(o.customer_name || o.customer_email || 'Customer') +
              '<span>' +
              escapeHtml(o.customer_email || '') +
              '</span></a>';
          });
          html += '</div>';
        }
        if (products.length) {
          html += '<div class="admin-search-group"><div class="admin-search-group-title">Products</div>';
          products.forEach(function (p) {
            html +=
              '<a href="#products">' +
              escapeHtml(p.name || p.slug || 'Product') +
              '<span>' +
              escapeHtml(p.slug || '') +
              '</span></a>';
          });
          html += '</div>';
        }
        if (!html) html = '<div class="admin-search-empty">No matches</div>';
        results.innerHTML = html;
        results.hidden = false;
      });
    }

    function escapeHtml(v) {
      return String(v == null ? '' : v)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }
  }

  function setPage(name) {
    if (window.adminAuth && window.adminAuth.showLogin) {
      var topbarLogin = document.getElementById('adminTopbar');
      if (topbarLogin) topbarLogin.hidden = true;
      renderLogin('', false);
      return;
    }
    var links = document.querySelectorAll('.admin-nav a[data-page]');
    links.forEach(function (a) {
      var href = a.getAttribute('href') || '';
      var currentHash = (window.location.hash || '#marketing/journeys').split('?')[0];
      var isMarketing = name === 'marketing' && href.indexOf('#marketing/') === 0;
      var hrefSection = href.replace('#marketing/', '').split('/')[0];
      var currentSection = currentHash.replace('#marketing/', '').split('/')[0];
      if (
        currentSection === 'email' ||
        currentSection === 'workflows' ||
        currentSection === 'settings' ||
        currentSection === 'leads'
      ) {
        if (currentSection === 'leads') currentSection = 'email-leads';
        else currentSection = 'journeys';
      }
      var matchesMarketingSection =
        isMarketing &&
        (href === currentHash ||
          hrefSection === currentSection ||
          (hrefSection === 'journeys' && currentHash.indexOf('#marketing/journeys') === 0) ||
          (hrefSection === 'templates' && currentHash.indexOf('#marketing/templates') === 0) ||
          (hrefSection === 'email-leads' && currentHash.indexOf('#marketing/email-leads') === 0) ||
          (hrefSection === 'campaigns' && currentHash.indexOf('#marketing/campaigns') === 0));
      a.classList.toggle(
        'active',
        (a.getAttribute('data-page') === name && !isMarketing) || matchesMarketingSection
      );
    });
    if (contentEl) contentEl.style.display = '';
    if (loadingEl) loadingEl.style.display = 'none';
    initGlobalSearch();
    if (window['renderAdmin' + name]) {
      window['renderAdmin' + name](contentEl);
    } else {
      contentEl.innerHTML = '<p class="admin-error">Page not found.</p>';
    }
  }

  function route() {
    if (window.adminAuth && window.adminAuth.showLogin) {
      renderLogin('', false);
      return;
    }
    var hash = (window.location.hash || '#dashboard').slice(1) || 'dashboard';
    var page = hash.split('/')[0] || 'dashboard';
    setPage(page);
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
