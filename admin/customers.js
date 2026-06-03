/**
 * Admin Customers - Customer/order database view.
 * Uses Supabase orders when available; falls back to mock data.
 */
window.renderAdmincustomers = function (container) {
  if (!container) return;

  var isZybarMy = window.ZYBAR_MY_TEST && window.MOCK_DATA && window.MOCK_DATA.customers;
  var mock_data = isZybarMy ? window.MOCK_DATA.customers : [
    {
      id: '1',
      client_name: 'Karolina Petraskiene',
      email: 'karolina.p@example.com',
      phone: '+370 612 34567',
      product_bought: 'Audi R8 – White',
      size: '40x60',
      amount_paid_usd: 233.95,
      shipping_address: 'Gedimino pr. 12, Vilnius 01103, Lithuania',
      postcode: '01103',
      order_date: '2026-03-15',
      status: 'Processing',
      receipt_url: '/receipt.html'
    },
    {
      id: '2',
      client_name: 'Jonathan Miller',
      email: 'jonathan.m@example.com',
      phone: '+60 12 345 6789',
      product_bought: 'Aston Martin DB5',
      size: '40x60',
      amount_paid_usd: 249,
      shipping_address: 'No. 27, Circuit Avenue, Mantin, Negeri Sembilan, 71700, Malaysia',
      postcode: '71700',
      order_date: '2026-03-13',
      status: 'Delivered',
      receipt_url: '/receipt.html'
    },
    {
      id: '3',
      client_name: 'Emma Thompson',
      email: 'emma.t@example.com',
      phone: '+44 7911 123456',
      product_bought: 'B Ferrari F40',
      size: '30x45',
      amount_paid_usd: 140,
      shipping_address: '42 High Street, London SW1A 1AA, United Kingdom',
      postcode: 'SW1A 1AA',
      order_date: '2026-03-12',
      status: 'In Transit',
      receipt_url: '/receipt.html'
    },
    {
      id: '4',
      client_name: 'Michael Chen',
      email: 'michael.chen@example.com',
      phone: '+1 415 555 0123',
      product_bought: 'Audi R8 GT3',
      size: '40x60',
      amount_paid_usd: 150,
      shipping_address: '123 Market St, San Francisco, CA 94103, USA',
      postcode: '94103',
      order_date: '2026-03-11',
      status: 'Delivered',
      receipt_url: '/receipt.html'
    },
    {
      id: '5',
      client_name: 'Sophie Laurent',
      email: 'sophie.l@example.com',
      phone: '+33 6 12 34 56 78',
      product_bought: 'B Maserati MC20',
      size: '30x45',
      amount_paid_usd: 140,
      shipping_address: '15 Rue de la Paix, 75002 Paris, France',
      postcode: '75002',
      order_date: '2026-03-10',
      status: 'Processing',
      receipt_url: '/receipt.html'
    }
  ];

  function formatDate(str) {
    if (!str) return '—';
    var d = new Date(str);
    if (isNaN(d.getTime())) return str;
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }

  function formatAmount(centsOrNum) {
    var n = typeof centsOrNum === 'number' ? centsOrNum : (parseInt(centsOrNum, 10) / 100);
    return (isZybarMy ? 'RM ' : '$') + (n || 0).toFixed(2);
  }

  function statusBadgeClass(s) {
    var v = (s || '').toLowerCase();
    if (v === 'delivered') return 'admin-badge-delivered';
    if (v === 'in transit') return 'admin-badge-transit';
    return 'admin-badge-processing';
  }

  container.innerHTML =
    '<h2 class="admin-page-title">Customers</h2>' +
    '<div class="admin-card">' +
    '  <div class="admin-customers-header">' +
    '    <h3 style="margin:0;">Customer Database</h3>' +
    '    <input type="search" id="customersSearch" class="admin-search-input" placeholder="Search by Name or Email" />' +
    '  </div>' +
    '  <div class="admin-table-wrap">' +
    '    <table class="admin-table admin-table-customers">' +
    '      <thead><tr>' +
    '        <th>Client Name</th>' +
    '        <th>Contact</th>' +
    '        <th>Product Bought</th>' +
    '        <th>Amount Paid</th>' +
    '        <th>Shipping Address</th>' +
    '        <th>Order Date</th>' +
    '        <th>Status</th>' +
    '        <th>Actions</th>' +
    '      </tr></thead>' +
    '      <tbody id="customersTableBody">' +
    '        <tr><td colspan="8" class="admin-loading">Loading...</td></tr>' +
    '      </tbody>' +
    '    </table>' +
    '  </div>' +
    '</div>';

  var tbody = document.getElementById('customersTableBody');
  var searchInput = document.getElementById('customersSearch');
  var allRows = [];

  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function renderRows(data) {
    allRows = data;
    filterAndRender();
  }

  function formatFullShippingAddress(r) {
    var parts = [
      r.shipping_address,
      r.city,
      r.state,
      r.postcode,
      r.country
    ].filter(function (p) {
      return p && String(p).trim();
    });
    return parts.length ? parts.join(', ') : '—';
  }

  function filterAndRender() {
    var q = (searchInput && searchInput.value || '').trim().toLowerCase();
    var filtered = q
      ? allRows.filter(function (r) {
          return (r.client_name && r.client_name.toLowerCase().indexOf(q) !== -1) ||
                 (r.email && r.email.toLowerCase().indexOf(q) !== -1) ||
                 (r.phone && r.phone.toLowerCase().indexOf(q) !== -1);
        })
      : allRows;

    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="admin-cell-empty">No customers found.</td></tr>';
      return;
    }

    var html = filtered.map(function (r) {
      var amount = typeof r.amount_paid_usd === 'number' ? (isZybarMy ? 'RM ' : '$') + r.amount_paid_usd.toFixed(2) : formatAmount(r.amount_total_cents);
      var statusCls = statusBadgeClass(r.status);
      return '<tr>' +
        '<td class="admin-cell-name">' + escapeHtml(r.client_name) + '</td>' +
        '<td>' + escapeHtml(r.email) + (r.phone ? '<br><small style="color:var(--admin-text-muted)">' + escapeHtml(r.phone) + '</small>' : '') + '</td>' +
        '<td>' + escapeHtml(r.product_bought) + '</td>' +
        '<td class="admin-cell-price">' + amount + '</td>' +
        '<td style="max-width:220px;font-size:0.875rem;">' + escapeHtml(formatFullShippingAddress(r)) + '</td>' +
        '<td>' + escapeHtml(formatDate(r.order_date)) + '</td>' +
        '<td><span class="admin-badge ' + statusCls + '">' + escapeHtml(r.status || 'Processing') + '</span></td>' +
        '<td><a href="' + escapeHtml(r.receipt_url || '/receipt.html') + '" target="_blank" rel="noopener" class="admin-btn-view">View Order</a></td>' +
        '</tr>';
    }).join('');
    tbody.innerHTML = html;
  }

  if (searchInput) {
    searchInput.addEventListener('input', filterAndRender);
    searchInput.addEventListener('search', filterAndRender);
  }

  var sb = !isZybarMy ? window.supabase : null;
  if (sb) {
    sb.from('orders')
      .select(
        'id, stripe_session_id, customer_name, customer_email, customer_phone, ' +
        'shipping_address, city, state, postcode, country, ' +
        'amount_total_cents, product_slug, size, quantity, status, created_at'
      )
      .order('created_at', { ascending: false })
      .limit(200)
      .then(function (res) {
        var data = (res && res.data) || [];
        var err = res && res.error;
        if (err || !data.length) {
          data = mock_data;
        } else {
          data = data.map(function (o) {
            var slug = (o.product_slug || '').replace(/-/g, ' ');
            var productName = slug ? slug.replace(/\b\w/g, function (c) { return c.toUpperCase(); }) : 'Product';
            return {
              id: o.id,
              client_name: o.customer_name || o.customer_email || '—',
              email: o.customer_email || '—',
              phone: o.customer_phone || '',
              product_bought: productName + (o.size ? ' [' + o.size + ']' : ''),
              amount_paid_usd: (o.amount_total_cents || 0) / 100,
              shipping_address: o.shipping_address || '',
              city: o.city || '',
              state: o.state || '',
              postcode: o.postcode || '',
              country: o.country || '',
              order_date: o.created_at,
              status: o.status === 'completed' ? 'Delivered' : (o.status || 'Processing'),
              receipt_url: '/receipt.html?id=' + (o.stripe_session_id || o.id || '')
            };
          });
        }
        renderRows(data);
      })
      .catch(function () {
        renderRows(mock_data);
      });
  } else {
    renderRows(mock_data);
  }
};
