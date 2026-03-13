/**
 * Admin Dashboard - KPIs with date range, sparklines, live visitors (no traffic source)
 * Sessions, Total sales, Orders, Conversion rate
 */
window.renderAdmindashboard = function (container) {
  if (!container) return;
  var sb = window.supabase;
  if (!sb) {
    container.innerHTML = '<p class="admin-error">Supabase not configured.</p>';
    return;
  }

  var state = {
    start: null,
    end: null,
    startPrev: null,
    endPrev: null
  };

  function getMonthRange(year, month) {
    var s = new Date(year, month, 1);
    var e = new Date(year, month + 1, 0);
    e.setHours(23, 59, 59, 999);
    return { start: s, end: e };
  }

  function setCurrentMonth() {
    var now = new Date();
    var cur = getMonthRange(now.getFullYear(), now.getMonth());
    var prev = getMonthRange(now.getFullYear(), now.getMonth() - 1);
    state.start = cur.start;
    state.end = cur.end;
    state.startPrev = prev.start;
    state.endPrev = prev.end;
  }

  setCurrentMonth();

  function formatDateRangeLabel() {
    var m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return m[state.start.getMonth()] + ' ' + state.start.getDate() + '-' + state.end.getDate() + ', ' + state.start.getFullYear();
  }

  function iso(date) { return date.toISOString().slice(0, 19).replace('T', ' '); }
  function isoDate(d) { return d.toISOString().slice(0, 10); }

  container.innerHTML =
    '<h2 class="admin-page-title">Dashboard</h2>' +
    '<div class="admin-dashboard-header">' +
    '  <div class="admin-dashboard-toolbar">' +
    '    <div class="admin-date-range" id="adminDateRange">' + formatDateRangeLabel() + '</div>' +
    '    <div class="admin-live-visitors" id="adminLiveVisitors"><span class="admin-live-dot"></span> <span id="adminLiveCount">0</span> live visitors</div>' +
    '  </div>' +
    '</div>' +
    '<div class="admin-kpi-cards" id="adminKpiCards">' +
    '  <div class="admin-kpi-card"><div class="admin-kpi-value" id="kpiSessions">—</div><div class="admin-kpi-meta"><span class="admin-kpi-change" id="kpiSessionsChange">—</span></div><div class="admin-kpi-spark" id="sparkSessions"></div><div class="admin-kpi-label">Sessions</div></div>' +
    '  <div class="admin-kpi-card"><div class="admin-kpi-value" id="kpiSales">—</div><div class="admin-kpi-meta"><span class="admin-kpi-change" id="kpiSalesChange">—</span></div><div class="admin-kpi-spark" id="sparkSales"></div><div class="admin-kpi-label">Total sales</div></div>' +
    '  <div class="admin-kpi-card"><div class="admin-kpi-value" id="kpiOrders">—</div><div class="admin-kpi-meta"><span class="admin-kpi-change" id="kpiOrdersChange">—</span></div><div class="admin-kpi-spark" id="sparkOrders"></div><div class="admin-kpi-label">Orders</div></div>' +
    '  <div class="admin-kpi-card"><div class="admin-kpi-value" id="kpiConv">—</div><div class="admin-kpi-meta"><span class="admin-kpi-change" id="kpiConvChange">—</span></div><div class="admin-kpi-spark" id="sparkConv"></div><div class="admin-kpi-label">Conversion rate</div></div>' +
    '</div>' +
    '<div class="admin-card"><h3>Most viewed pages</h3><div id="topPages" class="admin-loading">Loading...</div></div>' +
    '<div class="admin-card"><h3>Top products</h3><div id="topProducts" class="admin-loading">Loading...</div></div>';

  function drawSparkline(elId, values) {
    var el = document.getElementById(elId);
    if (!el || !values || values.length === 0) return;
    var max = Math.max.apply(null, values);
    if (max === 0) max = 1;
    var w = 80, h = 28;
    var pts = values.map(function (v, i) {
      var x = (i / (values.length - 1 || 1)) * w;
      var y = h - (v / max) * h;
      return x + ',' + y;
    }).join(' ');
    el.innerHTML = '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none"><polyline fill="none" stroke="#0d6efd" stroke-width="1.5" points="' + pts + '"/></svg>';
  }

  function formatNum(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(n);
  }

  function pctChange(curr, prev) {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 100);
  }

  function renderChange(elId, pct) {
    var el = document.getElementById(elId);
    if (!el) return;
    if (pct == null || isNaN(pct)) { el.textContent = '—'; el.className = 'admin-kpi-change'; return; }
    el.className = 'admin-kpi-change ' + (pct >= 0 ? 'admin-kpi-up' : 'admin-kpi-down');
    el.textContent = (pct >= 0 ? '+' : '') + pct + '%';
  }

  function loadLiveVisitors() {
    var cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    sb.from('sessions').select('*', { count: 'exact', head: true }).gte('last_activity_at', cutoff)
      .then(function (r) {
        var el = document.getElementById('adminLiveCount');
        if (el) el.textContent = (r && r.count != null) ? r.count : 0;
      })
      .catch(function () {
        var el = document.getElementById('adminLiveCount');
        if (el) el.textContent = '0';
      });
  }

  loadLiveVisitors();
  setInterval(loadLiveVisitors, 30000);

  function loadKpis() {
    var startStr = state.start.toISOString().slice(0, 10);
    var endStr = state.end.toISOString().slice(0, 10);
    var endExcl = new Date(state.end.getTime() + 1).toISOString().slice(0, 10);
    var startPrevStr = state.startPrev.toISOString().slice(0, 10);
    var endPrevExcl = new Date(state.endPrev.getTime() + 1).toISOString().slice(0, 10);

    Promise.all([
      sb.from('sessions').select('started_at').gte('started_at', startStr).lt('started_at', endExcl),
      sb.from('sessions').select('started_at').gte('started_at', startPrevStr).lt('started_at', endPrevExcl),
      sb.from('events').select('created_at').eq('event_type', 'add_to_cart').gte('created_at', startStr).lt('created_at', endExcl),
      sb.from('events').select('created_at').eq('event_type', 'add_to_cart').gte('created_at', startPrevStr).lt('created_at', endPrevExcl)
    ]).then(function (results) {
      var sessionsData = (results[0] && results[0].data) || [];
      var sessionsPrevData = (results[1] && results[1].data) || [];
      var ordersData = (results[2] && results[2].data) || [];
      var ordersPrevData = (results[3] && results[3].data) || [];

      var sessions = sessionsData.length;
      var sessionsPrev = sessionsPrevData.length;
      var orders = ordersData.length;
      var ordersPrev = ordersPrevData.length;

      var conv = sessions > 0 ? (orders / sessions) * 100 : 0;
      var convPrev = sessionsPrev > 0 ? (ordersPrev / sessionsPrev) * 100 : 0;

      var pctSessions = pctChange(sessions, sessionsPrev);
      var pctOrders = pctChange(orders, ordersPrev);
      var pctConv = convPrev > 0 ? Math.round(((conv - convPrev) / convPrev) * 100) : (conv > 0 ? 100 : 0);

      document.getElementById('kpiSessions').textContent = formatNum(sessions);
      document.getElementById('kpiSales').textContent = 'RM 0';
      document.getElementById('kpiOrders').textContent = formatNum(orders);
      document.getElementById('kpiConv').textContent = conv.toFixed(2) + '%';

      renderChange('kpiSessionsChange', pctSessions);
      renderChange('kpiSalesChange', null);
      renderChange('kpiOrdersChange', pctOrders);
      renderChange('kpiConvChange', pctConv);

      var dayCount = Math.ceil((state.end - state.start) / 86400000) + 1;
      var byDaySessions = {};
      var byDayOrders = {};
      for (var d = new Date(state.start); d <= state.end; d.setDate(d.getDate() + 1)) {
        var k = isoDate(new Date(d));
        byDaySessions[k] = 0;
        byDayOrders[k] = 0;
      }
      sessionsData.forEach(function (r) {
        var k = (r.started_at || '').slice(0, 10);
        if (byDaySessions[k] !== undefined) byDaySessions[k]++;
      });
      ordersData.forEach(function (r) {
        var k = (r.created_at || '').slice(0, 10);
        if (byDayOrders[k] !== undefined) byDayOrders[k]++;
      });
      var days = Object.keys(byDaySessions).sort();
      var sparkSessions = days.map(function (k) { return byDaySessions[k] || 0; });
      var sparkOrders = days.map(function (k) { return byDayOrders[k] || 0; });

      drawSparkline('sparkSessions', sparkSessions);
      drawSparkline('sparkSales', sparkSessions);
      drawSparkline('sparkOrders', sparkOrders);
      drawSparkline('sparkConv', days.map(function (k) {
        var s = byDaySessions[k] || 0;
        var o = byDayOrders[k] || 0;
        return s > 0 ? (o / s) * 100 : 0;
      }));
    }).catch(function () {
      document.getElementById('kpiSessions').textContent = '0';
      document.getElementById('kpiSales').textContent = 'RM 0';
      document.getElementById('kpiOrders').textContent = '0';
      document.getElementById('kpiConv').textContent = '0%';
    });
  }

  loadKpis();

  var today = state.start.toISOString().slice(0, 10);
  var tomorrow = new Date(state.end.getTime() + 86400000).toISOString().slice(0, 10);

  function renderTopPages(rows) {
    var el = document.getElementById('topPages');
    if (!el) return;
    if (!rows || rows.length === 0) { el.innerHTML = '<p>No data yet.</p>'; return; }
    var html = '<table class="admin-table"><thead><tr><th>Page</th><th>Views</th></tr></thead><tbody>';
    rows.forEach(function (r) { html += '<tr><td>' + (r.page_url || '-') + '</td><td>' + (r.count || 0) + '</td></tr>'; });
    html += '</tbody></table>';
    el.innerHTML = html;
  }

  function renderTopProducts(rows) {
    var el = document.getElementById('topProducts');
    if (!el) return;
    if (!rows || rows.length === 0) { el.innerHTML = '<p>No data yet.</p>'; return; }
    var html = '<table class="admin-table"><thead><tr><th>Product</th><th>Views</th></tr></thead><tbody>';
    rows.forEach(function (r) { html += '<tr><td>' + (r.product_id || r.name || '-') + '</td><td>' + (r.count || 0) + '</td></tr>'; });
    html += '</tbody></table>';
    el.innerHTML = html;
  }

  sb.from('page_views').select('page_url').gte('created_at', today).lt('created_at', tomorrow)
    .then(function (res) {
      var data = (res && res.data) || [];
      var map = {};
      data.forEach(function (r) { map[r.page_url] = (map[r.page_url] || 0) + 1; });
      var arr = Object.keys(map).map(function (url) { return { page_url: url, count: map[url] }; }).sort(function (a, b) { return b.count - a.count; }).slice(0, 10);
      renderTopPages(arr);
    })
    .catch(function () { renderTopPages([]); });

  sb.from('events').select('product_id').eq('event_type', 'product_view').gte('created_at', today).lt('created_at', tomorrow)
    .then(function (res) {
      var data = (res && res.data) || [];
      var map = {};
      data.forEach(function (r) { var id = r.product_id || 'unknown'; map[id] = (map[id] || 0) + 1; });
      var arr = Object.keys(map).map(function (id) { return { product_id: id, count: map[id] }; }).sort(function (a, b) { return b.count - a.count; }).slice(0, 10);
      renderTopProducts(arr);
    })
    .catch(function () { renderTopProducts([]); });
};
