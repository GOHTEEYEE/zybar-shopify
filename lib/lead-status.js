/**
 * Shared lead funnel status (Subscriber → Customer).
 * Status is always derived from real events / carts / orders — never stored as funnel status.
 */

const LEAD_STATUSES = [
  { key: 'subscriber', label: 'Subscriber' },
  { key: 'browsing', label: 'Browsing' },
  { key: 'cart', label: 'Cart' },
  { key: 'checkout', label: 'Checkout' },
  { key: 'customer', label: 'Customer' }
];

const LEAD_STATUS_KEYS = LEAD_STATUSES.map(function (s) {
  return s.key;
});

function productName(slug) {
  if (!slug) return null;
  return String(slug)
    .replace(/-/g, ' ')
    .replace(/\b\w/g, function (c) {
      return c.toUpperCase();
    });
}

function isValidLeadStatus(status) {
  return LEAD_STATUS_KEYS.indexOf(String(status || '').toLowerCase()) !== -1;
}

/**
 * Same priority rules used by workflows and campaigns.
 * @param {{ hasPurchase: boolean, hasCheckout: boolean, hasAddToCart: boolean, hasProductView: boolean }} flags
 * @param {{ status?: string, item_count?: number }|null} latestCart
 */
function deriveLeadStatus(flags, latestCart) {
  flags = flags || {};
  if (flags.hasPurchase) return 'customer';
  if (flags.hasCheckout || (latestCart && latestCart.status === 'checkout_started')) return 'checkout';
  if (flags.hasAddToCart || (latestCart && (latestCart.item_count || 0) > 0)) return 'cart';
  if (flags.hasProductView) return 'browsing';
  return 'subscriber';
}

function emptyFlags() {
  return {
    hasProductView: false,
    hasAddToCart: false,
    hasCheckout: false,
    hasPurchase: false
  };
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Load campaign-eligible newsletter leads (active subscribers).
 */
async function listActiveLeads(supabase, options) {
  options = options || {};
  const limit = Math.min(Math.max(parseInt(options.limit, 10) || 5000, 1), 10000);
  let query = supabase
    .from('newsletter_subscribers')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (options.excludeUnsubscribed !== false) {
    query = query.neq('status', 'unsubscribed');
  }

  const result = await query;
  if (result.error) {
    // Older schemas may not have subscription status column.
    if (/status|column/i.test(String(result.error.message || ''))) {
      const fallback = await supabase
        .from('newsletter_subscribers')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (fallback.error) throw fallback.error;
      return fallback.data || [];
    }
    throw result.error;
  }
  return result.data || [];
}

async function fetchInChunks(supabase, table, select, column, values, extra) {
  const unique = Array.from(
    new Set(
      (values || []).filter(function (v) {
        return v != null && String(v).trim() !== '';
      })
    )
  );
  if (!unique.length) return [];
  const rows = [];
  const parts = chunk(unique, 100);
  for (const part of parts) {
    let q = supabase.from(table).select(select).in(column, part);
    if (extra) q = extra(q);
    const res = await q;
    if (res.error) throw res.error;
    rows.push.apply(rows, res.data || []);
  }
  return rows;
}

/**
 * Batch-classify leads with the same rules as getLeadJourneySnapshot.
 * Returns Map-like object: { [leadId]: { status, lead, ... } }
 */
async function classifyLeadsBatch(supabase, leads) {
  leads = leads || [];
  const byId = {};
  if (!supabase || !leads.length) return byId;

  const visitorIds = leads
    .map(function (l) {
      return l.visitor_id;
    })
    .filter(Boolean);
  const emails = leads
    .map(function (l) {
      return String(l.email || '')
        .trim()
        .toLowerCase();
    })
    .filter(Boolean);

  const [events, carts, orders] = await Promise.all([
    fetchInChunks(
      supabase,
      'events',
      'event_type,product_id,created_at,visitor_id',
      'visitor_id',
      visitorIds,
      function (q) {
        return q
          .in('event_type', ['product_view', 'add_to_cart', 'begin_checkout', 'purchase', 'payment_success'])
          .limit(5000);
      }
    ),
    fetchInChunks(
      supabase,
      'cart_sessions',
      'id,visitor_id,status,cart_value_cents,item_count,last_activity_at',
      'visitor_id',
      visitorIds,
      function (q) {
        return q.order('last_activity_at', { ascending: false }).limit(2000);
      }
    ),
    fetchInChunks(
      supabase,
      'orders',
      'id,customer_name,customer_email,amount_total_cents,created_at,status,product_slug,size,line_items',
      'customer_email',
      emails,
      function (q) {
        return q.order('created_at', { ascending: false }).limit(2000);
      }
    )
  ]);

  const eventsByVisitor = {};
  events.forEach(function (ev) {
    const vid = ev.visitor_id;
    if (!vid) return;
    if (!eventsByVisitor[vid]) eventsByVisitor[vid] = [];
    eventsByVisitor[vid].push(ev);
  });

  const latestCartByVisitor = {};
  carts.forEach(function (cart) {
    const vid = cart.visitor_id;
    if (!vid) return;
    if (!latestCartByVisitor[vid]) latestCartByVisitor[vid] = cart;
  });

  const ordersByEmail = {};
  orders.forEach(function (order) {
    const key = String(order.customer_email || '')
      .trim()
      .toLowerCase();
    if (!key) return;
    if (!ordersByEmail[key]) ordersByEmail[key] = [];
    ordersByEmail[key].push(order);
  });

  leads.forEach(function (lead) {
    const visitorId = lead.visitor_id || null;
    const emailKey = String(lead.email || '')
      .trim()
      .toLowerCase();
    const leadEvents = (visitorId && eventsByVisitor[visitorId]) || [];
    const latestCart = (visitorId && latestCartByVisitor[visitorId]) || null;
    const leadOrders = (emailKey && ordersByEmail[emailKey]) || [];

    const flags = emptyFlags();
    flags.hasPurchase = leadOrders.length > 0;
    const viewedProducts = {};
    let lastEvent = null;

    leadEvents
      .slice()
      .reverse()
      .forEach(function (ev) {
        if (!lastEvent || String(ev.created_at || '') > String(lastEvent.created_at || '')) {
          lastEvent = ev;
        }
        if (ev.event_type === 'product_view') {
          flags.hasProductView = true;
          if (ev.product_id) viewedProducts[ev.product_id] = true;
        }
        if (ev.event_type === 'add_to_cart') flags.hasAddToCart = true;
        if (ev.event_type === 'begin_checkout') flags.hasCheckout = true;
        if (ev.event_type === 'purchase' || ev.event_type === 'payment_success') {
          flags.hasPurchase = true;
        }
      });

    const status = deriveLeadStatus(flags, latestCart);
    byId[lead.id] = {
      lead: lead,
      status: status,
      last_activity_at:
        (lastEvent && lastEvent.created_at) ||
        (latestCart && latestCart.last_activity_at) ||
        (leadOrders[0] && leadOrders[0].created_at) ||
        lead.created_at,
      last_activity_type:
        (lastEvent && lastEvent.event_type) || (leadOrders[0] ? 'purchase' : 'email_signup'),
      viewed_products: Object.keys(viewedProducts).map(function (slug) {
        return { product_id: slug, product_name: productName(slug) };
      }),
      cart_value_cents: (latestCart && latestCart.cart_value_cents) || 0,
      cart_products: [],
      orders: leadOrders,
      revenue_cents: leadOrders.reduce(function (sum, order) {
        return sum + (Number(order.amount_total_cents) || 0);
      }, 0)
    };
  });

  return byId;
}

/**
 * Full snapshot for a single lead (used at send-time / workflow condition checks).
 */
async function getLeadJourneySnapshot(supabase, lead) {
  if (!supabase || !lead) return null;
  const visitorId = lead.visitor_id || null;
  const email = lead.email || null;

  const queries = [];
  if (visitorId) {
    queries.push(
      supabase
        .from('events')
        .select('event_type,product_id,created_at')
        .eq('visitor_id', visitorId)
        .in('event_type', ['product_view', 'add_to_cart', 'begin_checkout', 'purchase', 'payment_success'])
        .order('created_at', { ascending: false })
        .limit(200)
    );
    queries.push(
      supabase
        .from('cart_sessions')
        .select('id,status,cart_value_cents,item_count,last_activity_at')
        .eq('visitor_id', visitorId)
        .order('last_activity_at', { ascending: false })
        .limit(5)
    );
    queries.push(
      supabase
        .from('cart_session_items')
        .select('*, cart_sessions!inner(visitor_id)')
        .eq('cart_sessions.visitor_id', visitorId)
        .limit(100)
    );
  } else {
    queries.push(Promise.resolve({ data: [], error: null }));
    queries.push(Promise.resolve({ data: [], error: null }));
    queries.push(Promise.resolve({ data: [], error: null }));
  }

  if (email) {
    queries.push(
      supabase
        .from('orders')
        .select('id,customer_name,customer_email,amount_total_cents,created_at,status,product_slug,size,line_items')
        .eq('customer_email', email)
        .order('created_at', { ascending: false })
        .limit(20)
    );
  } else {
    queries.push(Promise.resolve({ data: [], error: null }));
  }

  const results = await Promise.all(queries);
  const eventsRes = results[0];
  const cartsRes = results[1];
  const cartItemsRes = results[2];
  const ordersRes = results[3];

  if (eventsRes.error) throw eventsRes.error;
  if (cartsRes.error) throw cartsRes.error;
  if (ordersRes.error) throw ordersRes.error;

  let cartItems = cartItemsRes.data || [];
  if (cartItemsRes.error && visitorId) {
    const cartIds = (cartsRes.data || []).map(function (c) {
      return c.id;
    });
    if (cartIds.length) {
      const fallback = await supabase.from('cart_session_items').select('*').in('cart_id', cartIds);
      if (fallback.error) throw fallback.error;
      cartItems = fallback.data || [];
    }
  }

  const events = eventsRes.data || [];
  const carts = cartsRes.data || [];
  const orders = ordersRes.data || [];
  const latestCart = carts[0] || null;

  const flags = emptyFlags();
  flags.hasPurchase = orders.length > 0;
  const viewedProducts = {};
  let lastEvent = null;

  events
    .slice()
    .reverse()
    .forEach(function (ev) {
      if (!lastEvent || String(ev.created_at || '') > String(lastEvent.created_at || '')) {
        lastEvent = ev;
      }
      if (ev.event_type === 'product_view') {
        flags.hasProductView = true;
        if (!viewedProducts[ev.product_id || '']) viewedProducts[ev.product_id || ''] = true;
      }
      if (ev.event_type === 'add_to_cart') flags.hasAddToCart = true;
      if (ev.event_type === 'begin_checkout') flags.hasCheckout = true;
      if (ev.event_type === 'purchase' || ev.event_type === 'payment_success') flags.hasPurchase = true;
    });

  const status = deriveLeadStatus(flags, latestCart);
  const activeCartId = latestCart ? latestCart.id : null;
  const activeCartItems = (cartItems || []).filter(function (item) {
    return item.cart_id === activeCartId;
  });

  return {
    lead: lead,
    status: status,
    last_activity_at:
      (lastEvent && lastEvent.created_at) ||
      (latestCart && latestCart.last_activity_at) ||
      (orders[0] && orders[0].created_at) ||
      lead.created_at,
    last_activity_type:
      (lastEvent && lastEvent.event_type) || (orders[0] ? 'purchase' : 'email_signup'),
    viewed_products: Object.keys(viewedProducts).map(function (slug) {
      return { product_id: slug, product_name: productName(slug) };
    }),
    cart_value_cents: (latestCart && latestCart.cart_value_cents) || 0,
    cart_products: activeCartItems.map(function (item) {
      return {
        product_id: item.product_id,
        product_name: item.product_name || productName(item.product_id),
        variant: [item.variant, item.size, item.power_type, item.led_color].filter(Boolean).join(' / '),
        size: item.size || null,
        options: [item.power_type, item.led_color].filter(Boolean),
        quantity: item.quantity || 1,
        unit_price_cents: item.unit_price_cents || 0
      };
    }),
    orders: orders,
    revenue_cents: orders.reduce(function (sum, order) {
      return sum + (Number(order.amount_total_cents) || 0);
    }, 0)
  };
}

async function getAudienceCounts(supabase) {
  const leads = await listActiveLeads(supabase);
  const classified = await classifyLeadsBatch(supabase, leads);
  const counts = {};
  LEAD_STATUS_KEYS.forEach(function (key) {
    counts[key] = 0;
  });
  Object.keys(classified).forEach(function (id) {
    const status = classified[id].status;
    if (counts[status] != null) counts[status] += 1;
  });
  return {
    total: leads.length,
    audiences: LEAD_STATUSES.map(function (s) {
      return {
        key: s.key,
        label: s.label,
        count: counts[s.key] || 0
      };
    })
  };
}

async function listLeadsByStatus(supabase, status, options) {
  const normalized = String(status || '')
    .trim()
    .toLowerCase();
  if (!isValidLeadStatus(normalized)) {
    throw new Error('Invalid lead status audience: ' + status);
  }
  const leads = await listActiveLeads(supabase, options);
  const classified = await classifyLeadsBatch(supabase, leads);
  return leads
    .filter(function (lead) {
      const snap = classified[lead.id];
      return snap && snap.status === normalized;
    })
    .map(function (lead) {
      const snap = classified[lead.id];
      return {
        id: lead.id,
        email: lead.email,
        country: lead.country || null,
        language: lead.language || null,
        discount_code: lead.discount_code || null,
        signup_at: lead.created_at,
        source: lead.source || null,
        visitor_id: lead.visitor_id || null,
        status: snap.status,
        last_activity_at: snap.last_activity_at,
        purchased: snap.status === 'customer',
        order_count: (snap.orders || []).length,
        revenue_cents: snap.revenue_cents || 0
      };
    });
}

module.exports = {
  LEAD_STATUSES,
  LEAD_STATUS_KEYS,
  isValidLeadStatus,
  deriveLeadStatus,
  productName,
  listActiveLeads,
  classifyLeadsBatch,
  getLeadJourneySnapshot,
  getAudienceCounts,
  listLeadsByStatus
};
