/**
 * Analytics aggregation fallbacks when Supabase RPCs are not deployed yet.
 * Used by server.js on Vercel (/api/analytics/*).
 */

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

function isMissingRpc(error) {
  if (!error) return false;
  const code = String(error.code || '');
  const message = String(error.message || '');
  return code === 'PGRST202' || message.indexOf('Could not find the function') !== -1;
}

async function countRows(supabase, table, filters) {
  let query = supabase.from(table).select('id', { count: 'exact', head: true });
  Object.keys(filters || {}).forEach(function (key) {
    const value = filters[key];
    if (key === 'created_at_gte') query = query.gte('created_at', value);
    else if (key === 'created_at_lt') query = query.lt('created_at', value);
    else if (key === 'started_at_gte') query = query.gte('started_at', value);
    else if (key === 'started_at_lt') query = query.lt('started_at', value);
    else if (key === 'event_type') query = query.eq('event_type', value);
    else if (key === 'event_type_in') query = query.in('event_type', value);
  });
  const { count, error } = await query;
  if (error) return 0;
  return count || 0;
}

async function overviewFallback(supabase, range) {
  const filters = {
    created_at_gte: range.start,
    created_at_lt: range.end
  };
  const sessionFilters = {
    started_at_gte: range.start,
    started_at_lt: range.end
  };
  const orderFilters = {
    created_at_gte: range.start,
    created_at_lt: range.end
  };

  const [
    productViews,
    addToCart,
    checkoutStarted,
    paymentStarted,
    orders,
    visitors
  ] = await Promise.all([
    countRows(supabase, 'events', Object.assign({}, filters, { event_type: 'product_view' })),
    countRows(supabase, 'events', Object.assign({}, filters, { event_type: 'add_to_cart' })),
    countRows(supabase, 'events', Object.assign({}, filters, { event_type_in: ['begin_checkout', 'checkout_started'] })),
    countRows(supabase, 'events', Object.assign({}, filters, { event_type: 'payment_started' })),
    countRows(supabase, 'orders', orderFilters),
    countRows(supabase, 'sessions', sessionFilters)
  ]);

  let revenueCents = 0;
  const { data: orderRows } = await supabase
    .from('orders')
    .select('amount_total_cents')
    .gte('created_at', range.start)
    .lt('created_at', range.end);
  if (Array.isArray(orderRows)) {
    revenueCents = orderRows.reduce(function (sum, row) {
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

async function funnelFallback(supabase, range) {
  const filters = { created_at_gte: range.start, created_at_lt: range.end };
  const sessionFilters = { started_at_gte: range.start, started_at_lt: range.end };
  const counts = await Promise.all([
    countRows(supabase, 'sessions', sessionFilters),
    countRows(supabase, 'events', Object.assign({}, filters, { event_type: 'product_view' })),
    countRows(supabase, 'events', Object.assign({}, filters, { event_type: 'add_to_cart' })),
    countRows(supabase, 'events', Object.assign({}, filters, { event_type_in: ['begin_checkout', 'checkout_started'] })),
    countRows(supabase, 'events', Object.assign({}, filters, { event_type: 'payment_started' })),
    countRows(supabase, 'orders', { created_at_gte: range.start, created_at_lt: range.end })
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

function seriesFromMap(map, isVisitorSet) {
  return Object.keys(map).sort().map(function (date) {
    return {
      date: date,
      value: isVisitorSet ? Object.keys(map[date]).length : map[date]
    };
  });
}

async function trendsFallback(supabase, range, granularity) {
  const [{ data: events }, { data: sessions }, { data: orders }] = await Promise.all([
    supabase.from('events').select('event_type,created_at').gte('created_at', range.start).lt('created_at', range.end).limit(10000),
    supabase.from('sessions').select('visitor_id,started_at').gte('started_at', range.start).lt('started_at', range.end).limit(10000),
    supabase.from('orders').select('created_at,amount_total_cents').gte('created_at', range.start).lt('created_at', range.end).limit(10000)
  ]);

  const addToCart = {};
  const checkout = {};
  (events || []).forEach(function (ev) {
    const d = bucketDate(ev.created_at, granularity);
    if (ev.event_type === 'add_to_cart') addToCart[d] = (addToCart[d] || 0) + 1;
    if (ev.event_type === 'begin_checkout' || ev.event_type === 'checkout_started') {
      checkout[d] = (checkout[d] || 0) + 1;
    }
  });

  const visitors = {};
  (sessions || []).forEach(function (s) {
    const d = bucketDate(s.started_at, granularity);
    if (!visitors[d]) visitors[d] = {};
    if (s.visitor_id) visitors[d][s.visitor_id] = true;
  });

  const revenue = {};
  const orderCounts = {};
  (orders || []).forEach(function (o) {
    const d = bucketDate(o.created_at, granularity);
    revenue[d] = (revenue[d] || 0) + (Number(o.amount_total_cents) || 0);
    orderCounts[d] = (orderCounts[d] || 0) + 1;
  });

  return {
    revenue: seriesFromMap(revenue, false),
    orders: seriesFromMap(orderCounts, false),
    add_to_cart: seriesFromMap(addToCart, false),
    checkout: seriesFromMap(checkout, false),
    visitors: seriesFromMap(visitors, true)
  };
}

async function productsFallback(supabase, range) {
  const { data: events } = await supabase
    .from('events')
    .select('event_type,product_id')
    .gte('created_at', range.start)
    .lt('created_at', range.end)
    .in('event_type', ['product_view', 'add_to_cart'])
    .limit(10000);

  const views = {};
  const adds = {};
  (events || []).forEach(function (ev) {
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

async function distributionsFallback(supabase, range) {
  const { data: sessions } = await supabase
    .from('sessions')
    .select('country,device_type')
    .gte('started_at', range.start)
    .lt('started_at', range.end)
    .limit(10000);

  const countries = {};
  const devices = {};
  (sessions || []).forEach(function (s) {
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

async function insertEventSafe(supabase, ev) {
  if (!ev || !ev.event_type || !ev.visitor_id) {
    return { ok: false, error: 'Invalid event payload' };
  }

  if (ev.dedup_key) {
    try {
      const existing = await supabase.from('events').select('id').eq('dedup_key', ev.dedup_key).maybeSingle();
      if (existing.data) return { ok: true, deduped: true };
    } catch (_) {}
  }

  let { error } = await supabase.from('events').insert(ev);
  if (error && (error.code === 'PGRST204' || String(error.message || '').indexOf('column') !== -1)) {
    const retry = await supabase.from('events').insert(baseEventRow(ev));
    error = retry.error;
  }
  if (error && error.code !== '23505') {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

module.exports = {
  baseEventRow,
  isMissingRpc,
  overviewFallback,
  funnelFallback,
  trendsFallback,
  productsFallback,
  distributionsFallback,
  insertEventSafe
};
