/**
 * Cloudflare Pages metric drill-down (summary + rows).
 * Mirrors Node lib/analytics-metric-detail.js for the primary KPI keys.
 */
import {
  json,
  parseRange,
  rpc,
  overviewFallback,
  distributionsFallback,
  funnelFallback,
  supabaseFetch
} from '../../_lib/analytics.js';

const METRIC_META = {
  visitors: { title: 'Visitors', filters: ['country', 'device', 'source', 'q'] },
  sessions: { title: 'Sessions', filters: ['country', 'device', 'source', 'q'] },
  orders: { title: 'Orders', filters: ['country', 'status', 'q'] },
  revenue: { title: 'Revenue', filters: ['country', 'status', 'q'] },
  aov: { title: 'Average Order Value', filters: ['country', 'status', 'q'] },
  conversion: { title: 'Conversion Rate', filters: [] },
  add_to_cart: { title: 'Add To Cart', filters: ['country', 'product', 'q'] },
  checkout: { title: 'Checkout Started', filters: ['country', 'q'] },
  email_leads: { title: 'Email Leads', filters: ['country', 'source', 'q'] },
  abandoned: { title: 'Abandoned Cart', filters: ['country', 'q'] }
};

function parseFilters(url) {
  return {
    country: String(url.searchParams.get('country') || '').trim(),
    device: String(url.searchParams.get('device') || '').trim(),
    source: String(url.searchParams.get('source') || '').trim(),
    product: String(url.searchParams.get('product') || '').trim(),
    status: String(url.searchParams.get('status') || '').trim(),
    q: String(url.searchParams.get('q') || '').trim().toLowerCase(),
    limit: Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit'), 10) || 40)),
    offset: Math.max(0, parseInt(url.searchParams.get('offset'), 10) || 0)
  };
}

function money(cents) {
  return 'US$' + ((Number(cents) || 0) / 100).toFixed(2);
}

function pct(n, d) {
  if (!d) return '0';
  return (((Number(n) || 0) / d) * 100).toFixed(2);
}

function emailKey(email) {
  return encodeURIComponent(String(email || '').trim().toLowerCase());
}

function matchQ(hay, q) {
  if (!q) return true;
  return String(hay || '').toLowerCase().indexOf(q) !== -1;
}

function productTitle(slug) {
  if (!slug) return '—';
  return String(slug)
    .replace(/-/g, ' ')
    .replace(/\b\w/g, function (c) {
      return c.toUpperCase();
    });
}

async function restRows(env, path) {
  const res = await supabaseFetch(env, path, {
    method: 'GET',
    headers: { prefer: 'count=exact' }
  });
  if (!res.response.ok) return { rows: [], total: 0 };
  const rows = Array.isArray(res.data) ? res.data : [];
  const countHeader = res.response.headers.get('content-range') || '';
  const m = countHeader.match(/\/(\d+)/);
  return { rows: rows, total: m ? parseInt(m[1], 10) : rows.length };
}

async function loadOverview(env, range) {
  try {
    const data = await rpc(env, 'get_analytics_overview', {
      p_start: range.start,
      p_end: range.end
    });
    if (data && typeof data === 'object') return data;
  } catch (_) {}
  return overviewFallback(env, range);
}

async function getSummary(env, key, range) {
  const overview = (await loadOverview(env, range)) || {};
  const visitors = Number(overview.unique_visitors || overview.visitors || 0);
  const sessions = Number(overview.sessions || 0);
  const orders = Number(overview.orders || overview.order_count || 0);
  const revenue = Number(overview.revenue_cents || overview.revenue || 0);
  const atc = Number(overview.add_to_cart || 0);
  const checkout = Number(overview.checkout_started || overview.begin_checkout || 0);
  const aov = orders ? Math.round(revenue / orders) : 0;

  if (key === 'visitors') {
    let dist = {};
    try {
      dist = await distributionsFallback(env, range);
    } catch (_) {}
    return {
      cards: [
        { label: 'Unique visitors', value: String(visitors) },
        { label: 'Returning', value: String(overview.returning_visitors || 0) },
        { label: 'Sessions', value: String(sessions) },
        { label: 'Top device', value: (dist.devices && dist.devices[0] && dist.devices[0].label) || '—' }
      ],
      breakdowns: {
        countries: (dist.countries || []).slice(0, 5),
        devices: (dist.devices || []).slice(0, 5)
      }
    };
  }

  if (key === 'sessions') {
    return {
      cards: [
        { label: 'Sessions', value: String(sessions) },
        { label: 'Visitors', value: String(visitors) },
        {
          label: 'Pages / session',
          value: String(overview.pages_per_session || overview.avg_pages_per_session || '—')
        },
        {
          label: 'Avg duration',
          value: overview.avg_session_duration_seconds
            ? Math.round(overview.avg_session_duration_seconds) + 's'
            : '—'
        }
      ],
      breakdowns: {}
    };
  }

  if (key === 'orders' || key === 'revenue' || key === 'aov') {
    return {
      cards: [
        { label: 'Orders', value: String(orders) },
        { label: 'Revenue', value: money(revenue) },
        { label: 'AOV', value: money(aov) },
        { label: 'Refunds', value: '—' }
      ],
      breakdowns: {}
    };
  }

  if (key === 'conversion') {
    let funnel = [];
    try {
      funnel = (await funnelFallback(env, range)) || [];
    } catch (_) {}
    return {
      cards: [
        { label: 'Conversion', value: pct(orders, visitors) + '%' },
        { label: 'Visitors', value: String(visitors) },
        { label: 'Add to cart', value: String(atc) },
        { label: 'Checkout', value: String(checkout) },
        { label: 'Orders', value: String(orders) }
      ],
      breakdowns: {
        funnel: (funnel || []).map(function (s) {
          return {
            label: s.step || s.label || 'Step',
            value: s.count != null ? s.count : s.value || 0,
            rate: s.rate
          };
        })
      }
    };
  }

  if (key === 'add_to_cart') {
    return {
      cards: [
        { label: 'Add to cart', value: String(atc) },
        { label: 'ATC rate', value: pct(atc, visitors) + '%' },
        { label: 'Checkout rate', value: pct(checkout, atc) + '%' },
        { label: 'Purchase rate', value: pct(orders, atc) + '%' }
      ],
      breakdowns: {}
    };
  }

  if (key === 'checkout') {
    return {
      cards: [
        { label: 'Checkout starts', value: String(checkout) },
        { label: 'Checkout → Purchase', value: pct(orders, checkout) + '%' },
        { label: 'Orders', value: String(orders) },
        { label: 'Avg cart', value: money(aov) }
      ],
      breakdowns: {}
    };
  }

  if (key === 'email_leads') {
    return {
      cards: [
        { label: 'New leads', value: String(overview.email_leads || overview.newsletter_signups || 0) },
        { label: 'Visitors', value: String(visitors) }
      ],
      breakdowns: {}
    };
  }

  if (key === 'abandoned') {
    return {
      cards: [
        { label: 'Abandoned carts', value: String(overview.abandoned_carts || 0) },
        { label: 'Add to cart', value: String(atc) }
      ],
      breakdowns: {}
    };
  }

  return { cards: [], breakdowns: {} };
}

async function getRows(env, key, range, filters) {
  const start = encodeURIComponent(range.start);
  const end = encodeURIComponent(range.end);
  const limit = filters.limit;
  const offset = filters.offset;

  if (key === 'visitors' || key === 'sessions') {
    let path =
      '/rest/v1/sessions?started_at=gte.' +
      start +
      '&started_at=lt.' +
      end +
      '&select=id,visitor_id,started_at,ended_at,country,device_type,browser,landing_page,referrer,utm_source,duration_seconds,page_count' +
      '&order=started_at.desc&limit=' +
      limit +
      '&offset=' +
      offset;
    if (filters.country) path += '&country=eq.' + encodeURIComponent(filters.country);
    if (filters.device) path += '&device_type=eq.' + encodeURIComponent(filters.device);
    if (filters.source) path += '&utm_source=eq.' + encodeURIComponent(filters.source);
    const { rows, total } = await restRows(env, path);
    const filtered = filters.q
      ? rows.filter(function (r) {
          return (
            matchQ(r.visitor_id, filters.q) ||
            matchQ(r.landing_page, filters.q) ||
            matchQ(r.referrer, filters.q) ||
            matchQ(r.country, filters.q)
          );
        })
      : rows;
    return {
      columns: [
        { key: 'time', label: 'Time' },
        { key: 'country', label: 'Country' },
        { key: 'device', label: 'Device' },
        { key: 'browser', label: 'Browser' },
        { key: 'landing', label: 'Landing' },
        { key: 'referrer', label: 'Referrer' },
        { key: 'duration', label: 'Duration' }
      ],
      rows: filtered.map(function (r) {
        return {
          href: r.visitor_id ? '#activity/' + encodeURIComponent(r.visitor_id) : null,
          time: r.started_at,
          country: r.country || '—',
          device: r.device_type || '—',
          browser: r.browser || '—',
          landing: r.landing_page || '—',
          referrer: r.referrer || r.utm_source || '—',
          duration: r.duration_seconds != null ? r.duration_seconds + 's' : '—'
        };
      }),
      total: filters.q ? filtered.length : total,
      limit: limit,
      offset: offset
    };
  }

  if (key === 'orders' || key === 'revenue' || key === 'aov') {
    let path =
      '/rest/v1/orders?created_at=gte.' +
      start +
      '&created_at=lt.' +
      end +
      '&select=id,order_number,customer_email,customer_name,country,amount_total_cents,status,created_at,visitor_id' +
      '&order=created_at.desc&limit=' +
      limit +
      '&offset=' +
      offset;
    if (filters.country) path += '&country=eq.' + encodeURIComponent(filters.country);
    if (filters.status) path += '&status=eq.' + encodeURIComponent(filters.status);
    const { rows, total } = await restRows(env, path);
    const filtered = filters.q
      ? rows.filter(function (r) {
          return (
            matchQ(r.customer_email, filters.q) ||
            matchQ(r.customer_name, filters.q) ||
            matchQ(r.id, filters.q)
          );
        })
      : rows;
    return {
      columns: [
        { key: 'order', label: 'Order' },
        { key: 'customer', label: 'Customer' },
        { key: 'country', label: 'Country' },
        { key: 'amount', label: 'Amount' },
        { key: 'status', label: 'Status' },
        { key: 'created', label: 'Created' }
      ],
      rows: filtered.map(function (r) {
        return {
          href: '#orders/' + encodeURIComponent(r.id),
          order: r.order_number || String(r.id).slice(0, 8),
          customer: r.customer_name || r.customer_email || '—',
          customer_href: r.customer_email ? '#customers/' + emailKey(r.customer_email) : null,
          country: r.country || '—',
          amount: money(r.amount_total_cents),
          status: r.status || '—',
          created: r.created_at
        };
      }),
      total: filters.q ? filtered.length : total,
      limit: limit,
      offset: offset
    };
  }

  if (key === 'add_to_cart' || key === 'checkout') {
    const eventType = key === 'checkout' ? 'begin_checkout' : 'add_to_cart';
    let path =
      '/rest/v1/events?created_at=gte.' +
      start +
      '&created_at=lt.' +
      end +
      '&event_type=eq.' +
      eventType +
      '&select=id,visitor_id,product_id,created_at,metadata' +
      '&order=created_at.desc&limit=' +
      limit +
      '&offset=' +
      offset;
    if (filters.product) path += '&product_id=eq.' + encodeURIComponent(filters.product);
    const { rows, total } = await restRows(env, path);
    return {
      columns: [
        { key: 'time', label: 'Time' },
        { key: 'customer', label: 'Visitor' },
        { key: 'product', label: 'Product' },
        { key: 'status', label: 'Status' }
      ],
      rows: rows.map(function (r) {
        return {
          href: r.visitor_id ? '#activity/' + encodeURIComponent(r.visitor_id) : null,
          time: r.created_at,
          customer: r.visitor_id ? String(r.visitor_id).slice(0, 10) + '…' : '—',
          product: productTitle(r.product_id),
          status: eventType
        };
      }),
      total: total,
      limit: limit,
      offset: offset
    };
  }

  if (key === 'conversion') {
    let funnel = [];
    try {
      funnel = (await funnelFallback(env, range)) || [];
    } catch (_) {}
    return {
      columns: [
        { key: 'step', label: 'Funnel step' },
        { key: 'count', label: 'Count' },
        { key: 'rate', label: 'Rate' }
      ],
      rows: (funnel || []).map(function (s) {
        return {
          href: null,
          step: s.step || s.label || 'Step',
          count: s.count != null ? s.count : s.value || 0,
          rate: (s.rate != null ? s.rate : '—') + (s.rate != null ? '%' : '')
        };
      }),
      total: (funnel || []).length,
      limit: limit,
      offset: 0
    };
  }

  if (key === 'email_leads') {
    let path =
      '/rest/v1/newsletter_subscribers?created_at=gte.' +
      start +
      '&created_at=lt.' +
      end +
      '&select=id,email,source,country,created_at,status' +
      '&order=created_at.desc&limit=' +
      limit +
      '&offset=' +
      offset;
    const { rows, total } = await restRows(env, path);
    return {
      columns: [
        { key: 'time', label: 'Time' },
        { key: 'email', label: 'Email' },
        { key: 'source', label: 'Source' },
        { key: 'country', label: 'Country' },
        { key: 'status', label: 'Status' }
      ],
      rows: rows.map(function (r) {
        return {
          href: r.email ? '#customers/' + emailKey(r.email) : null,
          email_href: r.email ? '#customers/' + emailKey(r.email) : null,
          time: r.created_at,
          email: r.email || '—',
          source: r.source || '—',
          country: r.country || '—',
          status: r.status || '—'
        };
      }),
      total: total,
      limit: limit,
      offset: offset
    };
  }

  if (key === 'abandoned') {
    let path =
      '/rest/v1/cart_sessions?updated_at=gte.' +
      start +
      '&updated_at=lt.' +
      end +
      '&status=eq.abandoned' +
      '&select=id,visitor_id,email,cart_value_cents,updated_at,item_count,status' +
      '&order=updated_at.desc&limit=' +
      limit +
      '&offset=' +
      offset;
    const { rows, total } = await restRows(env, path);
    return {
      columns: [
        { key: 'time', label: 'Time' },
        { key: 'email', label: 'Email' },
        { key: 'products', label: 'Products' },
        { key: 'cart_value', label: 'Value' },
        { key: 'status', label: 'Status' }
      ],
      rows: rows.map(function (r) {
        return {
          href: r.visitor_id ? '#activity/' + encodeURIComponent(r.visitor_id) : null,
          email_href: r.email ? '#customers/' + emailKey(r.email) : null,
          time: r.updated_at,
          email: r.email || '—',
          products: r.item_count != null ? r.item_count + ' items' : '—',
          cart_value: money(r.cart_value_cents),
          status: r.status || 'abandoned'
        };
      }),
      total: total,
      limit: limit,
      offset: offset
    };
  }

  return { columns: [], rows: [], total: 0, limit: limit, offset: offset };
}

export async function onRequestGet(context) {
  const env = context.env || {};
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Analytics not configured' }, 503);
  }

  const url = new URL(context.request.url);
  const parts = url.pathname.split('/').filter(Boolean);
  const keyIdx = parts.indexOf('metric');
  const key = keyIdx >= 0 ? String(parts[keyIdx + 1] || '').toLowerCase() : '';
  const action = keyIdx >= 0 ? parts[keyIdx + 2] : '';

  if (!key || !METRIC_META[key]) {
    return json({ error: 'Unknown metric key.' }, 404);
  }
  if (action !== 'summary' && action !== 'rows') {
    return json({ error: 'Use /api/analytics/metric/:key/summary or /rows' }, 400);
  }

  const range = parseRange(url);
  const filters = parseFilters(url);

  try {
    if (action === 'summary') {
      const summary = await getSummary(env, key, range);
      return json({
        key: key,
        meta: METRIC_META[key],
        range: range,
        summary: summary
      });
    }
    const table = await getRows(env, key, range, filters);
    return json({
      key: key,
      meta: METRIC_META[key],
      range: range,
      filters: filters,
      table: table
    });
  } catch (err) {
    return json({ error: (err && err.message) || 'Metric detail failed' }, 500);
  }
}
