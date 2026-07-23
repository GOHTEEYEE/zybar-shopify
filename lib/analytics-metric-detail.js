/**
 * KPI drill-down metric summaries + paginated rows.
 * Keys: visitors, sessions, orders, revenue, aov, conversion,
 *       add_to_cart, checkout, email_leads, abandoned
 */
const CustomerActivity = require('./customer-activity.js');
const AnalyticsFallback = require('./analytics-fallback.js');

const METRIC_KEYS = [
  'visitors',
  'sessions',
  'orders',
  'revenue',
  'aov',
  'conversion',
  'add_to_cart',
  'checkout',
  'email_leads',
  'abandoned'
];

const METRIC_META = {
  visitors: {
    title: 'Visitors',
    description: 'Unique visitors in the selected range.',
    trendKey: 'visitors',
    filters: ['country', 'device', 'source', 'q']
  },
  sessions: {
    title: 'Sessions',
    description: 'Session starts and engagement.',
    trendKey: 'sessions',
    filters: ['country', 'device', 'source', 'q']
  },
  orders: {
    title: 'Orders',
    description: 'Completed and recorded store orders.',
    trendKey: 'orders',
    filters: ['country', 'status', 'q']
  },
  revenue: {
    title: 'Revenue',
    description: 'Gross order revenue.',
    trendKey: 'revenue',
    filters: ['country', 'status', 'q']
  },
  aov: {
    title: 'Average Order Value',
    description: 'Revenue per order.',
    trendKey: 'orders',
    filters: ['country', 'status', 'q']
  },
  conversion: {
    title: 'Conversion Rate',
    description: 'Visitors through purchase funnel.',
    trendKey: 'orders',
    filters: []
  },
  add_to_cart: {
    title: 'Add To Cart',
    description: 'Add-to-cart events and rates.',
    trendKey: 'add_to_cart',
    filters: ['country', 'product', 'q']
  },
  checkout: {
    title: 'Checkout Started',
    description: 'Checkout begins and progression.',
    trendKey: 'checkout',
    filters: ['country', 'q']
  },
  email_leads: {
    title: 'Email Leads',
    description: 'Newsletter and popup signups.',
    trendKey: 'visitors',
    filters: ['country', 'source', 'q']
  },
  abandoned: {
    title: 'Abandoned Cart',
    description: 'Carts left without purchase.',
    trendKey: 'add_to_cart',
    filters: ['country', 'q']
  }
};

function parseFilters(query) {
  query = query || {};
  return {
    country: String(query.country || '').trim(),
    device: String(query.device || '').trim(),
    source: String(query.source || '').trim(),
    product: String(query.product || '').trim(),
    status: String(query.status || '').trim(),
    q: String(query.q || '').trim().toLowerCase(),
    limit: Math.min(100, Math.max(1, parseInt(query.limit, 10) || 40)),
    offset: Math.max(0, parseInt(query.offset, 10) || 0)
  };
}

function productTitle(slug) {
  if (!slug) return '—';
  return String(slug)
    .replace(/-/g, ' ')
    .replace(/\b\w/g, function (c) {
      return c.toUpperCase();
    });
}

function moneyCents(cents) {
  return Number(cents) || 0;
}

function pct(n, d) {
  if (!d) return 0;
  return Number(((Number(n) || 0) / d) * 100).toFixed(2);
}

function emailKey(email) {
  return encodeURIComponent(String(email || '').trim().toLowerCase());
}

function matchQ(hay, q) {
  if (!q) return true;
  return String(hay || '')
    .toLowerCase()
    .indexOf(q) !== -1;
}

function card(label, value, hint) {
  return { label: label, value: value, hint: hint || null };
}

async function loadOverview(supabase, range) {
  return AnalyticsFallback.rpcOrFallback(
    supabase,
    'get_shopify_analytics_overview',
    { p_start: range.start, p_end: range.end },
    function () {
      return AnalyticsFallback.overviewFallback(supabase, range);
    }
  );
}

async function loadDistributions(supabase, range) {
  return AnalyticsFallback.rpcOrFallback(
    supabase,
    'get_shopify_device_analytics',
    { p_start: range.start, p_end: range.end },
    function () {
      return AnalyticsFallback.distributionsFallback(supabase, range);
    }
  ).catch(function () {
    return { devices: [], countries: [], browsers: [] };
  });
}

async function loadFunnel(supabase, range) {
  return AnalyticsFallback.rpcOrFallback(
    supabase,
    'get_shopify_conversion_funnel',
    { p_start: range.start, p_end: range.end },
    function () {
      return AnalyticsFallback.funnelFallback(supabase, range);
    }
  ).catch(function () {
    return [];
  });
}

function topFromDist(items, n) {
  return (items || []).slice(0, n || 5).map(function (row) {
    return {
      label: row.label || row.country || row.device_type || 'Unknown',
      value: row.value != null ? row.value : row.cnt || row.count || 0
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Summary                                                                    */
/* -------------------------------------------------------------------------- */

async function getMetricSummary(supabase, key, range, filters) {
  filters = filters || parseFilters({});
  const overview = (await loadOverview(supabase, range)) || {};
  const visitors = Number(overview.unique_visitors || overview.visitors || 0);
  const sessions = Number(overview.sessions || 0);
  const orders = Number(overview.orders || overview.order_count || 0);
  const revenue = moneyCents(overview.revenue_cents || overview.revenue || 0);
  const atc = Number(overview.add_to_cart || 0);
  const checkout = Number(overview.checkout_started || overview.begin_checkout || 0);
  const aov = orders ? Math.round(revenue / orders) : 0;
  const conversion = pct(orders, visitors);

  if (key === 'visitors') {
    const dist = (await loadDistributions(supabase, range)) || {};
    const returning = Number(overview.returning_visitors || 0);
    const unique = Number(overview.new_visitors != null ? overview.new_visitors : Math.max(0, visitors - returning));
    return {
      cards: [
        card('Unique Visitors', visitors),
        card('New Visitors', unique),
        card('Returning Visitors', returning),
        card('Sessions', sessions),
        card('Top Device', (dist.devices && dist.devices[0] && dist.devices[0].label) || '—')
      ],
      breakdowns: {
        devices: topFromDist(dist.devices || dist.device || [], 5),
        countries: topFromDist(dist.countries || [], 5)
      }
    };
  }

  if (key === 'sessions') {
    const avgDur = Number(overview.avg_session_duration_seconds || overview.avg_duration_seconds || 0);
    return {
      cards: [
        card('Sessions', sessions),
        card('Unique Visitors', visitors),
        card('Avg Duration', avgDur ? Math.round(avgDur) + 's' : '—'),
        card('Pages / Session', overview.pages_per_session != null ? Number(overview.pages_per_session).toFixed(2) : '—')
      ],
      breakdowns: {}
    };
  }

  if (key === 'orders' || key === 'revenue' || key === 'aov') {
    const paid = orders; // status breakdown filled in rows; summary uses totals
    return {
      cards:
        key === 'aov'
          ? [
              card('AOV', 'US$' + (aov / 100).toFixed(2)),
              card('Orders', orders),
              card('Gross Revenue', 'US$' + (revenue / 100).toFixed(2)),
              card('High / Low', 'See table')
            ]
          : key === 'revenue'
            ? [
                card('Gross Revenue', 'US$' + (revenue / 100).toFixed(2)),
                card('Orders', orders),
                card('AOV', 'US$' + (aov / 100).toFixed(2)),
                card('Refunds', '—'),
                card('Net Revenue', 'US$' + (revenue / 100).toFixed(2))
              ]
            : [
                card('Orders', orders),
                card('Revenue', 'US$' + (revenue / 100).toFixed(2)),
                card('AOV', 'US$' + (aov / 100).toFixed(2)),
                card('Paid Orders', paid)
              ],
      breakdowns: {}
    };
  }

  if (key === 'conversion') {
    let funnel = await loadFunnel(supabase, range);
    if (funnel && funnel.steps) funnel = funnel.steps;
    if (!Array.isArray(funnel)) funnel = [];
    return {
      cards: [
        card('Conversion Rate', conversion + '%'),
        card('Visitors', visitors),
        card('Add To Cart', atc),
        card('Checkout', checkout),
        card('Orders', orders)
      ],
      breakdowns: {
        funnel: funnel.map(function (s) {
          return {
            label: s.step || s.label,
            value: s.count != null ? s.count : 0,
            rate: s.rate_from_previous != null ? s.rate_from_previous : null
          };
        })
      }
    };
  }

  if (key === 'add_to_cart') {
    return {
      cards: [
        card('Total Adds', atc),
        card('ATC Rate', pct(atc, visitors) + '%'),
        card('Checkout Rate', pct(checkout, Math.max(atc, 1)) + '%'),
        card('Purchase Rate', pct(orders, Math.max(atc, 1)) + '%')
      ],
      breakdowns: {}
    };
  }

  if (key === 'checkout') {
    return {
      cards: [
        card('Checkout Started', checkout),
        card('Checkout → Purchase', pct(orders, Math.max(checkout, 1)) + '%'),
        card('Orders', orders),
        card('Avg Cart (orders)', 'US$' + (aov / 100).toFixed(2))
      ],
      breakdowns: {}
    };
  }

  if (key === 'email_leads') {
    const leads = await CustomerActivity.listEmailLeads(supabase, {
      preset: 'custom',
      start: range.start,
      end: range.end
    }).catch(function () {
      return [];
    });
    const bySource = {};
    (leads || []).forEach(function (l) {
      const s = l.source || 'unknown';
      bySource[s] = (bySource[s] || 0) + 1;
    });
    return {
      cards: [
        card('New Leads', (leads || []).length),
        card('Popup / Premium', bySource.premium_popup || bySource.popup || 0),
        card('Checkout Leads', bySource.checkout || 0),
        card('Other Sources', Math.max(0, (leads || []).length - (bySource.premium_popup || 0) - (bySource.popup || 0) - (bySource.checkout || 0)))
      ],
      breakdowns: {
        sources: Object.keys(bySource).map(function (k) {
          return { label: k, value: bySource[k] };
        })
      }
    };
  }

  if (key === 'abandoned') {
    const carts = await CustomerActivity.listAbandoned(supabase, {
      preset: 'custom',
      start: range.start,
      end: range.end,
      limit: 100,
      offset: 0
    }).catch(function () {
      return [];
    });
    const list = carts || [];
    const value = list.reduce(function (s, c) {
      return s + moneyCents(c.cart_value_cents || c.value_cents || 0);
    }, 0);
    const idle = list
      .map(function (c) {
        return Number(c.hours_idle || c.hours_since_activity || 0);
      })
      .filter(function (n) {
        return n > 0;
      });
    const avgIdle = idle.length
      ? Math.round(idle.reduce(function (a, b) {
          return a + b;
        }, 0) / idle.length)
      : 0;
    return {
      cards: [
        card('Abandoned Carts', list.length),
        card('Cart Value', 'US$' + (value / 100).toFixed(2)),
        card('Avg Idle Hours', avgIdle || '—'),
        card('In Recovery', list.filter(function (c) {
          return /recover|waiting|active/i.test(String(c.recovery_status || c.status || ''));
        }).length)
      ],
      breakdowns: {}
    };
  }

  return { cards: [], breakdowns: {} };
}

/* -------------------------------------------------------------------------- */
/* Rows                                                                       */
/* -------------------------------------------------------------------------- */

async function getMetricRows(supabase, key, range, filters) {
  filters = filters || parseFilters({});
  const limit = filters.limit;
  const offset = filters.offset;

  if (key === 'visitors' || key === 'sessions') {
    let q = supabase
      .from('sessions')
      .select(
        'id,visitor_id,started_at,ended_at,country,device_type,browser,landing_page,referrer,utm_source,duration_seconds,page_count',
        { count: 'exact' }
      )
      .gte('started_at', range.start)
      .lt('started_at', range.end)
      .order('started_at', { ascending: false });
    if (filters.country) q = q.ilike('country', filters.country);
    if (filters.device) q = q.ilike('device_type', filters.device);
    if (filters.source) q = q.ilike('utm_source', '%' + filters.source + '%');
    q = q.range(offset, offset + limit - 1);
    let result = await q;
    if (result.error && /column|browser|landing|duration|page_count/i.test(String(result.error.message || ''))) {
      result = await supabase
        .from('sessions')
        .select('id,visitor_id,started_at,country,device_type,utm_source', { count: 'exact' })
        .gte('started_at', range.start)
        .lt('started_at', range.end)
        .order('started_at', { ascending: false })
        .range(offset, offset + limit - 1);
    }
    if (result.error) throw result.error;
    let rows = result.data || [];
    if (filters.q) {
      rows = rows.filter(function (r) {
        return (
          matchQ(r.visitor_id, filters.q) ||
          matchQ(r.country, filters.q) ||
          matchQ(r.landing_page, filters.q) ||
          matchQ(r.utm_source, filters.q)
        );
      });
    }
    if (key === 'visitors') {
      // Deduplicate by visitor within page (approx); prefer latest session per visitor in window fetch
      const seen = {};
      rows = rows.filter(function (r) {
        const id = r.visitor_id || r.id;
        if (seen[id]) return false;
        seen[id] = true;
        return true;
      });
    }
    return {
      columns:
        key === 'visitors'
          ? [
              { key: 'time', label: 'Time' },
              { key: 'country', label: 'Country' },
              { key: 'device', label: 'Device' },
              { key: 'browser', label: 'Browser' },
              { key: 'landing', label: 'Landing Page' },
              { key: 'referrer', label: 'Referrer' },
              { key: 'duration', label: 'Duration' }
            ]
          : [
              { key: 'time', label: 'Time' },
              { key: 'visitor', label: 'Visitor' },
              { key: 'country', label: 'Country' },
              { key: 'device', label: 'Device' },
              { key: 'landing', label: 'Landing' },
              { key: 'duration', label: 'Duration' }
            ],
      rows: rows.map(function (r) {
        const href = r.visitor_id ? '#activity/' + encodeURIComponent(r.visitor_id) : null;
        return {
          id: r.id,
          href: href,
          time: r.started_at,
          visitor: r.visitor_id || '—',
          country: r.country || '—',
          device: r.device_type || '—',
          browser: r.browser || '—',
          landing: r.landing_page || '—',
          referrer: r.referrer || r.utm_source || '—',
          duration: r.duration_seconds != null ? r.duration_seconds + 's' : '—'
        };
      }),
      total: result.count != null ? result.count : rows.length,
      limit: limit,
      offset: offset
    };
  }

  if (key === 'orders' || key === 'revenue' || key === 'aov') {
    let q = supabase
      .from('orders')
      .select(
        'id,order_number,customer_email,customer_name,country,amount_total_cents,currency,status,payment_status,created_at,line_items,visitor_id',
        { count: 'exact' }
      )
      .gte('created_at', range.start)
      .lt('created_at', range.end)
      .order(key === 'aov' || key === 'revenue' ? 'amount_total_cents' : 'created_at', {
        ascending: false
      });
    if (filters.country) q = q.ilike('country', filters.country);
    if (filters.status) q = q.ilike('status', filters.status);
    q = q.range(offset, offset + limit - 1);
    let result = await q;
    if (result.error && /column|line_items|payment_status|order_number/i.test(String(result.error.message || ''))) {
      result = await supabase
        .from('orders')
        .select('id,customer_email,amount_total_cents,status,created_at,visitor_id', { count: 'exact' })
        .gte('created_at', range.start)
        .lt('created_at', range.end)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
    }
    if (result.error) throw result.error;
    let rows = result.data || [];
    if (filters.q) {
      rows = rows.filter(function (r) {
        return (
          matchQ(r.customer_email, filters.q) ||
          matchQ(r.customer_name, filters.q) ||
          matchQ(r.order_number, filters.q) ||
          matchQ(r.id, filters.q)
        );
      });
    }
    if (key === 'aov' && rows.length) {
      const amounts = rows.map(function (r) {
        return moneyCents(r.amount_total_cents);
      }).sort(function (a, b) {
        return a - b;
      });
      // attach high/low into first row meta via summary only — table still orders
    }
    return {
      columns: [
        { key: 'order', label: 'Order' },
        { key: 'customer', label: 'Customer' },
        { key: 'country', label: 'Country' },
        { key: 'products', label: 'Products' },
        { key: 'amount', label: 'Amount' },
        { key: 'status', label: 'Status' },
        { key: 'created', label: 'Created At' }
      ],
      rows: rows.map(function (r) {
        let products = '—';
        try {
          const items = typeof r.line_items === 'string' ? JSON.parse(r.line_items) : r.line_items;
          if (Array.isArray(items) && items.length) {
            products = items
              .slice(0, 2)
              .map(function (it) {
                return it.title || it.name || it.product_id || 'Item';
              })
              .join(', ');
            if (items.length > 2) products += ' +' + (items.length - 2);
          }
        } catch (_) {}
        const href = '#orders/' + encodeURIComponent(r.id);
        return {
          id: r.id,
          href: href,
          order: r.order_number || String(r.id).slice(0, 8),
          customer: r.customer_email || r.customer_name || '—',
          customer_href: r.customer_email ? '#customers/' + emailKey(r.customer_email) : null,
          country: r.country || '—',
          products: products,
          amount: 'US$' + (moneyCents(r.amount_total_cents) / 100).toFixed(2),
          status: r.payment_status || r.status || '—',
          created: r.created_at,
          time: r.created_at
        };
      }),
      total: result.count != null ? result.count : rows.length,
      limit: limit,
      offset: offset
    };
  }

  if (key === 'add_to_cart' || key === 'checkout') {
    const eventType = key === 'add_to_cart' ? 'add_to_cart' : ['begin_checkout', 'checkout_started'];
    let q = supabase
      .from('events')
      .select('id,visitor_id,event_type,product_id,created_at,page_url,metadata,session_id', {
        count: 'exact'
      })
      .gte('created_at', range.start)
      .lt('created_at', range.end)
      .order('created_at', { ascending: false });
    if (key === 'add_to_cart') q = q.eq('event_type', 'add_to_cart');
    else q = q.in('event_type', ['begin_checkout', 'checkout_started']);
    if (filters.product) q = q.ilike('product_id', '%' + filters.product + '%');
    q = q.range(offset, offset + limit - 1);
    const result = await q;
    if (result.error) throw result.error;
    let rows = result.data || [];
    if (filters.q) {
      rows = rows.filter(function (r) {
        return matchQ(r.visitor_id, filters.q) || matchQ(r.product_id, filters.q);
      });
    }
    // Enrich with session country when possible
    const visitorIds = rows.map(function (r) {
      return r.visitor_id;
    }).filter(Boolean);
    const sessionMap = {};
    if (visitorIds.length) {
      const sess = await supabase
        .from('sessions')
        .select('visitor_id,country,device_type')
        .in('visitor_id', visitorIds.slice(0, 80))
        .limit(200);
      (sess.data || []).forEach(function (s) {
        if (!sessionMap[s.visitor_id]) sessionMap[s.visitor_id] = s;
      });
    }
    return {
      columns:
        key === 'add_to_cart'
          ? [
              { key: 'time', label: 'Time' },
              { key: 'customer', label: 'Customer' },
              { key: 'country', label: 'Country' },
              { key: 'product', label: 'Product' },
              { key: 'cart_value', label: 'Cart Value' },
              { key: 'status', label: 'Status' }
            ]
          : [
              { key: 'time', label: 'Time' },
              { key: 'customer', label: 'Customer' },
              { key: 'email', label: 'Email' },
              { key: 'country', label: 'Country' },
              { key: 'cart_value', label: 'Cart Value' },
              { key: 'payment_status', label: 'Payment Status' }
            ],
      rows: rows.map(function (r) {
        const meta = r.metadata || {};
        const sess = sessionMap[r.visitor_id] || {};
        const href = r.visitor_id ? '#activity/' + encodeURIComponent(r.visitor_id) : null;
        return {
          id: r.id,
          href: href,
          time: r.created_at,
          customer: r.visitor_id ? String(r.visitor_id).slice(0, 10) + '…' : '—',
          email: meta.email || meta.customer_email || '—',
          email_href: meta.email || meta.customer_email ? '#customers/' + emailKey(meta.email || meta.customer_email) : null,
          country: sess.country || meta.country || '—',
          product: productTitle(r.product_id),
          product_href: r.product_id ? '#analytics/products' : null,
          cart_value:
            meta.cart_value_cents != null
              ? 'US$' + (moneyCents(meta.cart_value_cents) / 100).toFixed(2)
              : '—',
          status: 'Added',
          payment_status: meta.payment_status || 'Started'
        };
      }),
      total: result.count != null ? result.count : rows.length,
      limit: limit,
      offset: offset
    };
  }

  if (key === 'conversion') {
    let funnel = await loadFunnel(supabase, range);
    if (funnel && funnel.steps) funnel = funnel.steps;
    if (!Array.isArray(funnel)) funnel = [];
    return {
      columns: [
        { key: 'step', label: 'Funnel Step' },
        { key: 'count', label: 'Count' },
        { key: 'rate', label: 'Rate from Previous' }
      ],
      rows: funnel.map(function (s, i) {
        return {
          id: 'step-' + i,
          href: null,
          step: s.step || s.label || 'Step',
          count: s.count != null ? s.count : 0,
          rate: s.rate_from_previous != null ? s.rate_from_previous + '%' : i === 0 ? '100%' : '—',
          time: null
        };
      }),
      total: funnel.length,
      limit: limit,
      offset: 0
    };
  }

  if (key === 'email_leads') {
    const leads = await CustomerActivity.listEmailLeads(supabase, {
      preset: 'custom',
      start: range.start,
      end: range.end
    });
    let rows = leads || [];
    if (filters.country) {
      rows = rows.filter(function (r) {
        return matchQ(r.country, filters.country.toLowerCase());
      });
    }
    if (filters.source) {
      rows = rows.filter(function (r) {
        return matchQ(r.source, filters.source.toLowerCase());
      });
    }
    if (filters.q) {
      rows = rows.filter(function (r) {
        return matchQ(r.email, filters.q) || matchQ(r.source, filters.q);
      });
    }
    const total = rows.length;
    rows = rows.slice(offset, offset + limit);
    return {
      columns: [
        { key: 'time', label: 'Time' },
        { key: 'email', label: 'Email' },
        { key: 'source', label: 'Source' },
        { key: 'country', label: 'Country' },
        { key: 'status', label: 'Status' },
        { key: 'welcome', label: 'Purchased?' }
      ],
      rows: rows.map(function (r) {
        return {
          id: r.email,
          href: r.visitor_id
            ? '#activity/' + encodeURIComponent(r.visitor_id)
            : '#customers/' + emailKey(r.email),
          time: r.signup_at,
          email: r.email,
          email_href: '#customers/' + emailKey(r.email),
          source: r.source || '—',
          country: r.country || '—',
          status: r.purchased ? 'Customer' : 'Lead',
          welcome: r.purchased ? 'Yes' : 'No'
        };
      }),
      total: total,
      limit: limit,
      offset: offset
    };
  }

  if (key === 'abandoned') {
    const carts = await CustomerActivity.listAbandoned(supabase, {
      preset: 'custom',
      start: range.start,
      end: range.end,
      limit: 100,
      offset: 0
    });
    let rows = carts || [];
    if (filters.country) {
      rows = rows.filter(function (r) {
        return matchQ(r.country, filters.country.toLowerCase());
      });
    }
    if (filters.q) {
      rows = rows.filter(function (r) {
        return (
          matchQ(r.email || r.customer_email, filters.q) ||
          matchQ(r.visitor_id, filters.q)
        );
      });
    }
    const total = rows.length;
    rows = rows.slice(offset, offset + limit);
    return {
      columns: [
        { key: 'time', label: 'Time' },
        { key: 'customer', label: 'Customer' },
        { key: 'email', label: 'Email' },
        { key: 'products', label: 'Products' },
        { key: 'cart_value', label: 'Cart Value' },
        { key: 'hours_idle', label: 'Hours Idle' },
        { key: 'status', label: 'Recovery Status' }
      ],
      rows: rows.map(function (r) {
        const email = r.email || r.customer_email || null;
        return {
          id: r.id || r.cart_id,
          href: r.visitor_id ? '#activity/' + encodeURIComponent(r.visitor_id) : null,
          time: r.last_activity_at || r.created_at,
          customer: r.visitor_id ? String(r.visitor_id).slice(0, 10) + '…' : '—',
          email: email || '—',
          email_href: email ? '#customers/' + emailKey(email) : null,
          products: r.item_count != null ? r.item_count + ' items' : '—',
          cart_value: 'US$' + (moneyCents(r.cart_value_cents || r.value_cents) / 100).toFixed(2),
          hours_idle: r.hours_idle != null ? r.hours_idle : r.hours_since_activity || '—',
          status: r.recovery_status || r.status || 'abandoned'
        };
      }),
      total: total,
      limit: limit,
      offset: offset
    };
  }

  return { columns: [], rows: [], total: 0, limit: limit, offset: offset };
}

function getMetricMeta(key) {
  return METRIC_META[key] || null;
}

module.exports = {
  METRIC_KEYS,
  METRIC_META,
  parseFilters,
  getMetricMeta,
  getMetricSummary,
  getMetricRows
};
