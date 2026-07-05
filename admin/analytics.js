/**
 * Admin Analytics Hub — overview, funnel, cart, abandoned, revenue, products, geo, devices
 */
window.renderAdminanalytics = function (container) {
  if (!container) return;

  var activeTab = 'overview';
  var rangeDays = 30;
  var charts = {};
  var refreshTimer = null;

  var hash = (window.location.hash || '#analytics').slice(1);
  var parts = hash.split('/');
  if (parts[1]) activeTab = parts[1];

  var tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'realtime', label: 'Realtime' },
    { id: 'funnel', label: 'Conversion Funnel' },
    { id: 'traffic', label: 'Traffic Sources' },
    { id: 'cart', label: 'Cart Analytics' },
    { id: 'abandoned', label: 'Abandoned Cart' },
    { id: 'revenue', label: 'Revenue' },
    { id: 'products', label: 'Products' },
    { id: 'orders', label: 'Orders' },
    { id: 'countries', label: 'Countries' },
    { id: 'devices', label: 'Devices & Browsers' }
  ];

  function apiBase() {
    return window.location.origin;
  }

  function fetchJson(path) {
    return fetch(apiBase() + path + (path.indexOf('?') === -1 ? '?' : '&') + 'days=' + rangeDays)
      .then(function (r) {
        if (!r.ok) return null;
        return r.json();
      })
      .then(function (data) {
        if (!data || data.error || typeof data !== 'object') return null;
        return data;
      })
      .catch(function () { return null; });
  }

  function loadOverview() {
    var range = dateRange();
    return fetchJson('/api/analytics/overview').then(function (data) {
      if (data && (data.unique_visitors != null || data.product_views != null)) return data;
      return rpc('get_analytics_overview', { p_start: range.start, p_end: range.end });
    });
  }

  function loadTrends() {
    var range = dateRange();
    return fetchJson('/api/analytics/trends').then(function (data) {
      if (data && (data.visitors || data.add_to_cart)) return data;
      return rpc('get_analytics_trends', {
        p_start: range.start,
        p_end: range.end,
        p_granularity: 'day'
      });
    });
  }

  function loadFunnel() {
    var range = dateRange();
    return fetchJson('/api/analytics/funnel').then(function (data) {
      if (data && Array.isArray(data.steps)) return data.steps;
      return rpc('get_conversion_funnel', { p_start: range.start, p_end: range.end }).then(function (steps) {
        return Array.isArray(steps) ? steps : [];
      });
    });
  }

  function loadCarts() {
    var range = dateRange();
    return fetchJson('/api/analytics/carts').then(function (data) {
      if (data && typeof data.total_add_to_cart !== 'undefined') return data;
      return rpc('get_cart_analytics_summary', { p_start: range.start, p_end: range.end });
    });
  }

  function loadProducts() {
    var range = dateRange();
    return fetchJson('/api/analytics/products').then(function (data) {
      if (data && (data.most_viewed || data.most_added)) return data;
      return rpc('get_top_products_analytics', { p_start: range.start, p_end: range.end });
    });
  }

  function loadDistributions() {
    var range = dateRange();
    return fetchJson('/api/analytics/distributions').then(function (data) {
      if (data && (data.countries || data.devices)) return data;
      return rpc('get_analytics_distributions', { p_start: range.start, p_end: range.end });
    });
  }

  function loadRealtime() {
    return fetchJson('/api/analytics/realtime');
  }

  function loadTraffic() {
    return fetchJson('/api/analytics/traffic');
  }

  function loadAbandoned() {
    return fetch(apiBase() + '/api/analytics/abandoned?limit=100')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data && Array.isArray(data.carts)) return data.carts;
        return rpc('get_abandoned_carts', { p_limit: 100, p_offset: 0 }).then(function (carts) {
          return Array.isArray(carts) ? carts : [];
        });
      })
      .catch(function () { return []; });
  }

  function rpc(name, params) {
    var sb = window.supabase;
    if (!sb) return Promise.resolve(null);
    return sb.rpc(name, params).then(function (res) {
      if (res.error) throw res.error;
      return res.data;
    }).catch(function () { return null; });
  }

  function dateRange() {
    var end = new Date();
    end.setHours(23, 59, 59, 999);
    var start = new Date(end);
    start.setDate(start.getDate() - (rangeDays - 1));
    start.setHours(0, 0, 0, 0);
    var endExcl = new Date(end.getTime() + 86400000);
    return { start: start.toISOString(), end: endExcl.toISOString() };
  }

  function formatUsdCents(cents) {
    var n = Number(cents) || 0;
    return 'US$' + (n / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatNum(n) {
    n = Number(n) || 0;
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(n);
  }

  function pct(a, b) {
    if (!b) return '0%';
    return ((a / b) * 100).toFixed(1) + '%';
  }

  function destroyCharts() {
    Object.keys(charts).forEach(function (k) {
      if (charts[k]) { charts[k].destroy(); charts[k] = null; }
    });
  }

  function kpiCard(label, value, sub) {
    return (
      '<div class="admin-kpi-card admin-kpi-card--static">' +
      '<div class="admin-kpi-card-inner">' +
      '<div class="admin-kpi-card-top"><span class="admin-kpi-label">' + label + '</span></div>' +
      '<div class="admin-kpi-value-wrap"><span class="admin-kpi-value">' + value + '</span></div>' +
      (sub ? '<div class="admin-kpi-card-bottom"><span class="admin-kpi-vs-label">' + sub + '</span></div>' : '') +
      '</div></div>'
    );
  }

  function renderShell() {
    var tabHtml = tabs.map(function (t) {
      return '<button type="button" class="admin-analytics-tab' + (t.id === activeTab ? ' is-active' : '') + '" data-tab="' + t.id + '">' + t.label + '</button>';
    }).join('');

    container.innerHTML =
      '<h2 class="admin-page-title">Analytics</h2>' +
      '<div class="admin-analytics-toolbar">' +
      '<label class="admin-analytics-filter-pill">' +
      '<select id="analyticsHubRange" aria-label="Date range">' +
      '<option value="7">Last 7 days</option>' +
      '<option value="14">Last 14 days</option>' +
      '<option value="30" selected>Last 30 days</option>' +
      '<option value="90">Last 90 days</option>' +
      '</select></label>' +
      '<button type="button" class="admin-btn-secondary" id="analyticsHubRefresh">Refresh</button>' +
      '</div>' +
      '<nav class="admin-analytics-tabs" aria-label="Analytics sections">' + tabHtml + '</nav>' +
      '<div id="analyticsHubContent" class="admin-analytics-hub-content"><div class="admin-loading">Loading…</div></div>';

    var rangeEl = document.getElementById('analyticsHubRange');
    if (rangeEl) {
      rangeEl.value = String(rangeDays);
      rangeEl.addEventListener('change', function () {
        rangeDays = parseInt(rangeEl.value, 10) || 30;
        loadTab();
      });
    }
    document.getElementById('analyticsHubRefresh').addEventListener('click', loadTab);
    container.querySelectorAll('.admin-analytics-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        activeTab = btn.getAttribute('data-tab');
        window.location.hash = 'analytics/' + activeTab;
        container.querySelectorAll('.admin-analytics-tab').forEach(function (b) {
          b.classList.toggle('is-active', b === btn);
        });
        loadTab();
      });
    });
  }

  function renderOverview(data) {
    data = data || {};
    var visitors = data.unique_visitors != null ? data.unique_visitors : data.visitors;
    var conv = data.conversion_rate != null
      ? String(data.conversion_rate) + '%'
      : (visitors > 0 ? ((data.orders / visitors) * 100).toFixed(2) + '%' : '0%');
    var aov = data.orders > 0 ? formatUsdCents((data.avg_order_value_cents || data.revenue_cents / data.orders)) : '—';

    return (
      '<div class="admin-kpi-cards admin-kpi-cards--dense">' +
      kpiCard('Unique visitors', formatNum(visitors), 'COUNT(DISTINCT visitor_id)') +
      kpiCard('Sessions', formatNum(data.sessions), 'COUNT(DISTINCT session_id)') +
      kpiCard('New visitors', formatNum(data.new_visitors), 'First visit in range') +
      kpiCard('Returning visitors', formatNum(data.returning_visitors), 'Visited before range') +
      kpiCard('Product views', formatNum(data.product_views), 'product_view events') +
      kpiCard('Collection views', formatNum(data.collection_views), 'collection_view events') +
      kpiCard('Add to cart', formatNum(data.add_to_cart), 'Click events (not qty)') +
      kpiCard('Products added', formatNum(data.products_added), 'Sum of quantities') +
      kpiCard('Checkout started', formatNum(data.checkout_started), 'begin_checkout events') +
      kpiCard('Orders', formatNum(data.orders), 'Completed purchases') +
      kpiCard('Conversion rate', conv, 'Orders ÷ unique visitors') +
      kpiCard('Revenue', formatUsdCents(data.revenue_cents), 'Gross order total') +
      kpiCard('Avg order value', aov, 'Revenue ÷ orders') +
      '</div>' +
      '<div class="admin-card"><h3>Visitor trends</h3><div class="chart-container"><canvas id="chartHubOverview"></canvas></div></div>'
    );
  }

  function renderFunnel(steps) {
    steps = Array.isArray(steps) ? steps : [];
    var html = '<div class="admin-funnel">';
    steps.forEach(function (step, i) {
      var prev = i > 0 ? steps[i - 1].count : null;
      var rate = step.rate_from_previous != null
        ? String(step.rate_from_previous) + '%'
        : (prev ? pct(step.count, prev) : '100%');
      var label = String(step.step || '').replace(/_/g, ' ');
      html +=
        '<div class="admin-funnel-step">' +
        '<div class="admin-funnel-step-label">' + label + '</div>' +
        '<div class="admin-funnel-step-value">' + formatNum(step.count) + '</div>' +
        (i > 0 ? '<div class="admin-funnel-step-rate">' + rate + ' from previous</div>' : '') +
        '</div>';
      if (i < steps.length - 1) html += '<div class="admin-funnel-arrow" aria-hidden="true">↓</div>';
    });
    html += '</div>';
    html += '<div class="admin-card"><h3>Funnel visualization</h3><div class="chart-container"><canvas id="chartHubFunnel"></canvas></div></div>';
    return html;
  }

  function renderCartAnalytics(data) {
    data = data || {};
    var topProducts = (data.top_products || []).map(function (p) {
      return '<tr><td>' + (p.product_name || p.product_id) + '</td><td>' + p.total_qty + '</td></tr>';
    }).join('') || '<tr><td colspan="2">No data yet</td></tr>';

    return (
      '<div class="admin-kpi-cards admin-kpi-cards--dense">' +
      kpiCard('Total add to cart', formatNum(data.total_add_to_cart), '') +
      kpiCard('Unique cart sessions', formatNum(data.unique_cart_sessions), '') +
      kpiCard('Avg cart value', formatUsdCents(data.avg_cart_value_cents), '') +
      kpiCard('Products per cart', String(data.avg_items_per_cart || '—'), 'Average') +
      '</div>' +
      '<div class="admin-grid-2">' +
      '<div class="admin-card"><h3>Most added products</h3><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Product</th><th>Qty</th></tr></thead><tbody>' + topProducts + '</tbody></table></div></div>' +
      '<div class="admin-card"><h3>Top sizes</h3>' + listFromRows(data.top_sizes, 'size') + '</div>' +
      '<div class="admin-card"><h3>Top power types</h3>' + listFromRows(data.top_power_types, 'power_type') + '</div>' +
      '<div class="admin-card"><h3>Top LED colors</h3>' + listFromRows(data.top_led_colors, 'led_color') + '</div>' +
      '</div>' +
      '<div class="admin-card"><h3>Add to cart trend</h3><div class="chart-container"><canvas id="chartHubCart"></canvas></div></div>'
    );
  }

  function listFromRows(rows, key) {
    rows = rows || [];
    if (!rows.length) return '<p class="admin-muted">No data yet</p>';
    return '<ul class="admin-stat-list">' + rows.map(function (r) {
      return '<li><span>' + (r[key] || '—') + '</span><strong>' + r.total_qty + '</strong></li>';
    }).join('') + '</ul>';
  }

  function renderAbandoned(carts) {
    carts = Array.isArray(carts) ? carts : [];
    var rows = carts.map(function (c) {
      var customer = c.customer_id || ('Anonymous · ' + String(c.visitor_id || '').slice(0, 12));
      var products = Array.isArray(c.products) ? c.products.map(function (p) {
        return (p.product_name || p.product_id) + ' ×' + p.quantity;
      }).join(', ') : '—';
      return (
        '<tr>' +
        '<td><code>' + String(c.cart_id || '').slice(0, 8) + '…</code></td>' +
        '<td>' + customer + '</td>' +
        '<td>' + formatDate(c.created_at) + '</td>' +
        '<td>' + formatDate(c.last_activity_at) + '</td>' +
        '<td>' + products + '</td>' +
        '<td>' + formatUsdCents(c.cart_value_cents) + '</td>' +
        '<td><span class="admin-badge">' + (c.status || '—') + '</span></td>' +
        '<td>' + (c.recovery_status || 'none') + '</td>' +
        '</tr>'
      );
    }).join('') || '<tr><td colspan="8">No abandoned carts</td></tr>';

    return (
      '<div class="admin-card">' +
      '<h3>Abandoned carts</h3>' +
      '<p class="admin-muted">Carts with items and no purchase after 24 hours of inactivity.</p>' +
      '<div class="admin-table-wrap"><table class="admin-table admin-table--compact">' +
      '<thead><tr><th>Cart</th><th>Customer</th><th>Created</th><th>Last activity</th><th>Products</th><th>Value</th><th>Status</th><th>Recovery</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>'
    );
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return iso; }
  }

  function renderRevenue(trends) {
    trends = trends || {};
    return (
      '<div class="admin-grid-2">' +
      '<div class="admin-card"><h3>Revenue trend</h3><div class="chart-container"><canvas id="chartHubRevenue"></canvas></div></div>' +
      '<div class="admin-card"><h3>Orders trend</h3><div class="chart-container"><canvas id="chartHubOrders"></canvas></div></div>' +
      '<div class="admin-card"><h3>Checkout trend</h3><div class="chart-container"><canvas id="chartHubCheckout"></canvas></div></div>' +
      '<div class="admin-card"><h3>Conversion rate trend</h3><div class="chart-container"><canvas id="chartHubConvRate"></canvas></div></div>' +
      '</div>'
    );
  }

  function renderProducts(data) {
    data = data || {};
    function table(title, rows, cols) {
      var body = (rows || []).map(function (r) {
        return '<tr>' + cols.map(function (c) { return '<td>' + (r[c.key] != null ? r[c.key] : '—') + '</td>'; }).join('') + '</tr>';
      }).join('') || '<tr><td colspan="' + cols.length + '">No data</td></tr>';
      return '<div class="admin-card"><h3>' + title + '</h3><div class="admin-table-wrap"><table class="admin-table"><thead><tr>' +
        cols.map(function (c) { return '<th>' + c.label + '</th>'; }).join('') +
        '</tr></thead><tbody>' + body + '</tbody></table></div></div>';
    }
    return '<div class="admin-grid-2">' +
      table('Most viewed', data.most_viewed, [{ key: 'product_id', label: 'Product' }, { key: 'views', label: 'Views' }]) +
      table('Most added to cart', data.most_added, [{ key: 'product_id', label: 'Product' }, { key: 'add_events', label: 'Clicks' }, { key: 'products_added', label: 'Units' }]) +
      table('Highest revenue', (data.highest_revenue || []).map(function (r) {
        return { product_id: r.product_id, revenue: formatUsdCents(r.revenue_cents), orders: r.orders };
      }), [{ key: 'product_id', label: 'Product' }, { key: 'revenue', label: 'Revenue' }, { key: 'orders', label: 'Orders' }]) +
      '</div>';
  }

  function renderOrdersTable() {
    return '<div class="admin-card" id="analyticsOrdersHost"><div class="admin-loading">Loading orders…</div></div>';
  }

  function renderCustomersNote() {
    return '<div class="admin-card"><h3>Customers</h3><p class="admin-muted">Customer profiles are derived from completed orders. Open the <a href="#customers">Customers</a> section for full order history and contact details.</p></div>';
  }

  function renderDistribution(title, items, chartId) {
    items = items || [];
    return '<div class="admin-card"><h3>' + title + '</h3><div class="chart-container"><canvas id="' + chartId + '"></canvas></div></div>';
  }

  function drawLineChart(id, labels, values, label) {
    var el = document.getElementById(id);
    if (!el || typeof Chart === 'undefined') return;
    if (charts[id]) { charts[id].destroy(); }
    charts[id] = new Chart(el, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{ label: label, data: values, borderColor: '#2c6ecb', backgroundColor: 'rgba(44,110,203,0.08)', fill: true, tension: 0.35 }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
  }

  function drawBarChart(id, labels, values, label) {
    var el = document.getElementById(id);
    if (!el || typeof Chart === 'undefined') return;
    if (charts[id]) { charts[id].destroy(); }
    charts[id] = new Chart(el, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{ label: label, data: values, backgroundColor: 'rgba(44,110,203,0.75)' }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
  }

  function drawDoughnut(id, items) {
    var el = document.getElementById(id);
    if (!el || typeof Chart === 'undefined') return;
    if (charts[id]) { charts[id].destroy(); }
    charts[id] = new Chart(el, {
      type: 'doughnut',
      data: {
        labels: items.map(function (i) { return i.label; }),
        datasets: [{ data: items.map(function (i) { return i.value; }), backgroundColor: ['#2c6ecb', '#5b9bd5', '#8bb8e8', '#b8d4f0', '#d4e6f7', '#3498db', '#2980b9'] }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }

  function seriesLabelsValues(series) {
    series = series || [];
    return {
      labels: series.map(function (p) { return String(p.date || '').slice(5); }),
      values: series.map(function (p) { return p.value; })
    };
  }

  function renderRealtime(data) {
    data = data || {};
    var events = (data.recent_events || []).map(function (ev) {
      return '<tr><td>' + formatDate(ev.created_at) + '</td><td>' + (ev.event_type || '') + '</td><td>' + (ev.product_id || '—') + '</td><td><code>' + String(ev.visitor_id || '').slice(0, 10) + '…</code></td></tr>';
    }).join('') || '<tr><td colspan="4">No recent activity</td></tr>';

    return (
      '<div class="admin-kpi-cards admin-kpi-cards--dense">' +
      kpiCard('Visitors online', formatNum(data.active_visitors), 'Last 5 minutes') +
      kpiCard('Active sessions', formatNum(data.active_sessions), 'Last 5 minutes') +
      kpiCard('Active carts', formatNum(data.active_carts), 'With items') +
      kpiCard('In checkout', formatNum(data.checkout_users), 'Checkout started') +
      '</div>' +
      '<div class="admin-card"><h3>Recent events</h3><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Time</th><th>Event</th><th>Product</th><th>Visitor</th></tr></thead><tbody>' + events + '</tbody></table></div></div>'
    );
  }

  function renderTraffic(data) {
    data = data || {};
    var sources = (data.sources || []).map(function (s) {
      return '<tr><td>' + (s.label || '—') + '</td><td>' + formatNum(s.sessions) + '</td><td>' + formatNum(s.visitors) + '</td></tr>';
    }).join('') || '<tr><td colspan="3">No traffic data yet</td></tr>';
    var campaigns = (data.campaigns || []).map(function (c) {
      return '<tr><td>' + (c.utm_source || '—') + '</td><td>' + (c.utm_medium || '—') + '</td><td>' + (c.utm_campaign || '—') + '</td><td>' + formatNum(c.sessions) + '</td></tr>';
    }).join('') || '<tr><td colspan="4">No UTM campaigns yet</td></tr>';

    return (
      '<div class="admin-grid-2">' +
      '<div class="admin-card"><h3>Traffic sources</h3><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Source</th><th>Sessions</th><th>Visitors</th></tr></thead><tbody>' + sources + '</tbody></table></div></div>' +
      '<div class="admin-card"><h3>UTM campaigns</h3><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Source</th><th>Medium</th><th>Campaign</th><th>Sessions</th></tr></thead><tbody>' + campaigns + '</tbody></table></div></div>' +
      '</div>'
    );
  }

  function loadTab() {
    destroyCharts();
    var host = document.getElementById('analyticsHubContent');
    if (!host) return;
    host.innerHTML = '<div class="admin-loading">Loading…</div>';

    var range = dateRange();

    if (activeTab === 'overview') {
      Promise.all([
        loadOverview(),
        loadTrends()
      ]).then(function (res) {
        host.innerHTML = renderOverview(res[0]);
        var trends = res[1] || {};
        var visitors = seriesLabelsValues(trends.visitors);
        drawLineChart('chartHubOverview', visitors.labels, visitors.values, 'Visitors');
      });
      return;
    }

    if (activeTab === 'realtime') {
      loadRealtime().then(function (data) {
        host.innerHTML = renderRealtime(data);
      });
      return;
    }

    if (activeTab === 'traffic') {
      loadTraffic().then(function (data) {
        host.innerHTML = renderTraffic(data);
      });
      return;
    }

    if (activeTab === 'funnel') {
      loadFunnel().then(function (steps) {
        host.innerHTML = renderFunnel(steps);
        drawBarChart('chartHubFunnel', steps.map(function (s) { return String(s.step).replace(/_/g, ' '); }), steps.map(function (s) { return s.count; }), 'Count');
      });
      return;
    }

    if (activeTab === 'cart') {
      Promise.all([loadCarts(), loadTrends()]).then(function (res) {
        host.innerHTML = renderCartAnalytics(res[0]);
        var atc = seriesLabelsValues((res[1] || {}).add_to_cart);
        drawLineChart('chartHubCart', atc.labels, atc.values, 'Add to cart');
      });
      return;
    }

    if (activeTab === 'abandoned') {
      loadAbandoned().then(function (carts) {
        host.innerHTML = renderAbandoned(carts);
      });
      return;
    }

    if (activeTab === 'revenue') {
      loadTrends().then(function (trends) {
        host.innerHTML = renderRevenue(trends);
        var rev = seriesLabelsValues(trends.revenue);
        var ord = seriesLabelsValues(trends.orders);
        var chk = seriesLabelsValues(trends.checkout);
        var vis = seriesLabelsValues(trends.visitors);
        drawLineChart('chartHubRevenue', rev.labels, rev.values.map(function (v) { return v / 100; }), 'Revenue USD');
        drawLineChart('chartHubOrders', ord.labels, ord.values, 'Orders');
        drawLineChart('chartHubCheckout', chk.labels, chk.values, 'Checkouts');
        var conv = vis.values.map(function (v, i) {
          return v > 0 ? ((ord.values[i] || 0) / v * 100) : 0;
        });
        drawLineChart('chartHubConvRate', vis.labels, conv, 'Conversion %');
      });
      return;
    }

    if (activeTab === 'products') {
      loadProducts().then(function (data) {
        host.innerHTML = renderProducts(data);
      });
      return;
    }

    if (activeTab === 'orders') {
      host.innerHTML = renderOrdersTable();
      var sb = window.supabase;
      if (sb) {
        sb.from('orders').select('*').order('created_at', { ascending: false }).limit(50).then(function (res) {
          var orders = res.data || [];
          var rows = orders.map(function (o) {
            return '<tr><td>' + formatDate(o.created_at) + '</td><td>' + (o.customer_email || '—') + '</td><td>' + (o.product_slug || '—') + '</td><td>' + formatUsdCents(o.amount_total_cents) + '</td><td>' + (o.status || '') + '</td></tr>';
          }).join('') || '<tr><td colspan="5">No orders</td></tr>';
          document.getElementById('analyticsOrdersHost').innerHTML =
            '<h3>Recent orders</h3><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Date</th><th>Email</th><th>Product</th><th>Total</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
        });
      }
      return;
    }

    if (activeTab === 'customers') {
      host.innerHTML = renderCustomersNote();
      return;
    }

    if (activeTab === 'countries' || activeTab === 'devices') {
      loadDistributions().then(function (data) {
        data = data || {};
        if (activeTab === 'countries') {
          host.innerHTML = renderDistribution('Country distribution', data.countries, 'chartHubCountries');
          drawDoughnut('chartHubCountries', (data.countries || []).map(function (c) { return { label: c.label, value: c.value }; }));
        } else {
          host.innerHTML =
            renderDistribution('Device distribution', data.devices, 'chartHubDevices') +
            renderDistribution('Browser distribution', data.browsers, 'chartHubBrowsers');
          drawDoughnut('chartHubDevices', (data.devices || []).map(function (d) { return { label: d.label, value: d.value }; }));
          drawDoughnut('chartHubBrowsers', (data.browsers || []).map(function (b) { return { label: b.label, value: b.value }; }));
        }
      });
      return;
    }

    host.innerHTML = '<p class="admin-error">Unknown analytics section.</p>';
  }

  if (window.ZYBAR_MY_TEST && window.MOCK_DATA && window.MOCK_DATA.analyticsHub) {
    renderShell();
    document.getElementById('analyticsHubContent').innerHTML = '<p class="admin-muted">Analytics mock mode — connect Supabase migration for live cart data.</p>';
    return;
  }

  renderShell();
  loadTab();

  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(loadTab, 60000);
};
