/**
 * Shopify-style analytics aggregation + safe event inserts.
 * Used by server.js on Vercel (/api/analytics/*).
 */

const BrandAnalytics = require('./brand-analytics.js');

function baseEventRow(ev) {
  if (!ev || typeof ev !== 'object') return null;
  return {
    event_type: ev.event_type,
    page_url: ev.page_url || null,
    product_id: ev.product_id || null,
    collection_id: ev.collection_id || null,
    visitor_id: ev.visitor_id,
    session_id: ev.session_id || null,
    referrer: ev.referrer || null,
    user_agent: ev.user_agent || null,
    device_type: ev.device_type || null,
    browser: ev.browser || null,
    traffic_source: ev.traffic_source || null,
    utm_source: ev.utm_source || null,
    utm_medium: ev.utm_medium || null,
    utm_campaign: ev.utm_campaign || null,
    utm_term: ev.utm_term || null,
    utm_content: ev.utm_content || null,
    country: ev.country || null,
    quantity: Number(ev.quantity) > 0 ? Math.round(Number(ev.quantity)) : 1,
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

function isMissingRpc(error) {
  if (!error) return false;
  const code = String(error.code || '');
  const message = String(error.message || '');
  return code === 'PGRST202' || message.indexOf('Could not find the function') !== -1;
}

function eventQuantity(ev) {
  const q = Number(ev && ev.quantity);
  if (Number.isFinite(q) && q > 0) return Math.round(q);
  const meta = ev && ev.metadata;
  const mq = meta && Number(meta.quantity);
  if (Number.isFinite(mq) && mq > 0) return Math.round(mq);
  return 1;
}

async function countRows(supabase, table, filters) {
  if (table === 'events' || table === 'orders') {
    const selectCols =
      table === 'events'
        ? 'id,page_url,product_id,collection_id,event_type,status'
        : 'id,product_slug,line_items,status';
    let query = supabase.from(table).select(selectCols);
    Object.keys(filters || {}).forEach(function (key) {
      const value = filters[key];
      if (key === 'created_at_gte') query = query.gte('created_at', value);
      else if (key === 'created_at_lt') query = query.lt('created_at', value);
      else if (key === 'event_type') query = query.eq('event_type', value);
      else if (key === 'event_type_in') query = query.in('event_type', value);
    });
    const { data, error } = await query.limit(10000);
    if (error || !Array.isArray(data)) return 0;
    if (table === 'events') return BrandAnalytics.filterZybarEvents(data).length;
    return BrandAnalytics.filterZybarOrders(data).filter(function (row) {
      return row.status !== 'failed' && row.status !== 'canceled';
    }).length;
  }

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

async function countDistinct(supabase, table, column, filters) {
  const selectCols =
    table === 'sessions'
      ? column + ',landing_page'
      : table === 'events'
        ? column + ',page_url,product_id,collection_id'
        : column;
  const { data, error } = await supabase
    .from(table)
    .select(selectCols)
    .gte(filters.startCol, filters.gte)
    .lt(filters.startCol, filters.lt)
    .limit(10000);
  if (error || !Array.isArray(data)) return 0;
  const set = {};
  data.forEach(function (row) {
    if (table === 'sessions' && !BrandAnalytics.isZybarSession(row)) return;
    if (table === 'events' && !BrandAnalytics.isZybarEvent(row)) return;
    if (row[column]) set[row[column]] = true;
  });
  return Object.keys(set).length;
}

async function sumAddToCartQuantity(supabase, range) {
  const { data } = await supabase
    .from('events')
    .select('quantity, metadata, page_url, product_id, collection_id')
    .eq('event_type', 'add_to_cart')
    .gte('created_at', range.start)
    .lt('created_at', range.end)
    .limit(10000);
  if (!Array.isArray(data)) return 0;
  return BrandAnalytics.filterZybarEvents(data).reduce(function (sum, ev) {
    return sum + eventQuantity(ev);
  }, 0);
}

async function overviewFallback(supabase, range) {
  const filters = { created_at_gte: range.start, created_at_lt: range.end };
  const sessionFilters = { started_at_gte: range.start, started_at_lt: range.end };

  const [
    uniqueVisitors,
    sessions,
    productViews,
    collectionViews,
    addToCart,
    productsAdded,
    checkoutStarted,
    orders
  ] = await Promise.all([
    countDistinct(supabase, 'sessions', 'visitor_id', { startCol: 'started_at', gte: range.start, lt: range.end }),
    countDistinct(supabase, 'sessions', 'id', { startCol: 'started_at', gte: range.start, lt: range.end }),
    countRows(supabase, 'events', Object.assign({}, filters, { event_type: 'product_view' })),
    countRows(supabase, 'events', Object.assign({}, filters, { event_type: 'collection_view' })),
    countRows(supabase, 'events', Object.assign({}, filters, { event_type: 'add_to_cart' })),
    sumAddToCartQuantity(supabase, range),
    countRows(supabase, 'events', Object.assign({}, filters, { event_type: 'begin_checkout' })),
    countRows(supabase, 'orders', { created_at_gte: range.start, created_at_lt: range.end })
  ]);

  let revenueCents = 0;
  let zybarOrders = 0;
  const [{ data: orderRows }, { data: sessionRows }] = await Promise.all([
    supabase
      .from('orders')
      .select('amount_total_cents,product_slug,line_items,status')
      .gte('created_at', range.start)
      .lt('created_at', range.end),
    supabase
      .from('sessions')
      .select('started_at,last_activity_at,landing_page')
      .gte('started_at', range.start)
      .lt('started_at', range.end)
      .limit(10000)
  ]);
  if (Array.isArray(orderRows)) {
    BrandAnalytics.filterZybarOrders(orderRows).forEach(function (row) {
      if (row.status === 'failed' || row.status === 'canceled') return;
      zybarOrders += 1;
      revenueCents += Number(row.amount_total_cents) || 0;
    });
  }

  var durations = [];
  BrandAnalytics.filterZybarSessions(sessionRows || []).forEach(function (s) {
    if (!s.started_at || !s.last_activity_at) return;
    var secs = Math.max(0, (new Date(s.last_activity_at).getTime() - new Date(s.started_at).getTime()) / 1000);
    if (Number.isFinite(secs)) durations.push(secs);
  });
  durations.sort(function (a, b) { return a - b; });
  var avgDuration = durations.length
    ? Math.round(durations.reduce(function (sum, n) { return sum + n; }, 0) / durations.length)
    : 0;
  var medianDuration = durations.length
    ? Math.round(durations[Math.floor(durations.length / 2)])
    : 0;

  let newVisitors = 0;
  let returningVisitors = 0;
  const { data: visitorRows } = await supabase
    .from('analytics_visitors')
    .select('visitor_id, first_seen_at')
    .gte('last_seen_at', range.start)
    .lt('last_seen_at', range.end)
    .limit(10000);
  if (Array.isArray(visitorRows)) {
    visitorRows.forEach(function (v) {
      const first = new Date(v.first_seen_at).getTime();
      const start = new Date(range.start).getTime();
      if (first >= start) newVisitors += 1;
      else returningVisitors += 1;
    });
  }

  return {
    unique_visitors: uniqueVisitors,
    visitors: uniqueVisitors,
    sessions: sessions,
    new_visitors: newVisitors,
    returning_visitors: returningVisitors,
    product_views: productViews,
    collection_views: collectionViews,
    add_to_cart: addToCart,
    products_added: productsAdded,
    checkout_started: checkoutStarted,
    orders: zybarOrders,
    revenue_cents: revenueCents,
    avg_order_value_cents: zybarOrders > 0 ? Math.round(revenueCents / zybarOrders) : 0,
    conversion_rate: uniqueVisitors > 0 ? Number(((zybarOrders / uniqueVisitors) * 100).toFixed(2)) : 0,
    avg_session_duration_seconds: avgDuration,
    median_session_duration_seconds: medianDuration
  };
}

async function funnelFallback(supabase, range) {
  const steps = [
    { step: 'visitors', order: 1 },
    { step: 'product_views', order: 2 },
    { step: 'add_to_cart', order: 3 },
    { step: 'checkout_started', order: 4 },
    { step: 'payment_started', order: 5 },
    { step: 'orders', order: 6 }
  ];

  const visitors = await countDistinct(supabase, 'sessions', 'visitor_id', {
    startCol: 'started_at',
    gte: range.start,
    lt: range.end
  });

  const { data: events } = await supabase
    .from('events')
    .select('event_type, visitor_id, page_url, product_id, collection_id')
    .gte('created_at', range.start)
    .lt('created_at', range.end)
    .in('event_type', [
      'product_view',
      'add_to_cart',
      'begin_checkout',
      'checkout_started',
      'payment_started',
      'payment_success',
      'purchase'
    ])
    .limit(10000);

  const pv = {};
  const atc = {};
  const chk = {};
  const pay = {};
  BrandAnalytics.filterZybarEvents(events || []).forEach(function (ev) {
    if (!ev.visitor_id) return;
    if (ev.event_type === 'product_view') pv[ev.visitor_id] = true;
    if (ev.event_type === 'add_to_cart') atc[ev.visitor_id] = true;
    if (ev.event_type === 'begin_checkout' || ev.event_type === 'checkout_started') {
      chk[ev.visitor_id] = true;
    }
    if (
      ev.event_type === 'payment_started' ||
      ev.event_type === 'payment_success' ||
      ev.event_type === 'purchase'
    ) {
      pay[ev.visitor_id] = true;
    }
  });

  const orders = await countRows(supabase, 'orders', {
    created_at_gte: range.start,
    created_at_lt: range.end
  });

  const counts = [
    visitors,
    Object.keys(pv).length,
    Object.keys(atc).length,
    Object.keys(chk).length,
    Object.keys(pay).length,
    orders
  ];

  return steps.map(function (s, i) {
    const cnt = counts[i];
    const prev = i > 0 ? counts[i - 1] : null;
    return {
      step: s.step,
      count: cnt,
      order: s.order,
      rate_from_previous: prev ? Number(((cnt / Math.max(prev, 1)) * 100).toFixed(2)) : 100
    };
  });
}

async function trendsFallback(supabase, range, granularity) {
  function bucketDate(iso) {
    const d = new Date(iso);
    if (granularity === 'year') {
      return String(d.getUTCFullYear()) + '-01-01';
    }
    if (granularity === 'month') return d.toISOString().slice(0, 7) + '-01';
    if (granularity === 'week') {
      const day = d.getUTCDay();
      d.setUTCDate(d.getUTCDate() - ((day + 6) % 7));
      return d.toISOString().slice(0, 10);
    }
    if (granularity === 'hour') {
      return d.toISOString().slice(0, 13) + ':00:00Z';
    }
    return d.toISOString().slice(0, 10);
  }

  const [{ data: events }, { data: sessions }, { data: orders }, { data: leads }, { data: carts }, { data: customLeads }] =
    await Promise.all([
      supabase
        .from('events')
        .select('event_type,created_at,quantity,metadata,page_url,product_id,collection_id')
        .gte('created_at', range.start)
        .lt('created_at', range.end)
        .limit(10000),
      supabase
        .from('sessions')
        .select('visitor_id,started_at,landing_page')
        .gte('started_at', range.start)
        .lt('started_at', range.end)
        .limit(10000),
      supabase
        .from('orders')
        .select('created_at,amount_total_cents,product_slug,line_items,status')
        .gte('created_at', range.start)
        .lt('created_at', range.end)
        .limit(10000),
      supabase
        .from('newsletter_subscribers')
        .select('created_at,source,discount_code')
        .gte('created_at', range.start)
        .lt('created_at', range.end)
        .limit(10000),
      supabase
        .from('cart_sessions')
        .select('id,created_at,abandoned_at,last_activity_at,status,recovery_status,purchased_at')
        .gte('created_at', range.start)
        .lt('created_at', range.end)
        .limit(10000),
      supabase
        .from('custom_leads')
        .select('created_at')
        .gte('created_at', range.start)
        .lt('created_at', range.end)
        .limit(10000)
    ]);

  const addToCart = {}; const checkout = {}; const productsAdded = {};
  BrandAnalytics.filterZybarEvents(events || []).forEach(function (ev) {
    const d = bucketDate(ev.created_at);
    if (ev.event_type === 'add_to_cart') {
      addToCart[d] = (addToCart[d] || 0) + 1;
      productsAdded[d] = (productsAdded[d] || 0) + eventQuantity(ev);
    }
    if (ev.event_type === 'begin_checkout' || ev.event_type === 'checkout_started') {
      checkout[d] = (checkout[d] || 0) + 1;
    }
  });

  const visitors = {};
  const sessionCounts = {};
  BrandAnalytics.filterZybarSessions(sessions || []).forEach(function (s) {
    const d = bucketDate(s.started_at);
    sessionCounts[d] = (sessionCounts[d] || 0) + 1;
    if (!visitors[d]) visitors[d] = {};
    if (s.visitor_id) visitors[d][s.visitor_id] = true;
  });

  const revenue = {}; const orderCounts = {};
  BrandAnalytics.filterZybarOrders(orders || []).forEach(function (o) {
    if (o.status === 'failed' || o.status === 'canceled') return;
    const d = bucketDate(o.created_at);
    revenue[d] = (revenue[d] || 0) + (Number(o.amount_total_cents) || 0);
    orderCounts[d] = (orderCounts[d] || 0) + 1;
  });

  const emailLeads = {};
  BrandAnalytics.filterZybarLeads(leads || []).forEach(function (l) {
    const d = bucketDate(l.created_at);
    emailLeads[d] = (emailLeads[d] || 0) + 1;
  });

  const abandoned = {};
  const cartIds = (carts || []).map(function (c) {
    return c.id;
  });
  const itemsByCart = await BrandAnalytics.loadCartItemsByCartId(supabase, cartIds);
  BrandAnalytics.filterZybarCarts(carts || [], itemsByCart).forEach(function (c) {
    const isAbandoned =
      c.status === 'abandoned' ||
      ['abandoned', 'recoverable', 'unrecovered'].indexOf(c.recovery_status) !== -1 ||
      (!c.purchased_at && c.abandoned_at);
    if (!isAbandoned) return;
    const d = bucketDate(c.abandoned_at || c.last_activity_at || c.created_at);
    abandoned[d] = (abandoned[d] || 0) + 1;
  });
  const customMadeLeads = {};
  (customLeads || []).forEach(function (l) {
    const d = bucketDate(l.created_at);
    customMadeLeads[d] = (customMadeLeads[d] || 0) + 1;
  });

  function toSeries(map, isSet) {
    return Object.keys(map).sort().map(function (date) {
      return { date: date, value: isSet ? Object.keys(map[date]).length : map[date] };
    });
  }

  return {
    granularity: granularity || 'day',
    revenue: toSeries(revenue, false),
    orders: toSeries(orderCounts, false),
    add_to_cart: toSeries(addToCart, false),
    products_added: toSeries(productsAdded, false),
    checkout: toSeries(checkout, false),
    visitors: toSeries(visitors, true),
    sessions: toSeries(sessionCounts, false),
    email_leads: toSeries(emailLeads, false),
    custom_made_leads: toSeries(customMadeLeads, false),
    abandoned: toSeries(abandoned, false)
  };
}

async function productsFallback(supabase, range) {
  const { data: events } = await supabase
    .from('events')
    .select('event_type,product_id,quantity,metadata,page_url,collection_id')
    .gte('created_at', range.start)
    .lt('created_at', range.end)
    .in('event_type', ['product_view', 'add_to_cart'])
    .limit(10000);

  const views = {}; const addEvents = {}; const addQty = {};
  BrandAnalytics.filterZybarEvents(events || []).forEach(function (ev) {
    const pid = ev.product_id || 'unknown';
    if (ev.event_type === 'product_view') views[pid] = (views[pid] || 0) + 1;
    if (ev.event_type === 'add_to_cart') {
      addEvents[pid] = (addEvents[pid] || 0) + 1;
      addQty[pid] = (addQty[pid] || 0) + eventQuantity(ev);
    }
  });

  function topViews() {
    return Object.keys(views).map(function (id) {
      return { product_id: id, views: views[id] };
    }).sort(function (a, b) { return b.views - a.views; }).slice(0, 15);
  }
  function topAdds() {
    return Object.keys(addQty).map(function (id) {
      return { product_id: id, add_events: addEvents[id] || 0, products_added: addQty[id] };
    }).sort(function (a, b) { return b.products_added - a.products_added; }).slice(0, 15);
  }

  return {
    most_viewed: topViews(),
    most_added: topAdds(),
    highest_revenue: [],
    highest_conversion: []
  };
}

async function distributionsFallback(supabase, range) {
  const { data: sessions } = await supabase
    .from('sessions')
    .select('country,device_type,browser,traffic_source,visitor_id,landing_page')
    .gte('started_at', range.start)
    .lt('started_at', range.end)
    .limit(10000);

  const countries = {}; const devices = {}; const browsers = {}; const sources = {};
  BrandAnalytics.filterZybarSessions(sessions || []).forEach(function (s) {
    const c = s.country || 'Unknown';
    const d = s.device_type || 'unknown';
    const b = s.browser || 'other';
    const src = s.traffic_source || 'direct';
    countries[c] = countries[c] || {};
    devices[d] = devices[d] || {};
    browsers[b] = browsers[b] || {};
    sources[src] = sources[src] || {};
    if (s.visitor_id) {
      countries[c][s.visitor_id] = true;
      devices[d][s.visitor_id] = true;
      browsers[b][s.visitor_id] = true;
      sources[src][s.visitor_id] = true;
    }
  });

  function toList(map) {
    return Object.keys(map).map(function (label) {
      return { label: label, value: Object.keys(map[label]).length };
    }).sort(function (a, b) { return b.value - a.value; }).slice(0, 25);
  }

  return {
    countries: toList(countries),
    devices: toList(devices),
    browsers: toList(browsers),
    traffic_sources: toList(sources)
  };
}

async function realtimeFallback(supabase) {
  const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const [{ data: sessions }, { data: carts }, { data: events }] = await Promise.all([
    supabase.from('sessions').select('visitor_id,id,last_activity_at,landing_page').gte('last_activity_at', since).limit(500),
    supabase.from('cart_sessions').select('id,visitor_id,status,item_count,last_activity_at,brand').gte('last_activity_at', new Date(Date.now() - 30 * 60 * 1000).toISOString()).limit(500),
    supabase.from('events').select('event_type,product_id,visitor_id,page_url,collection_id,created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(20)
  ]);

  const visitors = {};
  BrandAnalytics.filterZybarSessions(sessions || []).forEach(function (s) {
    if (s.visitor_id) visitors[s.visitor_id] = true;
  });

  const itemsByCart = await BrandAnalytics.loadCartItemsByCartId(
    supabase,
    (carts || []).map(function (c) {
      return c.id;
    })
  );
  let activeCarts = 0;
  let checkoutUsers = {};
  BrandAnalytics.filterZybarCarts(carts || [], itemsByCart).forEach(function (c) {
    if (c.status === 'active' && (c.item_count || 0) > 0) activeCarts += 1;
    if (c.status === 'checkout_started' && c.visitor_id) checkoutUsers[c.visitor_id] = true;
  });

  return {
    active_visitors: Object.keys(visitors).length,
    active_sessions: BrandAnalytics.filterZybarSessions(sessions || []).length,
    active_carts: activeCarts,
    checkout_users: Object.keys(checkoutUsers).length,
    recent_events: BrandAnalytics.filterZybarEvents(events || [])
  };
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

  let { error } = await supabase.from('events').insert(extendedEventRow(ev));
  if (error && (error.code === 'PGRST204' || String(error.message || '').indexOf('column') !== -1)) {
    const retry = await supabase.from('events').insert(baseEventRow(ev));
    error = retry.error;
  }
  if (error && error.code !== '23505') {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * SQL RPCs that must exclude LUNEVA. Until
 * supabase/migrations/20260729180000_zybar_exclude_luneva_analytics.sql
 * is applied in production, those RPCs still count butterfly traffic as ZYBAR.
 * Prefer JS fallbacks (which always brand-filter) for these.
 */
var ZYBAR_RPCS_NEED_LUNEVA_EXCLUSION = {
  get_shopify_analytics_overview: true,
  get_shopify_conversion_funnel: true,
  get_analytics_trends: true,
  get_shopify_device_analytics: true,
  get_shopify_top_products: true,
  get_shopify_traffic_sources: true,
  get_shopify_realtime: true,
  get_shopify_geo_analytics: true,
  get_analytics_geo_traffic: true
};

async function rpcOrFallback(supabase, rpcName, params, fallbackFn) {
  if (ZYBAR_RPCS_NEED_LUNEVA_EXCLUSION[rpcName] && typeof fallbackFn === 'function') {
    return fallbackFn();
  }
  const { data, error } = await supabase.rpc(rpcName, params);
  if (!error && data != null) return data;
  if (error && !isMissingRpc(error)) throw error;
  return fallbackFn();
}

function sessionDurationSeconds(startedAt, lastActivityAt) {
  if (!startedAt || !lastActivityAt) return 0;
  return Math.max(0, Math.round((new Date(lastActivityAt).getTime() - new Date(startedAt).getTime()) / 1000));
}

async function geoTrafficFallback(supabase, range) {
  const [{ data: sessions }, { data: events }, { data: orders }] = await Promise.all([
    supabase
      .from('sessions')
      .select('id,visitor_id,started_at,last_activity_at,country,traffic_source,utm_source,utm_campaign,landing_page')
      .gte('started_at', range.start)
      .lt('started_at', range.end)
      .limit(10000),
    supabase
      .from('events')
      .select('event_type,visitor_id,session_id,created_at,page_url,product_id,collection_id')
      .gte('created_at', range.start)
      .lt('created_at', range.end)
      .eq('event_type', 'add_to_cart')
      .limit(10000),
    supabase
      .from('orders')
      .select('visitor_id,amount_total_cents,status,created_at,product_slug,line_items')
      .gte('created_at', range.start)
      .lt('created_at', range.end)
      .limit(10000)
  ]);

  const sessionList = BrandAnalytics.filterZybarSessions(sessions || []);
  const durations = sessionList.map(function (s) {
    return sessionDurationSeconds(s.started_at, s.last_activity_at);
  }).filter(function (n) { return n >= 0; });
  durations.sort(function (a, b) { return a - b; });

  const firstTouch = {};
  sessionList.forEach(function (s) {
    if (!s.visitor_id || firstTouch[s.visitor_id]) return;
    firstTouch[s.visitor_id] = {
      country: s.country || 'Unknown',
      traffic_source: s.traffic_source || 'direct',
      utm_source: s.utm_source || '—',
      utm_campaign: s.utm_campaign || '—'
    };
  });

  const sessionById = {};
  sessionList.forEach(function (s) {
    sessionById[String(s.id)] = s;
  });

  function bucketKey(parts) {
    return [parts.country, parts.traffic_source, parts.utm_source, parts.utm_campaign].join('\0');
  }

  const buckets = {};
  function ensureBucket(parts) {
    var key = bucketKey(parts);
    if (!buckets[key]) {
      buckets[key] = {
        country: parts.country,
        traffic_source: parts.traffic_source,
        utm_source: parts.utm_source,
        utm_campaign: parts.utm_campaign,
        sessions: 0,
        visitors: {},
        durationTotal: 0,
        add_to_cart_visitors: {},
        orders: 0,
        revenue_cents: 0
      };
    }
    return buckets[key];
  }

  sessionList.forEach(function (s) {
    var parts = {
      country: s.country || 'Unknown',
      traffic_source: s.traffic_source || 'direct',
      utm_source: s.utm_source || '—',
      utm_campaign: s.utm_campaign || '—'
    };
    var bucket = ensureBucket(parts);
    bucket.sessions += 1;
    if (s.visitor_id) bucket.visitors[s.visitor_id] = true;
    bucket.durationTotal += sessionDurationSeconds(s.started_at, s.last_activity_at);
  });

  (BrandAnalytics.filterZybarEvents(events || [])).forEach(function (ev) {
    var session = sessionById[String(ev.session_id || '')];
    if (!session) return;
    var bucket = ensureBucket({
      country: session.country || 'Unknown',
      traffic_source: session.traffic_source || 'direct',
      utm_source: session.utm_source || '—',
      utm_campaign: session.utm_campaign || '—'
    });
    if (ev.visitor_id) bucket.add_to_cart_visitors[ev.visitor_id] = true;
  });

  BrandAnalytics.filterZybarOrders(orders || []).forEach(function (order) {
    if (!order.visitor_id) return;
    if (order.status === 'failed' || order.status === 'canceled') return;
    var touch = firstTouch[order.visitor_id];
    if (!touch) return;
    var bucket = ensureBucket(touch);
    bucket.orders += 1;
    bucket.revenue_cents += Number(order.amount_total_cents) || 0;
  });

  const countryDuration = {};
  sessionList.forEach(function (s) {
    var country = s.country || 'Unknown';
    if (!countryDuration[country]) countryDuration[country] = { sessions: 0, durationTotal: 0 };
    countryDuration[country].sessions += 1;
    countryDuration[country].durationTotal += sessionDurationSeconds(s.started_at, s.last_activity_at);
  });

  const rows = Object.keys(buckets).map(function (key) {
    var b = buckets[key];
    var visitors = Object.keys(b.visitors).length;
    return {
      country: b.country,
      traffic_source: b.traffic_source,
      utm_source: b.utm_source,
      utm_campaign: b.utm_campaign,
      sessions: b.sessions,
      visitors: visitors,
      avg_duration_seconds: b.sessions > 0 ? Math.round(b.durationTotal / b.sessions) : 0,
      add_to_cart_visitors: Object.keys(b.add_to_cart_visitors).length,
      orders: b.orders,
      revenue_cents: b.revenue_cents,
      conversion_rate: visitors > 0 ? Number(((b.orders / visitors) * 100).toFixed(2)) : 0
    };
  }).sort(function (a, b) {
    return b.sessions - a.sessions || b.visitors - a.visitors;
  }).slice(0, 100);

  return {
    summary: {
      avg_session_duration_seconds: durations.length
        ? Math.round(durations.reduce(function (sum, n) { return sum + n; }, 0) / durations.length)
        : 0,
      median_session_duration_seconds: durations.length
        ? Math.round(durations[Math.floor(durations.length / 2)])
        : 0,
      total_sessions: sessionList.length,
      total_visitors: Object.keys(firstTouch).length
    },
    rows: rows,
    by_country: Object.keys(countryDuration).map(function (country) {
      var c = countryDuration[country];
      return {
        country: country,
        sessions: c.sessions,
        avg_duration_seconds: c.sessions > 0 ? Math.round(c.durationTotal / c.sessions) : 0
      };
    }).sort(function (a, b) { return b.sessions - a.sessions; }).slice(0, 30)
  };
}

function geoCountryFromRequest(req) {
  const headers = req.headers || {};
  const code = headers['cf-ipcountry'] || headers['x-vercel-ip-country'] || headers['x-country-code'];
  if (!code || code === 'XX' || code === 'T1') return null;
  return String(code).toUpperCase().slice(0, 2);
}

module.exports = {
  baseEventRow,
  extendedEventRow,
  isMissingRpc,
  overviewFallback,
  funnelFallback,
  trendsFallback,
  productsFallback,
  distributionsFallback,
  realtimeFallback,
  insertEventSafe,
  rpcOrFallback,
  geoTrafficFallback,
  geoCountryFromRequest
};
