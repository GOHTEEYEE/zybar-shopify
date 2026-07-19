/**
 * Admin Analytics — Overview · Revenue · Conversion · Products · Countries · Traffic Sources
 * Real Supabase / API data only. Date presets refresh every KPI and chart.
 */
window.renderAdminanalytics = function (container) {
  if (!container) return;

  var U = window.AdminUtils || {};
  var tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'revenue', label: 'Revenue' },
    { id: 'conversion', label: 'Conversion' },
    { id: 'products', label: 'Products' },
    { id: 'countries', label: 'Countries' },
    { id: 'traffic', label: 'Traffic Sources' }
  ];

  var hash = (window.location.hash || '#analytics').slice(1);
  var parts = hash.split('/');
  var activeTab = parts[1] && tabs.some(function (t) { return t.id === parts[1]; }) ? parts[1] : 'overview';

  var rangeState = { preset: '30', customStart: '', customEnd: '' };
  var range = U.resolveRange ? U.resolveRange('30') : { days: 30, startDate: '', endDate: '', start: '', end: '' };
  var charts = {};
  var cache = {};
  var CACHE_TTL = 45000;
  var sortState = { countries: { key: 'revenue_cents', dir: -1 }, products: { key: 'revenue_cents', dir: -1 } };
  var lastPayload = {};
  var productSearch = '';

  function granularityForRange() {
    var days = Number(range.days) || 30;
    if (days <= 14) return 'day';
    if (days <= 90) return 'week';
    return 'month';
  }

  function apiBase() {
    return window.location.origin;
  }

  function cacheKey(path) {
    return path + '|' + range.startDate + '|' + range.endDate;
  }

  function fetchJson(path) {
    var key = cacheKey(path);
    var hit = cache[key];
    if (hit && Date.now() - hit.t < CACHE_TTL) return Promise.resolve(hit.data);

    var q = U.apiQuery ? U.apiQuery(range) : 'days=' + (range.days || 30);
    return fetch(apiBase() + path + (path.indexOf('?') === -1 ? '?' : '&') + q)
      .then(function (r) {
        if (!r.ok) return null;
        return r.json();
      })
      .then(function (data) {
        if (!data || data.error || typeof data !== 'object') return null;
        cache[key] = { t: Date.now(), data: data };
        return data;
      })
      .catch(function () {
        return null;
      });
  }

  function rpc(name, params) {
    var sb = window.supabase;
    if (!sb) return Promise.resolve(null);
    return sb
      .rpc(name, params)
      .then(function (res) {
        if (res.error) throw res.error;
        return res.data;
      })
      .catch(function () {
        return null;
      });
  }

  function loadOverview() {
    return fetchJson('/api/analytics/overview').then(function (data) {
      if (data && (data.unique_visitors != null || data.product_views != null || data.orders != null)) return data;
      return rpc('get_shopify_analytics_overview', { p_start: range.start, p_end: range.end });
    });
  }

  function loadTrends() {
    var gran = granularityForRange();
    return fetchJson('/api/analytics/trends?granularity=' + encodeURIComponent(gran)).then(function (data) {
      if (data && (data.visitors || data.orders || data.revenue)) return data;
      return rpc('get_analytics_trends', {
        p_start: range.start,
        p_end: range.end,
        p_granularity: gran
      });
    });
  }

  function loadFunnel() {
    return fetchJson('/api/analytics/funnel').then(function (data) {
      if (data && Array.isArray(data.steps)) return data.steps;
      return rpc('get_shopify_conversion_funnel', { p_start: range.start, p_end: range.end }).then(function (steps) {
        return Array.isArray(steps) ? steps : [];
      });
    });
  }

  function loadCarts() {
    return fetchJson('/api/analytics/carts').then(function (data) {
      if (data && typeof data.total_add_to_cart !== 'undefined') return data;
      return rpc('get_cart_analytics_summary', { p_start: range.start, p_end: range.end });
    });
  }

  function loadProducts() {
    return fetchJson('/api/analytics/products').then(function (data) {
      if (data && (data.most_viewed || data.most_added || data.highest_revenue)) return data;
      return rpc('get_shopify_top_products', { p_start: range.start, p_end: range.end });
    });
  }

  function loadTraffic() {
    return fetchJson('/api/analytics/traffic');
  }

  function loadGeoTraffic() {
    return fetchJson('/api/analytics/geo-traffic');
  }

  function formatUsdCents(cents) {
    return U.formatUsdCents ? U.formatUsdCents(cents) : 'US$' + ((Number(cents) || 0) / 100).toFixed(2);
  }

  function formatNum(n) {
    return U.formatNum ? U.formatNum(n) : String(Number(n) || 0);
  }

  function pct(a, b) {
    return U.pct ? U.pct(a, b) : '0%';
  }

  function escapeHtml(v) {
    return U.escapeHtml ? U.escapeHtml(v) : String(v == null ? '' : v);
  }

  function formatDate(iso) {
    return U.formatDateTime ? U.formatDateTime(iso) : String(iso || '—');
  }

  function productName(slug) {
    if (!slug) return '—';
    return String(slug)
      .replace(/-/g, ' ')
      .replace(/\b\w/g, function (c) {
        return c.toUpperCase();
      });
  }

  function thumbUrl(slug) {
    if (!slug) return '';
    return '/Image/' + slug + '-1.webp';
  }

  function destroyCharts() {
    Object.keys(charts).forEach(function (k) {
      if (charts[k]) {
        charts[k].destroy();
        charts[k] = null;
      }
    });
  }

  function chartColors() {
    var accent = getComputedStyle(document.documentElement).getPropertyValue('--admin-accent').trim() || '#0d6efd';
    return {
      line: accent,
      fill: 'rgba(13, 110, 253, 0.08)',
      bar: 'rgba(13, 110, 253, 0.72)'
    };
  }

  function drawLineChart(id, labels, values, label) {
    var el = document.getElementById(id);
    if (!el || typeof Chart === 'undefined') return;
    if (charts[id]) charts[id].destroy();
    var c = chartColors();
    charts[id] = new Chart(el, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: label,
            data: values,
            borderColor: c.line,
            backgroundColor: c.fill,
            fill: true,
            tension: 0.35,
            pointRadius: 0,
            borderWidth: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.06)' } }
        }
      }
    });
  }

  function drawBarChart(id, labels, values, label) {
    var el = document.getElementById(id);
    if (!el || typeof Chart === 'undefined') return;
    if (charts[id]) charts[id].destroy();
    var c = chartColors();
    charts[id] = new Chart(el, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{ label: label, data: values, backgroundColor: c.bar, borderRadius: 6 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.06)' } }
        }
      }
    });
  }

  function series(seriesArr) {
    seriesArr = seriesArr || [];
    return {
      labels: seriesArr.map(function (p) {
        return String(p.date || '').slice(5);
      }),
      values: seriesArr.map(function (p) {
        return p.value;
      })
    };
  }

  function kpiCard(label, value) {
    return (
      '<div class="admin-kpi-card admin-kpi-card--static">' +
      '<div class="admin-kpi-card-inner">' +
      '<div class="admin-kpi-card-top"><span class="admin-kpi-label">' +
      escapeHtml(label) +
      '</span></div>' +
      '<div class="admin-kpi-value-wrap"><span class="admin-kpi-value">' +
      value +
      '</span></div>' +
      '</div></div>'
    );
  }

  function normalizeSource(raw) {
    var s = String(raw || '')
      .toLowerCase()
      .trim();
    if (!s || s === '—' || s === 'none') return 'Unknown';
    if (s === 'direct' || s === '(direct)') return 'Direct';
    if (s.indexOf('facebook') !== -1 || s === 'fb' || s === 'meta') return 'Facebook';
    if (s.indexOf('instagram') !== -1 || s === 'ig') return 'Instagram';
    if (s.indexOf('google') !== -1 || s === 'gads' || s === 'adwords' || s === 'cpc') return 'Google';
    if (s.indexOf('tiktok') !== -1 || s === 'tt') return 'TikTok';
    if (s.indexOf('email') !== -1 || s === 'newsletter' || s === 'mail') return 'Email';
    if (s === 'unknown') return 'Unknown';
    return 'Unknown';
  }

  var CANONICAL_SOURCES = ['Direct', 'Facebook', 'Instagram', 'TikTok', 'Google', 'Email', 'Unknown'];

  function aggregateTraffic(geo, traffic) {
    var map = {};
    CANONICAL_SOURCES.forEach(function (label) {
      map[label] = { label: label, visitors: 0, orders: 0, revenue_cents: 0 };
    });

    (geo && geo.rows ? geo.rows : []).forEach(function (row) {
      var label = normalizeSource(row.traffic_source || row.utm_source);
      var bucket = map[label] || map.Unknown;
      bucket.visitors += Number(row.visitors) || 0;
      bucket.orders += Number(row.orders) || 0;
      bucket.revenue_cents += Number(row.revenue_cents) || 0;
    });

    // Fill visitors from traffic API when geo has no rows yet
    var geoEmpty = !(geo && geo.rows && geo.rows.length);
    if (geoEmpty && traffic && traffic.sources) {
      traffic.sources.forEach(function (s) {
        var label = normalizeSource(s.label);
        var bucket = map[label] || map.Unknown;
        bucket.visitors += Number(s.visitors || s.sessions) || 0;
      });
    }

    return CANONICAL_SOURCES.map(function (label) {
      var b = map[label];
      return {
        label: label,
        visitors: b.visitors,
        orders: b.orders,
        revenue_cents: b.revenue_cents,
        conversion_rate: b.visitors > 0 ? Number(((b.orders / b.visitors) * 100).toFixed(2)) : 0
      };
    });
  }

  function aggregateCountries(geo) {
    var map = {};
    (geo && geo.rows ? geo.rows : []).forEach(function (row) {
      var country = row.country || 'Unknown';
      if (!map[country]) {
        map[country] = { country: country, visitors: 0, orders: 0, revenue_cents: 0 };
      }
      map[country].visitors += Number(row.visitors) || 0;
      map[country].orders += Number(row.orders) || 0;
      map[country].revenue_cents += Number(row.revenue_cents) || 0;
    });
    return Object.keys(map)
      .map(function (k) {
        var r = map[k];
        return {
          country: r.country,
          visitors: r.visitors,
          orders: r.orders,
          revenue_cents: r.revenue_cents,
          aov_cents: r.orders > 0 ? Math.round(r.revenue_cents / r.orders) : 0,
          conversion_rate: r.visitors > 0 ? Number(((r.orders / r.visitors) * 100).toFixed(2)) : 0
        };
      })
      .sort(function (a, b) {
        return b.revenue_cents - a.revenue_cents || b.orders - a.orders;
      });
  }

  function mergeProducts(data) {
    data = data || {};
    var map = {};
    function ensure(id) {
      if (!map[id]) {
        map[id] = {
          product_id: id,
          name: productName(id),
          thumb: thumbUrl(id),
          views: 0,
          add_to_cart: 0,
          checkout: 0,
          orders: 0,
          revenue_cents: 0
        };
      }
      return map[id];
    }
    (data.most_viewed || []).forEach(function (r) {
      var row = ensure(r.product_id || 'unknown');
      row.views = Number(r.views) || 0;
    });
    (data.most_added || []).forEach(function (r) {
      var row = ensure(r.product_id || 'unknown');
      row.add_to_cart = Number(r.add_events || r.products_added) || 0;
    });
    (data.highest_revenue || []).forEach(function (r) {
      var row = ensure(r.product_id || 'unknown');
      row.orders = Number(r.orders) || 0;
      row.revenue_cents = Number(r.revenue_cents) || 0;
    });
    (data.highest_conversion || []).forEach(function (r) {
      var row = ensure(r.product_id || 'unknown');
      if (r.checkout != null) row.checkout = Number(r.checkout) || 0;
    });
    return Object.keys(map)
      .map(function (k) {
        var r = map[k];
        return {
          product_id: r.product_id,
          name: r.name,
          thumb: r.thumb,
          views: r.views,
          add_to_cart: r.add_to_cart,
          checkout: r.checkout,
          orders: r.orders,
          revenue_cents: r.revenue_cents,
          conversion_rate: r.views > 0 ? Number(((r.orders / r.views) * 100).toFixed(2)) : 0
        };
      })
      .sort(function (a, b) {
        return b.revenue_cents - a.revenue_cents || b.orders - a.orders || b.views - a.views;
      });
  }

  function sortRows(rows, key, dir) {
    return rows.slice().sort(function (a, b) {
      var av = a[key];
      var bv = b[key];
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }

  function sortableTh(label, key, stateKey) {
    var st = sortState[stateKey];
    var arrow = st.key === key ? (st.dir > 0 ? ' ↑' : ' ↓') : '';
    return (
      '<th class="admin-sortable" data-sort-key="' +
      key +
      '" data-sort-group="' +
      stateKey +
      '" role="button" tabindex="0">' +
      escapeHtml(label) +
      arrow +
      '</th>'
    );
  }

  function renderShell() {
    var tabHtml = tabs
      .map(function (t) {
        return (
          '<button type="button" class="admin-analytics-tab' +
          (t.id === activeTab ? ' is-active' : '') +
          '" data-tab="' +
          t.id +
          '">' +
          t.label +
          '</button>'
        );
      })
      .join('');

    var exportBtn =
      '<button type="button" class="admin-btn-secondary" id="analyticsExportCsv">Export CSV</button>';

    container.innerHTML =
      '<div class="admin-page-header">' +
      '<h2 class="admin-page-title">Analytics</h2>' +
      '</div>' +
      (U.renderDateFilter
        ? U.renderDateFilter(rangeState.preset, { extra: exportBtn })
        : '') +
      '<nav class="admin-analytics-tabs" aria-label="Analytics sections">' +
      tabHtml +
      '</nav>' +
      '<div id="analyticsHubContent" class="admin-analytics-hub-content">' +
      (U.skeletonCards ? U.skeletonCards(7) : '<div class="admin-loading">Loading…</div>') +
      '</div>';

    if (U.bindDateFilter) {
      U.bindDateFilter(container, rangeState, function (next) {
        range = next;
        cache = {};
        loadTab();
      });
    }

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

    var exportEl = document.getElementById('analyticsExportCsv');
    if (exportEl) {
      exportEl.addEventListener('click', function () {
        exportActiveTab();
      });
    }
  }

  function exportActiveTab() {
    if (!U.downloadCsv) return;
    if (activeTab === 'countries' && lastPayload.countries) {
      U.downloadCsv(
        'zybar-countries.csv',
        lastPayload.countries.map(function (r) {
          return {
            Country: r.country,
            Visitors: r.visitors,
            Orders: r.orders,
            Revenue: (r.revenue_cents / 100).toFixed(2),
            AOV: (r.aov_cents / 100).toFixed(2),
            Conversion: r.conversion_rate
          };
        })
      );
      return;
    }
    if (activeTab === 'products' && lastPayload.products) {
      U.downloadCsv(
        'zybar-products-analytics.csv',
        lastPayload.products.map(function (r) {
          return {
            Product: r.name,
            Views: r.views,
            AddToCart: r.add_to_cart,
            Orders: r.orders,
            Revenue: (r.revenue_cents / 100).toFixed(2),
            Conversion: r.conversion_rate
          };
        })
      );
      return;
    }
    if (activeTab === 'traffic' && lastPayload.traffic) {
      U.downloadCsv(
        'zybar-traffic.csv',
        lastPayload.traffic.map(function (r) {
          return {
            Source: r.label,
            Visitors: r.visitors,
            Orders: r.orders,
            Revenue: (r.revenue_cents / 100).toFixed(2),
            Conversion: r.conversion_rate
          };
        })
      );
      return;
    }
    if (activeTab === 'orders' && lastPayload.orderRows) {
      U.downloadCsv('zybar-orders-analytics.csv', lastPayload.orderRows);
    }
  }

  function bindSortable(host, rowsKey, renderFn) {
    host.querySelectorAll('.admin-sortable').forEach(function (th) {
      th.addEventListener('click', function () {
        var key = th.getAttribute('data-sort-key');
        var group = th.getAttribute('data-sort-group');
        var st = sortState[group];
        if (st.key === key) st.dir *= -1;
        else {
          st.key = key;
          st.dir = key === 'country' || key === 'name' ? 1 : -1;
        }
        var sorted = sortRows(lastPayload[rowsKey] || [], st.key, st.dir);
        host.innerHTML = renderFn(sorted);
        bindSortable(host, rowsKey, renderFn);
      });
    });
  }

  function renderOverview(overview, trends, products, orders) {
    overview = overview || {};
    var visitors = overview.unique_visitors != null ? overview.unique_visitors : overview.visitors;
    var conv =
      overview.conversion_rate != null
        ? String(overview.conversion_rate) + '%'
        : visitors > 0
          ? ((overview.orders / visitors) * 100).toFixed(2) + '%'
          : '0%';
    var aov =
      overview.avg_order_value_cents != null
        ? formatUsdCents(overview.avg_order_value_cents)
        : overview.orders > 0
          ? formatUsdCents(overview.revenue_cents / overview.orders)
          : '—';

    var topProducts = mergeProducts(products).slice(0, 5);
    var topHtml = topProducts.length
      ? topProducts
          .map(function (p) {
            return (
              '<tr>' +
              '<td class="admin-cell-thumb"><img src="' +
              escapeHtml(p.thumb) +
              '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'" /></td>' +
              '<td>' +
              escapeHtml(p.name) +
              '</td>' +
              '<td>' +
              formatNum(p.orders) +
              '</td>' +
              '<td>' +
              formatUsdCents(p.revenue_cents) +
              '</td>' +
              '<td>' +
              p.conversion_rate +
              '%</td></tr>'
            );
          })
          .join('')
      : '<tr><td colspan="5" class="admin-cell-empty">No product sales in this range</td></tr>';

    var recent = (orders || [])
      .slice(0, 8)
      .map(function (o) {
        return (
          '<tr>' +
          '<td><a href="#orders/' +
          escapeHtml(o.id) +
          '">' +
          escapeHtml(String(o.stripe_session_id || o.id).slice(0, 14)) +
          '</a></td>' +
          '<td>' +
          escapeHtml(o.customer_name || '—') +
          '</td>' +
          '<td>' +
          escapeHtml(o.country || '—') +
          '</td>' +
          '<td>' +
          formatUsdCents(o.amount_total_cents) +
          '</td>' +
          '<td>' +
          escapeHtml(o.status || '—') +
          '</td>' +
          '<td>' +
          formatDate(o.created_at) +
          '</td></tr>'
        );
      })
      .join('') || '<tr><td colspan="6" class="admin-cell-empty">No orders yet</td></tr>';

    return (
      '<div class="admin-kpi-cards admin-kpi-cards--dense">' +
      kpiCard('Visitors', formatNum(visitors)) +
      kpiCard('Sessions', formatNum(overview.sessions)) +
      kpiCard('Orders', formatNum(overview.orders)) +
      kpiCard('Revenue', formatUsdCents(overview.revenue_cents)) +
      kpiCard('Average Order Value', aov) +
      kpiCard('Conversion Rate', conv) +
      kpiCard('Add To Cart', formatNum(overview.add_to_cart)) +
      kpiCard('Checkout Started', formatNum(overview.checkout_started)) +
      '</div>' +
      '<div class="admin-grid-2">' +
      '<div class="admin-card"><h3>Revenue Trend</h3><div class="chart-container"><canvas id="chartOverviewRevenue"></canvas></div></div>' +
      '<div class="admin-card"><h3>Orders Trend</h3><div class="chart-container"><canvas id="chartOverviewOrders"></canvas></div></div>' +
      '</div>' +
      '<div class="admin-grid-2">' +
      '<div class="admin-card"><h3>Top Selling Products</h3><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th></th><th>Product</th><th>Orders</th><th>Revenue</th><th>Conversion</th></tr></thead><tbody>' +
      topHtml +
      '</tbody></table></div></div>' +
      '<div class="admin-card"><h3>Recent Orders</h3><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Order</th><th>Customer</th><th>Country</th><th>Total</th><th>Status</th><th>Created</th></tr></thead><tbody>' +
      recent +
      '</tbody></table></div></div>' +
      '</div>'
    );
  }

  function renderRevenue(overview, trends) {
    overview = overview || {};
    var aov =
      overview.avg_order_value_cents != null
        ? formatUsdCents(overview.avg_order_value_cents)
        : overview.orders > 0
          ? formatUsdCents(overview.revenue_cents / overview.orders)
          : '—';
    var gran = granularityForRange();
    var granLabel = gran === 'day' ? 'Daily' : gran === 'week' ? 'Weekly' : 'Monthly';
    return (
      '<div class="admin-kpi-cards admin-kpi-cards--dense">' +
      kpiCard('Revenue', formatUsdCents(overview.revenue_cents)) +
      kpiCard('Orders', formatNum(overview.orders)) +
      kpiCard('Average Order Value', aov) +
      kpiCard('Refunds', '—') +
      '</div>' +
      '<div class="admin-card"><h3>Revenue Trend (' +
      granLabel +
      ')</h3><div class="chart-container"><canvas id="chartRevenueTab"></canvas></div></div>' +
      '<p class="admin-muted" style="margin-top:0.75rem">Refunds are future-ready and will appear here once refund tracking is enabled.</p>'
    );
  }

  function funnelStepValue(steps, keys) {
    steps = steps || [];
    for (var i = 0; i < steps.length; i++) {
      var id = String(steps[i].step || '').toLowerCase();
      for (var j = 0; j < keys.length; j++) {
        if (id === keys[j] || id.indexOf(keys[j]) !== -1) return Number(steps[i].count) || 0;
      }
    }
    return 0;
  }

  function renderConversion(steps, carts, overview) {
    overview = overview || {};
    carts = carts || {};
    var visitors =
      funnelStepValue(steps, ['visitors', 'unique_visitors']) ||
      Number(overview.unique_visitors || overview.visitors) ||
      0;
    var views =
      funnelStepValue(steps, ['product_view', 'product_views', 'views']) ||
      Number(overview.product_views) ||
      0;
    var atc =
      funnelStepValue(steps, ['add_to_cart', 'cart']) || Number(overview.add_to_cart) || 0;
    var checkout =
      funnelStepValue(steps, ['checkout', 'begin_checkout']) ||
      Number(overview.checkout_started) ||
      0;
    var payment =
      funnelStepValue(steps, ['payment']) ||
      Number(overview.payment_started) ||
      0;
    var purchases =
      funnelStepValue(steps, ['purchase', 'purchases', 'orders', 'completed']) ||
      Number(overview.orders) ||
      0;

    var removed = Number(overview.remove_from_cart) || 0;
    var abandonRate =
      atc > 0 ? (((atc - purchases) / atc) * 100).toFixed(1) + '%' : '0%';

    var funnelHtml =
      '<div class="admin-funnel">' +
      [
        { label: 'Visitors', value: visitors },
        { label: 'Product View', value: views },
        { label: 'Add To Cart', value: atc },
        { label: 'Checkout Started', value: checkout },
        { label: 'Payment Success', value: payment },
        { label: 'Order Completed', value: purchases }
      ]
        .map(function (step, i, arr) {
          var rate =
            i === 0
              ? ''
              : '<div class="admin-funnel-step-rate">' + pct(step.value, arr[i - 1].value) + '</div>';
          var html =
            '<div class="admin-funnel-step">' +
            '<div class="admin-funnel-step-label">' +
            step.label +
            '</div>' +
            '<div class="admin-funnel-step-value">' +
            formatNum(step.value) +
            '</div>' +
            rate +
            '</div>';
          if (i < arr.length - 1) html += '<div class="admin-funnel-arrow" aria-hidden="true">↓</div>';
          return html;
        })
        .join('') +
      '</div>';

    return (
      funnelHtml +
      '<div class="admin-kpi-cards admin-kpi-cards--dense">' +
      kpiCard('View → Cart', pct(atc, views)) +
      kpiCard('Cart → Checkout', pct(checkout, atc)) +
      kpiCard('Checkout → Payment', pct(payment, checkout)) +
      kpiCard('Payment → Order', pct(purchases, payment || checkout)) +
      kpiCard('Overall Conversion', pct(purchases, visitors)) +
      '</div>' +
      '<h3 class="admin-section-title">Cart Analytics</h3>' +
      '<div class="admin-kpi-cards admin-kpi-cards--dense">' +
      kpiCard('Added To Cart', formatNum(carts.total_add_to_cart != null ? carts.total_add_to_cart : atc)) +
      kpiCard('Removed From Cart', formatNum(removed)) +
      kpiCard('Average Cart Value', formatUsdCents(carts.avg_cart_value_cents)) +
      kpiCard('Cart Abandonment Rate', abandonRate) +
      '</div>'
    );
  }

  function renderTrafficTable(rows) {
    var body = rows
      .map(function (r) {
        return (
          '<tr>' +
          '<td><strong>' +
          escapeHtml(r.label) +
          '</strong></td>' +
          '<td>' +
          formatNum(r.visitors) +
          '</td>' +
          '<td>' +
          formatNum(r.orders) +
          '</td>' +
          '<td>' +
          formatUsdCents(r.revenue_cents) +
          '</td>' +
          '<td>' +
          r.conversion_rate +
          '%</td></tr>'
        );
      })
      .join('');
    return (
      '<div class="admin-card"><h3>Traffic Sources</h3><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Source</th><th>Visitors</th><th>Orders</th><th>Revenue</th><th>Conversion Rate</th></tr></thead><tbody>' +
      body +
      '</tbody></table></div></div>' +
      '<div class="admin-card"><h3>Revenue by Traffic Source</h3><div class="chart-container"><canvas id="chartTrafficRevenue"></canvas></div></div>'
    );
  }

  function renderCountriesTable(rows) {
    var st = sortState.countries;
    var sorted = sortRows(rows, st.key, st.dir);
    var body =
      sorted
        .map(function (r) {
          return (
            '<tr>' +
            '<td><strong>' +
            escapeHtml(r.country) +
            '</strong></td>' +
            '<td>' +
            formatNum(r.visitors) +
            '</td>' +
            '<td>' +
            formatNum(r.orders) +
            '</td>' +
            '<td>' +
            formatUsdCents(r.revenue_cents) +
            '</td>' +
            '<td>' +
            r.conversion_rate +
            '%</td></tr>'
          );
        })
        .join('') ||
      '<tr><td colspan="5" class="admin-cell-empty">No country data yet</td></tr>';

    return (
      '<div class="admin-card"><h3>Country Performance</h3><div class="admin-table-wrap"><table class="admin-table"><thead><tr>' +
      sortableTh('Country', 'country', 'countries') +
      sortableTh('Visitors', 'visitors', 'countries') +
      sortableTh('Orders', 'orders', 'countries') +
      sortableTh('Revenue', 'revenue_cents', 'countries') +
      sortableTh('Conversion Rate', 'conversion_rate', 'countries') +
      '</tr></thead><tbody>' +
      body +
      '</tbody></table></div></div>'
    );
  }

  function renderProductsTable(rows) {
    var st = sortState.products;
    var filtered = rows;
    if (productSearch) {
      var q = productSearch.toLowerCase();
      filtered = rows.filter(function (r) {
        return (
          String(r.name || '').toLowerCase().indexOf(q) !== -1 ||
          String(r.product_id || '').toLowerCase().indexOf(q) !== -1
        );
      });
    }
    var sorted = sortRows(filtered, st.key, st.dir);
    var body =
      sorted
        .map(function (r) {
          return (
            '<tr>' +
            '<td class="admin-cell-thumb"><img src="' +
            escapeHtml(r.thumb) +
            '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'" /></td>' +
            '<td>' +
            escapeHtml(r.name) +
            '</td>' +
            '<td>' +
            formatNum(r.views) +
            '</td>' +
            '<td>' +
            formatNum(r.add_to_cart) +
            '</td>' +
            '<td>' +
            formatNum(r.checkout) +
            '</td>' +
            '<td>' +
            formatNum(r.orders) +
            '</td>' +
            '<td>' +
            formatUsdCents(r.revenue_cents) +
            '</td>' +
            '<td>' +
            r.conversion_rate +
            '%</td></tr>'
          );
        })
        .join('') ||
      '<tr><td colspan="8" class="admin-cell-empty">No product data yet</td></tr>';

    return (
      '<div class="admin-card"><div style="display:flex;justify-content:space-between;gap:1rem;align-items:center;margin-bottom:0.75rem"><h3 style="margin:0">Products</h3>' +
      '<input type="search" id="analyticsProductSearch" class="admin-search-input" placeholder="Search products…" value="' +
      escapeHtml(productSearch) +
      '" /></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th></th>' +
      sortableTh('Product', 'name', 'products') +
      sortableTh('Views', 'views', 'products') +
      sortableTh('Add To Cart', 'add_to_cart', 'products') +
      sortableTh('Checkout', 'checkout', 'products') +
      sortableTh('Orders', 'orders', 'products') +
      sortableTh('Revenue', 'revenue_cents', 'products') +
      sortableTh('Conversion %', 'conversion_rate', 'products') +
      '</tr></thead><tbody>' +
      body +
      '</tbody></table></div></div>'
    );
  }

  function bindProductSearch(host) {
    var input = host.querySelector('#analyticsProductSearch');
    if (!input) return;
    var t;
    input.addEventListener('input', function () {
      clearTimeout(t);
      t = setTimeout(function () {
        productSearch = input.value.trim();
        host.innerHTML = renderProductsTable(lastPayload.products || []);
        bindSortable(host, 'products', renderProductsTable);
        bindProductSearch(host);
      }, 200);
    });
  }

  function loadRecentOrders(limit) {
    var sb = window.supabase;
    if (!sb) return Promise.resolve([]);
    return sb
      .from('orders')
      .select(
        'id,stripe_session_id,customer_name,customer_email,amount_total_cents,status,created_at,country,product_slug'
      )
      .gte('created_at', range.start)
      .lt('created_at', range.end)
      .order('created_at', { ascending: false })
      .limit(limit || 200)
      .then(function (res) {
        return res.data || [];
      })
      .catch(function () {
        return [];
      });
  }

  function loadTab() {
    destroyCharts();
    var host = document.getElementById('analyticsHubContent');
    if (!host) return;
    host.innerHTML = U.skeletonCards
      ? U.skeletonCards(6) + (U.skeletonTable ? U.skeletonTable(4) : '')
      : '<div class="admin-loading">Loading…</div>';

    if (activeTab === 'overview') {
      Promise.all([loadOverview(), loadTrends(), loadProducts(), loadRecentOrders(12)]).then(
        function (res) {
          host.innerHTML = renderOverview(res[0], res[1], res[2], res[3]);
          requestAnimationFrame(function () {
            var rev = series((res[1] || {}).revenue);
            var ord = series((res[1] || {}).orders);
            drawLineChart(
              'chartOverviewRevenue',
              rev.labels,
              rev.values.map(function (v) {
                return (Number(v) || 0) / 100;
              }),
              'Revenue'
            );
            drawLineChart('chartOverviewOrders', ord.labels, ord.values, 'Orders');
          });
        }
      );
      return;
    }

    if (activeTab === 'revenue') {
      Promise.all([loadOverview(), loadTrends()]).then(function (res) {
        host.innerHTML = renderRevenue(res[0], res[1]);
        requestAnimationFrame(function () {
          var rev = series((res[1] || {}).revenue);
          drawLineChart(
            'chartRevenueTab',
            rev.labels,
            rev.values.map(function (v) {
              return (Number(v) || 0) / 100;
            }),
            'Revenue'
          );
        });
      });
      return;
    }

    if (activeTab === 'conversion') {
      Promise.all([loadFunnel(), loadCarts(), loadOverview()]).then(function (res) {
        host.innerHTML = renderConversion(res[0], res[1], res[2]);
      });
      return;
    }

    if (activeTab === 'traffic') {
      Promise.all([loadGeoTraffic(), loadTraffic()]).then(function (res) {
        var rows = aggregateTraffic(res[0], res[1]);
        lastPayload.traffic = rows;
        host.innerHTML = renderTrafficTable(rows);
        requestAnimationFrame(function () {
          drawBarChart(
            'chartTrafficRevenue',
            rows.map(function (r) {
              return r.label;
            }),
            rows.map(function (r) {
              return (r.revenue_cents || 0) / 100;
            }),
            'Revenue'
          );
        });
      });
      return;
    }

    if (activeTab === 'countries') {
      loadGeoTraffic().then(function (geo) {
        var rows = aggregateCountries(geo);
        lastPayload.countries = rows;
        host.innerHTML = renderCountriesTable(rows);
        bindSortable(host, 'countries', renderCountriesTable);
      });
      return;
    }

    if (activeTab === 'products') {
      loadProducts().then(function (data) {
        var rows = mergeProducts(data);
        lastPayload.products = rows;
        host.innerHTML = renderProductsTable(rows);
        bindSortable(host, 'products', renderProductsTable);
        bindProductSearch(host);
      });
      return;
    }

    host.innerHTML = '<p class="admin-error">Unknown analytics section.</p>';
  }

  renderShell();
  loadTab();
};
