function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

function buildHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    authorization: 'Bearer ' + serviceRoleKey,
    'content-type': 'application/json',
    prefer: 'return=representation'
  };
}

function escapeIlike(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}

function productLabel(row) {
  if (Array.isArray(row.line_items) && row.line_items.length) {
    return row.line_items
      .map(function (li) {
        var name = li.name || li.productSlug || li.slug || 'Item';
        return name + (li.quantity ? ' ×' + li.quantity : '');
      })
      .join(', ');
  }
  var slug = String(row.product_slug || '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, function (c) {
      return c.toUpperCase();
    });
  if (!slug) return 'ZYBAR LED Wall Art';
  return slug + (row.size ? ' [' + row.size + ']' : '');
}

function itemList(row) {
  if (Array.isArray(row.line_items) && row.line_items.length) {
    return row.line_items.map(function (li) {
      var name = li.name || li.productSlug || li.slug || 'Item';
      var size = li.size ? ' · ' + li.size : '';
      var qty = li.quantity ? ' ×' + li.quantity : '';
      return name + size + qty;
    });
  }
  return [productLabel(row)];
}

function incorrect() {
  return json({ ok: false, error: 'Incorrect email or tracking number.' }, 404);
}

export async function onRequestPost(context) {
  var env = context.env || {};
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Order tracking is temporarily unavailable.' }, 503);
  }

  var body;
  try {
    body = await context.request.json();
  } catch (_) {
    return json({ error: 'Invalid request.' }, 400);
  }

  var email = String(body.email || '')
    .trim()
    .toLowerCase();
  var trackingNumber = String(body.trackingNumber || body.tracking_number || '').trim();
  var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!email || !trackingNumber || !emailRegex.test(email)) {
    return json({ error: 'Please provide a valid email and tracking number.' }, 400);
  }

  var headers = buildHeaders(env.SUPABASE_SERVICE_ROLE_KEY);
  var select =
    'id,customer_email,customer_name,product_slug,size,quantity,line_items,' +
    'status,fulfillment_status,tracking_number,shipping_method,created_at';
  var url =
    env.SUPABASE_URL +
    '/rest/v1/orders?select=' +
    encodeURIComponent(select) +
    '&tracking_number=ilike.' +
    encodeURIComponent(escapeIlike(trackingNumber)) +
    '&limit=5';

  try {
    var response = await fetch(url, { method: 'GET', headers: headers });
    if (!response.ok) return incorrect();
    var rows = await response.json().catch(function () {
      return [];
    });
    if (!Array.isArray(rows) || !rows.length) return incorrect();

    var match = null;
    for (var i = 0; i < rows.length; i++) {
      var rowEmail = String(rows[i].customer_email || '')
        .trim()
        .toLowerCase();
      var rowTrack = String(rows[i].tracking_number || '').trim();
      if (rowEmail === email && rowTrack.toLowerCase() === trackingNumber.toLowerCase()) {
        match = rows[i];
        break;
      }
    }
    if (!match) return incorrect();

    return json({
      ok: true,
      order: {
        fulfillmentStatus: match.fulfillment_status || 'unfulfilled',
        trackingNumber: match.tracking_number,
        shippingMethod: match.shipping_method || null,
        paymentStatus: match.status || null,
        createdAt: match.created_at || null,
        productLabel: productLabel(match),
        items: itemList(match)
      }
    });
  } catch (_) {
    return json({ error: 'Unable to check order right now.' }, 500);
  }
}
