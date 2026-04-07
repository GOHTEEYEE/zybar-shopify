/**
 * Admin Dashboard - KPIs with date range, sparklines, live visitors (no traffic source)
 * Sessions, Total sales, Orders, Conversion rate
 */

function renderDashboardMock(container) {
  var mock = window.MOCK_DATA && window.MOCK_DATA.dashboard;
  if (!mock) return;
  var state = { chartData: null, expandedKpi: null, chartInstance: null };
  var now = new Date();
  function formatAxisDate(isoStr) {
    if (!isoStr) return '';
    var d = new Date(isoStr);
    return (d.getMonth() + 1) + '\u6708' + d.getDate() + '\u65E5';
  }
  function formatDateRangeLabel() {
    var m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var start = mock.labels && mock.labels[0] ? new Date(mock.labels[0]) : now;
    var end = mock.labels && mock.labels.length ? new Date(mock.labels[mock.labels.length - 1]) : now;
    return m[start.getMonth()] + ' ' + start.getDate() + '-' + end.getDate() + ', ' + start.getFullYear();
  }
  function drawSparkline(elId, values) {
    var el = document.getElementById(elId);
    if (!el || !values || values.length === 0) return;
    var max = Math.max.apply(null, values);
    if (max === 0) max = 1;
    var w = 80, h = 40;
    var n = values.length;
    var xs = [], ys = [];
    for (var i = 0; i < n; i++) {
      xs.push((i / (n - 1 || 1)) * w);
      ys.push(h - (values[i] / max) * h);
    }
    var path = 'M ' + xs[0] + ',' + ys[0];
    for (var j = 1; j < n; j++) {
      var dx = xs[j] - xs[j - 1];
      path += ' C ' + (xs[j - 1] + dx / 2) + ',' + ys[j - 1] + ' ' + (xs[j] - dx / 2) + ',' + ys[j] + ' ' + xs[j] + ',' + ys[j];
    }
    el.innerHTML = '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none"><path fill="none" stroke="#3498db" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="' + path + '"/></svg>';
  }
  function formatNum(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(n);
  }
  function renderChange(elId, pct) {
    var el = document.getElementById(elId);
    if (!el) return;
    if (pct == null || isNaN(pct)) { el.textContent = '\u2014'; el.className = 'admin-kpi-change'; return; }
    el.className = 'admin-kpi-change ' + (pct >= 0 ? 'admin-kpi-up' : 'admin-kpi-down');
    el.textContent = (pct >= 0 ? '+' : '') + pct + '%';
  }
  function padPrevToLength(prevArr, len) {
    if (!prevArr || prevArr.length >= len) return (prevArr || []).slice(0, len);
    var out = prevArr.slice();
    while (out.length < len) out.push(0);
    return out;
  }
  state.chartData = {
    labels: mock.labels,
    sessionsCurr: mock.sessionsCurr,
    sessionsPrev: mock.sessionsPrev,
    salesCurr: mock.salesCurr,
    salesPrev: mock.salesPrev,
    ordersCurr: mock.ordersCurr,
    ordersPrev: mock.ordersPrev,
    convCurr: mock.convCurr,
    convPrev: mock.convPrev
  };
  container.innerHTML =
    '<h2 class="admin-page-title">Dashboard</h2>' +
    '<div class="admin-dashboard-header">' +
    '  <div class="admin-dashboard-toolbar">' +
    '    <div class="admin-date-range" id="adminDateRange">' + formatDateRangeLabel() + '</div>' +
    '    <div class="admin-live-visitors" id="adminLiveVisitors"><span class="admin-live-dot"></span> <span id="adminLiveCount">' + (mock.liveVisitors || 0) + '</span> live visitors</div>' +
    '  </div>' +
    '</div>' +
    '<div class="admin-kpi-cards" id="adminKpiCards">' +
    '  <div class="admin-kpi-card" data-kpi="sessions" role="button" tabindex="0">' +
    '    <div class="admin-kpi-card-inner">' +
    '      <div class="admin-kpi-card-top"><span class="admin-kpi-label">Sessions</span><div class="admin-kpi-spark" id="sparkSessions"></div></div>' +
    '      <div class="admin-kpi-value-wrap"><span class="admin-kpi-value" id="kpiSessions">—</span></div>' +
    '      <div class="admin-kpi-card-bottom"><span class="admin-kpi-change" id="kpiSessionsChange">—</span><span class="admin-kpi-vs-label">vs last month</span></div>' +
    '    </div><div class="admin-kpi-chart-panel" id="chartPanelSessions" aria-hidden="true"></div></div>' +
    '  <div class="admin-kpi-card" data-kpi="sales" role="button" tabindex="0">' +
    '    <div class="admin-kpi-card-inner">' +
    '      <div class="admin-kpi-card-top"><span class="admin-kpi-label">Total sales</span><div class="admin-kpi-spark" id="sparkSales"></div></div>' +
    '      <div class="admin-kpi-value-wrap"><span class="admin-kpi-currency" id="kpiSalesCurrency">RM</span> <span class="admin-kpi-value" id="kpiSales">—</span></div>' +
    '      <div class="admin-kpi-card-bottom"><span class="admin-kpi-change" id="kpiSalesChange">—</span><span class="admin-kpi-vs-label">vs last month</span></div>' +
    '    </div><div class="admin-kpi-chart-panel" id="chartPanelSales" aria-hidden="true"></div></div>' +
    '  <div class="admin-kpi-card" data-kpi="orders" role="button" tabindex="0">' +
    '    <div class="admin-kpi-card-inner">' +
    '      <div class="admin-kpi-card-top"><span class="admin-kpi-label">Orders</span><div class="admin-kpi-spark" id="sparkOrders"></div></div>' +
    '      <div class="admin-kpi-value-wrap"><span class="admin-kpi-value" id="kpiOrders">—</span></div>' +
    '      <div class="admin-kpi-card-bottom"><span class="admin-kpi-change" id="kpiOrdersChange">—</span><span class="admin-kpi-vs-label">vs last month</span></div>' +
    '    </div><div class="admin-kpi-chart-panel" id="chartPanelOrders" aria-hidden="true"></div></div>' +
    '  <div class="admin-kpi-card" data-kpi="conv" role="button" tabindex="0">' +
    '    <div class="admin-kpi-card-inner">' +
    '      <div class="admin-kpi-card-top"><span class="admin-kpi-label">Conversion rate</span><div class="admin-kpi-spark" id="sparkConv"></div></div>' +
    '      <div class="admin-kpi-value-wrap"><span class="admin-kpi-value" id="kpiConv">—</span></div>' +
    '      <div class="admin-kpi-card-bottom"><span class="admin-kpi-change" id="kpiConvChange">—</span><span class="admin-kpi-vs-label">vs last month</span></div>' +
    '    </div><div class="admin-kpi-chart-panel" id="chartPanelConv" aria-hidden="true"></div></div>' +
    '</div>' +
    '<div class="admin-card"><h3>Most viewed pages</h3><div id="topPages" class="admin-loading">Loading...</div></div>' +
    '<div class="admin-card"><h3>Top products</h3><div id="topProducts" class="admin-loading">Loading...</div></div>';
  document.getElementById('kpiSessions').textContent = formatNum(mock.sessionsTotal);
  var salesCurEl = document.getElementById('kpiSalesCurrency');
  if (salesCurEl) salesCurEl.textContent = 'RM ';
  document.getElementById('kpiSales').textContent = (mock.salesTotalRM || 0).toFixed(2);
  document.getElementById('kpiOrders').textContent = formatNum(mock.ordersTotal);
  document.getElementById('kpiConv').textContent = (mock.conversionPct || 0).toFixed(2) + '%';
  renderChange('kpiSessionsChange', 12);
  renderChange('kpiSalesChange', 8);
  renderChange('kpiOrdersChange', 5);
  renderChange('kpiConvChange', -5);
  drawSparkline('sparkSessions', mock.sessionsCurr);
  drawSparkline('sparkSales', mock.salesCurr);
  drawSparkline('sparkOrders', mock.ordersCurr);
  drawSparkline('sparkConv', mock.convCurr || mock.sessionsCurr.map(function (s, i) { return s > 0 ? (mock.ordersCurr[i] / s * 100) : 0; }));
  var topPages = mock.topPages || [];
  var topProducts = mock.topProducts || [];
  var pagesHtml = topPages.length ? '<table class="admin-table"><thead><tr><th>Page</th><th>Views</th></tr></thead><tbody>' + topPages.map(function (r) { return '<tr><td>' + (r.page_url || '-') + '</td><td>' + (r.count || 0) + '</td></tr>'; }).join('') + '</tbody></table>' : '<p>No data yet.</p>';
  var productsHtml = topProducts.length ? '<table class="admin-table"><thead><tr><th>Product</th><th>Views</th></tr></thead><tbody>' + topProducts.map(function (r) { return '<tr><td>' + (r.product_id || r.name || '-') + '</td><td>' + (r.count || 0) + '</td></tr>'; }).join('') + '</tbody></table>' : '<p>No data yet.</p>';
  document.getElementById('topPages').innerHTML = pagesHtml;
  document.getElementById('topProducts').innerHTML = productsHtml;
  function renderFullChart(panelId, chartData, kpiKey) {
    var panel = document.getElementById(panelId);
    if (!panel || !chartData || !chartData.labels || chartData.labels.length === 0) return;
    var labels = chartData.labels;
    var curr = chartData[kpiKey + 'Curr'] || [];
    var prev = chartData[kpiKey + 'Prev'] || [];
    var prevPadded = padPrevToLength(prev, labels.length);
    var formatValue = kpiKey === 'sales' ? function (v) { return (v || 0).toFixed(2); } : (kpiKey === 'conv' ? function (v) { return (v || 0).toFixed(1) + '%'; } : function (v) { return String(v || 0); });
    if (state.chartInstance) { state.chartInstance.destroy(); state.chartInstance = null; }
    panel.innerHTML = '<div class="admin-kpi-chart-header"><span class="admin-kpi-chart-range">' + formatAxisDate(labels[0]) + ' \u2013 ' + formatAxisDate(labels[labels.length - 1]) + '</span><button type="button" class="admin-kpi-chart-close" aria-label="Close chart">\u2715</button></div><div class="admin-kpi-chart-canvas-wrap"><canvas id="adminKpiChartCanvas"></canvas></div>';
    panel.querySelector('.admin-kpi-chart-close').addEventListener('click', function (e) { e.stopPropagation(); collapseKpi(); });
    var ctx = document.getElementById('adminKpiChartCanvas');
    if (!ctx || typeof Chart === 'undefined') return;
    state.chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels.map(formatAxisDate),
        datasets: [
          { label: 'Current period', data: curr, borderColor: '#1e40af', backgroundColor: 'rgba(30,64,175,0.08)', fill: true, tension: 0.3, borderWidth: 2 },
          { label: 'Previous period', data: prevPadded, borderColor: '#93c5fd', borderDash: [5, 5], fill: false, tension: 0.3, borderWidth: 2 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: { legend: { display: true, position: 'top' } },
        scales: { x: { grid: { display: false }, ticks: { maxRotation: 45, font: { size: 11 } } }, y: { beginAtZero: true, ticks: { callback: formatValue } } }
      }
    });
  }
  function expandKpi(kpiKey) {
    if (state.expandedKpi === kpiKey) return;
    collapseKpi();
    state.expandedKpi = kpiKey;
    var card = document.querySelector('.admin-kpi-card[data-kpi="' + kpiKey + '"]');
    var panel = document.getElementById('chartPanel' + kpiKey.charAt(0).toUpperCase() + kpiKey.slice(1));
    if (card) card.classList.add('kpi-card-expanded');
    if (panel && state.chartData) {
      panel.setAttribute('aria-hidden', 'false');
      panel.classList.add('admin-kpi-chart-panel-visible');
      renderFullChart(panel.id, state.chartData, kpiKey);
    }
  }
  function collapseKpi() {
    if (state.chartInstance) { state.chartInstance.destroy(); state.chartInstance = null; }
    state.expandedKpi = null;
    document.querySelectorAll('.admin-kpi-card.kpi-card-expanded').forEach(function (c) { c.classList.remove('kpi-card-expanded'); });
    document.querySelectorAll('.admin-kpi-chart-panel').forEach(function (p) {
      p.setAttribute('aria-hidden', 'true');
      p.classList.remove('admin-kpi-chart-panel-visible');
      p.innerHTML = '';
    });
  }
  document.querySelectorAll('.admin-kpi-card[data-kpi]').forEach(function (card) {
    var kpi = card.getAttribute('data-kpi');
    card.addEventListener('click', function (e) {
      if (e.target.closest('.admin-kpi-chart-close')) return;
      if (state.expandedKpi === kpi) collapseKpi(); else expandKpi(kpi);
    });
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); }
    });
  });
}

window.renderAdmindashboard = function (container) {
  if (!container) return;

  if (window.ZYBAR_MY_TEST && window.MOCK_DATA && window.MOCK_DATA.dashboard) {
    renderDashboardMock(container);
    return;
  }

  var sb = window.supabase;
  if (!sb) {
    container.innerHTML = '<p class="admin-error">Supabase not configured.</p>';
    return;
  }

  var state = {
    start: null,
    end: null,
    startPrev: null,
    endPrev: null,
    chartData: null,
    expandedKpi: null,
    chartInstance: null
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

  function formatAxisDate(isoStr) {
    if (!isoStr) return '';
    var d = new Date(isoStr);
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return m + '\u6708' + day + '\u65E5';
  }

  container.innerHTML =
    '<h2 class="admin-page-title">Dashboard</h2>' +
    '<div class="admin-dashboard-header">' +
    '  <div class="admin-dashboard-toolbar">' +
    '    <div class="admin-date-range" id="adminDateRange">' + formatDateRangeLabel() + '</div>' +
    '    <div class="admin-live-visitors" id="adminLiveVisitors"><span class="admin-live-dot"></span> <span id="adminLiveCount">0</span> live visitors</div>' +
    '  </div>' +
    '</div>' +
    '<div class="admin-kpi-cards" id="adminKpiCards">' +
    '  <div class="admin-kpi-card" data-kpi="sessions" role="button" tabindex="0">' +
    '    <div class="admin-kpi-card-inner">' +
    '      <div class="admin-kpi-card-top"><span class="admin-kpi-label">Sessions</span><div class="admin-kpi-spark" id="sparkSessions"></div></div>' +
    '      <div class="admin-kpi-value-wrap"><span class="admin-kpi-value" id="kpiSessions">—</span></div>' +
    '      <div class="admin-kpi-card-bottom"><span class="admin-kpi-change" id="kpiSessionsChange">—</span><span class="admin-kpi-vs-label">vs last month</span></div>' +
    '    </div><div class="admin-kpi-chart-panel" id="chartPanelSessions" aria-hidden="true"></div>' +
    '  </div>' +
    '  <div class="admin-kpi-card" data-kpi="sales" role="button" tabindex="0">' +
    '    <div class="admin-kpi-card-inner">' +
    '      <div class="admin-kpi-card-top"><span class="admin-kpi-label">Total sales</span><div class="admin-kpi-spark" id="sparkSales"></div></div>' +
    '      <div class="admin-kpi-value-wrap"><span class="admin-kpi-currency" id="kpiSalesCurrency">USD</span> <span class="admin-kpi-value" id="kpiSales">—</span></div>' +
    '      <div class="admin-kpi-card-bottom"><span class="admin-kpi-change" id="kpiSalesChange">—</span><span class="admin-kpi-vs-label">vs last month</span></div>' +
    '    </div><div class="admin-kpi-chart-panel" id="chartPanelSales" aria-hidden="true"></div>' +
    '  </div>' +
    '  <div class="admin-kpi-card" data-kpi="orders" role="button" tabindex="0">' +
    '    <div class="admin-kpi-card-inner">' +
    '      <div class="admin-kpi-card-top"><span class="admin-kpi-label">Orders</span><div class="admin-kpi-spark" id="sparkOrders"></div></div>' +
    '      <div class="admin-kpi-value-wrap"><span class="admin-kpi-value" id="kpiOrders">—</span></div>' +
    '      <div class="admin-kpi-card-bottom"><span class="admin-kpi-change" id="kpiOrdersChange">—</span><span class="admin-kpi-vs-label">vs last month</span></div>' +
    '    </div><div class="admin-kpi-chart-panel" id="chartPanelOrders" aria-hidden="true"></div>' +
    '  </div>' +
    '  <div class="admin-kpi-card" data-kpi="conv" role="button" tabindex="0">' +
    '    <div class="admin-kpi-card-inner">' +
    '      <div class="admin-kpi-card-top"><span class="admin-kpi-label">Conversion rate</span><div class="admin-kpi-spark" id="sparkConv"></div></div>' +
    '      <div class="admin-kpi-value-wrap"><span class="admin-kpi-value" id="kpiConv">—</span></div>' +
    '      <div class="admin-kpi-card-bottom"><span class="admin-kpi-change" id="kpiConvChange">—</span><span class="admin-kpi-vs-label">vs last month</span></div>' +
    '    </div><div class="admin-kpi-chart-panel" id="chartPanelConv" aria-hidden="true"></div>' +
    '  </div>' +
    '</div>' +
    '<div class="admin-card"><h3>Most viewed pages</h3><div id="topPages" class="admin-loading">Loading...</div></div>' +
    '<div class="admin-card"><h3>Top products</h3><div id="topProducts" class="admin-loading">Loading...</div></div>';

  function drawSparkline(elId, values) {
    var el = document.getElementById(elId);
    if (!el || !values || values.length === 0) return;
    var max = Math.max.apply(null, values);
    if (max === 0) max = 1;
    var w = 80, h = 40;
    var n = values.length;
    var xs = [], ys = [];
    for (var i = 0; i < n; i++) {
      xs.push((i / (n - 1 || 1)) * w);
      ys.push(h - (values[i] / max) * h);
    }
    var path = 'M ' + xs[0] + ',' + ys[0];
    for (var j = 1; j < n; j++) {
      var dx = xs[j] - xs[j - 1];
      path += ' C ' + (xs[j - 1] + dx / 2) + ',' + ys[j - 1] + ' ' + (xs[j] - dx / 2) + ',' + ys[j] + ' ' + xs[j] + ',' + ys[j];
    }
    el.innerHTML = '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none"><path fill="none" stroke="#3498db" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="' + path + '"/></svg>';
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
    if (pct == null || isNaN(pct)) { el.textContent = '\u2014'; el.className = 'admin-kpi-change'; return; }
    el.className = 'admin-kpi-change ' + (pct >= 0 ? 'admin-kpi-up' : 'admin-kpi-down');
    el.textContent = (pct >= 0 ? '+' : '') + pct + '%';
  }

  function padPrevToLength(prevArr, len) {
    if (!prevArr || prevArr.length >= len) return (prevArr || []).slice(0, len);
    var out = prevArr.slice();
    while (out.length < len) out.push(0);
    return out;
  }

  function renderFullChart(panelId, chartData, kpiKey) {
    var panel = document.getElementById(panelId);
    if (!panel || !chartData || !chartData.labels || chartData.labels.length === 0) return;
    var labels = chartData.labels;
    var curr = chartData[kpiKey + 'Curr'] || [];
    var prev = chartData[kpiKey + 'Prev'] || [];
    var prevPadded = padPrevToLength(prev, labels.length);
    var formatValue = kpiKey === 'sales' ? function (v) { return (v || 0).toFixed(2); } : (kpiKey === 'conv' ? function (v) { return (v || 0).toFixed(1) + '%'; } : function (v) { return String(v || 0); });
    if (state.chartInstance) {
      state.chartInstance.destroy();
      state.chartInstance = null;
    }
    panel.innerHTML = '<div class="admin-kpi-chart-header">' +
      '<span class="admin-kpi-chart-range">' + formatAxisDate(labels[0]) + ' \u2013 ' + formatAxisDate(labels[labels.length - 1]) + '</span>' +
      '<button type="button" class="admin-kpi-chart-close" aria-label="Close chart">\u2715</button>' +
      '</div><div class="admin-kpi-chart-canvas-wrap"><canvas id="adminKpiChartCanvas"></canvas></div>';
    var closeBtn = panel.querySelector('.admin-kpi-chart-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function (e) { e.stopPropagation(); collapseKpi(); });
    }
    var ctx = document.getElementById('adminKpiChartCanvas');
    if (!ctx || typeof Chart === 'undefined') return;
    state.chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels.map(formatAxisDate),
        datasets: [
          { label: 'Current period', data: curr, borderColor: '#1e40af', backgroundColor: 'rgba(30,64,175,0.08)', fill: true, tension: 0.3, borderWidth: 2 },
          { label: 'Previous period', data: prevPadded, borderColor: '#93c5fd', backgroundColor: 'transparent', borderDash: [5, 5], fill: false, tension: 0.3, borderWidth: 2 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: { legend: { display: true, position: 'top' } },
        scales: {
          x: { grid: { display: false }, ticks: { maxRotation: 45, font: { size: 11 } } },
          y: { beginAtZero: true, ticks: { callback: formatValue } }
        }
      }
    });
  }

  function expandKpi(kpiKey) {
    if (state.expandedKpi === kpiKey) return;
    collapseKpi();
    state.expandedKpi = kpiKey;
    var card = document.querySelector('.admin-kpi-card[data-kpi="' + kpiKey + '"]');
    var panel = document.getElementById('chartPanel' + kpiKey.charAt(0).toUpperCase() + kpiKey.slice(1));
    if (card) card.classList.add('kpi-card-expanded');
    if (panel && state.chartData) {
      panel.setAttribute('aria-hidden', 'false');
      panel.classList.add('admin-kpi-chart-panel-visible');
      renderFullChart(panel.id, state.chartData, kpiKey);
    }
  }

  function collapseKpi() {
    if (state.chartInstance) {
      state.chartInstance.destroy();
      state.chartInstance = null;
    }
    state.expandedKpi = null;
    document.querySelectorAll('.admin-kpi-card.kpi-card-expanded').forEach(function (c) { c.classList.remove('kpi-card-expanded'); });
    document.querySelectorAll('.admin-kpi-chart-panel').forEach(function (p) {
      p.setAttribute('aria-hidden', 'true');
      p.classList.remove('admin-kpi-chart-panel-visible');
      p.innerHTML = '';
    });
  }

  function bindKpiCards() {
    document.querySelectorAll('.admin-kpi-card[data-kpi]').forEach(function (card) {
      var kpi = card.getAttribute('data-kpi');
      card.addEventListener('click', function (e) {
        if (e.target.closest('.admin-kpi-chart-close')) return;
        if (state.expandedKpi === kpi) collapseKpi(); else expandKpi(kpi);
      });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); }
      });
    });
  }

  function loadLiveVisitors() {
    var el = document.getElementById('adminLiveCount');
    var sinceIso = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    sb.rpc('get_live_visitor_count')
      .then(function (r) {
        if (r && r.data != null) {
          if (el) el.textContent = r.data;
          return;
        }
        throw new Error('RPC returned no data');
      })
      .catch(function () {
        // Fallback for projects that do not have the RPC function.
        return sb
          .from('sessions')
          .select('id', { count: 'exact', head: true })
          .gte('last_activity_at', sinceIso)
          .then(function (res) {
            if (el) el.textContent = (res && typeof res.count === 'number') ? res.count : 0;
          })
          .catch(function () {
            if (el) el.textContent = '0';
          });
      });
  }

  loadLiveVisitors();
  setInterval(loadLiveVisitors, 10000);
  bindKpiCards();

  function loadKpis() {
    var startStr = state.start.toISOString().slice(0, 10);
    var endStr = state.end.toISOString().slice(0, 10);
    var endExcl = new Date(state.end.getTime() + 1).toISOString().slice(0, 10);
    var startPrevStr = state.startPrev.toISOString().slice(0, 10);
    var endPrevExcl = new Date(state.endPrev.getTime() + 1).toISOString().slice(0, 10);

    Promise.all([
      sb.from('sessions').select('started_at').gte('started_at', startStr).lt('started_at', endExcl),
      sb.from('sessions').select('started_at').gte('started_at', startPrevStr).lt('started_at', endPrevExcl),
      sb.from('orders').select('created_at, amount_total_cents').eq('test_mode', true).gte('created_at', startStr).lt('created_at', endExcl),
      sb.from('orders').select('created_at, amount_total_cents').eq('test_mode', true).gte('created_at', startPrevStr).lt('created_at', endPrevExcl)
    ]).then(function (results) {
      var sessionsData = (results[0] && results[0].data) || [];
      var sessionsPrevData = (results[1] && results[1].data) || [];
      var ordersData = (results[2] && results[2].data) || [];
      var ordersPrevData = (results[3] && results[3].data) || [];

      var sessions = sessionsData.length;
      var sessionsPrev = sessionsPrevData.length;
      var orders = ordersData.length;
      var ordersPrev = ordersPrevData.length;

      var salesCents = ordersData.reduce(function (sum, r) { return sum + (r.amount_total_cents || 0); }, 0);
      var salesPrevCents = ordersPrevData.reduce(function (sum, r) { return sum + (r.amount_total_cents || 0); }, 0);

      var conv = sessions > 0 ? (orders / sessions) * 100 : 0;
      var convPrev = sessionsPrev > 0 ? (ordersPrev / sessionsPrev) * 100 : 0;

      var pctSessions = pctChange(sessions, sessionsPrev);
      var pctOrders = pctChange(orders, ordersPrev);
      var pctSales = salesPrevCents > 0 ? Math.round(((salesCents - salesPrevCents) / salesPrevCents) * 100) : (salesCents > 0 ? 100 : 0);
      var pctConv = convPrev > 0 ? Math.round(((conv - convPrev) / convPrev) * 100) : (conv > 0 ? 100 : 0);

      var sales = salesCents / 100;

      document.getElementById('kpiSessions').textContent = formatNum(sessions);
      var salesCur = document.getElementById('kpiSalesCurrency');
      if (salesCur) salesCur.textContent = 'USD ';
      document.getElementById('kpiSales').textContent = sales.toFixed(2);
      document.getElementById('kpiOrders').textContent = formatNum(orders);
      document.getElementById('kpiConv').textContent = conv.toFixed(2) + '%';

      renderChange('kpiSessionsChange', pctSessions);
      renderChange('kpiSalesChange', pctSales);
      renderChange('kpiOrdersChange', pctOrders);
      renderChange('kpiConvChange', pctConv);

      var byDaySessions = {};
      var byDayOrders = {};
      var byDaySales = {};
      for (var d = new Date(state.start); d <= state.end; d.setDate(d.getDate() + 1)) {
        var k = isoDate(new Date(d));
        byDaySessions[k] = 0;
        byDayOrders[k] = 0;
        byDaySales[k] = 0;
      }
      sessionsData.forEach(function (r) {
        var k = (r.started_at || '').slice(0, 10);
        if (byDaySessions[k] !== undefined) byDaySessions[k]++;
      });
      ordersData.forEach(function (r) {
        var k = (r.created_at || '').slice(0, 10);
        if (byDayOrders[k] !== undefined) byDayOrders[k]++;
        if (byDaySales[k] !== undefined) byDaySales[k] += (r.amount_total_cents || 0) / 100;
      });
      var byDaySessionsPrev = {};
      var byDayOrdersPrev = {};
      var byDaySalesPrev = {};
      for (var d2 = new Date(state.startPrev); d2 <= state.endPrev; d2.setDate(d2.getDate() + 1)) {
        var k2 = isoDate(new Date(d2));
        byDaySessionsPrev[k2] = 0;
        byDayOrdersPrev[k2] = 0;
        byDaySalesPrev[k2] = 0;
      }
      sessionsPrevData.forEach(function (r) {
        var k2 = (r.started_at || '').slice(0, 10);
        if (byDaySessionsPrev[k2] !== undefined) byDaySessionsPrev[k2]++;
      });
      ordersPrevData.forEach(function (r) {
        var k2 = (r.created_at || '').slice(0, 10);
        if (byDayOrdersPrev[k2] !== undefined) { byDayOrdersPrev[k2]++; byDaySalesPrev[k2] += (r.amount_total_cents || 0) / 100; }
      });
      var days = Object.keys(byDaySessions).sort();
      var daysPrev = Object.keys(byDaySessionsPrev).sort();
      var sparkSessions = days.map(function (k) { return byDaySessions[k] || 0; });
      var sparkOrders = days.map(function (k) { return byDayOrders[k] || 0; });
      var sparkSales = days.map(function (k) { return byDaySales[k] || 0; });
      var sparkConv = days.map(function (k) {
        var s = byDaySessions[k] || 0;
        var o = byDayOrders[k] || 0;
        return s > 0 ? (o / s) * 100 : 0;
      });
      var sessionsPrevArr = daysPrev.map(function (k) { return byDaySessionsPrev[k] || 0; });
      var ordersPrevArr = daysPrev.map(function (k) { return byDayOrdersPrev[k] || 0; });
      var salesPrevArr = daysPrev.map(function (k) { return byDaySalesPrev[k] || 0; });
      var convPrevArr = daysPrev.map(function (k) {
        var s = byDaySessionsPrev[k] || 0;
        var o = byDayOrdersPrev[k] || 0;
        return s > 0 ? (o / s) * 100 : 0;
      });

      state.chartData = {
        labels: days,
        sessionsCurr: sparkSessions,
        sessionsPrev: sessionsPrevArr,
        salesCurr: sparkSales,
        salesPrev: salesPrevArr,
        ordersCurr: sparkOrders,
        ordersPrev: ordersPrevArr,
        convCurr: sparkConv,
        convPrev: convPrevArr
      };

      drawSparkline('sparkSessions', sparkSessions);
      drawSparkline('sparkSales', sparkSales);
      drawSparkline('sparkOrders', sparkOrders);
      drawSparkline('sparkConv', sparkConv);
    }).catch(function () {
      document.getElementById('kpiSessions').textContent = '0';
      var salesCur0 = document.getElementById('kpiSalesCurrency');
      if (salesCur0) salesCur0.textContent = 'USD ';
      document.getElementById('kpiSales').textContent = '0.00';
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
