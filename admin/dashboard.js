/**
 * Admin Dashboard — production KPIs from real analytics APIs.
 * Date filter drives every widget. No fake metrics.
 */
window.renderAdmindashboard = function (container) {
  if (!container) return;

  var metricKey =
    window.AdminMetricDetail && window.AdminMetricDetail.parseMetricKeyFromHash
      ? window.AdminMetricDetail.parseMetricKeyFromHash()
      : null;
  if (metricKey && window.AdminMetricDetail && window.AdminMetricDetail.mount) {
    window.AdminMetricDetail.mount(container, metricKey, {});
    return;
  }

  var U = window.AdminUtils || {};
  var rangeState = { preset: '30', customStart: '', customEnd: '' };
  var range = U.resolveRange ? U.resolveRange('30') : { days: 30, start: '', end: '', startDate: '', endDate: '' };
  var charts = {};
  var cache = {};
  var CACHE_TTL = 45000;
  var loadGeneration = 0;
  var activeController = null;

  function apiBase() {
    return window.location.origin;
  }

  function apiQuery(forRange) {
    var r = forRange || range;
    return U.apiQuery ? U.apiQuery(r) : 'days=' + (r.days || 30);
  }

  function granularityForRange(forRange) {
    var days = Number((forRange || range).days) || 30;
    if (days <= 1) return 'hour';
    if (days <= 14) return 'day';
    if (days <= 90) return 'week';
    return 'month';
  }

  function fetchJson(path, forRange, signal) {
    var r = forRange || range;
    var key = path + '|' + r.startDate + '|' + r.endDate;
    var hit = cache[key];
    if (hit && Date.now() - hit.t < CACHE_TTL) return Promise.resolve(hit.data);
    var joiner = path.indexOf('?') === -1 ? '?' : '&';
    return fetch(apiBase() + path + joiner + apiQuery(r), signal ? { signal: signal } : undefined)
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .then(function (data) {
        if (!data || data.error) return null;
        cache[key] = { t: Date.now(), data: data };
        return data;
      })
      .catch(function (err) {
        if (err && err.name === 'AbortError') throw err;
        return null;
      });
  }

  function money(cents) {
    return U.formatUsdCents ? U.formatUsdCents(cents) : 'US$' + ((Number(cents) || 0) / 100).toFixed(2);
  }

  function num(n) {
    return U.formatNum ? U.formatNum(n) : String(Number(n) || 0);
  }

  function esc(v) {
    return U.escapeHtml ? U.escapeHtml(v) : String(v == null ? '' : v);
  }

  function when(iso) {
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

  function kpi(label, value, metricKey, customHref) {
    if (!metricKey && !customHref) {
      return (
        '<div class="admin-kpi-card admin-kpi-card--static">' +
        '<div class="admin-kpi-card-inner">' +
        '<div class="admin-kpi-card-top"><span class="admin-kpi-label">' +
        esc(label) +
        '</span></div>' +
        '<div class="admin-kpi-value-wrap"><span class="admin-kpi-value">' +
        value +
        '</span></div>' +
        '</div></div>'
      );
    }
    var href = customHref || '#dashboard/metric/' + metricKey;
    return (
      '<a class="admin-kpi-card admin-kpi-card--link" href="' +
      esc(href) +
      '" role="link" aria-label="Open ' +
      esc(label) +
      ' analytics">' +
      '<div class="admin-kpi-card-inner">' +
      '<div class="admin-kpi-card-top"><span class="admin-kpi-label">' +
      esc(label) +
      '</span><span class="admin-kpi-chevron" aria-hidden="true">›</span></div>' +
      '<div class="admin-kpi-value-wrap"><span class="admin-kpi-value">' +
      value +
      '</span></div>' +
      '</div></a>'
    );
  }

  function destroyCharts() {
    Object.keys(charts).forEach(function (k) {
      if (charts[k]) {
        charts[k].destroy();
        charts[k] = null;
      }
    });
  }

  function series(arr) {
    arr = Array.isArray(arr) ? arr : [];
    return {
      labels: arr.map(function (r) {
        return r.date || r.bucket || r.day || '';
      }),
      values: arr.map(function (r) {
        return Number(r.value != null ? r.value : r.count != null ? r.count : r.amount_cents) || 0;
      })
    };
  }

  function drawLine(id, labels, values, asMoney) {
    var el = document.getElementById(id);
    if (!el || typeof Chart === 'undefined') return;
    if (charts[id]) charts[id].destroy();
    var accent =
      getComputedStyle(document.documentElement).getPropertyValue('--admin-accent').trim() ||
      '#0d6efd';
    charts[id] = new Chart(el, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            data: values,
            borderColor: accent,
            backgroundColor: 'rgba(13, 110, 253, 0.08)',
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
          x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } },
          y: {
            beginAtZero: true,
            ticks: asMoney
              ? {
                  callback: function (v) {
                    return 'US$' + Number(v).toFixed(0);
                  }
                }
              : {}
          }
        }
      }
    });
  }

  function loadRecentOrders(forRange) {
    var sb = window.supabase;
    var r = forRange || range;
    if (!sb) return Promise.resolve([]);
    return sb
      .from('orders')
      .select(
        'id,stripe_session_id,customer_name,customer_email,country,amount_total_cents,status,created_at'
      )
      .gte('created_at', r.start)
      .lt('created_at', r.end)
      .order('created_at', { ascending: false })
      .limit(12)
      .then(function (res) {
        return U.filterZybarOrders ? U.filterZybarOrders(res.data || []) : res.data || [];
      })
      .catch(function () {
        return [];
      });
  }

  function mergeTopProducts(data) {
    data = data || {};
    var map = {};
    function ensure(id) {
      if (!map[id]) {
        map[id] = { product_id: id, name: productName(id), orders: 0, revenue_cents: 0, views: 0 };
      }
      return map[id];
    }
    (data.highest_revenue || []).forEach(function (r) {
      var row = ensure(r.product_id || 'unknown');
      row.orders = Number(r.orders) || 0;
      row.revenue_cents = Number(r.revenue_cents) || 0;
    });
    (data.most_viewed || []).forEach(function (r) {
      var row = ensure(r.product_id || 'unknown');
      row.views = Number(r.views) || 0;
    });
    return Object.keys(map)
      .map(function (k) {
        var r = map[k];
        return {
          name: r.name,
          orders: r.orders,
          revenue_cents: r.revenue_cents,
          conversion_rate: r.views > 0 ? Number(((r.orders / r.views) * 100).toFixed(2)) : 0
        };
      })
      .sort(function (a, b) {
        return b.revenue_cents - a.revenue_cents || b.orders - a.orders;
      })
      .slice(0, 8);
  }

  function renderShell() {
    container.innerHTML =
      '<div class="admin-page-header"><h2 class="admin-page-title">Dashboard</h2>' +
      '<div class="admin-live-visitors" id="adminLiveVisitors"><span class="admin-live-dot"></span> <span id="adminLiveCount">—</span> live</div>' +
      '</div>' +
      '<div class="admin-analytics-toolbar">' +
      (U.renderDateFilter ? U.renderDateFilter(rangeState.preset, { extra: '' }) : '') +
      '</div>' +
      '<div id="dashHost">' +
      (U.skeletonCards ? U.skeletonCards(10) : '<div class="admin-loading">Loading…</div>') +
      '</div>';

    if (U.bindDateFilter) {
      U.bindDateFilter(container, rangeState, function (next) {
        range = next;
        rangeState.preset = next.preset || rangeState.preset;
        cache = {};
        loadAll();
      });
    }
  }

  function renderBody(overview, trends, products, orders, extras, live, forRange, gran) {
    overview = overview || {};
    extras = extras || {};
    var visitors = overview.unique_visitors != null ? overview.unique_visitors : overview.visitors || 0;
    var sessions = overview.sessions != null ? overview.sessions : 0;
    var ordersCount = overview.orders || 0;
    var revenue = overview.revenue_cents || 0;
    var aov =
      overview.avg_order_value_cents != null
        ? overview.avg_order_value_cents
        : ordersCount > 0
          ? Math.round(revenue / ordersCount)
          : 0;
    var conv =
      overview.conversion_rate != null
        ? overview.conversion_rate + '%'
        : visitors > 0
          ? ((ordersCount / visitors) * 100).toFixed(2) + '%'
          : '0%';

    var top = mergeTopProducts(products);
    var topHtml =
      top
        .map(function (p) {
          return (
            '<tr><td>' +
            esc(p.name) +
            '</td><td>' +
            num(p.orders) +
            '</td><td>' +
            money(p.revenue_cents) +
            '</td><td>' +
            p.conversion_rate +
            '%</td></tr>'
          );
        })
        .join('') || '<tr><td colspan="4" class="admin-cell-empty">No product sales in this range</td></tr>';

    var recentHtml =
      (orders || [])
        .map(function (o) {
          return (
            '<tr><td><a href="#orders/' +
            esc(o.id) +
            '"><code>' +
            esc(String(o.stripe_session_id || o.id).slice(0, 12)) +
            '…</code></a></td><td>' +
            esc(o.customer_name || o.customer_email || '—') +
            '</td><td>' +
            esc(o.country || '—') +
            '</td><td>' +
            money(o.amount_total_cents) +
            '</td><td>' +
            esc(o.status || '—') +
            '</td><td>' +
            esc(when(o.created_at)) +
            '</td></tr>'
          );
        })
        .join('') || '<tr><td colspan="6" class="admin-cell-empty">No orders in this range</td></tr>';

    var liveCount = live && (live.active_visitors != null ? live.active_visitors : live.visitors);
    var liveEl = document.getElementById('adminLiveCount');
    if (liveEl) liveEl.textContent = liveCount != null ? String(liveCount) : '0';

    gran = gran || granularityForRange(forRange);
    var granLabel =
      gran === 'hour' ? 'Hourly' : gran === 'day' ? 'Daily' : gran === 'week' ? 'Weekly' : 'Monthly';

    return (
      '<div class="admin-kpi-cards admin-kpi-cards--dense">' +
      kpi('Visitors', num(visitors), 'visitors') +
      kpi('Sessions', num(sessions), 'sessions') +
      kpi('Orders', num(ordersCount), 'orders') +
      kpi('Revenue', money(revenue), 'revenue') +
      kpi('Average Order Value', money(aov), 'aov') +
      kpi('Conversion Rate', conv, 'conversion') +
      kpi('Add To Cart', num(overview.add_to_cart), 'add_to_cart') +
      kpi('Checkout Started', num(overview.checkout_started), 'checkout') +
      kpi('Email Leads', num(extras.email_leads), 'email_leads', '#marketing/audience') +
      kpi('Custom Made Leads', num(extras.custom_made_leads), 'custom_made_leads', '#activity/custom-leads') +
      kpi('Abandoned Carts', num(extras.abandoned_carts), 'abandoned') +
      '</div>' +
      '<div class="admin-grid-2">' +
      '<div class="admin-card"><h3>Revenue (' +
      granLabel +
      ')</h3><div class="chart-container"><canvas id="dashChartRevenue"></canvas></div></div>' +
      '<div class="admin-card"><h3>Orders (' +
      granLabel +
      ')</h3><div class="chart-container"><canvas id="dashChartOrders"></canvas></div></div>' +
      '</div>' +
      '<div class="admin-grid-2">' +
      '<div class="admin-card"><h3>Top Products</h3><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Product</th><th>Orders</th><th>Revenue</th><th>Conversion</th></tr></thead><tbody>' +
      topHtml +
      '</tbody></table></div></div>' +
      '<div class="admin-card"><h3>Recent Orders</h3><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Order</th><th>Customer</th><th>Country</th><th>Total</th><th>Status</th><th>Created</th></tr></thead><tbody>' +
      recentHtml +
      '</tbody></table></div></div>' +
      '</div>'
    );
  }

  function loadAll() {
    var host = document.getElementById('dashHost');
    if (!host) return;

    // Capture the range for THIS load so a later preset click cannot relabel or overwrite it.
    var requestRange = {
      preset: range.preset,
      start: range.start,
      end: range.end,
      startDate: range.startDate,
      endDate: range.endDate,
      days: range.days
    };
    var gran = granularityForRange(requestRange);
    var generation = ++loadGeneration;

    if (activeController) {
      try {
        activeController.abort();
      } catch (_) {}
    }
    activeController = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var signal = activeController ? activeController.signal : null;

    host.innerHTML = U.skeletonCards
      ? U.skeletonCards(10) + (U.skeletonTable ? U.skeletonTable(5) : '')
      : '<div class="admin-loading">Loading…</div>';
    destroyCharts();

    Promise.all([
      fetchJson('/api/analytics/dashboard', requestRange, signal),
      fetchJson('/api/analytics/trends?granularity=' + encodeURIComponent(gran), requestRange, signal),
      fetchJson('/api/analytics/products', requestRange, signal),
      loadRecentOrders(requestRange),
      fetchJson('/api/analytics/realtime', requestRange, signal)
    ])
      .then(function (res) {
        if (generation !== loadGeneration) return;

        var dash = res[0];

        function finish(ov, ex) {
          if (generation !== loadGeneration) return;
          host.innerHTML = renderBody(ov, res[1], res[2], res[3], ex, res[4], requestRange, gran);
          requestAnimationFrame(function () {
            if (generation !== loadGeneration) return;
            var rev = series((res[1] || {}).revenue);
            var ord = series((res[1] || {}).orders);
            drawLine(
              'dashChartRevenue',
              rev.labels,
              rev.values.map(function (v) {
                return (Number(v) || 0) / 100;
              }),
              true
            );
            drawLine('dashChartOrders', ord.labels, ord.values, false);
          });
        }

        if (dash && (dash.overview || dash.revenue_cents != null || dash.orders != null)) {
          finish(dash.overview || dash, {
            email_leads: dash.email_leads || 0,
            abandoned_carts: dash.abandoned_carts || 0,
            custom_made_leads: dash.custom_made_leads || 0
          });
          return;
        }

        Promise.all([
          fetchJson('/api/analytics/overview', requestRange, signal),
          fetchJson('/api/customer-activity/leads', requestRange, signal),
          fetchJson('/api/customer-activity/abandoned', requestRange, signal),
          fetchJson('/api/customer-activity/custom-leads', requestRange, signal)
        ]).then(function (parts) {
          if (generation !== loadGeneration) return;
          finish(parts[0] || {}, {
            email_leads: (parts[1] && parts[1].leads && parts[1].leads.length) || 0,
            abandoned_carts: (parts[2] && parts[2].carts && parts[2].carts.length) || 0,
            custom_made_leads:
              (parts[3] && parts[3].total != null
                ? parts[3].total
                : parts[3] && parts[3].rows && parts[3].rows.length) || 0
          });
        });
      })
      .catch(function (err) {
        if (err && err.name === 'AbortError') return;
        if (generation !== loadGeneration) return;
        host.innerHTML = '<p class="admin-error">Failed to load dashboard.</p>';
      });
  }

  renderShell();
  loadAll();
};
