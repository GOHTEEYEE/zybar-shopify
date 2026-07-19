/**
 * Admin Customer Activity — journey intelligence from analytics + orders + leads.
 */
window.renderAdminactivity = function (container) {
  if (!container) return;

  var U = window.AdminUtils || {};
  var hash = (window.location.hash || '#activity').slice(1);
  var parts = hash.split('/');
  var visitorId = parts[1] ? decodeURIComponent(parts[1]) : null;
  var tab = parts[1] && !visitorId ? parts[1] : 'list';
  if (parts[1] === 'leads' || parts[1] === 'abandoned' || parts[1] === 'countries' || parts[1] === 'traffic') {
    tab = parts[1];
    visitorId = null;
  } else if (parts[1] && parts[1] !== 'list') {
    visitorId = parts[1];
    tab = 'detail';
  } else {
    tab = 'list';
  }

  var state = {
    preset: '30',
    status: '',
    country: '',
    traffic: '',
    search: '',
    offset: 0
  };

  function esc(v) {
    return U.escapeHtml ? U.escapeHtml(v) : String(v == null ? '' : v);
  }

  function money(cents) {
    return U.formatUsdCents ? U.formatUsdCents(cents) : 'US$' + ((Number(cents) || 0) / 100).toFixed(2);
  }

  function when(iso) {
    return U.formatDateTime ? U.formatDateTime(iso) : String(iso || '—');
  }

  function statusBadge(status) {
    var map = {
      anonymous: 'ca-badge-anonymous',
      browsing: 'ca-badge-browsing',
      product_viewed: 'ca-badge-product',
      added_to_cart: 'ca-badge-cart',
      checkout_started: 'ca-badge-checkout',
      purchased: 'ca-badge-purchased',
      abandoned: 'ca-badge-abandoned',
      inactive: 'ca-badge-inactive'
    };
    var label = String(status || 'anonymous').replace(/_/g, ' ');
    return '<span class="ca-badge ' + (map[status] || 'ca-badge-anonymous') + '">' + esc(label) + '</span>';
  }

  function apiQuery() {
    var q =
      'preset=' +
      encodeURIComponent(state.preset) +
      '&limit=40&offset=' +
      state.offset;
    if (state.preset === 'custom' && state.customStart && state.customEnd) {
      q +=
        '&start=' +
        encodeURIComponent(state.customStart) +
        '&end=' +
        encodeURIComponent(state.customEnd);
    }
    if (state.status) q += '&status=' + encodeURIComponent(state.status);
    if (state.country) q += '&country=' + encodeURIComponent(state.country);
    if (state.traffic) q += '&traffic=' + encodeURIComponent(state.traffic);
    if (state.search) q += '&search=' + encodeURIComponent(state.search);
    return q;
  }

  function fetchJson(path) {
    return fetch(window.location.origin + path)
      .then(function (r) {
        return r.json().then(function (body) {
          return { ok: r.ok, body: body };
        });
      })
      .catch(function () {
        return { ok: false, body: {} };
      });
  }

  function shellTabs(active) {
    var tabs = [
      { id: 'list', href: '#activity', label: 'Activity' },
      { id: 'leads', href: '#activity/leads', label: 'Email Leads' },
      { id: 'abandoned', href: '#activity/abandoned', label: 'Abandoned Carts' },
      { id: 'countries', href: '#activity/countries', label: 'Countries' },
      { id: 'traffic', href: '#activity/traffic', label: 'Traffic Sources' }
    ];
    return (
      '<nav class="admin-analytics-tabs" aria-label="Customer activity">' +
      tabs
        .map(function (t) {
          return (
            '<a class="admin-analytics-tab' +
            (t.id === active ? ' is-active' : '') +
            '" href="' +
            t.href +
            '">' +
            t.label +
            '</a>'
          );
        })
        .join('') +
      '</nav>'
    );
  }

  function renderFilters() {
    return (
      '<div class="admin-analytics-toolbar ca-filters">' +
      (U.renderDateFilter ? U.renderDateFilter(state.preset, { extra: '' }) : '') +
      '<select id="caStatus" class="admin-search-input" style="width:auto;min-width:140px">' +
      '<option value="">All statuses</option>' +
      ['anonymous', 'browsing', 'product_viewed', 'added_to_cart', 'checkout_started', 'purchased', 'abandoned', 'inactive']
        .map(function (s) {
          return '<option value="' + s + '"' + (state.status === s ? ' selected' : '') + '>' + s.replace(/_/g, ' ') + '</option>';
        })
        .join('') +
      '</select>' +
      '<select id="caTraffic" class="admin-search-input" style="width:auto;min-width:140px">' +
      '<option value="">All traffic</option>' +
      ['Facebook', 'Instagram', 'Google', 'TikTok', 'Direct', 'Referral', 'Unknown']
        .map(function (s) {
          return '<option value="' + s + '"' + (state.traffic === s ? ' selected' : '') + '>' + s + '</option>';
        })
        .join('') +
      '</select>' +
      '<input type="search" id="caCountry" class="admin-search-input" style="width:auto;min-width:110px" placeholder="Country" value="' +
      esc(state.country) +
      '" />' +
      '<input type="search" id="caSearch" class="admin-search-input" placeholder="Search email, name, country, product, order…" value="' +
      esc(state.search) +
      '" />' +
      '</div>'
    );
  }

  function bindFilters(reload) {
    if (U.bindDateFilter) {
      U.bindDateFilter(container, state, function (range) {
        var active = container.querySelector('[data-range].is-active');
        state.preset = active ? active.getAttribute('data-range') : range.preset || '30';
        if (state.preset === 'custom') {
          state.customStart = range.startDate;
          state.customEnd = range.endDate;
        }
        state.offset = 0;
        reload();
      });
    }
    var statusEl = document.getElementById('caStatus');
    var trafficEl = document.getElementById('caTraffic');
    var countryEl = document.getElementById('caCountry');
    var searchEl = document.getElementById('caSearch');
    if (statusEl) {
      statusEl.addEventListener('change', function () {
        state.status = statusEl.value;
        state.offset = 0;
        reload();
      });
    }
    if (trafficEl) {
      trafficEl.addEventListener('change', function () {
        state.traffic = trafficEl.value;
        state.offset = 0;
        reload();
      });
    }
    if (countryEl) {
      var tc;
      countryEl.addEventListener('input', function () {
        clearTimeout(tc);
        tc = setTimeout(function () {
          state.country = countryEl.value.trim().toUpperCase();
          state.offset = 0;
          reload();
        }, 280);
      });
    }
    if (searchEl) {
      var t;
      searchEl.addEventListener('input', function () {
        clearTimeout(t);
        t = setTimeout(function () {
          state.search = searchEl.value.trim();
          state.offset = 0;
          reload();
        }, 280);
      });
    }
  }

  function renderList() {
    container.innerHTML =
      '<div class="admin-page-header"><h2 class="admin-page-title">Customer Activity</h2></div>' +
      shellTabs('list') +
      renderFilters() +
      '<div id="caHost">' +
      (U.skeletonTable ? U.skeletonTable(8) : '<div class="admin-loading">Loading…</div>') +
      '</div>';

    function load() {
      var host = document.getElementById('caHost');
      if (!host) return;
      host.innerHTML = U.skeletonTable ? U.skeletonTable(8) : '<div class="admin-loading">Loading…</div>';
      fetchJson('/api/customer-activity?' + apiQuery()).then(function (res) {
        if (!res.ok) {
          host.innerHTML = '<p class="admin-error">' + esc((res.body && res.body.error) || 'Failed to load') + '</p>';
          return;
        }
        var rows = (res.body && res.body.rows) || [];
        var body =
          rows
            .map(function (r) {
              return (
                '<tr class="admin-row-clickable" data-vid="' +
                esc(r.visitor_id) +
                '">' +
                '<td><code>' +
                esc(String(r.activity_id || '').slice(0, 10)) +
                '…</code></td>' +
                '<td>' +
                esc(r.customer_name || '—') +
                '</td>' +
                '<td>' +
                esc(r.email || '—') +
                '</td>' +
                '<td>' +
                esc(r.country || '—') +
                '</td>' +
                '<td>' +
                esc(r.traffic_source || '—') +
                '</td>' +
                '<td>' +
                statusBadge(r.status) +
                '</td>' +
                '<td>' +
                esc(r.current_product || '—') +
                '</td>' +
                '<td>' +
                money(r.cart_value_cents) +
                '</td>' +
                '<td>' +
                esc(when(r.last_activity_at)) +
                '</td>' +
                '<td>' +
                esc(when(r.created_at)) +
                '</td>' +
                '<td><a class="admin-btn-view" href="#activity/' +
                encodeURIComponent(r.visitor_id) +
                '">View</a></td>' +
                '</tr>'
              );
            })
            .join('') ||
          '<tr><td colspan="11" class="admin-cell-empty">No activity in this range.</td></tr>';

        host.innerHTML =
          '<div class="admin-card"><div class="admin-table-wrap"><table class="admin-table admin-table--compact">' +
          '<thead><tr><th>Activity ID</th><th>Customer Name</th><th>Email</th><th>Country</th><th>Traffic Source</th><th>Status</th><th>Current Product</th><th>Cart Value</th><th>Last Activity</th><th>Created At</th><th>Actions</th></tr></thead>' +
          '<tbody>' +
          body +
          '</tbody></table></div>' +
          '<div class="ca-pager">' +
          '<button type="button" class="admin-btn-secondary" id="caPrev"' +
          (state.offset <= 0 ? ' disabled' : '') +
          '>Previous</button>' +
          '<span class="admin-muted">Showing ' +
          rows.length +
          ' · offset ' +
          state.offset +
          '</span>' +
          '<button type="button" class="admin-btn-secondary" id="caNext"' +
          (rows.length < 40 ? ' disabled' : '') +
          '>Next</button>' +
          '</div></div>';

        host.querySelectorAll('[data-vid]').forEach(function (tr) {
          tr.addEventListener('click', function (e) {
            if (e.target && e.target.closest && e.target.closest('a')) return;
            window.location.hash = 'activity/' + encodeURIComponent(tr.getAttribute('data-vid'));
          });
        });
        var prev = document.getElementById('caPrev');
        var next = document.getElementById('caNext');
        if (prev) {
          prev.addEventListener('click', function () {
            state.offset = Math.max(0, state.offset - 40);
            load();
          });
        }
        if (next) {
          next.addEventListener('click', function () {
            state.offset += 40;
            load();
          });
        }
      });
    }

    bindFilters(load);
    load();
  }

  function renderDetail() {
    container.innerHTML =
      '<div class="admin-page-header"><div><a href="#activity" class="admin-back-link">← Customer Activity</a>' +
      '<h2 class="admin-page-title">Customer Journey</h2></div></div>' +
      '<div id="caDetailHost"><div class="admin-loading">Loading…</div></div>';

    fetchJson('/api/customer-activity/detail?visitor_id=' + encodeURIComponent(visitorId)).then(function (res) {
      var host = document.getElementById('caDetailHost');
      if (!host) return;
      if (!res.ok || !res.body) {
        host.innerHTML = '<p class="admin-error">' + esc((res.body && res.body.error) || 'Not found') + '</p>';
        return;
      }
      var d = res.body;
      var c = d.customer || {};
      var cart = d.current_cart || {};
      var checkout = d.checkout || {};

      var cartRows =
        (cart.items || [])
          .map(function (i) {
            return (
              '<tr><td class="admin-cell-thumb"><img src="' +
              esc(i.thumb) +
              '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'" /></td><td>' +
              esc(i.product_name) +
              '</td><td>' +
              esc(i.variant || '—') +
              '</td><td>' +
              esc(i.quantity) +
              '</td><td>' +
              money(i.unit_price_cents) +
              '</td><td>' +
              money(i.subtotal_cents) +
              '</td></tr>'
            );
          })
          .join('') || '<tr><td colspan="6" class="admin-cell-empty">No cart items</td></tr>';

      var viewed =
        (d.viewed_products || [])
          .map(function (p) {
            return (
              '<tr><td>' +
              esc(p.product_name || p.product_id) +
              '</td><td>' +
              esc(when(p.last_viewed_at)) +
              '</td><td>' +
              esc(p.time_spent_seconds || '—') +
              '</td><td>' +
              esc(p.times_viewed) +
              '</td></tr>'
            );
          })
          .join('') || '<tr><td colspan="4" class="admin-cell-empty">No product views</td></tr>';

      var timeline =
        (d.timeline || [])
          .slice()
          .reverse()
          .map(function (ev) {
            return (
              '<li><div class="ca-timeline-time">' +
              esc(when(ev.at)) +
              '</div><div class="ca-timeline-label">' +
              esc(ev.label) +
              '</div></li>'
            );
          })
          .join('') || '<li class="admin-muted">No events yet</li>';

      var journey =
        (d.journey || [])
          .map(function (step, i, arr) {
            var done = !!step.at;
            return (
              '<div class="ca-journey-step' +
              (done ? ' is-done' : '') +
              '"><div class="ca-journey-dot"></div><div class="ca-journey-label">' +
              esc(step.label) +
              '</div><div class="ca-journey-time">' +
              esc(step.at ? when(step.at) : '—') +
              '</div></div>' +
              (i < arr.length - 1 ? '<div class="ca-journey-arrow">↓</div>' : '')
            );
          })
          .join('');

      host.innerHTML =
        '<div class="admin-detail-grid">' +
        '<div class="admin-card"><h3>Customer Information</h3><div class="ca-status-wrap">' +
        statusBadge(d.status) +
        '</div><dl class="admin-dl">' +
        [
          ['Name', c.name],
          ['Email', c.email],
          ['Phone', c.phone],
          ['Country', c.country],
          ['City', c.city],
          ['Language', c.language],
          ['Traffic Source', c.traffic_source],
          ['UTM Source', c.utm_source],
          ['UTM Campaign', c.utm_campaign],
          ['Facebook Click ID', c.fbclid],
          ['Google Click ID', c.gclid],
          ['Device', c.device],
          ['Browser', c.browser],
          ['OS', c.os],
          ['IP', c.ip_masked],
          ['First Visit', when(c.first_visit)],
          ['Last Visit', when(c.last_visit)],
          ['Sessions', c.session_count]
        ]
          .map(function (row) {
            return (
              '<div><dt>' +
              esc(row[0]) +
              '</dt><dd>' +
              esc(row[1] == null || row[1] === '' ? '—' : row[1]) +
              '</dd></div>'
            );
          })
          .join('') +
        '</dl></div>' +
        '<div class="admin-card"><h3>Customer Journey</h3><div class="ca-journey">' +
        journey +
        '</div></div>' +
        '<div class="admin-card"><h3>Current Cart</h3><p class="admin-muted">Updated ' +
        esc(when(cart.updated_at)) +
        ' · Total ' +
        money(cart.total_cents) +
        '</p><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th></th><th>Product</th><th>Variant</th><th>Qty</th><th>Price</th><th>Subtotal</th></tr></thead><tbody>' +
        cartRows +
        '</tbody></table></div></div>' +
        '<div class="admin-card"><h3>Checkout Information</h3><dl class="admin-dl">' +
        [
          ['Checkout Started', checkout.started ? 'Yes' : 'No'],
          ['Checkout Completed', checkout.completed ? 'Yes' : 'No'],
          ['Payment Status', checkout.payment_status],
          ['Shipping Method', checkout.shipping_method],
          ['Discount Code', checkout.discount_code],
          ['Payment Method', checkout.payment_method],
          ['Order Total', checkout.amount_total_cents != null ? money(checkout.amount_total_cents) : null]
        ]
          .map(function (row) {
            return (
              '<div><dt>' +
              esc(row[0]) +
              '</dt><dd>' +
              esc(row[1] == null || row[1] === '' ? '—' : row[1]) +
              '</dd></div>'
            );
          })
          .join('') +
        '</dl></div>' +
        '<div class="admin-card"><h3>Viewed Products</h3><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Product</th><th>Viewed Time</th><th>Time Spent</th><th>Times Viewed</th></tr></thead><tbody>' +
        viewed +
        '</tbody></table></div></div>' +
        '<div class="admin-card"><h3>Activity Timeline</h3><ul class="ca-timeline">' +
        timeline +
        '</ul></div>' +
        '</div>';
    });
  }

  function renderSimpleTable(title, activeTab, path, columns, mapRow) {
    container.innerHTML =
      '<div class="admin-page-header"><h2 class="admin-page-title">' +
      title +
      '</h2></div>' +
      shellTabs(activeTab) +
      renderFilters() +
      '<div id="caHost">' +
      (U.skeletonTable ? U.skeletonTable(6) : '<div class="admin-loading">Loading…</div>') +
      '</div>';

    function load() {
      var host = document.getElementById('caHost');
      fetchJson(path + '?' + apiQuery()).then(function (res) {
        if (!host) return;
        if (!res.ok) {
          host.innerHTML = '<p class="admin-error">' + esc((res.body && res.body.error) || 'Failed') + '</p>';
          return;
        }
        var rows = mapRow(res.body);
        var body =
          rows
            .map(function (cells) {
              return '<tr>' + cells.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>';
            })
            .join('') ||
          '<tr><td colspan="' + columns.length + '" class="admin-cell-empty">No data</td></tr>';
        host.innerHTML =
          '<div class="admin-card"><div class="admin-table-wrap"><table class="admin-table"><thead><tr>' +
          columns.map(function (c) { return '<th>' + c + '</th>'; }).join('') +
          '</tr></thead><tbody>' +
          body +
          '</tbody></table></div></div>';
      });
    }
    bindFilters(load);
    load();
  }

  if (tab === 'detail' && visitorId) {
    renderDetail();
    return;
  }
  if (tab === 'leads') {
    renderSimpleTable('Email Leads', 'leads', '/api/customer-activity/leads', [
      'Email', 'Country', 'Language', 'Discount', 'Signup Time', 'Purchased', 'Orders', 'Revenue', 'Source'
    ], function (body) {
      return (body.leads || []).map(function (l) {
        return [
          esc(l.email),
          esc(l.country || '—'),
          esc(l.language || '—'),
          esc(l.discount_code || '—'),
          esc(when(l.signup_at)),
          l.purchased ? statusBadge('purchased') : 'No',
          esc(l.order_count),
          money(l.revenue_cents),
          esc(l.source || '—')
        ];
      });
    });
    return;
  }
  if (tab === 'abandoned') {
    renderSimpleTable('Abandoned Carts', 'abandoned', '/api/customer-activity/abandoned', [
      'Visitor', 'Email', 'Country', 'Products', 'Cart Value', 'Hours Idle', 'Last Activity'
    ], function (body) {
      return (body.carts || []).map(function (c) {
        var products = Array.isArray(c.products)
          ? c.products.map(function (p) { return p.product_name || p.product_id; }).join(', ')
          : '—';
        return [
          c.visitor_id
            ? '<a href="#activity/' + encodeURIComponent(c.visitor_id) + '"><code>' + esc(String(c.visitor_id).slice(0, 10)) + '…</code></a>'
            : '—',
          esc(c.email || '—'),
          esc(c.country || '—'),
          esc(products || '—'),
          money(c.cart_value_cents),
          esc(c.hours_since_last_activity),
          esc(when(c.last_activity_at))
        ];
      });
    });
    return;
  }
  if (tab === 'countries') {
    renderSimpleTable('Country Analytics', 'countries', '/api/customer-activity/countries', [
      'Country', 'Visitors', 'Customers', 'Orders', 'Revenue', 'Conversion', 'AOV'
    ], function (body) {
      return (body.countries || []).map(function (c) {
        return [
          esc(c.country),
          esc(c.visitors),
          esc(c.customers),
          esc(c.orders),
          money(c.revenue_cents),
          esc(c.conversion_rate) + '%',
          money(c.aov_cents)
        ];
      });
    });
    return;
  }
  if (tab === 'traffic') {
    renderSimpleTable('Traffic Sources', 'traffic', '/api/customer-activity/traffic', [
      'Source', 'Visitors', 'Add To Cart', 'Checkout', 'Purchase', 'Revenue'
    ], function (body) {
      return (body.sources || []).map(function (s) {
        return [
          esc(s.label),
          esc(s.visitors),
          esc(s.add_to_cart),
          esc(s.checkout),
          esc(s.purchase),
          money(s.revenue_cents)
        ];
      });
    });
    return;
  }

  renderList();
};
