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

/** Gaps longer than this are treated as a new visit cluster (not continuous stay). */
const ENGAGED_GAP_MS = 2 * 60 * 1000;
/** Single-hit / near-instant exits show as 1s in admin. */
const BOUNCE_DURATION_SECONDS = 1;

function formatProductLabel(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (s.indexOf(' ') !== -1 && s.indexOf('luneva-') !== 0) return s;
  return s
    .replace(/^luneva-/i, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, function (c) {
      return c.toUpperCase();
    });
}

function extractLunevaSlug(urlOrId) {
  const s = String(urlOrId || '');
  const fromPath = s.match(/\/products\/(luneva-[^/?#]+)/i);
  if (fromPath) return fromPath[1].toLowerCase();
  if (/^luneva-[a-z0-9-]+$/i.test(s.trim())) return s.trim().toLowerCase();
  return null;
}

function pagePathLabel(pageUrl) {
  const raw = String(pageUrl || '').trim();
  if (!raw) return 'Page';
  let path = raw;
  try {
    if (/^https?:\/\//i.test(raw)) path = new URL(raw).pathname || '/';
  } catch (_) {
    path = raw.split('?')[0];
  }
  path = path.replace(/\/+$/, '') || '/';
  const slug = extractLunevaSlug(path);
  if (slug) return 'Product · ' + formatProductLabel(slug);
  if (/\/luneva\/cart/i.test(path)) return 'Cart';
  if (/\/luneva\/checkout|\/checkout/i.test(path)) return 'Checkout';
  if (/\/luneva\/contact/i.test(path)) return 'Contact';
  if (/\/luneva\/?$/i.test(path) || path === '/luneva' || path === '/luneva/index.html') {
    return 'Homepage';
  }
  if (/\/luneva\//i.test(path)) {
    const leaf = path.split('/').filter(Boolean).pop() || 'LUNEVA';
    return leaf
      .replace(/\.html$/i, '')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, function (c) {
        return c.toUpperCase();
      });
  }
  return path;
}

function eventTimelineLabel(ev) {
  const type = String(ev && ev.event_type || '');
  const slug =
    extractLunevaSlug(ev && ev.product_id) ||
    extractLunevaSlug(ev && ev.page_url) ||
    null;
  const product = formatProductLabel(
    (ev && ev.metadata && (ev.metadata.product_name || ev.metadata.name)) || slug
  );
  const kit =
    ev &&
    ev.metadata &&
    (ev.metadata.size || ev.metadata.kit || ev.metadata.sizeLabel);

  if (type === 'page_view') return pagePathLabel(ev.page_url);
  if (type === 'product_view') return 'Viewed · ' + (product || 'Product');
  if (type === 'collection_view') return 'Collection';
  if (type === 'add_to_cart') {
    return 'Added to cart · ' + (product || 'Product') + (kit ? ' (' + kit + ')' : '');
  }
  if (type === 'begin_checkout') return 'Started checkout';
  if (type === 'purchase' || type === 'payment_success' || type === 'checkout_completed') {
    return 'Purchase' + (product ? ' · ' + product : '');
  }
  if (type === 'variant_selected') {
    return 'Selected kit · ' + (kit || product || 'Variant');
  }
  return type.replace(/_/g, ' ');
}

function buildPageDwells(events) {
  const navTypes = {
    page_view: true,
    product_view: true,
    collection_view: true
  };
  const sorted = (events || [])
    .filter(function (ev) {
      return navTypes[ev.event_type] || (ev.page_url && ev.event_type === 'page_view');
    })
    .slice()
    .sort(function (a, b) {
      return String(a.created_at || '').localeCompare(String(b.created_at || ''));
    });

  const pages = [];
  for (let i = 0; i < sorted.length; i++) {
    const ev = sorted[i];
    const next = sorted[i + 1];
    const startMs = new Date(ev.created_at).getTime();
    let durationSeconds = BOUNCE_DURATION_SECONDS;
    if (next && Number.isFinite(startMs)) {
      const gap = new Date(next.created_at).getTime() - startMs;
      if (gap > 0 && gap <= ENGAGED_GAP_MS) {
        durationSeconds = Math.max(BOUNCE_DURATION_SECONDS, Math.round(gap / 1000));
      } else if (gap > ENGAGED_GAP_MS) {
        durationSeconds = BOUNCE_DURATION_SECONDS;
      }
    }
    const slug =
      extractLunevaSlug(ev.product_id) || extractLunevaSlug(ev.page_url) || null;
    pages.push({
      at: ev.created_at,
      event_type: ev.event_type,
      label: pagePathLabel(ev.page_url) || eventTimelineLabel(ev),
      page_url: ev.page_url || null,
      product_id: slug,
      duration_seconds: durationSeconds
    });
  }
  return pages;
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

    const productId = String(ev.product_id || '').trim();
    const metaName =
      (ev.metadata && (ev.metadata.product_name || ev.metadata.name)) || '';
    if (ev.event_type === 'product_view' && productId) {
      row.last_viewed_product_id = productId;
      row.last_viewed_product_name = metaName || productId;
      if (!row.viewed_product_ids) row.viewed_product_ids = {};
      row.viewed_product_ids[productId] = true;
    }
    if (ev.event_type === 'add_to_cart' && productId) {
      row.cart_product_id = productId;
      row.cart_product_name = metaName || productId;
      row.cart_kit =
        (ev.metadata && (ev.metadata.size || ev.metadata.kit || ev.metadata.sizeLabel)) ||
        null;
    }
    // Infer product from LUNEVA PDP URL when product_id missing.
    if (!productId && ev.page_url) {
      const m = String(ev.page_url).match(/\/products\/(luneva-[^/?#]+)/i);
      if (m) {
        if (ev.event_type === 'page_view' || ev.event_type === 'product_view') {
          row.last_viewed_product_id = m[1];
          row.last_viewed_product_name = m[1];
        }
      }
    }
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
    if (order.product_slug) {
      row.cart_product_id = row.cart_product_id || order.product_slug;
      row.cart_product_name = row.cart_product_name || order.product_slug;
    }
    noteActivity(row, order.created_at);
  });

  return Object.keys(map).map(function (visitorId) {
    const row = map[visitorId];
    row.status = deriveVisitorStatus(row);
    if (!row.traffic_source) row.traffic_source = 'Unknown';
    if (!row.country) row.country = 'Unknown';
    row.duration_seconds = calcEngagedDurationSeconds(row._activity_at);
    const rawProduct =
      row.cart_product_name ||
      row.last_viewed_product_name ||
      (row.viewed_product_ids ? Object.keys(row.viewed_product_ids)[0] : null) ||
      null;
    row.product_id = row.cart_product_id || row.last_viewed_product_id || null;
    row.product_label = formatProductLabel(rawProduct || row.product_id);
    if (row.cart_kit && row.product_label) {
      row.product_label = row.product_label + ' · ' + row.cart_kit;
    } else if (row.cart_kit && !row.product_label) {
      row.product_label = String(row.cart_kit);
    }
    row.viewed_count = row.viewed_product_ids
      ? Object.keys(row.viewed_product_ids).length
      : 0;
    delete row._activity_at;
    delete row.viewed_product_ids;
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
        row.status,
        row.product_label,
        row.product_id,
        row.cart_kit
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

async function getVisitorDetail(supabase, visitorId) {
  const id = String(visitorId || '').trim();
  if (!id) return null;

  const [sessionsRes, eventsRes, ordersRes, leadsRes, visitorRes] = await Promise.all([
    supabase
      .from('sessions')
      .select('*')
      .eq('visitor_id', id)
      .order('started_at', { ascending: false })
      .limit(50),
    supabase
      .from('events')
      .select(
        'id,event_type,visitor_id,session_id,product_id,page_url,collection_id,metadata,quantity,country,traffic_source,created_at'
      )
      .eq('visitor_id', id)
      .order('created_at', { ascending: true })
      .limit(400),
    supabase
      .from('orders')
      .select(
        'id,stripe_session_id,customer_email,customer_name,customer_phone,product_slug,line_items,amount_total_cents,quantity,status,fulfillment_status,country,created_at,visitor_id,payment_method'
      )
      .eq('visitor_id', id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('newsletter_subscribers')
      .select('*')
      .eq('visitor_id', id)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase.from('analytics_visitors').select('*').eq('visitor_id', id).maybeSingle()
  ]);

  if (sessionsRes.error) throw sessionsRes.error;
  if (eventsRes.error) throw eventsRes.error;
  if (ordersRes.error) throw ordersRes.error;

  let leads = leadsRes.data || [];
  if (leadsRes.error && /visitor_id|column|brand/i.test(String(leadsRes.error.message || ''))) {
    leads = [];
  }

  const allSessions = sessionsRes.data || [];
  const sessions = allSessions.filter(function (s) {
    return BrandAnalytics.isLunevaSession(s) || !s.landing_page;
  });
  const sessionsUse = sessions.length ? sessions : allSessions;

  let events = (eventsRes.data || []).filter(function (ev) {
    return BrandAnalytics.isLunevaEvent(ev);
  });
  if (!events.length && eventsRes.data && eventsRes.data.length) {
    // Visitor may only have generic page_views without brand markers — keep all.
    events = eventsRes.data;
  }

  const orders = (ordersRes.data || []).filter(isLunevaOrder);
  const visitor = visitorRes.data || { visitor_id: id };
  const latestSession = sessionsUse[0] || {};
  const order = orders[0] || null;
  const lead = leads[0] || null;

  if (!leads.length && order && order.customer_email) {
    const byEmail = await supabase
      .from('newsletter_subscribers')
      .select('*')
      .ilike('email', String(order.customer_email).trim())
      .limit(5);
    leads = byEmail.data || [];
  }

  const flags = {
    has_page_view: false,
    has_product_view: false,
    has_add_to_cart: false,
    has_checkout: false,
    has_purchase: orders.length > 0
  };
  const viewedMap = {};
  let cartProduct = null;
  let cartKit = null;

  events.forEach(function (ev) {
    if (ev.event_type === 'page_view') flags.has_page_view = true;
    const slug =
      extractLunevaSlug(ev.product_id) || extractLunevaSlug(ev.page_url) || null;
    if (ev.event_type === 'product_view' || (ev.event_type === 'page_view' && slug)) {
      flags.has_product_view = true;
      const pid = slug || ev.product_id || 'unknown';
      if (!viewedMap[pid]) {
        viewedMap[pid] = {
          product_id: pid,
          product_name: formatProductLabel(
            (ev.metadata && (ev.metadata.product_name || ev.metadata.name)) || pid
          ),
          times_viewed: 0,
          first_viewed_at: ev.created_at,
          last_viewed_at: ev.created_at
        };
      }
      viewedMap[pid].times_viewed += 1;
      viewedMap[pid].last_viewed_at = ev.created_at;
    }
    if (ev.event_type === 'add_to_cart') {
      flags.has_add_to_cart = true;
      cartProduct =
        formatProductLabel(
          (ev.metadata && (ev.metadata.product_name || ev.metadata.name)) ||
            slug ||
            ev.product_id
        ) || cartProduct;
      cartKit =
        (ev.metadata && (ev.metadata.size || ev.metadata.kit || ev.metadata.sizeLabel)) ||
        cartKit;
    }
    if (ev.event_type === 'begin_checkout') flags.has_checkout = true;
    if (
      ev.event_type === 'purchase' ||
      ev.event_type === 'payment_success' ||
      ev.event_type === 'checkout_completed'
    ) {
      flags.has_purchase = true;
    }
  });

  if (order && order.product_slug) {
    cartProduct = cartProduct || formatProductLabel(order.product_slug);
  }

  const statusRow = {
    orders: orders.length,
    begin_checkout: flags.has_checkout ? 1 : 0,
    add_to_cart: flags.has_add_to_cart ? 1 : 0,
    page_views: flags.has_page_view || flags.has_product_view ? 1 : 0
  };
  const status = deriveVisitorStatus(statusRow);

  const journeySteps = [
    { id: 'homepage', label: 'Homepage', at: null },
    { id: 'product', label: 'Product', at: null },
    { id: 'variant', label: 'Kit selected', at: null },
    { id: 'cart', label: 'Added to cart', at: null },
    { id: 'checkout', label: 'Checkout', at: null },
    { id: 'payment', label: 'Payment', at: null },
    { id: 'purchase', label: 'Purchase', at: null }
  ];

  events.forEach(function (ev) {
    const t = ev.created_at;
    const path = String(ev.page_url || '');
    const slug = extractLunevaSlug(ev.product_id) || extractLunevaSlug(path);

    if (
      ev.event_type === 'page_view' &&
      (/\/luneva\/?$/i.test(path.replace(/\/+$/, '') + '/') ||
        /\/luneva\/?(index\.html)?$/i.test(path) ||
        path === '/luneva')
    ) {
      if (!journeySteps[0].at) journeySteps[0].at = t;
    }
    if (
      ev.event_type === 'product_view' ||
      (ev.event_type === 'page_view' && slug) ||
      (path && /\/products\/luneva-/i.test(path))
    ) {
      if (!journeySteps[1].at) journeySteps[1].at = t;
    }
    if (ev.event_type === 'variant_selected') {
      if (!journeySteps[2].at) journeySteps[2].at = t;
    }
    if (ev.event_type === 'add_to_cart') {
      if (!journeySteps[3].at) journeySteps[3].at = t;
    }
    if (ev.event_type === 'begin_checkout' || /checkout/i.test(path)) {
      if (!journeySteps[4].at) journeySteps[4].at = t;
    }
    if (ev.event_type === 'payment_started' || ev.event_type === 'shipping_selected') {
      if (!journeySteps[5].at) journeySteps[5].at = t;
    }
    if (
      ev.event_type === 'purchase' ||
      ev.event_type === 'payment_success' ||
      ev.event_type === 'checkout_completed'
    ) {
      if (!journeySteps[6].at) journeySteps[6].at = t;
    }
  });
  if (order && !journeySteps[6].at) journeySteps[6].at = order.created_at;
  if (order && !journeySteps[5].at) journeySteps[5].at = order.created_at;
  if (order && !journeySteps[4].at) journeySteps[4].at = order.created_at;

  const activityTimes = [];
  sessionsUse.forEach(function (s) {
    if (s.started_at) activityTimes.push(s.started_at);
  });
  events.forEach(function (ev) {
    if (ev.created_at) activityTimes.push(ev.created_at);
  });
  orders.forEach(function (o) {
    if (o.created_at) activityTimes.push(o.created_at);
  });

  const firstVisit =
    visitor.first_seen_at ||
    (activityTimes.length
      ? activityTimes.slice().sort()[0]
      : latestSession.started_at) ||
    null;
  const lastVisit =
    visitor.last_seen_at ||
    (activityTimes.length
      ? activityTimes.slice().sort().reverse()[0]
      : latestSession.last_activity_at) ||
    null;

  const ua = latestSession.user_agent || '';
  const os = /Mac OS X|Macintosh/.test(ua)
    ? 'macOS'
    : /Windows/.test(ua)
      ? 'Windows'
      : /Android/.test(ua)
        ? 'Android'
        : /iPhone|iPad|iOS/.test(ua)
          ? 'iOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : null;

  const pages = buildPageDwells(events);
  // Attach dwell onto viewed products from consecutive page dwells.
  pages.forEach(function (p) {
    if (!p.product_id || !viewedMap[p.product_id]) return;
    viewedMap[p.product_id].time_spent_seconds =
      (viewedMap[p.product_id].time_spent_seconds || 0) + (p.duration_seconds || 0);
  });

  const statusLabelMap = {
    purchased: 'Purchased',
    checkout_started: 'Checkout started',
    added_to_cart: 'Added to cart',
    browsing: flags.has_product_view ? 'Product viewed' : 'Browsing',
    visited: 'Visited'
  };

  return {
    visitor_id: id,
    status: status,
    status_label: statusLabelMap[status] || status,
    customer: {
      name: (order && order.customer_name) || (lead && lead.name) || null,
      email: (order && order.customer_email) || (lead && lead.email) || null,
      phone: (order && order.customer_phone) || null,
      country: (order && order.country) || latestSession.country || visitor.country || null,
      city: null,
      language: (lead && lead.language) || null,
      traffic_source: normalizeSource(
        latestSession.traffic_source || latestSession.utm_source || visitor.first_traffic_source
      ),
      utm_source: latestSession.utm_source || null,
      utm_campaign: latestSession.utm_campaign || null,
      device: latestSession.device_type || visitor.device_type || null,
      browser: latestSession.browser || visitor.browser || null,
      os: os,
      first_visit: firstVisit,
      last_visit: lastVisit,
      session_count: visitor.session_count || sessionsUse.length || 0,
      duration_seconds: calcEngagedDurationSeconds(activityTimes)
    },
    product: {
      current: cartProduct || (Object.keys(viewedMap)[0]
        ? viewedMap[Object.keys(viewedMap).sort(function (a, b) {
            return String(viewedMap[b].last_viewed_at).localeCompare(
              String(viewedMap[a].last_viewed_at)
            );
          })[0]].product_name
        : null),
      kit: cartKit,
      viewed: Object.keys(viewedMap)
        .map(function (k) {
          return viewedMap[k];
        })
        .sort(function (a, b) {
          return String(b.last_viewed_at).localeCompare(String(a.last_viewed_at));
        })
    },
    pages: pages,
    journey: journeySteps,
    timeline: events.map(function (ev) {
      return {
        at: ev.created_at,
        event_type: ev.event_type,
        label: eventTimelineLabel(ev),
        product_id: ev.product_id || null,
        page_url: ev.page_url || null
      };
    }),
    orders: orders,
    email_leads: leads
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
  getVisitorDetail,
  getCountryAnalytics,
  getTrafficAnalytics
};
