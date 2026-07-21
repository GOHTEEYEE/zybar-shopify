/**
 * Customer Activity — aggregate visitor journeys from existing analytics tables.
 */
const ABANDONED_HOURS = Math.max(
  1,
  parseInt(process.env.CUSTOMER_ABANDONED_HOURS || '24', 10) || 24
);
const INACTIVE_HOURS = Math.max(
  ABANDONED_HOURS,
  parseInt(process.env.CUSTOMER_INACTIVE_HOURS || '72', 10) || 72
);

function hoursSince(iso) {
  if (!iso) return null;
  var t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return (Date.now() - t) / 3600000;
}

function maskIp(ip) {
  if (!ip) return null;
  var s = String(ip).trim();
  if (!s) return null;
  if (s.indexOf(':') !== -1) {
    var parts = s.split(':');
    return parts.slice(0, 3).join(':') + ':*';
  }
  var octets = s.split('.');
  if (octets.length === 4) return octets[0] + '.' + octets[1] + '.' + octets[2] + '.xxx';
  return s.slice(0, Math.max(4, s.length - 3)) + '…';
}

function normalizeSource(raw) {
  var s = String(raw || '')
    .toLowerCase()
    .trim();
  if (!s || s === '—' || s === 'none') return 'Unknown';
  if (s === 'direct' || s === '(direct)') return 'Direct';
  if (s.indexOf('facebook') !== -1 || s === 'fb' || s === 'meta') return 'Facebook';
  if (s.indexOf('instagram') !== -1 || s === 'ig') return 'Instagram';
  if (s.indexOf('google') !== -1 || s === 'gads' || s === 'adwords' || s === 'cpc') return 'Google';
  if (s.indexOf('tiktok') !== -1 || s === 'tt') return 'TikTok';
  if (s === 'referral' || s.indexOf('refer') !== -1) return 'Referral';
  return 'Unknown';
}

function productName(slug) {
  if (!slug) return null;
  return String(slug)
    .replace(/-/g, ' ')
    .replace(/\b\w/g, function (c) {
      return c.toUpperCase();
    });
}

function eventLabel(ev) {
  var type = String(ev.event_type || '');
  var meta = ev.metadata || {};
  var product = productName(ev.product_id) || ev.product_id;
  switch (type) {
    case 'page_view':
      if (ev.page_url && String(ev.page_url).indexOf('/collections') !== -1) return 'Viewed Collection';
      if (ev.page_url === '/' || ev.page_url === '') return 'Visited Homepage';
      return 'Viewed Page';
    case 'product_view':
      return product ? 'Viewed ' + product : 'Product Viewed';
    case 'collection_view':
      return 'Viewed Collection';
    case 'variant_selected':
      return 'Changed Variant' + (meta.size ? ' (' + meta.size + ')' : '');
    case 'add_to_cart':
      return product ? 'Added ' + product + ' To Cart' : 'Added To Cart';
    case 'remove_from_cart':
      return 'Removed From Cart';
    case 'begin_checkout':
      return 'Started Checkout';
    case 'shipping_selected':
      return 'Selected Shipping' + (meta.shipping_method ? ' (' + meta.shipping_method + ')' : '');
    case 'payment_started':
      return 'Entered Payment';
    case 'discount_claimed':
    case 'newsletter_signup':
      return 'Applied / Claimed Discount';
    case 'email_submitted':
      return 'Submitted Email';
    case 'purchase':
    case 'checkout_completed':
    case 'payment_success':
      return 'Purchased';
    case 'popup_viewed':
      return 'Saw Promo Popup';
    case 'popup_closed':
      return 'Closed Promo Popup';
    case 'contact_submit':
      return 'Submitted Contact Form';
    case 'search':
      return 'Searched';
    default:
      return type.replace(/_/g, ' ');
  }
}

function deriveStatus(ctx) {
  var hours = hoursSince(ctx.last_activity_at);
  if (ctx.has_purchase) return 'purchased';
  if (ctx.cart_status === 'abandoned' || (ctx.has_add_to_cart && !ctx.has_purchase && hours != null && hours >= ABANDONED_HOURS)) {
    return 'abandoned';
  }
  if (ctx.has_checkout || ctx.cart_status === 'checkout_started') return 'checkout_started';
  if (ctx.has_add_to_cart || (ctx.cart_item_count || 0) > 0) return 'added_to_cart';
  if (ctx.has_product_view) return 'product_viewed';
  if (hours != null && hours >= INACTIVE_HOURS) return 'inactive';
  if (ctx.email) return 'browsing';
  return ctx.has_page_view ? 'browsing' : 'anonymous';
}

function parseRange(query) {
  query = query || {};

  // Full ISO instants from the admin UI carry the user's local midnight already;
  // use them verbatim (end is exclusive) instead of recomputing presets in the
  // server's timezone.
  var rawStart = query.start ? String(query.start) : '';
  var rawEnd = query.end ? String(query.end) : '';
  if (rawStart.indexOf('T') !== -1 && rawEnd.indexOf('T') !== -1) {
    var exactStart = new Date(rawStart);
    var exactEnd = new Date(rawEnd);
    if (!isNaN(exactStart.getTime()) && !isNaN(exactEnd.getTime())) {
      return { start: exactStart.toISOString(), end: exactEnd.toISOString() };
    }
  }

  var end = query.end ? new Date(query.end) : new Date();
  end.setHours(23, 59, 59, 999);
  var preset = String(query.preset || query.range || '30');
  var start;
  if (preset === 'today') {
    start = new Date(end);
    start.setHours(0, 0, 0, 0);
  } else if (preset === 'yesterday') {
    start = new Date(end);
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    end = new Date(start);
    end.setHours(23, 59, 59, 999);
  } else if (preset === 'month') {
    start = new Date(end.getFullYear(), end.getMonth(), 1);
  } else if (preset === 'year') {
    start = new Date(end.getFullYear(), 0, 1);
  } else if (preset === 'custom' && query.start) {
    start = new Date(query.start);
    start.setHours(0, 0, 0, 0);
  } else {
    var days = parseInt(preset, 10) || 30;
    start = new Date(end.getTime() - (days - 1) * 86400000);
    start.setHours(0, 0, 0, 0);
  }
  return { start: start.toISOString(), end: new Date(end.getTime() + 1).toISOString() };
}

async function listActivities(supabase, query) {
  var range = parseRange(query);
  var limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 40));
  var offset = Math.max(0, parseInt(query.offset, 10) || 0);
  var statusFilter = query.status ? String(query.status) : '';
  var countryFilter = query.country ? String(query.country).toUpperCase() : '';
  var trafficFilter = query.traffic ? normalizeSource(query.traffic) : '';
  var search = query.search ? String(query.search).trim().toLowerCase() : '';

  var visitorsRes = await supabase
    .from('analytics_visitors')
    .select(
      'visitor_id,first_seen_at,last_seen_at,first_traffic_source,country,device_type,browser,session_count,order_count,total_spent_cents'
    )
    .gte('last_seen_at', range.start)
    .lt('last_seen_at', range.end)
    .order('last_seen_at', { ascending: false })
    .range(offset, offset + limit * 3 - 1);

  if (visitorsRes.error) throw visitorsRes.error;
  var visitors = visitorsRes.data || [];
  var visitorIds = visitors.map(function (v) {
    return v.visitor_id;
  });

  // If search looks like an order id / Stripe session / email, expand visitor set via orders
  if (search && search.length >= 4) {
    var safe = search.replace(/[%(),]/g, '');
    var orderHit = await supabase
      .from('orders')
      .select('visitor_id,id,stripe_session_id,customer_email')
      .or('stripe_session_id.ilike.%' + safe + '%,customer_email.ilike.%' + safe + '%')
      .limit(40);
    var extraIds = (orderHit.data || [])
      .map(function (o) {
        return o.visitor_id;
      })
      .filter(Boolean);
    if (extraIds.length) {
      var extraVis = await supabase
        .from('analytics_visitors')
        .select(
          'visitor_id,first_seen_at,last_seen_at,first_traffic_source,country,device_type,browser,session_count,order_count,total_spent_cents'
        )
        .in('visitor_id', extraIds);
      (extraVis.data || []).forEach(function (v) {
        if (
          !visitors.some(function (x) {
            return x.visitor_id === v.visitor_id;
          })
        ) {
          visitors.push(v);
        }
      });
      visitorIds = visitors.map(function (v) {
        return v.visitor_id;
      });
    }
  }

  if (!visitors.length) {
    return { rows: [], total: 0, range: range, abandonedHours: ABANDONED_HOURS };
  }

  var [sessionsRes, cartsRes, ordersRes, leadsRes, eventsRes] = await Promise.all([
    supabase
      .from('sessions')
      .select('visitor_id,country,traffic_source,utm_source,utm_campaign,device_type,browser,started_at,last_activity_at,user_agent')
      .in('visitor_id', visitorIds)
      .order('started_at', { ascending: false })
      .limit(2000),
    supabase
      .from('cart_sessions')
      .select('id,visitor_id,status,cart_value_cents,item_count,last_activity_at,customer_id,metadata')
      .in('visitor_id', visitorIds)
      .order('last_activity_at', { ascending: false })
      .limit(1000),
    supabase
      .from('orders')
      .select('id,visitor_id,customer_name,customer_email,customer_phone,country,city,amount_total_cents,product_slug,status,created_at,stripe_session_id')
      .in('visitor_id', visitorIds)
      .order('created_at', { ascending: false })
      .limit(1000),
    supabase
      .from('newsletter_subscribers')
      .select('email,visitor_id,country,language,discount_code,source,created_at,purchased,order_count,revenue_cents')
      .in('visitor_id', visitorIds)
      .limit(1000),
    supabase
      .from('events')
      .select('visitor_id,event_type,product_id,created_at')
      .in('visitor_id', visitorIds)
      .in('event_type', ['product_view', 'add_to_cart', 'begin_checkout', 'page_view', 'purchase', 'payment_success'])
      .order('created_at', { ascending: false })
      .limit(4000)
  ]);

  // Graceful fallback if newsletter visitor_id column not migrated yet
  if (leadsRes.error && /visitor_id|column/i.test(String(leadsRes.error.message || ''))) {
    leadsRes = await supabase
      .from('newsletter_subscribers')
      .select('email,country,language,discount_code,source,created_at')
      .limit(1000);
    leadsRes.data = (leadsRes.data || []).map(function (l) {
      return Object.assign({ visitor_id: null, purchased: false, order_count: 0, revenue_cents: 0 }, l);
    });
  }

  var latestSession = {};
  (sessionsRes.data || []).forEach(function (s) {
    if (!latestSession[s.visitor_id]) latestSession[s.visitor_id] = s;
  });
  var latestCart = {};
  (cartsRes.data || []).forEach(function (c) {
    if (!latestCart[c.visitor_id]) latestCart[c.visitor_id] = c;
  });
  var ordersByVisitor = {};
  (ordersRes.data || []).forEach(function (o) {
    if (!ordersByVisitor[o.visitor_id]) ordersByVisitor[o.visitor_id] = [];
    ordersByVisitor[o.visitor_id].push(o);
  });
  var leadByVisitor = {};
  (leadsRes.data || []).forEach(function (l) {
    if (l.visitor_id && !leadByVisitor[l.visitor_id]) leadByVisitor[l.visitor_id] = l;
  });
  var flags = {};
  (eventsRes.data || []).forEach(function (ev) {
    var f = flags[ev.visitor_id] || (flags[ev.visitor_id] = {
      has_page_view: false,
      has_product_view: false,
      has_add_to_cart: false,
      has_checkout: false,
      has_purchase: false,
      last_product_id: null
    });
    if (ev.event_type === 'page_view') f.has_page_view = true;
    if (ev.event_type === 'product_view') {
      f.has_product_view = true;
      if (!f.last_product_id && ev.product_id) f.last_product_id = ev.product_id;
    }
    if (ev.event_type === 'add_to_cart') {
      f.has_add_to_cart = true;
      if (ev.product_id) f.last_product_id = ev.product_id;
    }
    if (ev.event_type === 'begin_checkout') f.has_checkout = true;
    if (ev.event_type === 'purchase' || ev.event_type === 'payment_success') f.has_purchase = true;
  });

  var rows = visitors.map(function (v) {
    var session = latestSession[v.visitor_id] || {};
    var cart = latestCart[v.visitor_id] || {};
    var orders = ordersByVisitor[v.visitor_id] || [];
    var lead = leadByVisitor[v.visitor_id] || null;
    var f = flags[v.visitor_id] || {};
    var order = orders[0] || null;
    var hasPurchase = !!(orders.length || f.has_purchase || (v.order_count || 0) > 0);
    var status = deriveStatus({
      has_purchase: hasPurchase,
      has_add_to_cart: f.has_add_to_cart,
      has_checkout: f.has_checkout,
      has_product_view: f.has_product_view,
      has_page_view: f.has_page_view,
      cart_status: cart.status,
      cart_item_count: cart.item_count,
      last_activity_at: v.last_seen_at,
      email: (order && order.customer_email) || (lead && lead.email) || cart.customer_id
    });
    var email = (order && order.customer_email) || (lead && lead.email) || null;
    var name = (order && order.customer_name) || (email ? email.split('@')[0] : null);
    var country = (order && order.country) || session.country || v.country || (lead && lead.country) || null;
    var traffic = normalizeSource(session.traffic_source || v.first_traffic_source);
    var productId = f.last_product_id || (order && order.product_slug) || null;
    return {
      activity_id: v.visitor_id,
      visitor_id: v.visitor_id,
      customer_name: name,
      email: email,
      country: country,
      traffic_source: traffic,
      status: status,
      current_product: productName(productId),
      current_product_id: productId,
      cart_value_cents: cart.cart_value_cents || 0,
      last_activity_at: v.last_seen_at,
      created_at: v.first_seen_at,
      session_count: v.session_count || 0,
      order_count: orders.length || v.order_count || 0,
      revenue_cents: orders.reduce(function (sum, o) {
        return sum + (Number(o.amount_total_cents) || 0);
      }, 0) || v.total_spent_cents || 0
    };
  });

  rows = rows.filter(function (r) {
    if (statusFilter && r.status !== statusFilter) return false;
    if (countryFilter && String(r.country || '').toUpperCase() !== countryFilter) return false;
    if (trafficFilter && r.traffic_source !== trafficFilter) return false;
    if (search) {
      var orderIds = (ordersByVisitor[r.visitor_id] || [])
        .map(function (o) {
          return [o.id, o.stripe_session_id].join(' ');
        })
        .join(' ');
      var blob = [r.email, r.customer_name, r.country, r.current_product, r.visitor_id, orderIds]
        .join(' ')
        .toLowerCase();
      if (blob.indexOf(search) === -1) return false;
    }
    return true;
  });

  return {
    rows: rows.slice(0, limit),
    total: rows.length,
    range: range,
    abandonedHours: ABANDONED_HOURS,
    offset: offset,
    limit: limit
  };
}

async function getActivityDetail(supabase, visitorId) {
  if (!visitorId) return null;

  var [visitorRes, sessionsRes, eventsRes, cartsRes, cartItemsRes, ordersRes, leadsRes] =
    await Promise.all([
      supabase.from('analytics_visitors').select('*').eq('visitor_id', visitorId).maybeSingle(),
      supabase
        .from('sessions')
        .select('*')
        .eq('visitor_id', visitorId)
        .order('started_at', { ascending: false })
        .limit(50),
      supabase
        .from('events')
        .select('*')
        .eq('visitor_id', visitorId)
        .order('created_at', { ascending: true })
        .limit(300),
      supabase
        .from('cart_sessions')
        .select('*')
        .eq('visitor_id', visitorId)
        .order('last_activity_at', { ascending: false })
        .limit(10),
      supabase
        .from('cart_session_items')
        .select('*, cart_sessions!inner(visitor_id)')
        .eq('cart_sessions.visitor_id', visitorId)
        .limit(100),
      supabase
        .from('orders')
        .select('*')
        .eq('visitor_id', visitorId)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('newsletter_subscribers')
        .select('*')
        .eq('visitor_id', visitorId)
        .order('created_at', { ascending: false })
        .limit(5)
    ]);

  if (leadsRes.error && /visitor_id|column/i.test(String(leadsRes.error.message || ''))) {
    leadsRes = { data: [], error: null };
  }

  // Fallback cart items if join syntax unsupported
  var cartItems = cartItemsRes.data;
  if (cartItemsRes.error || !cartItems) {
    var cartIds = (cartsRes.data || []).map(function (c) {
      return c.id;
    });
    if (cartIds.length) {
      var itemsOnly = await supabase.from('cart_session_items').select('*').in('cart_id', cartIds);
      cartItems = itemsOnly.data || [];
    } else {
      cartItems = [];
    }
  }

  var visitor = visitorRes.data || { visitor_id: visitorId };
  var sessions = sessionsRes.data || [];
  var events = eventsRes.data || [];
  var carts = cartsRes.data || [];
  var orders = ordersRes.data || [];
  var leads = leadsRes.data || [];
  if (!leads.length && orders[0] && orders[0].customer_email) {
    var byEmail = await supabase
      .from('newsletter_subscribers')
      .select('*')
      .eq('email', orders[0].customer_email)
      .limit(5);
    leads = byEmail.data || [];
  }
  var latestSession = sessions[0] || {};
  var latestCart = carts[0] || {};
  var order = orders[0] || null;
  var lead = leads[0] || null;

  var flags = {
    has_page_view: false,
    has_product_view: false,
    has_add_to_cart: false,
    has_checkout: false,
    has_purchase: orders.length > 0
  };
  var viewedMap = {};
  events.forEach(function (ev) {
    if (ev.event_type === 'page_view') flags.has_page_view = true;
    if (ev.event_type === 'product_view') {
      flags.has_product_view = true;
      var pid = ev.product_id || 'unknown';
      if (!viewedMap[pid]) viewedMap[pid] = { product_id: pid, times_viewed: 0, first_viewed_at: ev.created_at, last_viewed_at: ev.created_at, time_spent_seconds: 0 };
      viewedMap[pid].times_viewed += 1;
      viewedMap[pid].last_viewed_at = ev.created_at;
    }
    if (ev.event_type === 'add_to_cart') flags.has_add_to_cart = true;
    if (ev.event_type === 'begin_checkout') flags.has_checkout = true;
    if (ev.event_type === 'purchase' || ev.event_type === 'payment_success') flags.has_purchase = true;
  });

  var status = deriveStatus({
    has_purchase: flags.has_purchase,
    has_add_to_cart: flags.has_add_to_cart,
    has_checkout: flags.has_checkout,
    has_product_view: flags.has_product_view,
    has_page_view: flags.has_page_view,
    cart_status: latestCart.status,
    cart_item_count: latestCart.item_count,
    last_activity_at: visitor.last_seen_at || latestSession.last_activity_at,
    email: (order && order.customer_email) || (lead && lead.email)
  });

  var activeCartId = latestCart.id;
  var currentCartItems = (cartItems || []).filter(function (i) {
    return i.cart_id === activeCartId;
  });

  var journeySteps = [
    { id: 'homepage', label: 'Homepage', at: null },
    { id: 'collection', label: 'Collection', at: null },
    { id: 'product', label: 'Product', at: null },
    { id: 'variant', label: 'Variant Selected', at: null },
    { id: 'cart', label: 'Added To Cart', at: null },
    { id: 'checkout', label: 'Checkout', at: null },
    { id: 'payment', label: 'Payment', at: null },
    { id: 'purchase', label: 'Purchase', at: null }
  ];
  events.forEach(function (ev) {
    var t = ev.created_at;
    if (ev.event_type === 'page_view' && (!ev.page_url || ev.page_url === '/' || String(ev.page_url).endsWith('/'))) {
      if (!journeySteps[0].at) journeySteps[0].at = t;
    }
    if (ev.event_type === 'collection_view' || (ev.page_url && String(ev.page_url).indexOf('/collections') !== -1)) {
      if (!journeySteps[1].at) journeySteps[1].at = t;
    }
    if (ev.event_type === 'product_view') {
      if (!journeySteps[2].at) journeySteps[2].at = t;
    }
    if (ev.event_type === 'variant_selected') {
      if (!journeySteps[3].at) journeySteps[3].at = t;
    }
    if (ev.event_type === 'add_to_cart') {
      if (!journeySteps[4].at) journeySteps[4].at = t;
    }
    if (ev.event_type === 'begin_checkout') {
      if (!journeySteps[5].at) journeySteps[5].at = t;
    }
    if (ev.event_type === 'payment_started' || ev.event_type === 'shipping_selected') {
      if (!journeySteps[6].at) journeySteps[6].at = t;
    }
    if (ev.event_type === 'purchase' || ev.event_type === 'payment_success' || ev.event_type === 'checkout_completed') {
      if (!journeySteps[7].at) journeySteps[7].at = t;
    }
  });
  if (orders[0] && !journeySteps[7].at) journeySteps[7].at = orders[0].created_at;

  var meta = latestCart.metadata || {};
  var ua = latestSession.user_agent || '';
  var os = /Mac OS X|Macintosh/.test(ua)
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

  return {
    visitor_id: visitorId,
    status: status,
    customer: {
      name: (order && order.customer_name) || null,
      email: (order && order.customer_email) || (lead && lead.email) || null,
      phone: (order && order.customer_phone) || null,
      country: (order && order.country) || latestSession.country || visitor.country || null,
      city: (order && order.city) || null,
      timezone: null,
      language: (lead && lead.language) || null,
      traffic_source: normalizeSource(latestSession.traffic_source || visitor.first_traffic_source),
      utm_source: latestSession.utm_source || null,
      utm_campaign: latestSession.utm_campaign || null,
      fbclid: meta.fbclid || (latestSession.metadata && latestSession.metadata.fbclid) || null,
      gclid: meta.gclid || null,
      device: latestSession.device_type || visitor.device_type || null,
      browser: latestSession.browser || visitor.browser || null,
      os: os,
      ip_masked: maskIp(meta.client_ip || meta.clientIp || null),
      first_visit: visitor.first_seen_at || null,
      last_visit: visitor.last_seen_at || null,
      session_count: visitor.session_count || sessions.length || 0
    },
    current_cart: {
      cart_id: latestCart.id || null,
      status: latestCart.status || null,
      updated_at: latestCart.last_activity_at || null,
      total_cents: latestCart.cart_value_cents || 0,
      items: currentCartItems.map(function (i) {
        return {
          product_id: i.product_id,
          product_name: i.product_name || productName(i.product_id),
          variant: [i.size, i.power_type, i.led_color].filter(Boolean).join(' / '),
          quantity: i.quantity || 1,
          unit_price_cents: i.unit_price_cents || 0,
          subtotal_cents: (i.unit_price_cents || 0) * (i.quantity || 1),
          thumb: i.product_id ? '/Image/' + i.product_id + '-1.webp' : ''
        };
      })
    },
    viewed_products: Object.keys(viewedMap)
      .map(function (k) {
        return Object.assign({ product_name: productName(k) }, viewedMap[k]);
      })
      .sort(function (a, b) {
        return String(b.last_viewed_at).localeCompare(String(a.last_viewed_at));
      }),
    timeline: events.map(function (ev) {
      return {
        at: ev.created_at,
        event_type: ev.event_type,
        label: eventLabel(ev),
        product_id: ev.product_id || null,
        page_url: ev.page_url || null,
        metadata: ev.metadata || null
      };
    }),
    checkout: {
      started: flags.has_checkout,
      completed: flags.has_purchase,
      payment_status: order ? order.status : null,
      shipping_method: (order && order.shipping_method) || latestCart.last_shipping_method || null,
      discount_code: (lead && lead.discount_code) || null,
      payment_method: (order && order.payment_method) || latestCart.last_payment_method || null,
      order_id: order ? order.id : null,
      stripe_session_id: order ? order.stripe_session_id : null,
      amount_total_cents: order ? order.amount_total_cents : null
    },
    email_leads: leads,
    orders: orders,
    journey: journeySteps,
    abandoned_hours: ABANDONED_HOURS,
    hours_since_last_activity: hoursSince(visitor.last_seen_at)
  };
}

async function listEmailLeads(supabase, query) {
  var range = parseRange(query);
  var res = await supabase
    .from('newsletter_subscribers')
    .select('*')
    .gte('created_at', range.start)
    .lt('created_at', range.end)
    .order('created_at', { ascending: false })
    .limit(200);
  if (res.error && /visitor_id|column/i.test(String(res.error.message || ''))) {
    res = await supabase
      .from('newsletter_subscribers')
      .select('email,country,language,discount_code,source,created_at,used_discount')
      .gte('created_at', range.start)
      .lt('created_at', range.end)
      .order('created_at', { ascending: false })
      .limit(200);
  }
  if (res.error) throw res.error;
  var leads = res.data || [];
  var emails = leads.map(function (l) {
    return l.email;
  }).filter(Boolean);
  var ordersByEmail = {};
  if (emails.length) {
    var ord = await supabase
      .from('orders')
      .select('customer_email,amount_total_cents,created_at')
      .in('customer_email', emails)
      .limit(1000);
    (ord.data || []).forEach(function (o) {
      var key = String(o.customer_email || '').toLowerCase();
      if (!ordersByEmail[key]) ordersByEmail[key] = [];
      ordersByEmail[key].push(o);
    });
  }
  return leads.map(function (l) {
    var key = String(l.email || '').toLowerCase();
    var olist = ordersByEmail[key] || [];
    var revenue = olist.reduce(function (s, o) {
      return s + (Number(o.amount_total_cents) || 0);
    }, 0);
    return {
      email: l.email,
      country: l.country || null,
      language: l.language || null,
      discount_code: l.discount_code || 'ZYBAR15',
      discount_used: !!l.used_discount,
      signup_at: l.created_at,
      purchased: olist.length > 0 || !!l.purchased,
      order_count: olist.length || l.order_count || 0,
      revenue_cents: revenue || l.revenue_cents || 0,
      source: l.source || 'premium_popup',
      visitor_id: l.visitor_id || null
    };
  });
}

async function listAbandoned(supabase, query) {
  var range = parseRange(query);
  try {
    await supabase.rpc('mark_abandoned_carts');
  } catch (e) {
    /* optional RPC */
  }
  var res = await supabase.rpc('get_abandoned_carts', {
    p_limit: Math.min(100, parseInt(query.limit, 10) || 50),
    p_offset: Math.max(0, parseInt(query.offset, 10) || 0)
  });
  if (res.error) {
    // Fallback query
    var fb = await supabase
      .from('cart_sessions')
      .select('id,visitor_id,customer_id,cart_value_cents,item_count,country,last_activity_at,status,created_at')
      .in('status', ['abandoned', 'active', 'checkout_started'])
      .gte('last_activity_at', range.start)
      .order('last_activity_at', { ascending: false })
      .limit(50);
    if (fb.error) throw fb.error;
    var carts = (fb.data || []).filter(function (c) {
      var h = hoursSince(c.last_activity_at);
      return h != null && h >= ABANDONED_HOURS && c.status !== 'purchased';
    });
    var cartIds = carts.map(function (c) {
      return c.id;
    });
    var itemsByCart = {};
    if (cartIds.length) {
      var itemsRes = await supabase.from('cart_session_items').select('*').in('cart_id', cartIds);
      (itemsRes.data || []).forEach(function (i) {
        if (!itemsByCart[i.cart_id]) itemsByCart[i.cart_id] = [];
        itemsByCart[i.cart_id].push({
          product_id: i.product_id,
          product_name: i.product_name || productName(i.product_id),
          quantity: i.quantity || 1
        });
      });
    }
    return carts.map(function (c) {
      return {
        cart_id: c.id,
        visitor_id: c.visitor_id,
        email: c.customer_id || null,
        country: c.country || null,
        cart_value_cents: c.cart_value_cents || 0,
        item_count: c.item_count || 0,
        hours_since_last_activity: Math.round(hoursSince(c.last_activity_at) || 0),
        last_activity_at: c.last_activity_at,
        products: itemsByCart[c.id] || []
      };
    });
  }
  return (res.data || []).map(function (c) {
    return {
      cart_id: c.cart_id || c.id,
      visitor_id: c.visitor_id,
      email: c.customer_id || c.email || null,
      country: c.country || null,
      cart_value_cents: c.cart_value_cents || 0,
      item_count: c.item_count || 0,
      hours_since_last_activity: Math.round(hoursSince(c.last_activity_at || c.last_activity) || 0),
      last_activity_at: c.last_activity_at,
      products: Array.isArray(c.products) ? c.products : []
    };
  });
}

async function countryAnalytics(supabase, query) {
  var range = parseRange(query);
  var [sessionsRes, ordersRes] = await Promise.all([
    supabase
      .from('sessions')
      .select('visitor_id,country')
      .gte('started_at', range.start)
      .lt('started_at', range.end)
      .limit(10000),
    supabase
      .from('orders')
      .select('visitor_id,country,amount_total_cents,customer_email,status')
      .gte('created_at', range.start)
      .lt('created_at', range.end)
      .limit(5000)
  ]);
  var map = {};
  (sessionsRes.data || []).forEach(function (s) {
    var c = s.country || 'Unknown';
    if (!map[c]) map[c] = { country: c, visitors: {}, customers: {}, orders: 0, revenue_cents: 0 };
    if (s.visitor_id) map[c].visitors[s.visitor_id] = true;
  });
  (ordersRes.data || []).forEach(function (o) {
    if (o.status === 'failed' || o.status === 'canceled') return;
    var c = o.country || 'Unknown';
    if (!map[c]) map[c] = { country: c, visitors: {}, customers: {}, orders: 0, revenue_cents: 0 };
    map[c].orders += 1;
    map[c].revenue_cents += Number(o.amount_total_cents) || 0;
    if (o.customer_email) map[c].customers[o.customer_email] = true;
  });
  return Object.keys(map)
    .map(function (k) {
      var r = map[k];
      var visitors = Object.keys(r.visitors).length;
      return {
        country: r.country,
        visitors: visitors,
        customers: Object.keys(r.customers).length,
        orders: r.orders,
        revenue_cents: r.revenue_cents,
        conversion_rate: visitors > 0 ? Number(((r.orders / visitors) * 100).toFixed(2)) : 0,
        aov_cents: r.orders > 0 ? Math.round(r.revenue_cents / r.orders) : 0
      };
    })
    .sort(function (a, b) {
      return b.revenue_cents - a.revenue_cents || b.visitors - a.visitors;
    });
}

async function trafficAnalytics(supabase, query) {
  var range = parseRange(query);
  var [sessionsRes, eventsRes, ordersRes] = await Promise.all([
    supabase
      .from('sessions')
      .select('visitor_id,traffic_source,started_at')
      .gte('started_at', range.start)
      .lt('started_at', range.end)
      .limit(10000),
    supabase
      .from('events')
      .select('visitor_id,event_type,session_id')
      .gte('created_at', range.start)
      .lt('created_at', range.end)
      .in('event_type', ['add_to_cart', 'begin_checkout'])
      .limit(10000),
    supabase
      .from('orders')
      .select('visitor_id,amount_total_cents,status')
      .gte('created_at', range.start)
      .lt('created_at', range.end)
      .limit(5000)
  ]);

  var firstTouch = {};
  (sessionsRes.data || []).forEach(function (s) {
    if (!s.visitor_id || firstTouch[s.visitor_id]) return;
    firstTouch[s.visitor_id] = normalizeSource(s.traffic_source);
  });

  var sources = ['Facebook', 'Instagram', 'Google', 'TikTok', 'Direct', 'Referral', 'Unknown'];
  var map = {};
  sources.forEach(function (s) {
    map[s] = { label: s, visitors: {}, add_to_cart: {}, checkout: {}, purchase: 0, revenue_cents: 0 };
  });

  Object.keys(firstTouch).forEach(function (vid) {
    var label = firstTouch[vid];
    map[label].visitors[vid] = true;
  });

  (eventsRes.data || []).forEach(function (ev) {
    var label = firstTouch[ev.visitor_id] || 'Unknown';
    if (ev.event_type === 'add_to_cart' && ev.visitor_id) map[label].add_to_cart[ev.visitor_id] = true;
    if (ev.event_type === 'begin_checkout' && ev.visitor_id) map[label].checkout[ev.visitor_id] = true;
  });

  (ordersRes.data || []).forEach(function (o) {
    if (o.status === 'failed' || o.status === 'canceled') return;
    var label = firstTouch[o.visitor_id] || 'Unknown';
    map[label].purchase += 1;
    map[label].revenue_cents += Number(o.amount_total_cents) || 0;
  });

  return sources.map(function (s) {
    var r = map[s];
    return {
      label: s,
      visitors: Object.keys(r.visitors).length,
      add_to_cart: Object.keys(r.add_to_cart).length,
      checkout: Object.keys(r.checkout).length,
      purchase: r.purchase,
      revenue_cents: r.revenue_cents
    };
  });
}

async function upsertProfileFromOrder(supabase, session, customer) {
  if (!supabase || !session) return;
  var visitorId = session.metadata && session.metadata.visitorId;
  customer = customer || {};
  if (!visitorId && !customer.customer_email) return;
  var now = new Date().toISOString();
  var row = {
    visitor_id: visitorId || null,
    email: customer.customer_email || null,
    customer_name: customer.customer_name || null,
    phone: customer.customer_phone || null,
    country: customer.country || null,
    city: customer.city || null,
    status: 'purchased',
    first_seen_at: now,
    last_seen_at: now,
    updated_at: now
  };
  try {
    if (visitorId) {
      await supabase.from('customer_profiles').upsert(row, { onConflict: 'visitor_id' });
    }
    if (customer.customer_email) {
      var leadUpdate = { purchased: true };
      if (visitorId) leadUpdate.visitor_id = visitorId;
      await supabase.from('newsletter_subscribers').update(leadUpdate).eq('email', customer.customer_email);
    }
  } catch (e) {
    console.warn('upsertProfileFromOrder:', e && e.message ? e.message : e);
  }
}

/** Merge anonymous visitor activity into a named profile when email is captured. */
async function mergeProfileFromLead(supabase, lead) {
  if (!supabase || !lead) return;
  var visitorId = lead.visitor_id || null;
  var email = lead.email || null;
  if (!visitorId && !email) return;
  var now = new Date().toISOString();
  var row = {
    visitor_id: visitorId,
    email: email,
    country: lead.country || null,
    language: lead.language || null,
    traffic_source: lead.utm_source || null,
    utm_source: lead.utm_source || null,
    utm_medium: lead.utm_medium || null,
    utm_campaign: lead.utm_campaign || null,
    status: 'browsing',
    first_seen_at: now,
    last_seen_at: now,
    updated_at: now
  };
  try {
    if (visitorId) {
      await supabase.from('customer_profiles').upsert(row, { onConflict: 'visitor_id' });
    }
  } catch (e) {
    console.warn('mergeProfileFromLead:', e && e.message ? e.message : e);
  }
}

module.exports = {
  ABANDONED_HOURS: ABANDONED_HOURS,
  parseRange: parseRange,
  listActivities: listActivities,
  getActivityDetail: getActivityDetail,
  listEmailLeads: listEmailLeads,
  listAbandoned: listAbandoned,
  countryAnalytics: countryAnalytics,
  trafficAnalytics: trafficAnalytics,
  upsertProfileFromOrder: upsertProfileFromOrder,
  mergeProfileFromLead: mergeProfileFromLead,
  deriveStatus: deriveStatus,
  normalizeSource: normalizeSource
};
