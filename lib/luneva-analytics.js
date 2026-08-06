/**
 * LUNEVA-scoped analytics queries — isolated from ZYBAR Automotive metrics.
 */

const BrandAnalytics = require('./brand-analytics.js');
const LUNEVA_SLUG_PREFIX = BrandAnalytics.LUNEVA_SLUG_PREFIX;

function eventQuantity(ev) {
  const q = Number(ev && ev.quantity);
  if (Number.isFinite(q) && q > 0) return Math.round(q);
  const mq = ev && ev.metadata && Number(ev.metadata.quantity);
  if (Number.isFinite(mq) && mq > 0) return Math.round(mq);
  return 1;
}

function isLunevaOrder(row) {
  return BrandAnalytics.isLunevaOrder(row);
}

function lunevaEventFilter() {
  return BrandAnalytics.lunevaEventFilter();
}

function normalizeSource(raw) {
  const s = String(raw || '')
    .toLowerCase()
    .trim();
  if (!s || s === '—' || s === 'none') return 'Unknown';
  if (s === 'direct' || s === '(direct)') return 'Direct';
  if (s.indexOf('facebook') !== -1 || s === 'fb' || s === 'meta') return 'Facebook';
  if (s.indexOf('instagram') !== -1 || s === 'ig') return 'Instagram';
  if (s.indexOf('google') !== -1 || s === 'gads' || s === 'adwords' || s === 'cpc') return 'Google';
  if (s.indexOf('tiktok') !== -1 || s === 'tt') return 'TikTok';
  if (s.indexOf('youtube') !== -1 || s === 'yt') return 'YouTube';
  if (s === 'referral' || s.indexOf('refer') !== -1) return 'Referral';
  if (s !== 'unknown') {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  return 'Unknown';
}

async function fetchLunevaEvents(supabase, range, opts) {
  const options = opts || {};
  let query = supabase
    .from('events')
    .select(
      'id,event_type,visitor_id,session_id,product_id,page_url,collection_id,metadata,quantity,country,traffic_source,created_at'
    )
    .gte('created_at', range.start)
    .lt('created_at', range.end)
    .or(lunevaEventFilter())
    .order('created_at', { ascending: false })
    .limit(options.limit || 10000);

  if (options.event_type) {
    query = query.eq('event_type', options.event_type);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function fetchLunevaSessions(supabase, range) {
  const { data, error } = await supabase
    .from('sessions')
    .select(
      'id,visitor_id,started_at,last_activity_at,landing_page,country,device_type,traffic_source,utm_source'
    )
    .gte('started_at', range.start)
    .lt('started_at', range.end)
    .or('landing_page.ilike.%/luneva%,landing_page.ilike.%/products/luneva-%')
    .order('started_at', { ascending: false })
    .limit(5000);
  if (error) return [];
  return data || [];
}

async function fetchLunevaOrders(supabase, range) {
  const { data, error } = await supabase
    .from('orders')
    .select(
      'id,stripe_session_id,customer_email,customer_name,customer_phone,product_slug,line_items,amount_total_cents,quantity,status,fulfillment_status,country,created_at,visitor_id'
    )
    .gte('created_at', range.start)
    .lt('created_at', range.end)
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) throw error;
  return (data || []).filter(isLunevaOrder);
}

function topProductsFromEvents(events) {
  const counts = {};
  (events || []).forEach(function (ev) {
    if (ev.event_type !== 'add_to_cart' && ev.event_type !== 'purchase') return;
    const slug = String(ev.product_id || '').trim();
    if (!slug || slug.indexOf(LUNEVA_SLUG_PREFIX) !== 0) return;
    counts[slug] = (counts[slug] || 0) + eventQuantity(ev);
  });
  return Object.keys(counts)
    .map(function (slug) {
      return { product_slug: slug, add_to_cart: counts[slug] };
    })
    .sort(function (a, b) {
      return b.add_to_cart - a.add_to_cart;
    })
    .slice(0, 8);
}

function dailyBuckets(events, orders, range) {
  const buckets = {};
  function dayKey(iso) {
    if (!iso) return '';
    return String(iso).slice(0, 10);
  }
  (events || []).forEach(function (ev) {
    if (ev.event_type !== 'page_view') return;
    const key = dayKey(ev.created_at);
    if (!key) return;
    if (!buckets[key]) buckets[key] = { date: key, visitors: {}, page_views: 0, orders: 0, revenue_cents: 0 };
    buckets[key].page_views += 1;
    if (ev.visitor_id) buckets[key].visitors[ev.visitor_id] = true;
  });
  (orders || []).forEach(function (order) {
    const key = dayKey(order.created_at);
    if (!key) return;
    if (!buckets[key]) buckets[key] = { date: key, visitors: {}, page_views: 0, orders: 0, revenue_cents: 0 };
    buckets[key].orders += 1;
    buckets[key].revenue_cents += Number(order.amount_total_cents) || 0;
  });
  return Object.keys(buckets)
    .sort()
    .map(function (key) {
      return {
        date: key,
        visitors: Object.keys(buckets[key].visitors).length,
        page_views: buckets[key].page_views,
        orders: buckets[key].orders,
        revenue_cents: buckets[key].revenue_cents
      };
    });
}

async function getDashboard(supabase, range) {
  const [events, orders, sessions] = await Promise.all([
    fetchLunevaEvents(supabase, range),
    fetchLunevaOrders(supabase, range),
    fetchLunevaSessions(supabase, range)
  ]);

  const visitors = new Set();
  const sessionVisitors = new Set();
  let pageViews = 0;
  let productViews = 0;
  let addToCartEvents = 0;
  let productsAdded = 0;
  let beginCheckout = 0;
  let paymentStarted = 0;
  const emails = new Set();

  sessions.forEach(function (s) {
    if (s.visitor_id) sessionVisitors.add(s.visitor_id);
  });

  events.forEach(function (ev) {
    if (ev.visitor_id) visitors.add(ev.visitor_id);
    if (ev.event_type === 'page_view') pageViews += 1;
    if (ev.event_type === 'product_view') productViews += 1;
    if (ev.event_type === 'add_to_cart') {
      addToCartEvents += 1;
      productsAdded += eventQuantity(ev);
    }
    if (ev.event_type === 'begin_checkout') beginCheckout += 1;
    if (ev.event_type === 'payment_started') paymentStarted += 1;
    if (ev.event_type === 'email_submitted' || ev.event_type === 'newsletter_signup') {
      const email =
        (ev.metadata && (ev.metadata.email || ev.metadata.customer_email)) || '';
      if (email) emails.add(String(email).trim().toLowerCase());
    }
  });

  sessionVisitors.forEach(function (id) {
    visitors.add(id);
  });

  orders.forEach(function (order) {
    if (order.customer_email) {
      emails.add(String(order.customer_email).trim().toLowerCase());
    }
  });

  const revenueCents = orders.reduce(function (sum, row) {
    return sum + (Number(row.amount_total_cents) || 0);
  }, 0);
  const uniqueVisitors = visitors.size;
  const orderCount = orders.length;

  return {
    overview: {
      unique_visitors: uniqueVisitors,
      sessions: sessionVisitors.size || uniqueVisitors,
      page_views: pageViews,
      product_views: productViews,
      add_to_cart: addToCartEvents,
      products_added: productsAdded,
      begin_checkout: beginCheckout,
      payment_started: paymentStarted,
      orders: orderCount,
      purchases: orderCount,
      revenue_cents: revenueCents,
      emails_collected: emails.size,
      conversion_rate: uniqueVisitors > 0 ? Number(((orderCount / uniqueVisitors) * 100).toFixed(2)) : 0,
      aov_cents: orderCount > 0 ? Math.round(revenueCents / orderCount) : 0
    },
    trends: dailyBuckets(events, orders, range),
    top_products: topProductsFromEvents(events),
    recent_orders: orders.slice(0, 15),
    recent_activity: events.slice(0, 25).map(function (ev) {
      return {
        event_type: ev.event_type,
        product_id: ev.product_id,
        page_url: ev.page_url,
        visitor_id: ev.visitor_id,
        country: ev.country || null,
        traffic_source: normalizeSource(ev.traffic_source),
        quantity: eventQuantity(ev),
        created_at: ev.created_at
      };
    }),
    range: range
  };
}

async function getCustomers(supabase, range) {
  const [orders, events] = await Promise.all([
    fetchLunevaOrders(supabase, range),
    fetchLunevaEvents(supabase, range)
  ]);
  const byEmail = {};

  function ensure(email) {
    const key = String(email || '')
      .trim()
      .toLowerCase();
    if (!key) return null;
    if (!byEmail[key]) {
      byEmail[key] = {
        email: key,
        name: '',
        phone: '',
        orders: 0,
        revenue_cents: 0,
        last_order_at: null,
        last_seen_at: null,
        country: '',
        source: 'checkout_email',
        status: 'lead'
      };
    }
    return byEmail[key];
  }

  (events || []).forEach(function (ev) {
    if (ev.event_type !== 'email_submitted' && ev.event_type !== 'newsletter_signup') return;
    const email =
      (ev.metadata && (ev.metadata.email || ev.metadata.customer_email)) || '';
    if (!email) return;
    const row = ensure(email);
    if (!row) return;
    if (ev.metadata && ev.metadata.name) row.name = String(ev.metadata.name);
    if (!row.last_seen_at || String(ev.created_at) > String(row.last_seen_at)) {
      row.last_seen_at = ev.created_at;
    }
  });

  (orders || []).forEach(function (order) {
    const email = String(order.customer_email || '').trim().toLowerCase();
    if (!email) return;
    const row = ensure(email);
    row.orders += 1;
    row.revenue_cents += Number(order.amount_total_cents) || 0;
    if (order.customer_name) row.name = order.customer_name;
    if (order.customer_phone) row.phone = order.customer_phone;
    if (order.country) row.country = order.country;
    if (!row.last_order_at || String(order.created_at) > String(row.last_order_at)) {
      row.last_order_at = order.created_at;
    }
    row.source = 'purchase';
    row.status = 'purchased';
  });

  return Object.values(byEmail).sort(function (a, b) {
    const aAt = a.last_order_at || a.last_seen_at || '';
    const bAt = b.last_order_at || b.last_seen_at || '';
    return String(bAt).localeCompare(String(aAt));
  });
}

/** Gaps longer than this are treated as a new visit cluster (not continuous stay). */
const ENGAGED_GAP_MS = 2 * 60 * 1000;
/** Single-hit / near-instant exits show as 1s in admin. */
const BOUNCE_DURATION_SECONDS = 1;

function touchTimestamp(row, iso) {
  if (!iso) return;
  if (!row.last_active_at || iso > row.last_active_at) row.last_active_at = iso;
  if (!row.first_seen_at || iso < row.first_seen_at) row.first_seen_at = iso;
}

function deriveVisitorStatus(row) {
  if ((row.orders || 0) > 0) return 'purchased';
  if ((row.begin_checkout || 0) > 0) return 'checkout_started';
  if ((row.add_to_cart || 0) > 0) return 'added_to_cart';
  if ((row.page_views || 0) > 0) return 'browsing';
  return 'visited';
}

/**
 * Engaged stay time from real activity timestamps (session starts + events + orders).
 * Ignores long idle gaps and background tab heartbeats so overnight open tabs
 * do not show as multi-hour "duration".
 * Instant bounces (< ~2s of engaged activity) are classified as 1s.
 */
function calcEngagedDurationSeconds(timestamps) {
  const times = (timestamps || [])
    .map(function (iso) {
      return new Date(iso).getTime();
    })
    .filter(function (ms) {
      return Number.isFinite(ms);
    })
    .sort(function (a, b) {
      return a - b;
    });

  if (!times.length) return 0;
  if (times.length === 1) return BOUNCE_DURATION_SECONDS;

  let totalMs = 0;
  for (let i = 1; i < times.length; i++) {
    const gap = times[i] - times[i - 1];
    if (gap > 0 && gap <= ENGAGED_GAP_MS) totalMs += gap;
  }

  const seconds = Math.round(totalMs / 1000);
  return seconds < 2 ? BOUNCE_DURATION_SECONDS : seconds;
}

function buildVisitorMap(sessions, events, orders) {
  const map = {};

  function ensure(visitorId) {
    if (!visitorId) return null;
    if (!map[visitorId]) {
      map[visitorId] = {
        visitor_id: visitorId,
        email: null,
        name: null,
        country: null,
        traffic_source: null,
        last_active_at: null,
        first_seen_at: null,
        page_views: 0,
        add_to_cart: 0,
        begin_checkout: 0,
        orders: 0,
        revenue_cents: 0,
        status: 'visited',
        _activity_at: []
      };
    }
    return map[visitorId];
  }

  function noteActivity(row, iso) {
    if (!row || !iso) return;
    touchTimestamp(row, iso);
    row._activity_at.push(iso);
  }

  const sessionsByVisitor = {};
  (sessions || []).forEach(function (session) {
    if (!session.visitor_id) return;
    if (!sessionsByVisitor[session.visitor_id]) {
      sessionsByVisitor[session.visitor_id] = session;
    } else if (
      String(session.started_at || '') >
      String(sessionsByVisitor[session.visitor_id].started_at || '')
    ) {
      // Prefer latest session for traffic source attribution.
      sessionsByVisitor[session.visitor_id] = session;
    }
    const row = ensure(session.visitor_id);
    if (session.country && !row.country) row.country = session.country;
    // Session start only — do not use last_activity_at (45s heartbeats inflate stay).
    noteActivity(row, session.started_at);
  });

  Object.keys(sessionsByVisitor).forEach(function (visitorId) {
    const session = sessionsByVisitor[visitorId];
    const row = ensure(visitorId);
    row.traffic_source = normalizeSource(session.traffic_source || session.utm_source);
    if (session.country && !row.country) row.country = session.country;
  });

  (events || []).forEach(function (ev) {
    const row = ensure(ev.visitor_id);
    if (!row) return;
    if (ev.country && !row.country) row.country = ev.country;
    if (!row.traffic_source && ev.traffic_source) {
      row.traffic_source = normalizeSource(ev.traffic_source);
    }
    if (ev.event_type === 'page_view') row.page_views += 1;
    if (ev.event_type === 'add_to_cart') row.add_to_cart += 1;
    if (ev.event_type === 'begin_checkout') row.begin_checkout += 1;
    noteActivity(row, ev.created_at);
  });

  (orders || []).forEach(function (order) {
    const row = ensure(order.visitor_id);
    if (!row) return;
    if (order.customer_email) row.email = String(order.customer_email).trim().toLowerCase();
    if (order.customer_name) row.name = order.customer_name;
    if (order.country && !row.country) row.country = order.country;
    row.orders += 1;
    row.revenue_cents += Number(order.amount_total_cents) || 0;
    noteActivity(row, order.created_at);
  });

  return Object.keys(map).map(function (visitorId) {
    const row = map[visitorId];
    row.status = deriveVisitorStatus(row);
    if (!row.traffic_source) row.traffic_source = 'Unknown';
    if (!row.country) row.country = 'Unknown';
    row.duration_seconds = calcEngagedDurationSeconds(row._activity_at);
    delete row._activity_at;
    return row;
  });
}

function calcDurationSeconds(firstSeenAt, lastActiveAt) {
  return calcEngagedDurationSeconds([firstSeenAt, lastActiveAt].filter(Boolean));
}

async function getVisitors(supabase, range, query) {
  const opts = query || {};
  const limit = Math.min(100, Math.max(1, parseInt(opts.limit, 10) || 50));
  const offset = Math.max(0, parseInt(opts.offset, 10) || 0);
  const countryFilter = opts.country ? String(opts.country).toUpperCase() : '';
  const trafficFilter = opts.traffic ? normalizeSource(opts.traffic) : '';
  const search = opts.search ? String(opts.search).trim().toLowerCase() : '';

  const [sessions, events, orders] = await Promise.all([
    fetchLunevaSessions(supabase, range),
    fetchLunevaEvents(supabase, range),
    fetchLunevaOrders(supabase, range)
  ]);

  let rows = buildVisitorMap(sessions, events, orders);
  rows.sort(function (a, b) {
    return String(b.last_active_at || '').localeCompare(String(a.last_active_at || ''));
  });

  if (countryFilter) {
    rows = rows.filter(function (row) {
      return String(row.country || '').toUpperCase() === countryFilter;
    });
  }
  if (trafficFilter) {
    rows = rows.filter(function (row) {
      return row.traffic_source === trafficFilter;
    });
  }
  if (search) {
    rows = rows.filter(function (row) {
      const blob = [
        row.email,
        row.name,
        row.country,
        row.traffic_source,
        row.visitor_id,
        row.status
      ]
        .join(' ')
        .toLowerCase();
      return blob.indexOf(search) !== -1;
    });
  }

  const total = rows.length;
  return {
    rows: rows.slice(offset, offset + limit),
    total: total,
    range: range,
    offset: offset,
    limit: limit
  };
}

async function getCountryAnalytics(supabase, range) {
  const [sessions, orders] = await Promise.all([
    fetchLunevaSessions(supabase, range),
    fetchLunevaOrders(supabase, range)
  ]);

  const map = {};
  sessions.forEach(function (session) {
    const country = session.country || 'Unknown';
    if (!map[country]) {
      map[country] = { country: country, visitors: {}, customers: {}, orders: 0, revenue_cents: 0 };
    }
    if (session.visitor_id) map[country].visitors[session.visitor_id] = true;
  });
  orders.forEach(function (order) {
    if (order.status === 'failed' || order.status === 'canceled') return;
    const country = order.country || 'Unknown';
    if (!map[country]) {
      map[country] = { country: country, visitors: {}, customers: {}, orders: 0, revenue_cents: 0 };
    }
    map[country].orders += 1;
    map[country].revenue_cents += Number(order.amount_total_cents) || 0;
    if (order.customer_email) {
      map[country].customers[String(order.customer_email).trim().toLowerCase()] = true;
    }
    if (order.visitor_id) map[country].visitors[order.visitor_id] = true;
  });

  return Object.keys(map)
    .map(function (key) {
      const row = map[key];
      const visitors = Object.keys(row.visitors).length;
      return {
        country: row.country,
        visitors: visitors,
        customers: Object.keys(row.customers).length,
        orders: row.orders,
        revenue_cents: row.revenue_cents,
        conversion_rate:
          visitors > 0 ? Number(((row.orders / visitors) * 100).toFixed(2)) : 0,
        aov_cents: row.orders > 0 ? Math.round(row.revenue_cents / row.orders) : 0
      };
    })
    .sort(function (a, b) {
      return b.revenue_cents - a.revenue_cents || b.visitors - a.visitors;
    });
}

async function getTrafficAnalytics(supabase, range) {
  const [sessions, events, orders] = await Promise.all([
    fetchLunevaSessions(supabase, range),
    fetchLunevaEvents(supabase, range),
    fetchLunevaOrders(supabase, range)
  ]);

  const firstTouch = {};
  const sessionsByVisitor = {};
  sessions.forEach(function (session) {
    if (!session.visitor_id) return;
    if (
      !sessionsByVisitor[session.visitor_id] ||
      String(session.started_at || '') <
        String(sessionsByVisitor[session.visitor_id].started_at || '')
    ) {
      sessionsByVisitor[session.visitor_id] = session;
    }
  });
  Object.keys(sessionsByVisitor).forEach(function (visitorId) {
    const session = sessionsByVisitor[visitorId];
    firstTouch[visitorId] = normalizeSource(session.traffic_source || session.utm_source);
  });

  const labels = [
    'Direct',
    'Facebook',
    'Instagram',
    'Google',
    'TikTok',
    'YouTube',
    'Referral',
    'Unknown'
  ];
  const map = {};
  labels.forEach(function (label) {
    map[label] = {
      label: label,
      visitors: {},
      add_to_cart: {},
      checkout: {},
      purchase: 0,
      revenue_cents: 0
    };
  });

  Object.keys(firstTouch).forEach(function (visitorId) {
    const label = firstTouch[visitorId];
    if (!map[label]) {
      map[label] = {
        label: label,
        visitors: {},
        add_to_cart: {},
        checkout: {},
        purchase: 0,
        revenue_cents: 0
      };
    }
    map[label].visitors[visitorId] = true;
  });

  events.forEach(function (ev) {
    const label = firstTouch[ev.visitor_id] || normalizeSource(ev.traffic_source) || 'Unknown';
    if (!map[label]) {
      map[label] = {
        label: label,
        visitors: {},
        add_to_cart: {},
        checkout: {},
        purchase: 0,
        revenue_cents: 0
      };
    }
    if (ev.event_type === 'add_to_cart' && ev.visitor_id) {
      map[label].add_to_cart[ev.visitor_id] = true;
    }
    if (ev.event_type === 'begin_checkout' && ev.visitor_id) {
      map[label].checkout[ev.visitor_id] = true;
    }
  });

  orders.forEach(function (order) {
    if (order.status === 'failed' || order.status === 'canceled') return;
    const label = firstTouch[order.visitor_id] || 'Unknown';
    if (!map[label]) {
      map[label] = {
        label: label,
        visitors: {},
        add_to_cart: {},
        checkout: {},
        purchase: 0,
        revenue_cents: 0
      };
    }
    map[label].purchase += 1;
    map[label].revenue_cents += Number(order.amount_total_cents) || 0;
  });

  return Object.keys(map)
    .map(function (label) {
      const row = map[label];
      return {
        label: label,
        visitors: Object.keys(row.visitors).length,
        add_to_cart: Object.keys(row.add_to_cart).length,
        checkout: Object.keys(row.checkout).length,
        purchase: row.purchase,
        revenue_cents: row.revenue_cents
      };
    })
    .filter(function (row) {
      return (
        row.visitors > 0 ||
        row.add_to_cart > 0 ||
        row.checkout > 0 ||
        row.purchase > 0
      );
    })
    .sort(function (a, b) {
      return b.visitors - a.visitors || b.revenue_cents - a.revenue_cents;
    });
}

/**
 * Visitors active on LUNEVA in the last 5 minutes (sessions + recent events).
 */
async function getRealtime(supabase) {
  const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const [{ data: sessions }, { data: events }] = await Promise.all([
    supabase
      .from('sessions')
      .select('visitor_id,id,last_activity_at,landing_page')
      .gte('last_activity_at', since)
      .limit(500),
    supabase
      .from('events')
      .select('event_type,product_id,visitor_id,page_url,collection_id,created_at')
      .or(lunevaEventFilter())
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(100)
  ]);

  const visitors = {};
  (sessions || []).forEach(function (s) {
    if (BrandAnalytics.isLunevaSession(s) && s.visitor_id) visitors[s.visitor_id] = true;
  });
  (events || []).forEach(function (ev) {
    if (BrandAnalytics.isLunevaEvent(ev) && ev.visitor_id) visitors[ev.visitor_id] = true;
  });

  const lunevaSessions = (sessions || []).filter(BrandAnalytics.isLunevaSession);
  const lunevaEvents = (events || []).filter(BrandAnalytics.isLunevaEvent);

  return {
    active_visitors: Object.keys(visitors).length,
    active_sessions: lunevaSessions.length,
    recent_events: lunevaEvents.slice(0, 20)
  };
}

module.exports = {
  LUNEVA_SLUG_PREFIX,
  isLunevaOrder,
  normalizeSource,
  fetchLunevaEvents,
  fetchLunevaOrders,
  fetchLunevaSessions,
  calcEngagedDurationSeconds,
  getDashboard,
  getRealtime,
  getCustomers,
  getVisitors,
  getCountryAnalytics,
  getTrafficAnalytics
};
