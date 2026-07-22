/**
 * Admin Orders — list + order details from Supabase (real data only).
 */
window.renderAdminorders = function (container) {
  if (!container) return;

  var U = window.AdminUtils || {};
  var hash = (window.location.hash || '#orders').slice(1);
  var parts = hash.split('/');
  var detailId = parts[1] || null;
  var allOrders = [];
  var searchQ = '';

  function escapeHtml(v) {
    return U.escapeHtml ? U.escapeHtml(v) : String(v == null ? '' : v);
  }

  function formatUsdCents(cents) {
    return U.formatUsdCents ? U.formatUsdCents(cents) : 'US$' + ((Number(cents) || 0) / 100).toFixed(2);
  }

  function formatDateTime(iso) {
    return U.formatDateTime ? U.formatDateTime(iso) : String(iso || '—');
  }

  function orderNumber(o) {
    if (!o) return '—';
    if (o.stripe_session_id) return String(o.stripe_session_id).slice(0, 18);
    return String(o.id || '').slice(0, 8).toUpperCase();
  }

  function productLabel(o) {
    if (Array.isArray(o.line_items) && o.line_items.length) {
      return o.line_items
        .map(function (li) {
          return (li.name || li.productSlug || li.slug || 'Item') + (li.quantity ? ' ×' + li.quantity : '');
        })
        .join(', ');
    }
    var name = (o.product_slug || '')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, function (c) {
        return c.toUpperCase();
      });
    if (!name) return '—';
    return name + (o.size ? ' [' + o.size + ']' : '') + (o.quantity > 1 ? ' ×' + o.quantity : '');
  }

  function paymentStatus(o) {
    var s = String(o.status || '').toLowerCase();
    if (o.refund_status === 'full') return 'Refunded';
    if (o.refund_status === 'partial') return 'Partial refund';
    if (s === 'paid' || s === 'completed' || s === 'no_payment_required') return 'Paid';
    if (s === 'unpaid' || s === 'pending') return 'Pending';
    if (s === 'canceled' || s === 'cancelled') return 'Cancelled';
    return o.status || '—';
  }

  function badgeClass(label) {
    var v = String(label || '').toLowerCase();
    if (v.indexOf('paid') !== -1 || v.indexOf('deliver') !== -1) return 'admin-badge-delivered';
    if (v.indexOf('ship') !== -1 || v.indexOf('transit') !== -1 || v.indexOf('process') !== -1)
      return 'admin-badge-transit';
    if (v.indexOf('cancel') !== -1 || v.indexOf('refund') !== -1) return 'admin-badge-processing';
    return 'admin-badge-processing';
  }

  function formatAddress(parts) {
    return parts
      .filter(function (p) {
        return p && String(p).trim();
      })
      .join(', ') || '—';
  }

  function selectCols() {
    return (
      'id,stripe_session_id,stripe_payment_intent,customer_name,customer_email,customer_phone,' +
      'shipping_address,city,state,postcode,country,' +
      'billing_address,billing_city,billing_state,billing_postcode,billing_country,' +
      'amount_total_cents,currency,product_slug,size,quantity,line_items,' +
      'status,shipping_method,payment_method,fulfillment_status,tracking_number,' +
      'refund_status,internal_notes,created_at,test_mode'
    );
  }

  function loadOrders() {
    var sb = window.supabase;
    if (!sb) return Promise.resolve([]);
    return sb
      .from('orders')
      .select(selectCols())
      .order('created_at', { ascending: false })
      .limit(500)
      .then(function (res) {
        if (res.error) {
          console.warn('Orders load:', res.error.message);
          return [];
        }
        return res.data || [];
      })
      .catch(function () {
        return [];
      });
  }

  function loadOrder(id) {
    var sb = window.supabase;
    if (!sb) return Promise.resolve(null);
    return sb
      .from('orders')
      .select(selectCols())
      .eq('id', id)
      .maybeSingle()
      .then(function (res) {
        return res.data || null;
      })
      .catch(function () {
        return null;
      });
  }

  function renderList() {
    container.innerHTML =
      '<div class="admin-page-header">' +
      '<h2 class="admin-page-title">Orders</h2>' +
      '<div class="admin-page-actions">' +
      '<input type="search" id="ordersSearch" class="admin-search-input" placeholder="Search orders, customers, email…" />' +
      '<button type="button" class="admin-btn-secondary" id="ordersExportCsv">Export CSV</button>' +
      '</div></div>' +
      '<div class="admin-card">' +
      '<div class="admin-table-wrap">' +
      '<table class="admin-table admin-table--compact">' +
      '<thead><tr>' +
      '<th>Order Number</th><th>Customer Name</th><th>Email</th><th>Country</th><th>Items</th><th>Total</th>' +
      '<th>Shipping Method</th><th>Payment Method</th><th>Payment Status</th><th>Fulfillment Status</th>' +
      '<th>Tracking Number</th><th>Created Time</th><th>Actions</th>' +
      '</tr></thead>' +
      '<tbody id="ordersTableBody"><tr><td colspan="13" class="admin-loading">Loading…</td></tr></tbody>' +
      '</table></div></div>';

    var search = document.getElementById('ordersSearch');
    if (search) {
      search.value = searchQ;
      search.addEventListener('input', function () {
        searchQ = search.value;
        paintRows();
      });
    }
    var exportBtn = document.getElementById('ordersExportCsv');
    if (exportBtn) {
      exportBtn.addEventListener('click', function () {
        if (!U.downloadCsv) return;
        U.downloadCsv(
          'zybar-orders.csv',
          filtered().map(function (o) {
            return {
              Order: orderNumber(o),
              Customer: o.customer_name || '',
              Email: o.customer_email || '',
              Country: o.country || '',
              Items: productLabel(o),
              Total: ((o.amount_total_cents || 0) / 100).toFixed(2),
              Shipping: o.shipping_method || '',
              PaymentMethod: o.payment_method || '',
              PaymentStatus: paymentStatus(o),
              Fulfillment: o.fulfillment_status || 'unfulfilled',
              Tracking: o.tracking_number || '',
              Created: o.created_at || ''
            };
          })
        );
      });
    }

    loadOrders().then(function (rows) {
      allOrders = rows;
      paintRows();
    });
  }

  function filtered() {
    var q = (searchQ || '').trim().toLowerCase();
    if (!q) return allOrders;
    return allOrders.filter(function (o) {
      return (
        String(o.stripe_session_id || '').toLowerCase().indexOf(q) !== -1 ||
        String(o.id || '').toLowerCase().indexOf(q) !== -1 ||
        String(o.customer_name || '').toLowerCase().indexOf(q) !== -1 ||
        String(o.customer_email || '').toLowerCase().indexOf(q) !== -1 ||
        String(o.tracking_number || '').toLowerCase().indexOf(q) !== -1 ||
        String(o.country || '').toLowerCase().indexOf(q) !== -1
      );
    });
  }

  function paintRows() {
    var tbody = document.getElementById('ordersTableBody');
    if (!tbody) return;
    var rows = filtered();
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="13" class="admin-cell-empty">No orders found.</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .map(function (o) {
        var pay = paymentStatus(o);
        var fulfill = o.fulfillment_status || 'unfulfilled';
        return (
          '<tr class="admin-row-clickable" data-order-id="' +
          escapeHtml(o.id) +
          '">' +
          '<td><code>' +
          escapeHtml(orderNumber(o)) +
          '</code></td>' +
          '<td>' +
          escapeHtml(o.customer_name || '—') +
          '</td>' +
          '<td>' +
          escapeHtml(o.customer_email || '—') +
          '</td>' +
          '<td>' +
          escapeHtml(o.country || '—') +
          '</td>' +
          '<td style="max-width:180px">' +
          escapeHtml(productLabel(o)) +
          '</td>' +
          '<td class="admin-cell-price">' +
          formatUsdCents(o.amount_total_cents) +
          '</td>' +
          '<td>' +
          escapeHtml(o.shipping_method || '—') +
          '</td>' +
          '<td>' +
          escapeHtml(o.payment_method || 'Card') +
          '</td>' +
          '<td><span class="admin-badge ' +
          badgeClass(pay) +
          '">' +
          escapeHtml(pay) +
          '</span></td>' +
          '<td><span class="admin-badge ' +
          badgeClass(fulfill) +
          '">' +
          escapeHtml(fulfill) +
          '</span></td>' +
          '<td>' +
          escapeHtml(o.tracking_number || '—') +
          '</td>' +
          '<td>' +
          escapeHtml(formatDateTime(o.created_at)) +
          '</td>' +
          '<td><a class="admin-btn-view" href="#orders/' +
          escapeHtml(o.id) +
          '">View</a></td>' +
          '</tr>'
        );
      })
      .join('');

    tbody.querySelectorAll('[data-order-id]').forEach(function (tr) {
      tr.addEventListener('click', function (e) {
        if (e.target && e.target.closest && e.target.closest('a')) return;
        window.location.hash = 'orders/' + tr.getAttribute('data-order-id');
      });
    });
  }

  function renderDetail(order) {
    if (!order) {
      container.innerHTML =
        '<p class="admin-error">Order not found.</p><p><a href="#orders">← Back to orders</a></p>';
      return;
    }

    var shipping = formatAddress([
      order.shipping_address,
      order.city,
      order.state,
      order.postcode,
      order.country
    ]);
    var billing = formatAddress([
      order.billing_address || order.shipping_address,
      order.billing_city || order.city,
      order.billing_state || order.state,
      order.billing_postcode || order.postcode,
      order.billing_country || order.country
    ]);

    var itemsHtml = '';
    if (Array.isArray(order.line_items) && order.line_items.length) {
      itemsHtml = order.line_items
        .map(function (li) {
          var slug = li.productSlug || li.slug || '';
          var name = li.name || productLabel({ product_slug: slug, size: li.size, quantity: li.quantity });
          return (
            '<tr><td class="admin-cell-thumb">' +
            (slug
              ? '<img src="/Image/' +
                escapeHtml(slug) +
                '-1.webp" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'" />'
              : '') +
            '</td><td>' +
            escapeHtml(name) +
            '</td><td>' +
            escapeHtml(li.size || '—') +
            '</td><td>' +
            escapeHtml(li.quantity || 1) +
            '</td></tr>'
          );
        })
        .join('');
    } else {
      itemsHtml =
        '<tr><td class="admin-cell-thumb">' +
        (order.product_slug
          ? '<img src="/Image/' +
            escapeHtml(order.product_slug) +
            '-1.webp" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'" />'
          : '') +
        '</td><td>' +
        escapeHtml(productLabel(order)) +
        '</td><td>' +
        escapeHtml(order.size || '—') +
        '</td><td>' +
        escapeHtml(order.quantity || 1) +
        '</td></tr>';
    }

    container.innerHTML =
      '<div class="admin-page-header">' +
      '<div><a href="#orders" class="admin-back-link">← Orders</a>' +
      '<h2 class="admin-page-title">Order ' +
      escapeHtml(orderNumber(order)) +
      '</h2></div>' +
      '<div class="admin-page-actions">' +
      '<a class="admin-btn-secondary" href="/receipt.html?id=' +
      encodeURIComponent(order.stripe_session_id || '') +
      '" target="_blank" rel="noopener">Receipt</a>' +
      '</div></div>' +
      '<div class="admin-detail-grid">' +
      section(
        'Customer Information',
        '<dl class="admin-dl">' +
          row('Name', order.customer_name) +
          row('Email', order.customer_email) +
          row('Phone', order.customer_phone) +
          '</dl>'
      ) +
      section('Shipping Address', '<p>' + escapeHtml(shipping) + '</p>') +
      section('Billing Address', '<p>' + escapeHtml(billing) + '</p>') +
      section(
        'Products Purchased',
        '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th></th><th>Product</th><th>Size</th><th>Qty</th></tr></thead><tbody>' +
          itemsHtml +
          '</tbody></table></div>'
      ) +
      section(
        'Shipping & Tracking',
        '<dl class="admin-dl">' +
          row('Shipping Method', order.shipping_method) +
          '</dl>' +
          '<div class="admin-form-group"><label for="orderTracking">Tracking Number</label>' +
          '<input id="orderTracking" type="text" value="' +
          escapeHtml(order.tracking_number || '') +
          '" /></div>' +
          '<div class="admin-form-group"><label for="orderFulfillment">Fulfillment Status</label>' +
          '<select id="orderFulfillment">' +
          ['unfulfilled', 'processing', 'shipped', 'delivered', 'cancelled']
            .map(function (s) {
              return (
                '<option value="' +
                s +
                '"' +
                ((order.fulfillment_status || 'unfulfilled') === s ? ' selected' : '') +
                '>' +
                s +
                '</option>'
              );
            })
            .join('') +
          '</select></div>'
      ) +
      section(
        'Payment Information',
        '<dl class="admin-dl">' +
          row('Total', formatUsdCents(order.amount_total_cents)) +
          row('Currency', (order.currency || 'usd').toUpperCase()) +
          row('Payment Status', paymentStatus(order)) +
          row('Payment Method', order.payment_method || 'Card') +
          row('Refund Status', order.refund_status || 'none') +
          row('Stripe Session', order.stripe_session_id) +
          row('Payment Intent', order.stripe_payment_intent) +
          '</dl>'
      ) +
      section(
        'Order Timeline',
        '<ul class="admin-timeline">' +
          '<li><strong>Created</strong><span>' +
          escapeHtml(formatDateTime(order.created_at)) +
          '</span></li>' +
          '<li><strong>Payment</strong><span>' +
          escapeHtml(paymentStatus(order)) +
          '</span></li>' +
          '<li><strong>Fulfillment</strong><span>' +
          escapeHtml(order.fulfillment_status || 'unfulfilled') +
          '</span></li>' +
          '</ul>'
      ) +
      section(
        'Internal Notes',
        '<textarea id="orderNotes" rows="4" placeholder="Private notes for your team…">' +
          escapeHtml(order.internal_notes || '') +
          '</textarea>' +
          '<button type="button" class="admin-btn-primary" id="orderSaveBtn" style="margin-top:0.75rem">Save changes</button>' +
          '<p id="orderSaveMsg" class="admin-muted" style="margin-top:0.5rem"></p>'
      ) +
      '<div id="customOrderSection" class="admin-card admin-detail-card" hidden><h3>Custom Order</h3><div id="customOrderBody"></div></div>' +
      '</div>';

    loadCustomOrderSection(order);

    var saveBtn = document.getElementById('orderSaveBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        var sb = window.supabase;
        var msg = document.getElementById('orderSaveMsg');
        if (!sb) {
          if (msg) msg.textContent = 'Supabase not configured.';
          return;
        }
        saveBtn.disabled = true;
        sb.from('orders')
          .update({
            tracking_number: (document.getElementById('orderTracking') || {}).value || null,
            fulfillment_status: (document.getElementById('orderFulfillment') || {}).value || 'unfulfilled',
            internal_notes: (document.getElementById('orderNotes') || {}).value || null
          })
          .eq('id', order.id)
          .then(function (res) {
            saveBtn.disabled = false;
            if (res.error) {
              if (msg) msg.textContent = res.error.message || 'Save failed.';
              return;
            }
            if (msg) msg.textContent = 'Saved.';
          })
          .catch(function (err) {
            saveBtn.disabled = false;
            if (msg) msg.textContent = (err && err.message) || 'Save failed.';
          });
      });
    }
  }

  function loadCustomOrderSection(order) {
    var wrap = document.getElementById('customOrderSection');
    var body = document.getElementById('customOrderBody');
    if (!wrap || !body || !order || !order.stripe_session_id) return;
    fetch(
      '/api/admin/custom-orders?stripe_session_id=' + encodeURIComponent(order.stripe_session_id)
    )
      .then(function (r) {
        return r.ok ? r.json() : { orders: [] };
      })
      .then(function (data) {
        var rows = (data && data.orders) || [];
        if (!rows.length) return;
        wrap.hidden = false;
        body.innerHTML = rows
          .map(function (co) {
            var photos = Array.isArray(co.uploaded_photos) ? co.uploaded_photos : [];
            var photoHtml = photos
              .map(function (p) {
                var src = p && (p.url || p.preview);
                if (!src) return '';
                return (
                  '<a href="' +
                  escapeHtml(src) +
                  '" target="_blank" rel="noopener"><img src="' +
                  escapeHtml(src) +
                  '" alt="" class="admin-custom-photo" loading="lazy" /></a>'
                );
              })
              .join('');
            var statuses = [
              'pending_review',
              'designing',
              'waiting_for_approval',
              'approved',
              'producing',
              'quality_check',
              'shipped'
            ];
            var options = statuses
              .map(function (s) {
                return (
                  '<option value="' +
                  s +
                  '"' +
                  (co.design_status === s ? ' selected' : '') +
                  '>' +
                  s.replace(/_/g, ' ') +
                  '</option>'
                );
              })
              .join('');
            return (
              '<div class="admin-custom-order" data-custom-order-id="' +
              escapeHtml(co.id) +
              '">' +
              '<dl class="admin-dl">' +
              row('Vehicle', [co.vehicle_brand, co.vehicle_model, co.vehicle_year].filter(Boolean).join(' ')) +
              row('Custom Fee', '$' + Number(co.custom_design_fee_usd || 0).toFixed(2)) +
              row('Size', co.size) +
              row('Power', co.power_type) +
              '</dl>' +
              (co.special_requests
                ? '<p><strong>Customer Notes</strong><br>' + escapeHtml(co.special_requests) + '</p>'
                : '') +
              (photoHtml ? '<div class="admin-custom-photos">' + photoHtml + '</div>' : '') +
              '<div class="admin-form-group"><label>Design Status</label>' +
              '<select class="admin-custom-status">' +
              options +
              '</select></div>' +
              '<button type="button" class="admin-btn-secondary admin-custom-save">Update Custom Order</button>' +
              '<p class="admin-muted admin-custom-msg"></p>' +
              '</div>'
            );
          })
          .join('');
        body.querySelectorAll('.admin-custom-save').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var block = btn.closest('.admin-custom-order');
            if (!block) return;
            var id = block.getAttribute('data-custom-order-id');
            var statusEl = block.querySelector('.admin-custom-status');
            var msgEl = block.querySelector('.admin-custom-msg');
            btn.disabled = true;
            fetch('/api/admin/custom-orders/' + encodeURIComponent(id), {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ designStatus: statusEl ? statusEl.value : '' })
            })
              .then(function (r) {
                return r.json();
              })
              .then(function (res) {
                btn.disabled = false;
                if (msgEl) msgEl.textContent = res.ok ? 'Custom order updated.' : res.error || 'Update failed.';
              })
              .catch(function (err) {
                btn.disabled = false;
                if (msgEl) msgEl.textContent = (err && err.message) || 'Update failed.';
              });
          });
        });
      })
      .catch(function () {});
  }

  function section(title, body) {
    return '<div class="admin-card admin-detail-card"><h3>' + title + '</h3>' + body + '</div>';
  }

  function row(label, value) {
    return (
      '<div><dt>' +
      escapeHtml(label) +
      '</dt><dd>' +
      escapeHtml(value == null || value === '' ? '—' : value) +
      '</dd></div>'
    );
  }

  if (detailId) {
    container.innerHTML = '<div class="admin-loading">Loading order…</div>';
    loadOrder(detailId).then(renderDetail);
    return;
  }

  renderList();
};
