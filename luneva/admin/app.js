(function () {
  'use strict';

  var content = document.getElementById('lvAdminContent');
  var loading = document.getElementById('lvAdminLoading');
  var signOutBtn = document.getElementById('lvAdminSignOut');
  var rangeKey = '7';
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
    offset: 0,
    limit: 50
  };
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
    return hash || 'dashboard';
  }

  function setActiveNav() {
    var tab = currentTab();
    document.querySelectorAll('[data-tab]').forEach(function (link) {
      link.classList.toggle('is-active', link.getAttribute('data-tab') === tab);
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
    return (
      '<div class="lv-admin__toolbar">' +
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

  function header(title, subtitle) {
    return (
      '<div class="lv-admin__header">' +
      '<div><h1>' +
      esc(title) +
      '</h1><p>' +
      esc(subtitle) +
      '</p><p class="lv-admin__range-note">Date ranges use Malaysia time (GMT+8), resetting at 12:00&nbsp;a.m.</p></div>' +
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
      '</div></div>'
    );
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
      header('Dashboard', 'LUNEVA-only metrics — not mixed with Automotive ZYBAR.') +
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
  }

  function renderVisitors(data) {
    var rows = (data && data.rows) || [];
    var total = (data && data.total) || rows.length;
    content.innerHTML =
      header(
        'Visitors',
        'First visit, last activity, and how long each LUNEVA visitor stayed.'
      ) +
      renderVisitorFilters() +
      '<section class="lv-admin__card"><table class="lv-admin__table"><thead><tr><th>Visitor</th><th>Email</th><th>Country</th><th>Traffic source</th><th>Status</th><th>First visit</th><th>Last active</th><th>Duration</th><th>Orders</th><th>Revenue</th></tr></thead><tbody>' +
      (rows.length
        ? rows
            .map(function (row) {
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
                '</td></tr>'
              );
            })
            .join('')
        : '<tr><td colspan="10">No visitors in this range.</td></tr>') +
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
    if ((row.orders || 0) > 0) return 'Purchased';
    if (row.source === 'checkout_email') return 'Checkout email';
    return 'Lead';
  }

  function renderCustomers(data) {
    var customers = (data && data.customers) || [];
    content.innerHTML =
      header(
        'Emails & customers',
        'Checkout emails and completed orders in the selected period.'
      ) +
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
        rangeKey = btn.getAttribute('data-range') || '7';
        visitorState.offset = 0;
        cache = {};
        render();
      });
    });
  }

  function render() {
    setActiveNav();
    setLoading(true);
    var tab = currentTab();
    if (tab === 'visitors') {
      return api('/api/admin/luneva/visitors', {
        country: visitorState.country,
        traffic: visitorState.traffic,
        search: visitorState.search,
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
    if (tab === 'inquiries') {
      return api('/api/admin/luneva/inquiries')
        .then(renderInquiries)
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
    if (ok) boot();
    else renderLogin();
  });
})();
