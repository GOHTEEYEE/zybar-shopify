function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

function serviceHeaders(serviceRoleKey, extra) {
  return Object.assign(
    {
      apikey: serviceRoleKey,
      authorization: 'Bearer ' + serviceRoleKey,
      'content-type': 'application/json'
    },
    extra || {}
  );
}

function parseRange(url) {
  const end = url.searchParams.get('end') ? new Date(url.searchParams.get('end')) : new Date();
  end.setHours(23, 59, 59, 999);
  const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get('days'), 10) || 30));
  const start = url.searchParams.get('start')
    ? new Date(url.searchParams.get('start'))
    : new Date(end.getTime() - (days - 1) * 86400000);
  start.setHours(0, 0, 0, 0);
  const endExcl = new Date(end.getTime() + 86400000);
  return { start: start.toISOString(), end: endExcl.toISOString() };
}

function baseEventRow(ev) {
  if (!ev || typeof ev !== 'object') return null;
  return {
    event_type: ev.event_type,
    page_url: ev.page_url || null,
    product_id: ev.product_id || null,
    visitor_id: ev.visitor_id,
    session_id: ev.session_id || null,
    referrer: ev.referrer || null,
    user_agent: ev.user_agent || null,
    device_type: ev.device_type || null,
    country: ev.country || null,
    created_at: ev.created_at || new Date().toISOString()
  };
}

function extendedEventRow(ev) {
  const row = baseEventRow(ev);
  if (!row) return null;
  if (ev.metadata != null) row.metadata = ev.metadata;
  if (ev.cart_id != null) row.cart_id = ev.cart_id;
  if (ev.customer_id != null) row.customer_id = ev.customer_id;
  if (ev.dedup_key != null) row.dedup_key = ev.dedup_key;
  return row;
}

async function supabaseFetch(env, path, options) {
  const url = env.SUPABASE_URL + path;
  const response = await fetch(url, Object.assign({}, options || {}, {
    headers: serviceHeaders(env.SUPABASE_SERVICE_ROLE_KEY, options && options.headers)
  }));
  let data = null;
  const text = await response.text();
  if (text) {
    try { data = JSON.parse(text); } catch (_) { data = text; }
  }
  return { response, data };
}

async function insertEvent(env, ev) {
  const full = extendedEventRow(ev);
  if (!full || !full.event_type || !full.visitor_id) {
    return { ok: false, error: 'Invalid event payload' };
  }

  if (full.dedup_key) {
    const dedup = await supabaseFetch(
      env,
      '/rest/v1/events?select=id&dedup_key=eq.' + encodeURIComponent(full.dedup_key) + '&limit=1',
      { method: 'GET' }
    );
    if (dedup.response.ok && Array.isArray(dedup.data) && dedup.data.length) {
      return { ok: true, deduped: true };
    }
  }

  let result = await supabaseFetch(env, '/rest/v1/events', {
    method: 'POST',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify(full)
  });

  if (!result.response.ok && result.data && result.data.code === 'PGRST204') {
    result = await supabaseFetch(env, '/rest/v1/events', {
      method: 'POST',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify(baseEventRow(ev))
    });
  }

  if (!result.response.ok) {
    return { ok: false, error: (result.data && result.data.message) || 'Insert failed' };
  }
  return { ok: true };
}

async function syncCart(env, cart) {
  if (!cart || !cart.visitor_id) return { ok: false, error: 'Invalid cart payload' };
  const now = new Date().toISOString();
  const cartRow = {
    id: cart.id,
    visitor_id: cart.visitor_id,
    session_id: cart.session_id || null,
    customer_id: cart.customer_id || null,
    status: cart.status || 'active',
    currency: cart.currency || 'USD',
    cart_value_cents: cart.cart_value_cents || 0,
    item_count: cart.item_count || 0,
    country: cart.country || null,
    device_type: cart.device_type || null,
    referrer: cart.referrer || null,
    last_shipping_method: cart.last_shipping_method || null,
    last_payment_method: cart.last_payment_method || null,
    last_activity_at: now
  };

  let cartId = cart.id;
  const existing = await supabaseFetch(
    env,
    '/rest/v1/cart_sessions?select=id,status&visitor_id=eq.' + encodeURIComponent(cart.visitor_id) +
      '&status=in.(active,checkout_started)&limit=1',
    { method: 'GET' }
  );
  if (existing.response.ok && Array.isArray(existing.data) && existing.data[0] && existing.data[0].id) {
    if (existing.data[0].id !== cart.id) cartId = existing.data[0].id;
  }

  const upsert = await supabaseFetch(env, '/rest/v1/cart_sessions', {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(Object.assign({}, cartRow, { id: cartId }))
  });
  if (!upsert.response.ok) {
    return { ok: false, error: (upsert.data && upsert.data.message) || 'Cart sync failed' };
  }

  if (Array.isArray(cart.items)) {
    await supabaseFetch(env, '/rest/v1/cart_session_items?cart_id=eq.' + encodeURIComponent(cartId), {
      method: 'DELETE'
    });
    if (cart.items.length) {
      const rows = cart.items.map(function (item) {
        return {
          cart_id: cartId,
          product_id: item.product_id || '',
          product_name: item.product_name || null,
          variant: item.variant || null,
          size: item.size || null,
          led_color: item.led_color || null,
          power_type: item.power_type || null,
          quantity: item.quantity || 1,
          unit_price_cents: item.unit_price_cents || 0,
          currency: cart.currency || 'USD',
          updated_at: now
        };
      });
      await supabaseFetch(env, '/rest/v1/cart_session_items', {
        method: 'POST',
        headers: { prefer: 'return=minimal' },
        body: JSON.stringify(rows)
      });
    }
  }
  return { ok: true, cart_id: cartId };
}

async function rpc(env, name, params) {
  const result = await supabaseFetch(env, '/rest/v1/rpc/' + name, {
    method: 'POST',
    body: JSON.stringify(params || {})
  });
  if (!result.response.ok) return null;
  return result.data;
}

async function countRows(env, table, filters) {
  const query = '/rest/v1/' + table + '?' + filters.join('&') + '&select=id';
  const result = await supabaseFetch(env, query, {
    method: 'HEAD',
    headers: { prefer: 'count=exact' }
  });
  if (!result.response.ok) return 0;
  const range = result.response.headers.get('content-range') || '';
  const match = range.match(/\/(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

async function overviewFallback(env, range) {
  const start = encodeURIComponent(range.start);
  const end = encodeURIComponent(range.end);
  const base = [
    'created_at=gte.' + start,
    'created_at=lt.' + end
  ];
  const sessionBase = [
    'started_at=gte.' + start,
    'started_at=lt.' + end
  ];
  const orderBase = [
    'created_at=gte.' + start,
    'created_at=lt.' + end
  ];

  const [
    productViews,
    addToCart,
    checkoutStarted,
    paymentStarted,
    orders,
    visitors
  ] = await Promise.all([
    countRows(env, 'events', base.concat(['event_type=eq.product_view'])),
    countRows(env, 'events', base.concat(['event_type=eq.add_to_cart'])),
    countRows(env, 'events', base.concat(['event_type=in.(begin_checkout,checkout_started)'])),
    countRows(env, 'events', base.concat(['event_type=eq.payment_started'])),
    countRows(env, 'orders', orderBase),
    countRows(env, 'sessions', sessionBase)
  ]);

  let revenueCents = 0;
  const rev = await supabaseFetch(
    env,
    '/rest/v1/orders?' + orderBase.join('&') + '&select=amount_total_cents',
    { method: 'GET' }
  );
  if (rev.response.ok && Array.isArray(rev.data)) {
    revenueCents = rev.data.reduce(function (sum, row) {
      return sum + (Number(row.amount_total_cents) || 0);
    }, 0);
  }

  return {
    visitors: visitors,
    product_views: productViews,
    add_to_cart: addToCart,
    checkout_started: checkoutStarted,
    payment_started: paymentStarted,
    orders: orders,
    revenue_cents: revenueCents,
    unique_cart_sessions: 0,
    abandoned_carts: 0,
    avg_order_value_cents: orders > 0 ? Math.round(revenueCents / orders) : 0
  };
}

async function funnelFallback(env, range) {
  const start = encodeURIComponent(range.start);
  const end = encodeURIComponent(range.end);
  const counts = await Promise.all([
    countRows(env, 'sessions', ['started_at=gte.' + start, 'started_at=lt.' + end]),
    countRows(env, 'events', ['created_at=gte.' + start, 'created_at=lt.' + end, 'event_type=eq.product_view']),
    countRows(env, 'events', ['created_at=gte.' + start, 'created_at=lt.' + end, 'event_type=eq.add_to_cart']),
    countRows(env, 'events', ['created_at=gte.' + start, 'created_at=lt.' + end, 'event_type=in.(begin_checkout,checkout_started)']),
    countRows(env, 'events', ['created_at=gte.' + start, 'created_at=lt.' + end, 'event_type=eq.payment_started']),
    countRows(env, 'orders', ['created_at=gte.' + start, 'created_at=lt.' + end])
  ]);
  const labels = ['website_visits', 'product_views', 'add_to_cart', 'checkout_started', 'payment_started', 'completed_orders'];
  return labels.map(function (step, i) {
    return { step: step, count: counts[i], order: i + 1 };
  });
}

function bucketDate(iso, granularity) {
  const d = new Date(iso);
  if (granularity === 'month') {
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-01';
  }
  if (granularity === 'week') {
    const day = d.getUTCDay();
    const diff = (day + 6) % 7;
    d.setUTCDate(d.getUTCDate() - diff);
    return d.toISOString().slice(0, 10);
  }
  return d.toISOString().slice(0, 10);
}

function seriesFromRows(rows, dateField, granularity) {
  const map = {};
  (rows || []).forEach(function (row) {
    const key = bucketDate(row[dateField], granularity);
    map[key] = (map[key] || 0) + 1;
  });
  return Object.keys(map).sort().map(function (date) {
    return { date: date, value: map[date] };
  });
}

async function fetchAllRows(env, path) {
  const result = await supabaseFetch(env, path, { method: 'GET' });
  if (!result.response.ok || !Array.isArray(result.data)) return [];
  return result.data;
}

async function trendsFallback(env, range, granularity) {
  const start = encodeURIComponent(range.start);
  const end = encodeURIComponent(range.end);
  const [events, sessions, orders] = await Promise.all([
    fetchAllRows(env, '/rest/v1/events?created_at=gte.' + start + '&created_at=lt.' + end + '&select=event_type,created_at&limit=10000'),
    fetchAllRows(env, '/rest/v1/sessions?started_at=gte.' + start + '&started_at=lt.' + end + '&select=visitor_id,started_at&limit=10000'),
    fetchAllRows(env, '/rest/v1/orders?created_at=gte.' + start + '&created_at=lt.' + end + '&select=created_at,amount_total_cents&limit=10000')
  ]);

  const addToCart = {};
  const checkout = {};
  events.forEach(function (ev) {
    const d = bucketDate(ev.created_at, granularity);
    if (ev.event_type === 'add_to_cart') addToCart[d] = (addToCart[d] || 0) + 1;
    if (ev.event_type === 'begin_checkout' || ev.event_type === 'checkout_started') {
      checkout[d] = (checkout[d] || 0) + 1;
    }
  });

  const visitors = {};
  sessions.forEach(function (s) {
    const d = bucketDate(s.started_at, granularity);
    if (!visitors[d]) visitors[d] = {};
    if (s.visitor_id) visitors[d][s.visitor_id] = true;
  });

  const revenue = {};
  const orderCounts = {};
  orders.forEach(function (o) {
    const d = bucketDate(o.created_at, granularity);
    revenue[d] = (revenue[d] || 0) + (Number(o.amount_total_cents) || 0);
    orderCounts[d] = (orderCounts[d] || 0) + 1;
  });

  function toSeries(map, isObjectSet) {
    return Object.keys(map).sort().map(function (date) {
      return {
        date: date,
        value: isObjectSet ? Object.keys(map[date]).length : map[date]
      };
    });
  }

  return {
    revenue: toSeries(revenue, false),
    orders: toSeries(orderCounts, false),
    add_to_cart: toSeries(addToCart, false),
    checkout: toSeries(checkout, false),
    visitors: toSeries(visitors, true)
  };
}

async function productsFallback(env, range) {
  const start = encodeURIComponent(range.start);
  const end = encodeURIComponent(range.end);
  const events = await fetchAllRows(
    env,
    '/rest/v1/events?created_at=gte.' + start + '&created_at=lt.' + end +
      '&event_type=in.(product_view,add_to_cart)&select=event_type,product_id&limit=10000'
  );
  const views = {};
  const adds = {};
  events.forEach(function (ev) {
    const pid = ev.product_id || 'unknown';
    if (ev.event_type === 'product_view') views[pid] = (views[pid] || 0) + 1;
    if (ev.event_type === 'add_to_cart') adds[pid] = (adds[pid] || 0) + 1;
  });
  function top(map, key) {
    return Object.keys(map).map(function (id) {
      var row = { product_id: id };
      row[key] = map[id];
      return row;
    }).sort(function (a, b) { return b[key] - a[key]; }).slice(0, 10);
  }
  return {
    most_viewed: top(views, 'views'),
    most_added: top(adds, 'adds'),
    highest_revenue: []
  };
}

async function distributionsFallback(env, range) {
  const start = encodeURIComponent(range.start);
  const end = encodeURIComponent(range.end);
  const sessions = await fetchAllRows(
    env,
    '/rest/v1/sessions?started_at=gte.' + start + '&started_at=lt.' + end +
      '&select=country,device_type&limit=10000'
  );
  const countries = {};
  const devices = {};
  sessions.forEach(function (s) {
    const c = s.country || 'Unknown';
    const d = s.device_type || 'unknown';
    countries[c] = (countries[c] || 0) + 1;
    devices[d] = (devices[d] || 0) + 1;
  });
  function toList(map) {
    return Object.keys(map).map(function (label) {
      return { label: label, value: map[label] };
    }).sort(function (a, b) { return b.value - a.value; }).slice(0, 20);
  }
  return { countries: toList(countries), devices: toList(devices) };
}

export {
  json,
  parseRange,
  insertEvent,
  syncCart,
  rpc,
  overviewFallback,
  funnelFallback,
  trendsFallback,
  productsFallback,
  distributionsFallback,
  supabaseFetch
};
