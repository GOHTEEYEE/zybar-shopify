(function () {
  'use strict';

  var content = document.getElementById('lvAdminContent');
  var loading = document.getElementById('lvAdminLoading');
  var signOutBtn = document.getElementById('lvAdminSignOut');
  var rangeKey = 'today';
  var chart = null;
  var cache = {};
  var MYT_TZ = 'Asia/Kuala_Lumpur';
  var RANGE_OPTIONS = [
    { key: 'today', label: 'Today' },
    { key: 'yesterday', label: 'Yesterday' },
    { key: '7', label: '7 days' },
    { key: '30', label: '30 days' }
  ];
  var visitorState = {
    country: '',
    traffic: '',
    search: '',
    stage: 'all',
    offset: 0,
    limit: 50
  };
  var adsState = {
    level: 'campaign'
  };
  var livePollTimer = null;
  var LIVE_POLL_MS = 20000;
  var TRAFFIC_SOURCES = [
    'Direct',
    'Facebook',
    'Instagram',
    'Google',
    'TikTok',
    'YouTube',
    'Referral',
    'Unknown'
  ];

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function moneyCents(cents) {
    return 'US$' + ((Number(cents) || 0) / 100).toFixed(2);
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString();
    } catch (_) {
      return String(iso);
    }
  }

  function fmtDuration(seconds) {
    var total = Math.max(0, Number(seconds) || 0);
    if (!total) return '—';
    var hours = Math.floor(total / 3600);
    var mins = Math.floor((total % 3600) / 60);
    var secs = total % 60;
    if (hours > 0) return hours + 'h ' + mins + 'm';
    if (mins > 0) return mins + 'm ' + secs + 's';
    return secs + 's';
  }

  function slugLabel(slug) {
    return String(slug || '')
      .replace(/^luneva-/, '')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, function (c) {
        return c.toUpperCase();
      });
  }

  function inquiryTopicLabel(topic) {
    var map = {
      order_shipping: 'Order & shipping',
      product: 'Product question',
      gift: 'Gift help',
      assembly: 'Assembly / DIY',
      other: 'Other'
    };
    return map[String(topic || '').toLowerCase()] || topic || '—';
  }

  function inquiryKitLabel(kit) {
    if (!kit) return '—';
    return slugLabel(kit);
  }

  function setLoading(on) {
    if (loading) loading.hidden = !on;
    if (content) content.hidden = on;
  }

  function currentTab() {
    var hash = (location.hash || '#dashboard').replace('#', '');
    if (/^visitors?\//.test(hash)) return 'visitor-detail';
    return hash.split('?')[0] || 'dashboard';
  }

  function currentVisitorId() {
    var hash = (location.hash || '').replace('#', '');
    var m = hash.match(/^visitors?\/([^/?#]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  function setActiveNav() {
    var tab = currentTab();
    var navTab = tab === 'visitor-detail' ? 'visitors' : tab;
    document.querySelectorAll('[data-tab]').forEach(function (link) {
      link.classList.toggle('is-active', link.getAttribute('data-tab') === navTab);
    });
  }

  function setMobileNavOpen(open) {
    var root = document.getElementById('lvAdmin');
    var btn = document.getElementById('lvAdminMenuBtn');
    var backdrop = document.getElementById('lvAdminBackdrop');
    if (!root) return;
    root.classList.toggle('is-nav-open', !!open);
    document.body.classList.toggle('lv-admin-nav-lock', !!open);
    if (btn) {
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    }
    if (backdrop) backdrop.hidden = !open;
  }

  function wireMobileNav() {
    var btn = document.getElementById('lvAdminMenuBtn');
    var backdrop = document.getElementById('lvAdminBackdrop');
    if (btn) {
      btn.addEventListener('click', function () {
        var root = document.getElementById('lvAdmin');
        setMobileNavOpen(!(root && root.classList.contains('is-nav-open')));
      });
    }
    if (backdrop) {
      backdrop.addEventListener('click', function () {
        setMobileNavOpen(false);
      });
    }
    document.querySelectorAll('.lv-admin__nav [data-tab]').forEach(function (link) {
      link.addEventListener('click', function () {
        setMobileNavOpen(false);
      });
    });
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setMobileNavOpen(false);
    });
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function mytParts(date) {
    var year = 0;
    var month = 0;
    var day = 0;
    new Intl.DateTimeFormat('en-CA', {
      timeZone: MYT_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
      .formatToParts(date || new Date())
      .forEach(function (part) {
        if (part.type === 'year') year = Number(part.value);
        if (part.type === 'month') month = Number(part.value);
        if (part.type === 'day') day = Number(part.value);
      });
    return { year: year, month: month, day: day };
  }

  function mytMidnightIso(year, month, day) {
    return new Date(
      year + '-' + pad2(month) + '-' + pad2(day) + 'T00:00:00+08:00'
    ).toISOString();
  }

  function addMytDays(parts, delta) {
    var mid = new Date(
      parts.year + '-' + pad2(parts.month) + '-' + pad2(parts.day) + 'T12:00:00+08:00'
    );
    mid.setDate(mid.getDate() + delta);
    return mytParts(mid);
  }

  function buildRangeParams() {
    var now = mytParts(new Date());
    var tomorrow = addMytDays(now, 1);
    var start;
    var end = mytMidnightIso(tomorrow.year, tomorrow.month, tomorrow.day);

    if (rangeKey === 'today') {
      start = mytMidnightIso(now.year, now.month, now.day);
    } else if (rangeKey === 'yesterday') {
      var yesterday = addMytDays(now, -1);
      start = mytMidnightIso(yesterday.year, yesterday.month, yesterday.day);
      end = mytMidnightIso(now.year, now.month, now.day);
    } else if (rangeKey === '7') {
      var weekStart = addMytDays(now, -6);
      start = mytMidnightIso(weekStart.year, weekStart.month, weekStart.day);
    } else {
      var monthStart = addMytDays(now, -29);
      start = mytMidnightIso(monthStart.year, monthStart.month, monthStart.day);
    }

    return { start: start, end: end };
  }

  function rangeQueryString() {
    var range = buildRangeParams();
    return (
      'start=' + encodeURIComponent(range.start) + '&end=' + encodeURIComponent(range.end)
    );
  }

  function api(path, opts) {
    var options = opts || {};
    var query = '?' + rangeQueryString();
    if (options.country) query += '&country=' + encodeURIComponent(options.country);
    if (options.traffic) query += '&traffic=' + encodeURIComponent(options.traffic);
    if (options.search) query += '&search=' + encodeURIComponent(options.search);
    if (options.stage) query += '&stage=' + encodeURIComponent(options.stage);
    if (options.offset != null) query += '&offset=' + encodeURIComponent(options.offset);
    if (options.limit != null) query += '&limit=' + encodeURIComponent(options.limit);
    var key = path + query;
    if (cache[key]) return Promise.resolve(cache[key]);
    return fetch(path + query)
      .then(function (res) {
        return res.ok ? res.json() : Promise.reject(new Error('Request failed'));
      })
      .then(function (data) {
        cache[key] = data;
        return data;
      });
  }

  function statusLabel(status) {
    var map = {
      purchased: 'Purchased',
      checkout_started: 'Checkout',
      added_to_cart: 'Added to cart',
      browsing: 'Browsing',
      visited: 'Visited'
    };
    return map[status] || status || '—';
  }

  function renderVisitorFilters() {
    var stages = [
      { key: 'all', label: 'All' },
      { key: 'add_to_cart', label: 'Add to cart' },
      { key: 'checkout', label: 'Checkout' },
      { key: 'purchase', label: 'Purchase' },
      { key: 'email', label: 'Email filled' }
    ];
    return (
      '<div class="lv-admin__toolbar">' +
      '<div class="lv-admin__stage-filters" role="group" aria-label="Visitor stage filter">' +
      stages
        .map(function (stage) {
          return (
            '<button type="button" class="lv-admin__stage-btn' +
            (visitorState.stage === stage.key ? ' is-active' : '') +
            '" data-visitor-stage="' +
            esc(stage.key) +
            '">' +
            esc(stage.label) +
            '</button>'
          );
        })
        .join('') +
      '</div>' +
      '<input type="search" class="lv-admin__input" id="lvVisitorSearch" placeholder="Search email, country, visitor…" value="' +
      esc(visitorState.search) +
      '" />' +
      '<input type="text" class="lv-admin__input lv-admin__input--short" id="lvVisitorCountry" placeholder="Country (e.g. US)" value="' +
      esc(visitorState.country) +
      '" />' +
      '<select class="lv-admin__input" id="lvVisitorTraffic"><option value="">All traffic</option>' +
      TRAFFIC_SOURCES.map(function (source) {
        return (
          '<option value="' +
          esc(source) +
          '"' +
          (visitorState.traffic === source ? ' selected' : '') +
          '>' +
          esc(source) +
          '</option>'
        );
      }).join('') +
      '</select></div>'
    );
  }

  function bindVisitorFilters(reload) {
    var searchEl = document.getElementById('lvVisitorSearch');
    var countryEl = document.getElementById('lvVisitorCountry');
    var trafficEl = document.getElementById('lvVisitorTraffic');
    var searchTimer;
    document.querySelectorAll('[data-visitor-stage]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var next = btn.getAttribute('data-visitor-stage') || 'all';
        if (visitorState.stage === next) return;
        visitorState.stage = next;
        visitorState.offset = 0;
        reload();
      });
    });
    if (searchEl) {
      searchEl.addEventListener('input', function () {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
          visitorState.search = searchEl.value.trim();
          visitorState.offset = 0;
          reload();
        }, 280);
      });
    }
    if (countryEl) {
      var countryTimer;
      countryEl.addEventListener('input', function () {
        clearTimeout(countryTimer);
        countryTimer = setTimeout(function () {
          visitorState.country = countryEl.value.trim().toUpperCase();
          visitorState.offset = 0;
          reload();
        }, 280);
      });
    }
    if (trafficEl) {
      trafficEl.addEventListener('change', function () {
        visitorState.traffic = trafficEl.value;
        visitorState.offset = 0;
        reload();
      });
    }
  }

  function renderLogin() {
    setLoading(false);
    if (content) {
      content.hidden = false;
      content.innerHTML =
        '<div class="lv-admin__login">' +
        '<h2>LUNEVA Admin</h2>' +
        '<p>Sign in with your ZYBAR admin code. This dashboard only shows LUNEVA visitors, carts, emails, and orders.</p>' +
        '<form id="lvAdminLoginForm">' +
        '<div class="lv-admin__field"><label for="lvAdminEmail">Email</label><input id="lvAdminEmail" type="email" required /></div>' +
        '<div class="lv-admin__field"><label for="lvAdminCode">Admin code</label><input id="lvAdminCode" type="password" autocomplete="off" required /></div>' +
        '<button class="lv-admin__btn" type="submit">Sign in</button>' +
        '<p class="lv-admin__error" id="lvAdminLoginError" hidden></p>' +
        '</form></div>';
      var form = document.getElementById('lvAdminLoginForm');
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var email = document.getElementById('lvAdminEmail').value.trim();
        var code = document.getElementById('lvAdminCode').value.trim();
        var err = document.getElementById('lvAdminLoginError');
        err.hidden = true;
        window.LunevaAdminAuth.login(email, code).then(function (result) {
          if (!result.ok || !window.LunevaAdminAuth.storeSession(result.body)) {
            err.textContent = (result.body && result.body.error) || 'Invalid code.';
            err.hidden = false;
            return;
          }
          boot();
        });
      });
    }
    if (signOutBtn) signOutBtn.hidden = true;
  }

  function header(title, subtitle, options) {
    var opts = options || {};
    var liveHtml = opts.showLive
      ? '<div class="lv-admin__live" id="lvAdminLiveVisitors" title="Active on LUNEVA in the last 5 minutes">' +
        '<span class="lv-admin__live-dot" aria-hidden="true"></span>' +
        '<span id="lvAdminLiveCount">—</span> live' +
        '</div>'
      : '';
    return (
      '<div class="lv-admin__header">' +
      '<div><h1>' +
      esc(title) +
      '</h1><p>' +
      esc(subtitle) +
      '</p><p class="lv-admin__range-note">Date ranges use Malaysia time (GMT+8), resetting at 12:00&nbsp;a.m.</p></div>' +
      '<div class="lv-admin__header-right">' +
      liveHtml +
      '<div class="lv-admin__filters">' +
      RANGE_OPTIONS.map(function (opt) {
        return (
          '<button type="button" data-range="' +
          esc(opt.key) +
          '" class="' +
          (rangeKey === opt.key ? 'is-active' : '') +
          '">' +
          esc(opt.label) +
          '</button>'
        );
      }).join('') +
      '</div></div></div>'
    );
  }

  function stopLivePoll() {
    if (livePollTimer) {
      clearInterval(livePollTimer);
      livePollTimer = null;
    }
  }

  function setLiveCount(n) {
    var el = document.getElementById('lvAdminLiveCount');
    if (el) el.textContent = n != null ? String(n) : '0';
  }

  function fetchLiveVisitors() {
    return api('/api/admin/luneva/realtime')
      .then(function (data) {
        var count =
          data && data.active_visitors != null ? data.active_visitors : 0;
        setLiveCount(count);
        return count;
      })
      .catch(function () {
        setLiveCount(0);
      });
  }

  function startLivePoll() {
    stopLivePoll();
    fetchLiveVisitors();
    livePollTimer = setInterval(fetchLiveVisitors, LIVE_POLL_MS);
  }

  function kpi(label, value) {
    return '<div class="lv-admin__kpi"><span>' + esc(label) + '</span><strong>' + value + '</strong></div>';
  }

  function drawChart(trends) {
    var canvas = document.getElementById('lvAdminTrendChart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (chart) chart.destroy();
    var rows = Array.isArray(trends) ? trends : [];
    chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: rows.map(function (r) {
          return r.date;
        }),
        datasets: [
          {
            label: 'Visitors',
            data: rows.map(function (r) {
              return r.visitors;
            }),
            borderColor: '#927135',
            tension: 0.3
          },
          {
            label: 'Orders',
            data: rows.map(function (r) {
              return r.orders;
            }),
            borderColor: '#1a1714',
            tension: 0.3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
      }
    });
  }

  function renderDashboard(data) {
    var o = (data && data.overview) || {};
    var orders = (data && data.recent_orders) || [];
    var products = (data && data.top_products) || [];
    content.innerHTML =
      header('Dashboard', 'LUNEVA-only metrics — not mixed with Automotive ZYBAR.', {
        showLive: true
      }) +
      '<div class="lv-admin__kpis">' +
      kpi('Visitors', esc(o.unique_visitors || 0)) +
      kpi('Page views', esc(o.page_views || 0)) +
      kpi('Add to cart', esc(o.add_to_cart || 0)) +
      kpi('Checkout started', esc(o.begin_checkout || 0)) +
      kpi('Purchases', esc(o.purchases || 0)) +
      kpi('Revenue', esc(moneyCents(o.revenue_cents))) +
      kpi('Emails collected', esc(o.emails_collected || 0)) +
      kpi('Conversion', esc((o.conversion_rate || 0) + '%')) +
      '</div>' +
      '<div class="lv-admin__grid">' +
      '<section class="lv-admin__card"><h2>Visitors &amp; orders</h2><div style="height:260px"><canvas id="lvAdminTrendChart"></canvas></div></section>' +
      '<section class="lv-admin__card"><h2>Top kits (add to cart)</h2>' +
      (products.length
        ? '<table class="lv-admin__table"><thead><tr><th>Kit</th><th>Adds</th></tr></thead><tbody>' +
          products
            .map(function (p) {
              return (
                '<tr><td>' +
                esc(slugLabel(p.product_slug)) +
                '</td><td>' +
                esc(p.add_to_cart || 0) +
                '</td></tr>'
              );
            })
            .join('') +
          '</tbody></table>'
        : '<p class="lv-admin__pill">No add-to-cart events yet.</p>') +
      '</section></div>' +
      '<section class="lv-admin__card"><h2>Recent LUNEVA orders</h2>' +
      (orders.length
        ? '<table class="lv-admin__table"><thead><tr><th>When</th><th>Customer</th><th>Email</th><th>Total</th></tr></thead><tbody>' +
          orders
            .map(function (order) {
              return (
                '<tr><td>' +
                esc(fmtDate(order.created_at)) +
                '</td><td>' +
                esc(order.customer_name || '—') +
                '</td><td>' +
                esc(order.customer_email || '—') +
                '</td><td>' +
                esc(moneyCents(order.amount_total_cents)) +
                '</td></tr>'
              );
            })
            .join('') +
          '</tbody></table>'
        : '<p class="lv-admin__pill">No LUNEVA orders in this range.</p>') +
      '</section>';
    drawChart(data.trends || []);
    bindRangeButtons();
    startLivePoll();
  }

  function renderVisitors(data) {
    var rows = (data && data.rows) || [];
    var total = (data && data.total) || rows.length;
    content.innerHTML =
      header(
        'Visitors',
        'Duration is engaged stay time (idle gaps ignored). Instant exits show as 1s. Open Journey to see pages and time spent.'
      ) +
      renderVisitorFilters() +
      '<section class="lv-admin__card"><table class="lv-admin__table"><thead><tr><th>Visitor</th><th>Email</th><th>Country</th><th>Traffic source</th><th>Status</th><th>Product</th><th>First visit</th><th>Last active</th><th>Duration</th><th>Orders</th><th>Revenue</th><th></th></tr></thead><tbody>' +
      (rows.length
        ? rows
            .map(function (row) {
              var productText = row.product_label || '—';
              if (!row.product_label && row.viewed_count > 1) {
                productText = row.viewed_count + ' products viewed';
              }
              return (
                '<tr><td><span class="lv-admin__pill">' +
                esc((row.visitor_id || '').slice(0, 8)) +
                '</span></td><td>' +
                esc(row.email || '—') +
                '</td><td>' +
                esc(row.country || '—') +
                '</td><td>' +
                esc(row.traffic_source || '—') +
                '</td><td>' +
                esc(statusLabel(row.status)) +
                '</td><td class="lv-admin__product-cell">' +
                esc(productText) +
                '</td><td>' +
                esc(fmtDate(row.first_seen_at)) +
                '</td><td>' +
                esc(fmtDate(row.last_active_at)) +
                '</td><td>' +
                esc(fmtDuration(row.duration_seconds)) +
                '</td><td>' +
                esc(row.orders || 0) +
                '</td><td>' +
                esc(moneyCents(row.revenue_cents)) +
                '</td><td><a class="lv-admin__action-btn" href="#visitors/' +
                esc(row.visitor_id) +
                '">View journey</a></td></tr>'
              );
            })
            .join('')
        : '<tr><td colspan="12">No visitors in this range.</td></tr>') +
      '</tbody></table>' +
      '<div class="lv-admin__pager">' +
      '<button type="button" class="lv-admin__pager-btn" id="lvVisitorPrev"' +
      (visitorState.offset <= 0 ? ' disabled' : '') +
      '>Previous</button>' +
      '<span>Showing ' +
      rows.length +
      ' of ' +
      total +
      '</span>' +
      '<button type="button" class="lv-admin__pager-btn" id="lvVisitorNext"' +
      (visitorState.offset + rows.length >= total || !rows.length ? ' disabled' : '') +
      '>Next</button>' +
      '</div></section>';
    bindRangeButtons();
    bindVisitorFilters(function () {
      cache = {};
      render();
    });
    var prev = document.getElementById('lvVisitorPrev');
    var next = document.getElementById('lvVisitorNext');
    if (prev) {
      prev.addEventListener('click', function () {
        visitorState.offset = Math.max(0, visitorState.offset - visitorState.limit);
        cache = {};
        render();
      });
    }
    if (next) {
      next.addEventListener('click', function () {
        visitorState.offset += visitorState.limit;
        cache = {};
        render();
      });
    }
  }

  function dlRows(pairs) {
    return pairs
      .map(function (row) {
        return (
          '<div><dt>' +
          esc(row[0]) +
          '</dt><dd>' +
          esc(row[1] == null || row[1] === '' ? '—' : row[1]) +
          '</dd></div>'
        );
      })
      .join('');
  }

  function renderVisitorDetail(data) {
    var c = (data && data.customer) || {};
    var product = (data && data.product) || {};
    var journey = (data && data.journey) || [];
    var pages = (data && data.pages) || [];
    var timeline = ((data && data.timeline) || []).slice().reverse();
    var viewed = product.viewed || [];

    var journeyHtml = journey
      .map(function (step, i, arr) {
        var done = !!step.at;
        return (
          '<div class="lv-journey-step' +
          (done ? ' is-done' : '') +
          '"><div class="lv-journey-dot"></div><div class="lv-journey-label">' +
          esc(step.label) +
          '</div><div class="lv-journey-time">' +
          esc(step.at ? fmtDate(step.at) : '—') +
          '</div></div>' +
          (i < arr.length - 1 ? '<div class="lv-journey-arrow">↓</div>' : '')
        );
      })
      .join('');

    var pagesHtml =
      pages.length
        ? pages
            .map(function (p) {
              return (
                '<tr><td>' +
                esc(p.label || pagePathFallback(p.page_url)) +
                '</td><td>' +
                esc(fmtDate(p.at)) +
                '</td><td>' +
                esc(fmtDuration(p.duration_seconds)) +
                '</td></tr>'
              );
            })
            .join('')
        : '<tr><td colspan="3">No page views recorded.</td></tr>';

    var viewedHtml =
      viewed.length
        ? viewed
            .map(function (p) {
              return (
                '<tr><td>' +
                esc(p.product_name || slugLabel(p.product_id) || '—') +
                '</td><td>' +
                esc(fmtDate(p.last_viewed_at)) +
                '</td><td>' +
                esc(fmtDuration(p.time_spent_seconds)) +
                '</td><td>' +
                esc(p.times_viewed || 0) +
                '</td></tr>'
              );
            })
            .join('')
        : '<tr><td colspan="4">No product views yet.</td></tr>';

    var timelineHtml =
      timeline.length
        ? timeline
            .map(function (ev) {
              return (
                '<li><div class="lv-timeline-time">' +
                esc(fmtDate(ev.at)) +
                '</div><div class="lv-timeline-label">' +
                esc(ev.label) +
                '</div></li>'
              );
            })
            .join('')
        : '<li class="lv-admin__muted">No events yet</li>';

    content.innerHTML =
      '<div class="lv-admin__header"><div><a class="lv-admin__back" href="#visitors">← Visitors</a><h1>Customer Journey</h1><p>Pages visited, products viewed, and time spent for this LUNEVA visitor.</p></div></div>' +
      '<div class="lv-admin__detail-grid">' +
      '<section class="lv-admin__card"><h2>Customer Information</h2>' +
      '<div class="lv-admin__status-wrap"><span class="lv-admin__status">' +
      esc((data && data.status_label) || statusLabel(data && data.status)) +
      '</span></div>' +
      (product.current
        ? '<p class="lv-admin__product-highlight">Product: <strong>' +
          esc(product.current) +
          '</strong></p>'
        : '') +
      '<dl class="lv-admin__dl">' +
      dlRows([
        ['Name', c.name],
        ['Email', c.email],
        ['Phone', c.phone],
        ['Address', c.address],
        ['City', c.city],
        ['State', c.state],
        ['Postcode', c.postcode],
        ['Country', c.country],
        ['Checkout stage', c.checkout_stage],
        ['Traffic source', c.traffic_source],
        ['UTM source', c.utm_source],
        ['UTM campaign', c.utm_campaign],
        ['Device', c.device],
        ['Browser', c.browser],
        ['OS', c.os],
        ['First visit', fmtDate(c.first_visit)],
        ['Last visit', fmtDate(c.last_visit)],
        ['Sessions', c.session_count],
        ['Engaged duration', fmtDuration(c.duration_seconds)]
      ]) +
      '</dl></section>' +
      '<section class="lv-admin__card"><h2>Customer Journey</h2><div class="lv-journey">' +
      journeyHtml +
      '</div></section>' +
      '<section class="lv-admin__card lv-admin__card--wide"><h2>Pages &amp; time spent</h2>' +
      '<table class="lv-admin__table"><thead><tr><th>Page</th><th>Visited</th><th>Time on page</th></tr></thead><tbody>' +
      pagesHtml +
      '</tbody></table></section>' +
      '<section class="lv-admin__card lv-admin__card--wide"><h2>Viewed products</h2>' +
      '<table class="lv-admin__table"><thead><tr><th>Product</th><th>Last viewed</th><th>Time spent</th><th>Views</th></tr></thead><tbody>' +
      viewedHtml +
      '</tbody></table></section>' +
      '<section class="lv-admin__card lv-admin__card--wide"><h2>Activity timeline</h2><ul class="lv-timeline">' +
      timelineHtml +
      '</ul></section></div>';
  }

  function pagePathFallback(url) {
    return url || 'Page';
  }

  function renderCountries(data) {
    var rows = (data && data.countries) || [];
    content.innerHTML =
      header('Countries', 'Where your LUNEVA visitors and customers are coming from.') +
      '<section class="lv-admin__card"><table class="lv-admin__table"><thead><tr><th>Country</th><th>Visitors</th><th>Customers</th><th>Orders</th><th>Revenue</th><th>Conversion</th><th>AOV</th></tr></thead><tbody>' +
      (rows.length
        ? rows
            .map(function (row) {
              return (
                '<tr><td>' +
                esc(row.country || '—') +
                '</td><td>' +
                esc(row.visitors || 0) +
                '</td><td>' +
                esc(row.customers || 0) +
                '</td><td>' +
                esc(row.orders || 0) +
                '</td><td>' +
                esc(moneyCents(row.revenue_cents)) +
                '</td><td>' +
                esc((row.conversion_rate || 0) + '%') +
                '</td><td>' +
                esc(moneyCents(row.aov_cents)) +
                '</td></tr>'
              );
            })
            .join('')
        : '<tr><td colspan="7">No country data yet.</td></tr>') +
      '</tbody></table></section>';
    bindRangeButtons();
  }

  function renderTraffic(data) {
    var rows = (data && data.sources) || [];
    content.innerHTML =
      header('Traffic sources', 'How visitors discovered LUNEVA.') +
      '<section class="lv-admin__card"><table class="lv-admin__table"><thead><tr><th>Source</th><th>Visitors</th><th>Add to cart</th><th>Checkout</th><th>Purchases</th><th>Revenue</th></tr></thead><tbody>' +
      (rows.length
        ? rows
            .map(function (row) {
              return (
                '<tr><td>' +
                esc(row.label || '—') +
                '</td><td>' +
                esc(row.visitors || 0) +
                '</td><td>' +
                esc(row.add_to_cart || 0) +
                '</td><td>' +
                esc(row.checkout || 0) +
                '</td><td>' +
                esc(row.purchase || 0) +
                '</td><td>' +
                esc(moneyCents(row.revenue_cents)) +
                '</td></tr>'
              );
            })
            .join('')
        : '<tr><td colspan="6">No traffic data yet.</td></tr>') +
      '</tbody></table></section>';
    bindRangeButtons();
  }

  function renderOrders(data) {
    var orders = (data && data.orders) || [];
    content.innerHTML =
      header('Orders', 'Paid LUNEVA kit orders only.') +
      '<section class="lv-admin__card"><table class="lv-admin__table"><thead><tr><th>When</th><th>Name</th><th>Email</th><th>Phone</th><th>Country</th><th>Total</th><th>Status</th></tr></thead><tbody>' +
      (orders.length
        ? orders
            .map(function (order) {
              return (
                '<tr><td>' +
                esc(fmtDate(order.created_at)) +
                '</td><td>' +
                esc(order.customer_name || '—') +
                '</td><td>' +
                esc(order.customer_email || '—') +
                '</td><td>' +
                esc(order.customer_phone || '—') +
                '</td><td>' +
                esc(order.country || '—') +
                '</td><td>' +
                esc(moneyCents(order.amount_total_cents)) +
                '</td><td>' +
                esc(order.fulfillment_status || order.status || '—') +
                '</td></tr>'
              );
            })
            .join('')
        : '<tr><td colspan="7">No orders in this range.</td></tr>') +
      '</tbody></table></section>';
    bindRangeButtons();
  }

  function customerSourceLabel(row) {
    if ((row.orders || 0) > 0 || row.source === 'purchase' || row.status === 'purchased') {
      return 'Purchased';
    }
    if (row.source === 'checkout_draft' || row.status === 'details_filled') {
      return 'Checkout details (unpaid)';
    }
    if (row.source === 'checkout_email' || row.source === 'luneva_checkout') {
      return 'Checkout email';
    }
    if (
      row.status === 'email_marketing' ||
      String(row.source || '').indexOf('luneva_popup') === 0
    ) {
      var intent = String(row.source || '').split(':')[1] || '';
      if (intent === 'gift') return 'Welcome popup · Gift';
      if (intent === 'diy') return 'Welcome popup · DIY';
      if (intent === 'other') return 'Welcome popup · Other';
      return 'Welcome popup';
    }
    return 'Email lead';
  }

  function renderCustomers(data) {
    var customers = (data && data.customers) || [];
    content.innerHTML =
      header(
        'Emails & customers',
        'Welcome popup emails, checkout leads, and completed orders in the selected period.'
      ) +
      '<p class="lv-admin__hint"><a href="#send">Send an email to these leads →</a></p>' +
      '<section class="lv-admin__card"><table class="lv-admin__table"><thead><tr><th>Email</th><th>Name</th><th>Source</th><th>Orders</th><th>Revenue</th><th>Last activity</th></tr></thead><tbody>' +
      (customers.length
        ? customers
            .map(function (c) {
              return (
                '<tr><td>' +
                esc(c.email) +
                '</td><td>' +
                esc(c.name || '—') +
                '</td><td>' +
                esc(customerSourceLabel(c)) +
                '</td><td>' +
                esc(c.orders || 0) +
                '</td><td>' +
                esc(moneyCents(c.revenue_cents)) +
                '</td><td>' +
                esc(fmtDate(c.last_order_at || c.last_seen_at)) +
                '</td></tr>'
              );
            })
            .join('')
        : '<tr><td colspan="6">No emails or customers in this range.</td></tr>') +
      '</tbody></table></section>';
    bindRangeButtons();
  }

  function authFetch(path, options) {
    return fetch(path, options || {}).then(function (res) {
      return res.json().then(function (body) {
        return { ok: res.ok, status: res.status, body: body };
      });
    });
  }

  function renderSendEmail(data) {
    var state = {
      step: 1,
      audience: '',
      template_key: '',
      audiences: (data && data.audiences) || [],
      templates: (data && data.templates) || [],
      preview: null,
      recipient_count: 0
    };

    function audienceLabel(key) {
      for (var i = 0; i < state.audiences.length; i++) {
        if (state.audiences[i].key === key) return state.audiences[i].label;
      }
      return key;
    }

    function paint() {
      var body = '';
      if (state.step === 1) {
        body =
          '<div class="lv-admin__field"><label for="lvCampAud">1. Who to email</label><select id="lvCampAud"><option value="">Select audience…</option>' +
          state.audiences
            .map(function (a) {
              return (
                '<option value="' +
                esc(a.key) +
                '"' +
                (a.key === state.audience ? ' selected' : '') +
                '>' +
                esc(a.label) +
                ' (' +
                a.count +
                ')</option>'
              );
            })
            .join('') +
          '</select></div>';
      } else if (state.step === 2) {
        body =
          '<div class="lv-admin__field"><label for="lvCampTpl">2. Email template</label><select id="lvCampTpl"><option value="">Select template…</option>' +
          state.templates
            .map(function (t) {
              return (
                '<option value="' +
                esc(t.key) +
                '"' +
                (t.key === state.template_key ? ' selected' : '') +
                '>' +
                esc(t.name) +
                '</option>'
              );
            })
            .join('') +
          '</select></div>' +
          '<p class="lv-admin__muted">LUNEVA welcome, cart, and purchase templates only — never ZYBAR car emails.</p>';
      } else if (state.step === 3) {
        body =
          '<p class="lv-admin__muted">3. Preview — ' +
          esc(audienceLabel(state.audience)) +
          ' · ' +
          esc(state.recipient_count) +
          ' recipients · ' +
          esc(state.template_key) +
          '</p>' +
          (state.preview
            ? '<div class="lv-admin__preview-subject">' +
              esc(state.preview.subject) +
              '</div><iframe class="lv-admin__preview-frame" title="Email preview" srcdoc="' +
              esc(state.preview.html) +
              '"></iframe>'
            : '');
      } else {
        body =
          '<p>4. Send now to <strong>' +
          esc(String(state.recipient_count)) +
          '</strong> LUNEVA leads.</p>' +
          '<p class="lv-admin__muted">One-time broadcast. Does not change automated journey progress.</p>' +
          '<button type="button" class="lv-admin__btn" id="lvCampSend">Send Now</button>';
      }

      content.innerHTML =
        header(
          'Send email',
          'One-time LUNEVA broadcast to welcome popup and checkout leads.'
        ) +
        '<section class="lv-admin__card lv-admin__send">' +
        '<div class="lv-admin__steps">' +
        [1, 2, 3, 4]
          .map(function (n) {
            return (
              '<span class="lv-admin__step' +
              (state.step === n ? ' is-active' : '') +
              (state.step > n ? ' is-done' : '') +
              '">' +
              n +
              '</span>'
            );
          })
          .join('') +
        '</div>' +
        body +
        '<div class="lv-admin__send-actions">' +
        (state.step > 1
          ? '<button type="button" class="lv-admin__btn lv-admin__btn--ghost" id="lvCampBack">Back</button>'
          : '') +
        (state.step < 4
          ? '<button type="button" class="lv-admin__btn" id="lvCampNext">Next</button>'
          : '') +
        '</div>' +
        '<p class="lv-admin__send-status" id="lvCampStatus" hidden></p>' +
        '</section>';

      var back = document.getElementById('lvCampBack');
      if (back) {
        back.addEventListener('click', function () {
          state.step -= 1;
          paint();
        });
      }
      var next = document.getElementById('lvCampNext');
      if (next) {
        next.addEventListener('click', function () {
          if (state.step === 1) {
            state.audience = document.getElementById('lvCampAud').value;
            if (!state.audience) return alert('Select an audience');
            state.step = 2;
            paint();
            return;
          }
          if (state.step === 2) {
            state.template_key = document.getElementById('lvCampTpl').value;
            if (!state.template_key) return alert('Select a template');
            next.disabled = true;
            next.textContent = 'Loading…';
            authFetch('/api/admin/luneva/campaigns/preview', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                audience: state.audience,
                template_key: state.template_key
              })
            }).then(function (r) {
              next.disabled = false;
              next.textContent = 'Next';
              if (!r.ok || !r.body.success) {
                return alert((r.body && r.body.error) || 'Preview failed');
              }
              state.preview = r.body.preview || { subject: r.body.subject, html: r.body.html };
              state.recipient_count = r.body.recipient_count || 0;
              state.step = 3;
              paint();
            });
            return;
          }
          state.step = 4;
          paint();
        });
      }
      var send = document.getElementById('lvCampSend');
      if (send) {
        send.addEventListener('click', function () {
          if (
            !window.confirm(
              'Send this LUNEVA email to ' + state.recipient_count + ' people now?'
            )
          ) {
            return;
          }
          var statusEl = document.getElementById('lvCampStatus');
          var backBtn = document.getElementById('lvCampBack');
          if (backBtn) backBtn.disabled = true;
          send.disabled = true;
          send.textContent = 'Sending…';
          if (statusEl) {
            statusEl.hidden = false;
            statusEl.textContent =
              'Sending one by one via Resend. Keep this tab open — larger lists can take a minute.';
          }
          authFetch('/api/admin/luneva/campaigns/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audience: state.audience,
              template_key: state.template_key
            })
          }).then(function (r) {
            if (!r.ok || !r.body.success) {
              send.disabled = false;
              send.textContent = 'Send Now';
              if (backBtn) backBtn.disabled = false;
              if (statusEl) {
                statusEl.textContent = (r.body && r.body.error) || 'Send failed';
              }
              return;
            }
            send.textContent = 'Sent';
            if (statusEl) {
              statusEl.textContent =
                'Sent ' +
                (r.body.sent || 0) +
                ' · skipped ' +
                (r.body.skipped || 0) +
                ' · failed ' +
                (r.body.failed || 0) +
                (r.body.errors && r.body.errors.length
                  ? ' — first error: ' + r.body.errors[0].error
                  : '');
            }
          });
        });
      }
    }

    paint();
  }

  function renderInquiries(data) {
    var inquiries = (data && data.inquiries) || [];
    content.innerHTML =
      header('Inquiries', 'Messages from the LUNEVA contact form.') +
      '<section class="lv-admin__card"><table class="lv-admin__table"><thead><tr><th>When</th><th>Name</th><th>Email</th><th>Phone</th><th>Topic</th><th>Kit</th><th>Order #</th><th>Message</th></tr></thead><tbody>' +
      (inquiries.length
        ? inquiries
            .map(function (row) {
              return (
                '<tr><td>' +
                esc(fmtDate(row.created_at)) +
                '</td><td>' +
                esc(row.name || '—') +
                '</td><td>' +
                esc(row.email || '—') +
                '</td><td>' +
                esc(row.phone || '—') +
                '</td><td>' +
                esc(inquiryTopicLabel(row.topic)) +
                '</td><td>' +
                esc(inquiryKitLabel(row.kit_interest)) +
                '</td><td>' +
                esc(row.order_number || '—') +
                '</td><td class="lv-admin__message">' +
                esc(row.message || '—') +
                '</td></tr>'
              );
            })
            .join('')
        : '<tr><td colspan="8">No inquiries in this range.</td></tr>') +
      '</tbody></table></section>';
    bindRangeButtons();
  }

  function renderActivity(data) {
    var rows = (data && data.recent_activity) || [];
    content.innerHTML =
      header('Activity', 'Recent LUNEVA storefront events.') +
      '<section class="lv-admin__card"><table class="lv-admin__table"><thead><tr><th>When</th><th>Event</th><th>Product</th><th>Country</th><th>Traffic source</th><th>Page</th><th>Visitor</th></tr></thead><tbody>' +
      (rows.length
        ? rows
            .map(function (ev) {
              return (
                '<tr><td>' +
                esc(fmtDate(ev.created_at)) +
                '</td><td>' +
                esc(ev.event_type) +
                '</td><td>' +
                esc(slugLabel(ev.product_id) || '—') +
                '</td><td>' +
                esc(ev.country || '—') +
                '</td><td>' +
                esc(ev.traffic_source || '—') +
                '</td><td>' +
                esc(ev.page_url || '—') +
                '</td><td><span class="lv-admin__pill">' +
                esc((ev.visitor_id || '').slice(0, 8)) +
                '</span></td></tr>'
              );
            })
            .join('')
        : '<tr><td colspan="7">No LUNEVA events yet. Browse /luneva/ to start collecting data.</td></tr>') +
      '</tbody></table></section>';
    bindRangeButtons();
  }

  function bindRangeButtons() {
    document.querySelectorAll('[data-range]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        rangeKey = btn.getAttribute('data-range') || 'today';
        visitorState.offset = 0;
        cache = {};
        render();
      });
    });
  }

  function formatAdMoney(amount, currency) {
    var n = Number(amount) || 0;
    var cur = String(currency || 'USD').toUpperCase();
    if (cur === 'MYR') {
      return 'RM' + (Math.round(n) === n ? String(Math.round(n)) : n.toFixed(2));
    }
    if (cur === 'USD') {
      return 'US$' + n.toFixed(2);
    }
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: cur,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(n);
    } catch (_) {
      return cur + ' ' + n.toFixed(2);
    }
  }

  function pct(n) {
    var v = Number(n) || 0;
    return v.toFixed(2) + '%';
  }

  function renderAds(payload) {
    var status = (payload && payload.status) || {};
    var data = (payload && payload.insights) || {};
    var account = status.account || data.account || null;
    var currency = data.currency || (account && account.currency) || 'USD';
    var totals = data.totals || {};
    var rows = data.rows || [];
    var level = data.level || adsState.level || 'campaign';
    var money = function (amount) {
      return formatAdMoney(amount, currency);
    };
    var nameKey =
      level === 'ad' ? 'ad_name' : level === 'adset' ? 'adset_name' : 'campaign_name';

    if (status.configured === false && !data.rows) {
      content.innerHTML =
        header('Ads', 'Meta / Facebook Ads campaign insights.') +
        '<section class="lv-admin__card"><h2>Connect Meta Ads API</h2>' +
        '<p>Add these env vars on Vercel (and locally in <code>.env.local</code>), then redeploy:</p>' +
        '<ul class="lv-admin__setup-list">' +
        '<li><code>META_ADS_ACCESS_TOKEN</code> — System User token with <code>ads_read</code></li>' +
        '<li><code>META_AD_ACCOUNT_ID</code> — e.g. <code>act_1234567890</code></li>' +
        '</ul>' +
        '<p>Step-by-step: see <code>META_ADS.md</code> in the repo. This is separate from Pixel / CAPI.</p>' +
        '</section>';
      bindRangeButtons();
      return;
    }

    content.innerHTML =
      header(
        'Ads',
        (account && account.name ? account.name + ' · ' : '') +
          'Spend in ' +
          currency +
          ' (from your Meta ad account). Ranges map to Ads date presets.'
      ) +
      '<div class="lv-admin__ads-levels">' +
      ['campaign', 'adset', 'ad']
        .map(function (key) {
          return (
            '<button type="button" class="lv-admin__level-btn' +
            (level === key ? ' is-active' : '') +
            '" data-ads-level="' +
            key +
            '">' +
            (key === 'campaign' ? 'Campaigns' : key === 'adset' ? 'Ad sets' : 'Ads') +
            '</button>'
          );
        })
        .join('') +
      '</div>' +
      '<div class="lv-admin__kpis">' +
      [
        ['Spend', money(totals.spend)],
        ['Impressions', totals.impressions || 0],
        ['Clicks', totals.clicks || 0],
        ['CTR', pct(totals.ctr)],
        ['CPC', money(totals.cpc)],
        ['ViewContent', totals.view_content || 0],
        ['Cost / VC', totals.view_content ? money(totals.cost_per_view_content) : '—'],
        ['ATC', totals.add_to_cart || 0],
        ['Cost / ATC', totals.add_to_cart ? money(totals.cost_per_add_to_cart) : '—'],
        ['Purchases', totals.purchases || 0],
        ['ROAS', (Number(totals.roas) || 0).toFixed(2) + 'x']
      ]
        .map(function (kpi) {
          return (
            '<div class="lv-admin__kpi"><span>' +
            esc(kpi[0]) +
            '</span><strong>' +
            esc(kpi[1]) +
            '</strong></div>'
          );
        })
        .join('') +
      '</div>' +
      '<section class="lv-admin__card"><table class="lv-admin__table"><thead><tr>' +
      '<th>Name</th><th>Spend</th><th>Impr.</th><th>Clicks</th><th>CTR</th><th>CPC</th><th>ViewContent</th><th>ATC</th><th>Checkout</th><th>Purchases</th><th>ROAS</th>' +
      '</tr></thead><tbody>' +
      (rows.length
        ? rows
            .map(function (row) {
              return (
                '<tr><td>' +
                esc(row[nameKey] || row.campaign_name || '—') +
                '</td><td>' +
                esc(money(row.spend)) +
                '</td><td>' +
                esc(row.impressions || 0) +
                '</td><td>' +
                esc(row.clicks || 0) +
                '</td><td>' +
                esc(pct(row.ctr)) +
                '</td><td>' +
                esc(money(row.cpc)) +
                '</td><td>' +
                esc(row.view_content || 0) +
                '</td><td>' +
                esc(row.add_to_cart || 0) +
                '</td><td>' +
                esc(row.initiate_checkout || 0) +
                '</td><td>' +
                esc(row.purchases || 0) +
                '</td><td>' +
                esc((Number(row.roas) || 0).toFixed(2) + 'x') +
                '</td></tr>'
              );
            })
            .join('')
        : '<tr><td colspan="11">No ad spend in this range.</td></tr>') +
      '</tbody></table></section>';

    bindRangeButtons();
    document.querySelectorAll('[data-ads-level]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        adsState.level = btn.getAttribute('data-ads-level') || 'campaign';
        cache = {};
        render();
      });
    });
  }

  function loadAds() {
    var level = adsState.level || 'campaign';
    var preset = rangeKey === 'today' || rangeKey === 'yesterday' ? rangeKey : rangeKey;
    return Promise.all([
      fetch('/api/admin/meta-ads/status').then(function (res) {
        return res.json();
      }),
      fetch(
        '/api/admin/meta-ads/insights?level=' +
          encodeURIComponent(level) +
          '&date_preset=' +
          encodeURIComponent(preset)
      ).then(function (res) {
        return res.json().then(function (body) {
          if (res.status === 503 && body && body.configured === false) {
            return null;
          }
          if (!res.ok) throw new Error((body && body.error) || 'Failed to load ads');
          return body;
        });
      })
    ]).then(function (parts) {
      return { status: parts[0], insights: parts[1] };
    });
  }

  function render() {
    stopLivePoll();
    setActiveNav();
    setLoading(true);
    var tab = currentTab();
    if (tab === 'visitor-detail') {
      var visitorId = currentVisitorId();
      if (!visitorId) {
        location.hash = '#visitors';
        return;
      }
      return fetch(
        '/api/admin/luneva/visitors/detail?visitor_id=' + encodeURIComponent(visitorId)
      )
        .then(function (res) {
          return res.json().then(function (body) {
            if (!res.ok) throw new Error((body && body.error) || 'Failed to load journey');
            return body;
          });
        })
        .then(renderVisitorDetail)
        .catch(showError)
        .finally(function () {
          setLoading(false);
        });
    }
    if (tab === 'visitors') {
      return api('/api/admin/luneva/visitors', {
        country: visitorState.country,
        traffic: visitorState.traffic,
        search: visitorState.search,
        stage: visitorState.stage,
        offset: visitorState.offset,
        limit: visitorState.limit
      })
        .then(renderVisitors)
        .catch(showError)
        .finally(function () {
          setLoading(false);
        });
    }
    if (tab === 'countries') {
      return api('/api/admin/luneva/countries')
        .then(renderCountries)
        .catch(showError)
        .finally(function () {
          setLoading(false);
        });
    }
    if (tab === 'traffic') {
      return api('/api/admin/luneva/traffic')
        .then(renderTraffic)
        .catch(showError)
        .finally(function () {
          setLoading(false);
        });
    }
    if (tab === 'orders') {
      return api('/api/admin/luneva/orders')
        .then(renderOrders)
        .catch(showError)
        .finally(function () {
          setLoading(false);
        });
    }
    if (tab === 'customers') {
      return api('/api/admin/luneva/customers')
        .then(renderCustomers)
        .catch(showError)
        .finally(function () {
          setLoading(false);
        });
    }
    if (tab === 'send') {
      return authFetch('/api/admin/luneva/campaigns')
        .then(function (r) {
          if (!r.ok) throw new Error((r.body && r.body.error) || 'Failed to load campaigns');
          renderSendEmail(r.body);
        })
        .catch(showError)
        .finally(function () {
          setLoading(false);
        });
    }
    if (tab === 'marketing' || tab === 'mkt-overview') {
      setLoading(false);
      if (content) content.hidden = false;
      if (window.LunevaMarketingUI) window.LunevaMarketingUI.renderOverview(content);
      else showError(new Error('Marketing UI failed to load'));
      return;
    }
    if (tab === 'mkt-audience') {
      setLoading(false);
      if (content) content.hidden = false;
      if (window.LunevaMarketingUI) window.LunevaMarketingUI.renderAudience(content);
      else showError(new Error('Marketing UI failed to load'));
      return;
    }
    if (tab === 'mkt-journeys') {
      setLoading(false);
      if (content) content.hidden = false;
      if (window.LunevaMarketingUI) window.LunevaMarketingUI.renderJourneys(content);
      else showError(new Error('Marketing UI failed to load'));
      return;
    }
    if (tab === 'inquiries') {
      return api('/api/admin/luneva/inquiries')
        .then(renderInquiries)
        .catch(showError)
        .finally(function () {
          setLoading(false);
        });
    }
    if (tab === 'ads') {
      return loadAds()
        .then(renderAds)
        .catch(showError)
        .finally(function () {
          setLoading(false);
        });
    }
    if (tab === 'activity') {
      return api('/api/admin/luneva/dashboard')
        .then(renderActivity)
        .catch(showError)
        .finally(function () {
          setLoading(false);
        });
    }
    return api('/api/admin/luneva/dashboard')
      .then(renderDashboard)
      .catch(showError)
      .finally(function () {
        setLoading(false);
      });
  }

  function showError(err) {
    if (!content) return;
    content.hidden = false;
    content.innerHTML =
      '<div class="lv-admin__card"><h2>Could not load dashboard</h2><p>' +
      esc((err && err.message) || 'Unknown error') +
      '</p></div>';
  }

  function boot() {
    if (signOutBtn) {
      signOutBtn.hidden = false;
      signOutBtn.onclick = function () {
        window.LunevaAdminAuth.clearSession();
        renderLogin();
      };
    }
    window.addEventListener('hashchange', function () {
      visitorState.offset = 0;
      cache = {};
      render();
    });
    render();
  }

  window.LunevaAdminAuth.validateSession().then(function (ok) {
    wireMobileNav();
    if (ok) boot();
    else renderLogin();
  });
})();
