/**
 * Admin Analytics — quick summary bar (Shopify-style), charts synced to date range
 */
window.renderAdminanalytics = function (container) {
  if (!container) return;
  var sb = window.supabase;
  if (!sb) {
    container.innerHTML = '<p class="admin-error">Supabase not configured.</p>';
    return;
  }

  var rangeDays = 30;
  var charts = { pageViews: null, visitors: null, topPages: null };

  var calendarIcon = '<svg class="admin-analytics-filter-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';
  var chevronDown = '<svg class="admin-analytics-filter-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  var channelIcon = '<svg class="admin-analytics-filter-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M7 15V5M7 5l-3 3M7 5l3 3"/><path d="M17 9v10M17 19l-3-3M17 19l3-3"/></svg>';

  container.innerHTML =
    '<h2 class="admin-page-title">Analytics</h2>' +
    '<div class="admin-analytics-toolbar">' +
    '  <label class="admin-analytics-filter-pill">' +
    calendarIcon +
    '    <select id="analyticsRangeSelect" aria-label="Date range">' +
    '      <option value="7">Last 7 days</option>' +
    '      <option value="14">Last 14 days</option>' +
    '      <option value="30" selected>The past 30 days</option>' +
    '    </select>' +
    chevronDown +
    '  </label>' +
    '  <span class="admin-analytics-filter-pill admin-analytics-filter-pill-static" title="All traffic">' +
    channelIcon +
    '    <span>All channels</span>' +
    '  </span>' +
    '</div>' +
    '<div class="admin-analytics-summary-card">' +
    '  <div class="admin-analytics-summary-grid">' +
    '    <div class="admin-analytics-metric">' +
    '      <div class="admin-analytics-metric-top"><span class="admin-analytics-metric-label" title="Checkout sessions started">Sessions</span><div class="admin-analytics-spark" id="analyticsSparkSessions"></div></div>' +
    '      <div class="admin-analytics-metric-value"><span class="admin-kpi-value" id="analyticsKpiSessions">—</span></div>' +
    '      <div class="admin-analytics-metric-trend"><span class="admin-kpi-change" id="analyticsKpiSessionsChange">—</span><span class="admin-analytics-vs">vs prior period</span></div>' +
    '    </div>' +
    '    <div class="admin-analytics-metric">' +
    '      <div class="admin-analytics-metric-top"><span class="admin-analytics-metric-label" title="Stripe checkout (test mode)">Total sales</span><div class="admin-analytics-spark" id="analyticsSparkSales"></div></div>' +
    '      <div class="admin-analytics-metric-value admin-kpi-value-wrap"><span class="admin-kpi-currency" id="analyticsKpiSalesCurrency">US$</span><span class="admin-kpi-value" id="analyticsKpiSales">—</span></div>' +
    '      <div class="admin-analytics-metric-trend"><span class="admin-kpi-change" id="analyticsKpiSalesChange">—</span><span class="admin-analytics-vs">vs prior period</span></div>' +
    '    </div>' +
    '    <div class="admin-analytics-metric">' +
    '      <div class="admin-analytics-metric-top"><span class="admin-analytics-metric-label">Orders</span><div class="admin-analytics-spark" id="analyticsSparkOrders"></div></div>' +
    '      <div class="admin-analytics-metric-value"><span class="admin-kpi-value" id="analyticsKpiOrders">—</span></div>' +
    '      <div class="admin-analytics-metric-trend"><span class="admin-kpi-change" id="analyticsKpiOrdersChange">—</span><span class="admin-analytics-vs">vs prior period</span></div>' +
    '    </div>' +
    '    <div class="admin-analytics-metric">' +
    '      <div class="admin-analytics-metric-top"><span class="admin-analytics-metric-label" title="Orders ÷ sessions">Conversion rate</span><div class="admin-analytics-spark" id="analyticsSparkConv"></div></div>' +
    '      <div class="admin-analytics-metric-value"><span class="admin-kpi-value" id="analyticsKpiConv">—</span></div>' +
    '      <div class="admin-analytics-metric-trend"><span class="admin-kpi-change" id="analyticsKpiConvChange">—</span><span class="admin-analytics-vs">vs prior period</span></div>' +
    '    </div>' +
    '  </div>' +
    '  <span class="admin-analytics-summary-bar-chevron" aria-hidden="true">' + chevronDown + '</span>' +
    '</div>' +
    '<div class="admin-card"><h3>Page views per day</h3><div class="chart-container"><canvas id="chartPageViews"></canvas></div></div>' +
    '<div class="admin-card"><h3>Unique visitors per day</h3><div class="chart-container"><canvas id="chartVisitors"></canvas></div></div>' +
    '<div class="admin-card"><h3>Top pages</h3><div class="chart-container"><canvas id="chartTopPages"></canvas></div></div>';

  function isoDate(d) {
    return d.toISOString().slice(0, 10);
  }

  function rollingRanges(days) {
    var end = new Date();
    end.setHours(23, 59, 59, 999);
    var start = new Date(end);
    start.setDate(start.getDate() - (days - 1));
    start.setHours(0, 0, 0, 0);
    var endPrev = new Date(start);
    endPrev.setDate(endPrev.getDate() - 1);
    endPrev.setHours(23, 59, 59, 999);
    var startPrev = new Date(endPrev);
    startPrev.setDate(startPrev.getDate() - (days - 1));
    startPrev.setHours(0, 0, 0, 0);
    return { start: start, end: end, startPrev: startPrev, endPrev: endPrev };
  }

  function destroyCharts() {
    ['pageViews', 'visitors', 'topPages'].forEach(function (k) {
      if (charts[k]) {
        charts[k].destroy();
        charts[k] = null;
      }
    });
  }

  function drawSparkline(elId, values) {
    var el = document.getElementById(elId);
    if (!el || !values || values.length === 0) return;
    var max = Math.max.apply(null, values);
    if (max === 0) max = 1;
    var w = 80;
    var h = 40;
    var n = values.length;
    var xs = [];
    var ys = [];
    for (var i = 0; i < n; i++) {
      xs.push((i / (n - 1 || 1)) * w);
      ys.push(h - (values[i] / max) * h);
    }
    var path = 'M ' + xs[0] + ',' + ys[0];
    for (var j = 1; j < n; j++) {
      var dx = xs[j] - xs[j - 1];
      path += ' C ' + (xs[j - 1] + dx / 2) + ',' + ys[j - 1] + ' ' + (xs[j] - dx / 2) + ',' + ys[j] + ' ' + xs[j] + ',' + ys[j];
    }
    el.innerHTML = '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none"><path fill="none" stroke="#2c6ecb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="' + path + '"/></svg>';
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
    if (pct == null || isNaN(pct)) {
      el.textContent = '\u2014';
      el.className = 'admin-kpi-change';
      return;
    }
    el.className = 'admin-kpi-change ' + (pct >= 0 ? 'admin-kpi-up' : 'admin-kpi-down');
    el.textContent = (pct >= 0 ? '+' : '') + pct + '%';
  }

  function loadSummary() {
    var r = rollingRanges(rangeDays);
    var startStr = isoDate(r.start);
    var endExcl = new Date(r.end.getTime() + 86400000);
    var endExclStr = isoDate(endExcl);
    var startPrevStr = isoDate(r.startPrev);
    var endPrevExcl = new Date(r.endPrev.getTime() + 86400000);
    var endPrevExclStr = isoDate(endPrevExcl);

    Promise.all([
      sb.from('sessions').select('started_at').gte('started_at', startStr).lt('started_at', endExclStr),
      sb.from('sessions').select('started_at').gte('started_at', startPrevStr).lt('started_at', endPrevExclStr),
      sb.from('orders').select('created_at, amount_total_cents').eq('test_mode', true).gte('created_at', startStr).lt('created_at', endExclStr),
      sb.from('orders').select('created_at, amount_total_cents').eq('test_mode', true).gte('created_at', startPrevStr).lt('created_at', endPrevExclStr)
    ]).then(function (results) {
      var sessionsData = (results[0] && results[0].data) || [];
      var sessionsPrevData = (results[1] && results[1].data) || [];
      var ordersData = (results[2] && results[2].data) || [];
      var ordersPrevData = (results[3] && results[3].data) || [];

      var sessions = sessionsData.length;
      var sessionsPrev = sessionsPrevData.length;
      var orders = ordersData.length;
      var ordersPrev = ordersPrevData.length;
      var salesCents = ordersData.reduce(function (sum, row) { return sum + (row.amount_total_cents || 0); }, 0);
      var salesPrevCents = ordersPrevData.reduce(function (sum, row) { return sum + (row.amount_total_cents || 0); }, 0);
      var conv = sessions > 0 ? (orders / sessions) * 100 : 0;
      var convPrev = sessionsPrev > 0 ? (ordersPrev / sessionsPrev) * 100 : 0;

      var pctSessions = pctChange(sessions, sessionsPrev);
      var pctOrders = pctChange(orders, ordersPrev);
      var pctSales = salesPrevCents > 0 ? Math.round(((salesCents - salesPrevCents) / salesPrevCents) * 100) : (salesCents > 0 ? 100 : 0);
      var pctConv = convPrev > 0 ? Math.round(((conv - convPrev) / convPrev) * 100) : (conv > 0 ? 100 : 0);

      var sales = salesCents / 100;
      document.getElementById('analyticsKpiSessions').textContent = formatNum(sessions);
      document.getElementById('analyticsKpiSales').textContent = sales.toFixed(2);
      document.getElementById('analyticsKpiOrders').textContent = formatNum(orders);
      document.getElementById('analyticsKpiConv').textContent = conv.toFixed(2) + '%';

      renderChange('analyticsKpiSessionsChange', pctSessions);
      renderChange('analyticsKpiSalesChange', pctSales);
      renderChange('analyticsKpiOrdersChange', pctOrders);
      renderChange('analyticsKpiConvChange', pctConv);

      var byDaySessions = {};
      var byDayOrders = {};
      var byDaySales = {};
      for (var d = new Date(r.start); d <= r.end; d.setDate(d.getDate() + 1)) {
        var k = isoDate(new Date(d));
        byDaySessions[k] = 0;
        byDayOrders[k] = 0;
        byDaySales[k] = 0;
      }
      sessionsData.forEach(function (row) {
        var key = (row.started_at || '').slice(0, 10);
        if (byDaySessions[key] !== undefined) byDaySessions[key]++;
      });
      ordersData.forEach(function (row) {
        var key = (row.created_at || '').slice(0, 10);
        if (byDayOrders[key] !== undefined) {
          byDayOrders[key]++;
          byDaySales[key] += (row.amount_total_cents || 0) / 100;
        }
      });
      var days = Object.keys(byDaySessions).sort();
      var sparkSessions = days.map(function (key) { return byDaySessions[key] || 0; });
      var sparkOrders = days.map(function (key) { return byDayOrders[key] || 0; });
      var sparkSales = days.map(function (key) { return byDaySales[key] || 0; });
      var sparkConv = days.map(function (key) {
        var s = byDaySessions[key] || 0;
        var o = byDayOrders[key] || 0;
        return s > 0 ? (o / s) * 100 : 0;
      });
      drawSparkline('analyticsSparkSessions', sparkSessions);
      drawSparkline('analyticsSparkSales', sparkSales);
      drawSparkline('analyticsSparkOrders', sparkOrders);
      drawSparkline('analyticsSparkConv', sparkConv);
    }).catch(function () {
      document.getElementById('analyticsKpiSessions').textContent = '0';
      document.getElementById('analyticsKpiSales').textContent = '0.00';
      document.getElementById('analyticsKpiOrders').textContent = '0';
      document.getElementById('analyticsKpiConv').textContent = '0%';
      ['analyticsKpiSessionsChange', 'analyticsKpiSalesChange', 'analyticsKpiOrdersChange', 'analyticsKpiConvChange'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) {
          el.textContent = '\u2014';
          el.className = 'admin-kpi-change';
        }
      });
    });
  }

  function loadCharts() {
    var r = rollingRanges(rangeDays);
    var startStr = isoDate(r.start);
    var endExcl = new Date(r.end.getTime() + 86400000);
    var endExclStr = isoDate(endExcl);

    sb.from('page_views').select('created_at, visitor_id, page_url').gte('created_at', startStr).lt('created_at', endExclStr)
      .then(function (res) {
        var data = (res && res.data) || [];
        var byDay = {};
        var dayKeys = [];
        for (var d = new Date(r.start); d <= r.end; d.setDate(d.getDate() + 1)) {
          var k = isoDate(new Date(d));
          dayKeys.push(k);
          byDay[k] = { views: 0, visitors: new Set() };
        }
        data.forEach(function (row) {
          var k = (row.created_at || '').slice(0, 10);
          if (byDay[k]) {
            byDay[k].views++;
            byDay[k].visitors.add(row.visitor_id);
          }
        });

        var labels = dayKeys.map(function (k) { return k.slice(5); });
        var viewsData = dayKeys.map(function (k) { return (byDay[k] && byDay[k].views) || 0; });
        var visitorsData = dayKeys.map(function (k) { return (byDay[k] && byDay[k].visitors.size) || 0; });

        destroyCharts();

        var elPv = document.getElementById('chartPageViews');
        var elVis = document.getElementById('chartVisitors');
        var elTop = document.getElementById('chartTopPages');
        if (!elPv || !elVis || !elTop) return;

        charts.pageViews = new Chart(elPv, {
          type: 'line',
          data: { labels: labels, datasets: [{ label: 'Page views', data: viewsData, borderColor: '#4f7cff', fill: true, tension: 0.3 }] },
          options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
        });
        charts.visitors = new Chart(elVis, {
          type: 'line',
          data: { labels: labels, datasets: [{ label: 'Unique visitors', data: visitorsData, borderColor: '#10b981', fill: true, tension: 0.3 }] },
          options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
        });

        var urlMap = {};
        data.forEach(function (row) {
          var u = row.page_url || '/';
          urlMap[u] = (urlMap[u] || 0) + 1;
        });
        var urlKeys = Object.keys(urlMap).sort(function (a, b) { return urlMap[b] - urlMap[a]; }).slice(0, 8);
        charts.topPages = new Chart(elTop, {
          type: 'bar',
          data: {
            labels: urlKeys.map(function (u) { return u.length > 30 ? u.slice(0, 30) + '\u2026' : u; }),
            datasets: [{ label: 'Views', data: urlKeys.map(function (k) { return urlMap[k]; }), backgroundColor: '#4f7cff' }]
          },
          options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', scales: { x: { beginAtZero: true } } }
        });
      })
      .catch(function () {
        destroyCharts();
        var wrap = document.getElementById('chartPageViews');
        if (wrap && wrap.parentElement) wrap.parentElement.innerHTML = '<p class="admin-error">Failed to load data.</p>';
      });
  }

  function refreshAll() {
    loadSummary();
    loadCharts();
  }

  var sel = document.getElementById('analyticsRangeSelect');
  if (sel) {
    sel.addEventListener('change', function () {
      rangeDays = parseInt(sel.value, 10) || 30;
      refreshAll();
    });
  }

  refreshAll();
};
