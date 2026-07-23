/**
 * Admin Dashboard metric drill-down pages.
 * Hash: #dashboard/metric/{key}
 */
window.AdminMetricDetail = (function () {
  var METRICS = {
    visitors: {
      title: 'Visitors',
      trendKey: 'visitors',
      money: false,
      filters: ['country', 'device', 'source']
    },
    sessions: {
      title: 'Sessions',
      trendKey: 'sessions',
      money: false,
      filters: ['country', 'device', 'source']
    },
    orders: {
      title: 'Orders',
      trendKey: 'orders',
      money: false,
      filters: ['country', 'status']
    },
    revenue: {
      title: 'Revenue',
      trendKey: 'revenue',
      money: true,
      filters: ['country', 'status']
    },
    aov: {
      title: 'Average Order Value',
      trendKey: 'orders',
      money: false,
      filters: ['country', 'status']
    },
    conversion: {
      title: 'Conversion Rate',
      trendKey: 'orders',
      money: false,
      filters: []
    },
    add_to_cart: {
      title: 'Add To Cart',
      trendKey: 'add_to_cart',
      money: false,
      filters: ['country', 'product']
    },
    checkout: {
      title: 'Checkout Started',
      trendKey: 'checkout',
      money: false,
      filters: ['country']
    },
    email_leads: {
      title: 'Email Leads',
      trendKey: 'email_leads',
      money: false,
      filters: ['country', 'source']
    },
    custom_made_leads: {
      title: 'Custom Made Leads',
      trendKey: 'custom_made_leads',
      money: false,
      filters: ['country', 'status']
    },
    abandoned: {
      title: 'Abandoned Cart',
      trendKey: 'abandoned',
      money: false,
      filters: ['country']
    }
  };

  var FILTER_LABELS = {
    country: 'Country',
    device: 'Device',
    source: 'Traffic source',
    product: 'Product',
    status: 'Status'
  };

  function parseMetricKeyFromHash() {
    var hash = String(window.location.hash || '').replace(/^#/, '');
    var parts = hash.split('/').filter(Boolean);
    if (parts[0] === 'dashboard' && parts[1] === 'metric' && parts[2]) {
      return String(parts[2]).toLowerCase();
    }
    return null;
  }

  function mount(container, metricKey, options) {
    if (!container || !METRICS[metricKey]) {
      container.innerHTML =
        '<div class="admin-card"><p class="admin-error">Unknown metric. <a href="#dashboard">Back to Dashboard</a></p></div>';
      return;
    }

    var U = window.AdminUtils || {};
    var meta = METRICS[metricKey];
    var rangeState = (options && options.rangeState) || {
      preset: '30',
      customStart: '',
      customEnd: ''
    };
    var range =
      options && options.range
        ? options.range
        : U.resolveRange
          ? U.resolveRange(rangeState.preset)
          : { days: 30, start: '', end: '', startDate: '', endDate: '' };
    var charts = {};
    var tableOffset = 0;
    var tableLimit = 40;
    var searchQ = '';
    var filters = { country: '', device: '', source: '', product: '', status: '' };
    var granularity = pickDefaultGranularity(range);
    var lastSeries = [];
    var prevSeriesValues = [];
    var periodDeltaLabel = '';

    function apiQuery() {
      var base = U.apiQuery ? U.apiQuery(range) : 'days=' + (range.days || 30);
      var extra = [];
      Object.keys(filters).forEach(function (k) {
        if (filters[k]) extra.push(encodeURIComponent(k) + '=' + encodeURIComponent(filters[k]));
      });
      return extra.length ? base + '&' + extra.join('&') : base;
    }

    function esc(v) {
      return U.escapeHtml ? U.escapeHtml(v) : String(v == null ? '' : v);
    }

    function when(iso) {
      return U.formatDateTime ? U.formatDateTime(iso) : String(iso || '—');
    }

    function destroyCharts() {
      Object.keys(charts).forEach(function (k) {
        if (charts[k]) {
          charts[k].destroy();
          charts[k] = null;
        }
      });
    }

    function pickDefaultGranularity(r) {
      var days = Number(r.days) || 30;
      if (days <= 2) return 'hour';
      if (days <= 14) return 'day';
      if (days <= 90) return 'week';
      if (days <= 400) return 'month';
      return 'year';
    }

    function hourAllowed() {
      return (Number(range.days) || 30) <= 2;
    }

    function formatBucketLabel(raw) {
      var s = String(raw || '');
      if (granularity === 'hour' && s.indexOf('T') !== -1) {
        var d = new Date(s);
        if (!isNaN(d.getTime())) {
          return String(d.getHours()).padStart(2, '0') + ':00';
        }
        return s.slice(11, 16) || s;
      }
      if (granularity === 'year') return s.slice(0, 4);
      return s.slice(0, 10);
    }

    function pctChange(curr, prev) {
      if (prev == null || prev === 0) {
        return curr ? '+100%' : '0%';
      }
      var p = ((curr - prev) / Math.abs(prev)) * 100;
      var sign = p > 0 ? '+' : '';
      return sign + p.toFixed(1) + '%';
    }

    function previousRange(r) {
      var startMs = new Date(r.start).getTime();
      var endMs = new Date(r.end).getTime();
      if (isNaN(startMs) || isNaN(endMs) || endMs <= startMs) return null;
      var span = endMs - startMs;
      var prevEnd = new Date(startMs);
      var prevStart = new Date(startMs - span);
      return {
        start: prevStart.toISOString(),
        end: prevEnd.toISOString(),
        days: r.days,
        startDate: prevStart.toISOString().slice(0, 10),
        endDate: prevEnd.toISOString().slice(0, 10)
      };
    }

    function fetchJson(path, rangeOverride) {
      var q =
        rangeOverride && U.apiQuery
          ? U.apiQuery(rangeOverride)
          : apiQuery();
      if (rangeOverride && !U.apiQuery) {
        q =
          'start=' +
          encodeURIComponent(rangeOverride.start) +
          '&end=' +
          encodeURIComponent(rangeOverride.end);
      }
      // When using a previous-range override, still append active filters
      if (rangeOverride) {
        Object.keys(filters).forEach(function (k) {
          if (filters[k]) q += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(filters[k]);
        });
      }
      var joiner = path.indexOf('?') === -1 ? '?' : '&';
      return fetch(window.location.origin + path + joiner + q)
        .then(function (r) {
          return r.ok ? r.json() : null;
        })
        .catch(function () {
          return null;
        });
    }

    function filterControlsHtml() {
      var keys = meta.filters || [];
      if (!keys.length) return '';
      return (
        '<div class="admin-metric-filters" id="metricFilters">' +
        keys
          .map(function (k) {
            return (
              '<label class="admin-metric-filter">' +
              '<span>' +
              esc(FILTER_LABELS[k] || k) +
              '</span>' +
              '<input type="text" class="admin-input" data-filter="' +
              esc(k) +
              '" placeholder="Any" value="' +
              esc(filters[k] || '') +
              '" />' +
              '</label>'
            );
          })
          .join('') +
        '<button type="button" class="admin-btn-secondary" id="metricFilterApply">Apply filters</button>' +
        '<button type="button" class="admin-btn-ghost" id="metricFilterClear">Clear</button>' +
        '</div>'
      );
    }

    function bindFilters() {
      var apply = document.getElementById('metricFilterApply');
      var clear = document.getElementById('metricFilterClear');
      function readFilters() {
        container.querySelectorAll('[data-filter]').forEach(function (el) {
          var k = el.getAttribute('data-filter');
          filters[k] = (el.value || '').trim();
        });
      }
      if (apply) {
        apply.addEventListener('click', function () {
          readFilters();
          tableOffset = 0;
          loadAll();
        });
      }
      if (clear) {
        clear.addEventListener('click', function () {
          Object.keys(filters).forEach(function (k) {
            filters[k] = '';
          });
          tableOffset = 0;
          renderShell();
          loadAll();
        });
      }
    }

    function renderShell() {
      var hourDisabled = hourAllowed() ? '' : ' disabled title="Hour view is available for Today / Yesterday"';
      container.innerHTML =
        '<div class="admin-metric-page">' +
        '<div class="admin-page-header admin-metric-header">' +
        (function () {
          var back = U.resolveBackNav
            ? U.resolveBackNav('dashboard', 'Dashboard')
            : { href: '#dashboard', label: '← Dashboard' };
          return (
            '<div><a class="admin-metric-back" href="' +
            esc(back.href) +
            '">' +
            esc(back.label) +
            '</a>'
          );
        })() +
        '<h2 class="admin-page-title">' +
        esc(meta.title) +
        '</h2>' +
        '<p class="admin-muted">Drill-down analytics for this KPI.</p></div>' +
        '</div>' +
        '<div class="admin-analytics-toolbar admin-metric-toolbar">' +
        (U.renderDateFilter ? U.renderDateFilter(rangeState.preset, { extra: '' }) : '') +
        '<div class="admin-metric-granularity" role="group" aria-label="Chart granularity">' +
        ['hour', 'day', 'week', 'month', 'year']
          .map(function (g) {
            var dis = g === 'hour' ? hourDisabled : '';
            var active = g === granularity ? ' is-active' : '';
            return (
              '<button type="button" class="admin-gran-btn' +
              active +
              '" data-gran="' +
              g +
              '"' +
              dis +
              '>' +
              g.charAt(0).toUpperCase() +
              g.slice(1) +
              '</button>'
            );
          })
          .join('') +
        '</div></div>' +
        filterControlsHtml() +
        '<section class="admin-card admin-metric-chart-card">' +
        '<div class="admin-metric-chart-head"><h3>Trend</h3>' +
        '<span class="admin-muted" id="metricPeriodDelta">' +
        esc(periodDeltaLabel) +
        '</span></div>' +
        '<div class="chart-container chart-container--tall"><canvas id="metricTrendChart"></canvas></div>' +
        '</section>' +
        '<section class="admin-metric-summary" id="metricSummary">' +
        (U.skeletonCards ? U.skeletonCards(4) : '<div class="admin-loading">Loading summary…</div>') +
        '</section>' +
        '<section class="admin-card admin-metric-table-card">' +
        '<div class="admin-metric-table-head">' +
        '<h3>Detailed table</h3>' +
        '<div class="admin-metric-table-actions">' +
        '<input type="search" id="metricSearch" class="admin-input" placeholder="Search…" value="' +
        esc(searchQ) +
        '" />' +
        '<button type="button" class="admin-btn-secondary" id="metricCsv">Export CSV</button>' +
        '</div></div>' +
        '<div id="metricTableHost"><div class="admin-loading">Loading rows…</div></div>' +
        '<div class="admin-metric-pager" id="metricPager"></div>' +
        '</section></div>';

      if (U.bindDateFilter) {
        U.bindDateFilter(container, rangeState, function (next) {
          range = next;
          rangeState.preset = next.preset || rangeState.preset;
          granularity = pickDefaultGranularity(range);
          tableOffset = 0;
          renderShell();
          loadAll();
        });
      }

      container.querySelectorAll('.admin-gran-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (btn.disabled) return;
          granularity = btn.getAttribute('data-gran');
          renderShell();
          loadAll();
        });
      });

      bindFilters();

      var searchEl = document.getElementById('metricSearch');
      if (searchEl) {
        var t;
        searchEl.addEventListener('input', function () {
          clearTimeout(t);
          t = setTimeout(function () {
            searchQ = searchEl.value || '';
            tableOffset = 0;
            loadTable();
          }, 280);
        });
      }

      var csvBtn = document.getElementById('metricCsv');
      if (csvBtn) {
        csvBtn.addEventListener('click', function () {
          exportCsv();
        });
      }
    }

    function sumSeries(values) {
      return (values || []).reduce(function (a, b) {
        return a + (Number(b) || 0);
      }, 0);
    }

    function drawTrend(seriesPoints) {
      var el = document.getElementById('metricTrendChart');
      if (!el || typeof Chart === 'undefined') return;
      destroyCharts();
      seriesPoints = Array.isArray(seriesPoints) ? seriesPoints : [];
      lastSeries = seriesPoints;
      var labels = seriesPoints.map(function (p) {
        return formatBucketLabel(p.date);
      });
      var values = seriesPoints.map(function (p) {
        var v = Number(p.value) || 0;
        return meta.money ? v / 100 : v;
      });
      var accent =
        getComputedStyle(document.documentElement).getPropertyValue('--admin-accent').trim() ||
        '#111111';
      charts.trend = new Chart(el, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            {
              data: values,
              borderColor: accent,
              backgroundColor: 'rgba(17,17,17,0.06)',
              fill: true,
              tension: 0.35,
              pointRadius: 2,
              borderWidth: 2
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title: function (items) {
                  if (!items || !items.length) return '';
                  var i = items[0].dataIndex;
                  return formatBucketLabel(seriesPoints[i] && seriesPoints[i].date);
                },
                label: function (ctx) {
                  var i = ctx.dataIndex;
                  var curr = values[i] || 0;
                  var prevBucket = i > 0 ? values[i - 1] : null;
                  var prevPeriod =
                    prevSeriesValues && prevSeriesValues[i] != null ? prevSeriesValues[i] : null;
                  var valLabel = meta.money
                    ? 'US$' + Number(curr).toFixed(2)
                    : String(Math.round(curr * 100) / 100);
                  var lines = ['Value: ' + valLabel];
                  if (prevBucket != null) lines.push('vs prior bucket: ' + pctChange(curr, prevBucket));
                  if (prevPeriod != null) {
                    lines.push('vs prior period: ' + pctChange(curr, prevPeriod));
                  }
                  return lines;
                }
              }
            }
          },
          scales: {
            x: { grid: { display: false }, ticks: { maxTicksLimit: 12 } },
            y: {
              beginAtZero: true,
              ticks: meta.money
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

    function renderSummary(payload) {
      var host = document.getElementById('metricSummary');
      if (!host) return;
      var cards = (payload && payload.summary && payload.summary.cards) || [];
      var breakdowns = (payload && payload.summary && payload.summary.breakdowns) || {};
      var cardsHtml =
        '<div class="admin-kpi-cards admin-kpi-cards--dense">' +
        cards
          .map(function (c) {
            return (
              '<div class="admin-kpi-card admin-kpi-card--static"><div class="admin-kpi-card-inner">' +
              '<div class="admin-kpi-card-top"><span class="admin-kpi-label">' +
              esc(c.label) +
              '</span></div>' +
              '<div class="admin-kpi-value-wrap"><span class="admin-kpi-value">' +
              esc(c.value) +
              '</span></div></div></div>'
            );
          })
          .join('') +
        '</div>';

      var breakHtml = '';
      Object.keys(breakdowns).forEach(function (name) {
        var items = breakdowns[name] || [];
        if (!items.length) return;
        breakHtml +=
          '<div class="admin-card admin-metric-breakdown"><h4>' +
          esc(name.replace(/_/g, ' ')) +
          '</h4><ul class="admin-metric-break-list">' +
          items
            .map(function (it) {
              return (
                '<li><span>' +
                esc(it.label) +
                '</span><strong>' +
                esc(it.value) +
                (it.rate != null ? ' · ' + esc(it.rate) + '%' : '') +
                '</strong></li>'
              );
            })
            .join('') +
          '</ul></div>';
      });

      host.innerHTML = cardsHtml + (breakHtml ? '<div class="admin-metric-breaks">' + breakHtml + '</div>' : '');
    }

    function renderTable(payload) {
      var host = document.getElementById('metricTableHost');
      var pager = document.getElementById('metricPager');
      if (!host) return;
      var table = (payload && payload.table) || { columns: [], rows: [], total: 0 };
      var cols = table.columns || [];
      var rows = table.rows || [];
      if (!cols.length) {
        host.innerHTML = '<p class="admin-cell-empty">No columns for this metric.</p>';
        if (pager) pager.innerHTML = '';
        return;
      }
      var head =
        '<thead><tr>' +
        cols
          .map(function (c) {
            return '<th>' + esc(c.label) + '</th>';
          })
          .join('') +
        '</tr></thead>';
      var body =
        '<tbody>' +
        (rows
          .map(function (r) {
            var hrefRaw = r.href || r.email_href || r.customer_href || null;
            var href = hrefRaw && U.withFrom ? U.withFrom(hrefRaw) : hrefRaw;
            var emailHref =
              r.email_href && U.withFrom ? U.withFrom(r.email_href) : r.email_href;
            var customerHref =
              r.customer_href && U.withFrom ? U.withFrom(r.customer_href) : r.customer_href;
            var productHref =
              r.product_href && U.withFrom ? U.withFrom(r.product_href) : r.product_href;
            var trClass = href ? ' class="admin-row-link" data-href="' + esc(href) + '"' : '';
            return (
              '<tr' +
              trClass +
              '>' +
              cols
                .map(function (c) {
                  var val = r[c.key];
                  if (c.key === 'time' || c.key === 'created') val = when(val);
                  if (c.key === 'email' && emailHref) {
                    return (
                      '<td><a href="' +
                      esc(emailHref) +
                      '">' +
                      esc(val) +
                      '</a></td>'
                    );
                  }
                  if (c.key === 'customer' && customerHref) {
                    return (
                      '<td><a href="' +
                      esc(customerHref) +
                      '">' +
                      esc(val) +
                      '</a></td>'
                    );
                  }
                  if (c.key === 'product' && productHref) {
                    return (
                      '<td><a href="' +
                      esc(productHref) +
                      '">' +
                      esc(val) +
                      '</a></td>'
                    );
                  }
                  return '<td>' + esc(val != null ? val : '—') + '</td>';
                })
                .join('') +
              '</tr>'
            );
          })
          .join('') ||
          '<tr><td colspan="' +
            cols.length +
            '" class="admin-cell-empty">No rows in this range</td></tr>') +
        '</tbody>';
      host.innerHTML =
        '<div class="admin-table-wrap"><table class="admin-table">' + head + body + '</table></div>';

      host.querySelectorAll('tr.admin-row-link').forEach(function (tr) {
        tr.addEventListener('click', function (e) {
          if (e.target && e.target.closest && e.target.closest('a')) return;
          var h = tr.getAttribute('data-href');
          if (!h) return;
          if (h.charAt(0) !== '#') h = '#' + h;
          window.location.hash = h;
        });
      });

      var total = Number(table.total) || rows.length;
      var from = total ? tableOffset + 1 : 0;
      var to = Math.min(tableOffset + tableLimit, total);
      if (pager) {
        pager.innerHTML =
          '<span class="admin-muted">' +
          from +
          '–' +
          to +
          ' of ' +
          total +
          '</span>' +
          '<div class="admin-metric-pager-btns">' +
          '<button type="button" class="admin-btn-secondary" id="metricPrev"' +
          (tableOffset <= 0 ? ' disabled' : '') +
          '>Previous</button>' +
          '<button type="button" class="admin-btn-secondary" id="metricNext"' +
          (tableOffset + tableLimit >= total ? ' disabled' : '') +
          '>Next</button></div>';
        var prev = document.getElementById('metricPrev');
        var next = document.getElementById('metricNext');
        if (prev) {
          prev.addEventListener('click', function () {
            tableOffset = Math.max(0, tableOffset - tableLimit);
            loadTable();
          });
        }
        if (next) {
          next.addEventListener('click', function () {
            tableOffset = tableOffset + tableLimit;
            loadTable();
          });
        }
      }

      window.__metricLastTable = table;
    }

    function exportCsv() {
      var table = window.__metricLastTable;
      if (!table || !table.rows || !table.rows.length) {
        alert('No rows to export.');
        return;
      }
      var cols = table.columns || [];
      var lines = [
        cols
          .map(function (c) {
            return '"' + String(c.label).replace(/"/g, '""') + '"';
          })
          .join(',')
      ];
      table.rows.forEach(function (r) {
        lines.push(
          cols
            .map(function (c) {
              return '"' + String(r[c.key] != null ? r[c.key] : '').replace(/"/g, '""') + '"';
            })
            .join(',')
        );
      });
      var blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = metricKey + '-export.csv';
      a.click();
      URL.revokeObjectURL(a.href);
    }

    function loadTable() {
      var host = document.getElementById('metricTableHost');
      if (host) host.innerHTML = '<div class="admin-loading">Loading rows…</div>';
      var q =
        '/api/analytics/metric/' +
        encodeURIComponent(metricKey) +
        '/rows?limit=' +
        tableLimit +
        '&offset=' +
        tableOffset +
        (searchQ ? '&q=' + encodeURIComponent(searchQ) : '');
      return fetchJson(q).then(function (data) {
        renderTable(data);
      });
    }

    function seriesValues(points, asMoney) {
      return (points || []).map(function (p) {
        var v = Number(p.value) || 0;
        return asMoney ? v / 100 : v;
      });
    }

    function loadAll() {
      destroyCharts();
      var summaryHost = document.getElementById('metricSummary');
      if (summaryHost) {
        summaryHost.innerHTML = U.skeletonCards
          ? U.skeletonCards(4)
          : '<div class="admin-loading">Loading…</div>';
      }
      var prev = previousRange(range);
      var seriesKey = meta.trendKey || metricKey;
      Promise.all([
        fetchJson(
          '/api/analytics/trends?granularity=' + encodeURIComponent(granularity)
        ),
        prev
          ? fetchJson(
              '/api/analytics/trends?granularity=' + encodeURIComponent(granularity),
              prev
            )
          : Promise.resolve(null),
        fetchJson('/api/analytics/metric/' + encodeURIComponent(metricKey) + '/summary'),
        loadTable()
      ]).then(function (parts) {
        var trends = parts[0] || {};
        var prevTrends = parts[1] || {};
        var currentPoints = trends[seriesKey] || [];
        var prevPoints = (prevTrends && prevTrends[seriesKey]) || [];
        prevSeriesValues = seriesValues(prevPoints, meta.money);
        var currTotal = sumSeries(seriesValues(currentPoints, meta.money));
        var prevTotal = sumSeries(prevSeriesValues);
        periodDeltaLabel =
          prev && prevTotal >= 0
            ? 'Period vs prior: ' + pctChange(currTotal, prevTotal)
            : '';
        var deltaEl = document.getElementById('metricPeriodDelta');
        if (deltaEl) deltaEl.textContent = periodDeltaLabel;
        drawTrend(currentPoints);
        renderSummary(parts[2]);
      });
    }

    renderShell();
    loadAll();

    return {
      destroy: destroyCharts
    };
  }

  return {
    METRICS: METRICS,
    parseMetricKeyFromHash: parseMetricKeyFromHash,
    mount: mount
  };
})();
