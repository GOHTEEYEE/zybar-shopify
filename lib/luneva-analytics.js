/**
 * LUNEVA-scoped analytics queries — isolated from ZYBAR Automotive metrics.
 */

const LUNEVA_SLUG_PREFIX = 'luneva-';

function eventQuantity(ev) {
  const q = Number(ev && ev.quantity);
  if (Number.isFinite(q) && q > 0) return Math.round(q);
  const mq = ev && ev.metadata && Number(ev.metadata.quantity);
  if (Number.isFinite(mq) && mq > 0) return Math.round(mq);
  return 1;
}

function isLunevaOrder(row) {
  if (!row || typeof row !== 'object') return false;
  const slug = String(row.product_slug || '');
  if (slug.indexOf(LUNEVA_SLUG_PREFIX) === 0) return true;
  const items = row.line_items;
  if (!Array.isArray(items)) return false;
  return items.some(function (item) {
    const s = String(
      (item && (item.slug || item.productSlug || item.product_slug)) || ''
    );
    return s.indexOf(LUNEVA_SLUG_PREFIX) === 0;
  });
}

function lunevaEventFilter() {
  return 'collection_id.eq.luneva,page_url.ilike.%/luneva%,product_id.ilike.luneva-%';
}

async function fetchLunevaEvents(supabase, range, opts) {
  const options = opts || {};
  let query = supabase
    .from('events')
    .select(
      'id,event_type,visitor_id,session_id,product_id,page_url,collection_id,metadata,quantity,created_at'
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
    .select('id,visitor_id,started_at,landing_page,country,device_type,traffic_source')
    .gte('started_at', range.start)
    .lt('started_at', range.end)
    .ilike('landing_page', '%/luneva%')
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
        quantity: eventQuantity(ev),
        created_at: ev.created_at
      };
    }),
    range: range
  };
}

async function getCustomers(supabase, range) {
  const orders = await fetchLunevaOrders(supabase, range);
  const byEmail = {};
  orders.forEach(function (order) {
    const email = String(order.customer_email || '').trim().toLowerCase();
    if (!email) return;
    if (!byEmail[email]) {
      byEmail[email] = {
        email: email,
        name: order.customer_name || '',
        phone: order.customer_phone || '',
        orders: 0,
        revenue_cents: 0,
        last_order_at: order.created_at,
        country: order.country || ''
      };
    }
    byEmail[email].orders += 1;
    byEmail[email].revenue_cents += Number(order.amount_total_cents) || 0;
    if (order.created_at > byEmail[email].last_order_at) {
      byEmail[email].last_order_at = order.created_at;
      if (order.customer_name) byEmail[email].name = order.customer_name;
    }
  });
  return Object.values(byEmail).sort(function (a, b) {
    return String(b.last_order_at).localeCompare(String(a.last_order_at));
  });
}

module.exports = {
  LUNEVA_SLUG_PREFIX,
  isLunevaOrder,
  fetchLunevaEvents,
  fetchLunevaOrders,
  getDashboard,
  getCustomers
};
