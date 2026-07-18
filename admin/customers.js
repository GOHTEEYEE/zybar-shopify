/**
 * Admin Customers — aggregated from real Supabase orders.
 */
window.renderAdmincustomers = function (container) {
  if (!container) return;

  var U = window.AdminUtils || {};
  var hash = (window.location.hash || '#customers').slice(1);
  var parts = hash.split('/');
  var detailKey = parts[1] ? decodeURIComponent(parts[1]) : null;
  var customers = [];
  var searchQ = '';

  function escapeHtml(v) {
    return U.escapeHtml ? U.escapeHtml(v) : String(v == null ? '' : v);
  }

  function formatUsdCents(cents) {
    return U.formatUsdCents ? U.formatUsdCents(cents) : 'US$' + ((Number(cents) || 0) / 100).toFixed(2);
  }

  function formatDate(iso) {
    return U.formatDate ? U.formatDate(iso) : String(iso || '—');
  }

  function formatDateTime(iso) {
    return U.formatDateTime ? U.formatDateTime(iso) : String(iso || '—');
  }

  function avatarInitials(name, email) {
    var src = (name || email || '?').trim();
    var parts = src.split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return src.slice(0, 2).toUpperCase();
  }

  function productName(slug) {
    if (!slug) return '—';
    return String(slug)
      .replace(/-/g, ' ')
      .replace(/\b\w/g, function (c) {
        return c.toUpperCase();
      });
  }

  function formatAddress(o) {
    return [o.shipping_address, o.city, o.state, o.postcode, o.country]
      .filter(function (p) {
        return p && String(p).trim();
      })
      .join(', ') || '—';
  }

  function loadOrders() {
    if (window.ZYBAR_MY_TEST && window.MOCK_DATA && window.MOCK_DATA.customers) {
      return Promise.resolve(
        window.MOCK_DATA.customers.map(function (c) {
          return {
            id: c.id,
            customer_name: c.client_name,
            customer_email: c.email,
            customer_phone: c.phone,
            shipping_address: c.shipping_address,
            postcode: c.postcode,
            country: '',
            amount_total_cents: Math.round((c.amount_paid_usd || 0) * 100),
            product_slug: (c.product_bought || '').toLowerCase().replace(/\s+/g, '-'),
            size: c.size,
            quantity: 1,
            status: c.status,
            created_at: c.order_date,
            stripe_session_id: null,
            internal_notes: null
          };
        })
      );
    }

    var sb = window.supabase;
    if (!sb) return Promise.resolve([]);
    return sb
      .from('orders')
      .select(
        'id,stripe_session_id,customer_name,customer_email,customer_phone,' +
          'shipping_address,city,state,postcode,country,' +
          'billing_address,billing_city,billing_state,billing_postcode,billing_country,' +
          'amount_total_cents,product_slug,size,quantity,status,created_at,internal_notes'
      )
      .order('created_at', { ascending: false })
      .limit(1000)
      .then(function (res) {
        if (res.error) return [];
        return res.data || [];
      })
      .catch(function () {
        return [];
      });
  }

  function aggregate(orders) {
    var map = {};
    orders.forEach(function (o) {
      var key = (o.customer_email || o.customer_name || o.id || '').toLowerCase();
      if (!key) return;
      if (!map[key]) {
        map[key] = {
          key: key,
          name: o.customer_name || o.customer_email || '—',
          email: o.customer_email || '—',
          phone: o.customer_phone || '',
          country: o.country || '',
          orders: [],
          lifetime_cents: 0,
          first_order: o.created_at,
          last_order: o.created_at,
          notes: o.internal_notes || '',
          shipping: o,
          billing: o
        };
      }
      var c = map[key];
      c.orders.push(o);
      c.lifetime_cents += Number(o.amount_total_cents) || 0;
      if (o.customer_name) c.name = o.customer_name;
      if (o.country) c.country = o.country;
      if (o.customer_phone) c.phone = o.customer_phone;
      if (o.created_at && (!c.first_order || o.created_at < c.first_order)) c.first_order = o.created_at;
      if (o.created_at && (!c.last_order || o.created_at > c.last_order)) {
        c.last_order = o.created_at;
        c.shipping = o;
        if (o.billing_address || o.shipping_address) c.billing = o;
      }
      if (o.internal_notes) c.notes = o.internal_notes;
    });

    return Object.keys(map)
      .map(function (k) {
        var c = map[k];
        var count = c.orders.length;
        var fav = {};
        c.orders.forEach(function (o) {
          var slug = o.product_slug || 'unknown';
          fav[slug] = (fav[slug] || 0) + (o.quantity || 1);
        });
        var favorite = Object.keys(fav)
          .map(function (slug) {
            return { slug: slug, qty: fav[slug] };
          })
          .sort(function (a, b) {
            return b.qty - a.qty;
          })
          .slice(0, 5);

        return {
          key: c.key,
          name: c.name,
          email: c.email,
          phone: c.phone,
          country: c.country,
          total_orders: count,
          lifetime_cents: c.lifetime_cents,
          aov_cents: count > 0 ? Math.round(c.lifetime_cents / count) : 0,
          last_order: c.last_order,
          customer_since: c.first_order,
          orders: c.orders,
          favorite: favorite,
          notes: c.notes,
          shipping: c.shipping,
          billing: c.billing
        };
      })
      .sort(function (a, b) {
        return (b.last_order || '').localeCompare(a.last_order || '');
      });
  }

  function renderList() {
    container.innerHTML =
      '<div class="admin-page-header">' +
      '<h2 class="admin-page-title">Customers</h2>' +
      '<div class="admin-page-actions">' +
      '<input type="search" id="customersSearch" class="admin-search-input" placeholder="Search name or email…" />' +
      '<button type="button" class="admin-btn-secondary" id="customersExportCsv">Export CSV</button>' +
      '</div></div>' +
      '<div class="admin-card"><div class="admin-table-wrap">' +
      '<table class="admin-table">' +
      '<thead><tr>' +
      '<th></th><th>Name</th><th>Email</th><th>Country</th><th>Total Orders</th>' +
      '<th>Lifetime Spend</th><th>Average Order Value</th><th>Last Order</th><th>Customer Since</th>' +
      '</tr></thead>' +
      '<tbody id="customersTableBody"><tr><td colspan="9" class="admin-loading">Loading…</td></tr></tbody>' +
      '</table></div></div>';

    var search = document.getElementById('customersSearch');
    if (search) {
      search.addEventListener('input', function () {
        searchQ = search.value;
        paintRows();
      });
    }
    var exportBtn = document.getElementById('customersExportCsv');
    if (exportBtn) {
      exportBtn.addEventListener('click', function () {
        if (!U.downloadCsv) return;
        U.downloadCsv(
          'zybar-customers.csv',
          filtered().map(function (c) {
            return {
              Name: c.name,
              Email: c.email,
              Country: c.country,
              Orders: c.total_orders,
              LifetimeSpend: (c.lifetime_cents / 100).toFixed(2),
              AOV: (c.aov_cents / 100).toFixed(2),
              LastOrder: c.last_order || '',
              CustomerSince: c.customer_since || ''
            };
          })
        );
      });
    }

    loadOrders().then(function (orders) {
      customers = aggregate(orders);
      paintRows();
    });
  }

  function filtered() {
    var q = (searchQ || '').trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(function (c) {
      return (
        String(c.name).toLowerCase().indexOf(q) !== -1 ||
        String(c.email).toLowerCase().indexOf(q) !== -1 ||
        String(c.country).toLowerCase().indexOf(q) !== -1
      );
    });
  }

  function paintRows() {
    var tbody = document.getElementById('customersTableBody');
    if (!tbody) return;
    var rows = filtered();
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="admin-cell-empty">No customers found.</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .map(function (c) {
        return (
          '<tr class="admin-row-clickable" data-customer-key="' +
          escapeHtml(encodeURIComponent(c.key)) +
          '">' +
          '<td><span class="admin-avatar">' +
          escapeHtml(avatarInitials(c.name, c.email)) +
          '</span></td>' +
          '<td class="admin-cell-name">' +
          escapeHtml(c.name) +
          '</td>' +
          '<td>' +
          escapeHtml(c.email) +
          '</td>' +
          '<td>' +
          escapeHtml(c.country || '—') +
          '</td>' +
          '<td>' +
          c.total_orders +
          '</td>' +
          '<td class="admin-cell-price">' +
          formatUsdCents(c.lifetime_cents) +
          '</td>' +
          '<td>' +
          formatUsdCents(c.aov_cents) +
          '</td>' +
          '<td>' +
          escapeHtml(formatDate(c.last_order)) +
          '</td>' +
          '<td>' +
          escapeHtml(formatDate(c.customer_since)) +
          '</td></tr>'
        );
      })
      .join('');

    tbody.querySelectorAll('[data-customer-key]').forEach(function (tr) {
      tr.addEventListener('click', function () {
        window.location.hash = 'customers/' + tr.getAttribute('data-customer-key');
      });
    });
  }

  function renderDetail(customer) {
    if (!customer) {
      container.innerHTML =
        '<p class="admin-error">Customer not found.</p><p><a href="#customers">← Back to customers</a></p>';
      return;
    }

    var ship = customer.shipping || {};
    var bill = customer.billing || {};
    var history =
      customer.orders
        .map(function (o) {
          return (
            '<tr>' +
            '<td><a href="#orders/' +
            escapeHtml(o.id) +
            '">' +
            escapeHtml(String(o.stripe_session_id || o.id).slice(0, 14)) +
            '</a></td>' +
            '<td>' +
            escapeHtml(productName(o.product_slug)) +
            '</td>' +
            '<td>' +
            formatUsdCents(o.amount_total_cents) +
            '</td>' +
            '<td>' +
            escapeHtml(formatDateTime(o.created_at)) +
            '</td>' +
            '<td>' +
            escapeHtml(o.status || '—') +
            '</td></tr>'
          );
        })
        .join('') || '<tr><td colspan="5">No orders</td></tr>';

    var fav =
      customer.favorite
        .map(function (f) {
          return (
            '<li><span>' +
            escapeHtml(productName(f.slug)) +
            '</span><strong>×' +
            f.qty +
            '</strong></li>'
          );
        })
        .join('') || '<li class="admin-muted">No favorites yet</li>';

    container.innerHTML =
      '<div class="admin-page-header">' +
      '<div><a href="#customers" class="admin-back-link">← Customers</a>' +
      '<h2 class="admin-page-title">' +
      escapeHtml(customer.name) +
      '</h2></div></div>' +
      '<div class="admin-detail-grid">' +
      '<div class="admin-card"><h3>Customer Information</h3>' +
      '<div class="admin-customer-hero"><span class="admin-avatar admin-avatar--lg">' +
      escapeHtml(avatarInitials(customer.name, customer.email)) +
      '</span><dl class="admin-dl">' +
      '<div><dt>Name</dt><dd>' +
      escapeHtml(customer.name) +
      '</dd></div>' +
      '<div><dt>Email</dt><dd>' +
      escapeHtml(customer.email) +
      '</dd></div>' +
      '<div><dt>Phone</dt><dd>' +
      escapeHtml(customer.phone || '—') +
      '</dd></div>' +
      '<div><dt>Country</dt><dd>' +
      escapeHtml(customer.country || '—') +
      '</dd></div>' +
      '<div><dt>Total Revenue</dt><dd>' +
      formatUsdCents(customer.lifetime_cents) +
      '</dd></div>' +
      '</dl></div></div>' +
      '<div class="admin-card"><h3>Shipping Address</h3><p>' +
      escapeHtml(formatAddress(ship)) +
      '</p></div>' +
      '<div class="admin-card"><h3>Billing Address</h3><p>' +
      escapeHtml(
        formatAddress({
          shipping_address: bill.billing_address || bill.shipping_address,
          city: bill.billing_city || bill.city,
          state: bill.billing_state || bill.state,
          postcode: bill.billing_postcode || bill.postcode,
          country: bill.billing_country || bill.country
        })
      ) +
      '</p></div>' +
      '<div class="admin-card"><h3>Orders History</h3><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Order</th><th>Product</th><th>Total</th><th>Date</th><th>Status</th></tr></thead><tbody>' +
      history +
      '</tbody></table></div></div>' +
      '<div class="admin-card"><h3>Favorite Products</h3><ul class="admin-stat-list">' +
      fav +
      '</ul></div>' +
      '<div class="admin-card"><h3>Notes</h3><p class="admin-muted">' +
      escapeHtml(customer.notes || 'No notes yet. Add notes on individual orders.') +
      '</p></div>' +
      '</div>';
  }

  if (detailKey) {
    container.innerHTML = '<div class="admin-loading">Loading customer…</div>';
    loadOrders().then(function (orders) {
      customers = aggregate(orders);
      var found = customers.filter(function (c) {
        return c.key === detailKey.toLowerCase();
      })[0];
      renderDetail(found);
    });
    return;
  }

  renderList();
};
