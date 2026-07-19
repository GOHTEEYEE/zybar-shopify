/**
 * Cloudflare-compatible chatbot knowledge builder (ESM).
 */

var DEFAULT_SHIPPING = [
  {
    code: 'standard',
    label: 'Standard Shipping',
    description: 'Estimated delivery: 14–18 business days',
    priceUsd: 20,
    isDefault: true
  },
  {
    code: 'priority',
    label: 'Priority Shipping',
    description: 'Estimated delivery: 7–14 business days',
    priceUsd: 25,
    isDefault: false
  }
];

var DEFAULT_PRODUCTS = [
  { name: 'Audi R8 - White', slug: 'audi-r8-white', price: 'US$98', sizes: '30 x 45 cm, 40 x 60 cm' },
  { name: 'Audi R8 - Yellow', slug: 'audi-r8-yellow', price: 'US$98', sizes: '30 x 45 cm, 40 x 60 cm' },
  { name: 'Audi R8 GT3', slug: 'audi-r8-gt3', price: 'US$98', sizes: '30 x 45 cm, 40 x 60 cm' },
  { name: 'Audi RS6', slug: 'audi-rs6', price: 'US$98', sizes: '30 x 45 cm, 40 x 60 cm' }
];

function moneyUsd(n) {
  var v = Number(n);
  if (!Number.isFinite(v)) return 'US$0';
  return 'US$' + v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function normalizeShipping(methods) {
  var list = Array.isArray(methods) && methods.length ? methods : DEFAULT_SHIPPING;
  return list
    .slice()
    .sort(function (a, b) {
      return (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0);
    })
    .map(function (m) {
      return {
        code: m.code || '',
        label: m.label || m.code || 'Shipping',
        description: m.description || '',
        priceUsd: Number(m.priceUsd != null ? m.priceUsd : m.price_usd) || 0,
        isDefault: !!(m.isDefault != null ? m.isDefault : m.is_default)
      };
    });
}

export function buildSystemPrompt(options) {
  options = options || {};
  var shipping = normalizeShipping(options.shippingMethods);
  var products = Array.isArray(options.products) && options.products.length ? options.products : DEFAULT_PRODUCTS;

  var shippingLines = shipping.map(function (m) {
    return (
      '- ' +
      m.label +
      ' (' +
      m.code +
      '): ' +
      moneyUsd(m.priceUsd) +
      (m.description ? ' — ' + m.description : '') +
      (m.isDefault ? ' [default at checkout]' : '')
    );
  });

  var productLines = products.map(function (p) {
    return '- ' + p.name + ' (' + p.slug + '): ' + p.price + ', sizes ' + (p.sizes || '30 x 45 cm, 40 x 60 cm');
  });

  return [
    'You are the ZYBAR website assistant for LED automotive wall art.',
    'Help with product recommendations, shipping answers, and customer support.',
    'Be concise, friendly, and practical.',
    'Answer support questions using ONLY the store information below.',
    'When asked about shipping fees or delivery times, quote the exact figures from Shipping methods.',
    'Do not invent policies, prices, shipping times, or unavailable products.',
    'If unsure, suggest /contact.html or /policies/faq.html.',
    '',
    'Store facts:',
    '- Brand: ZYBAR',
    '- Ships from: Mantin, Malaysia',
    '- Worldwide shipping: yes',
    '- Typical delivery: about 7–21 business days depending on method and destination',
    '- Sizes: 30 x 45 cm and 40 x 60 cm',
    '- Power: Universal USB cable included; optional USB + Battery upgrade',
    '- Returns: 30-day easy returns',
    '- Payments: major cards, Apple Pay / Google Pay where available',
    '- Contact: /contact.html',
    '',
    'Shipping methods (authoritative):',
    shippingLines.join('\n'),
    '',
    'Catalog sample:',
    productLines.join('\n')
  ].join('\n');
}

export async function loadShippingMethods(env) {
  if (!env || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return DEFAULT_SHIPPING;
  }
  try {
    var res = await fetch(env.SUPABASE_URL + '/rest/v1/rpc/get_store_pricing', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY
      },
      body: '{}'
    });
    if (!res.ok) return DEFAULT_SHIPPING;
    var data = await res.json();
    var methods = data && data.shippingMethods ? data.shippingMethods : null;
    return normalizeShipping(methods);
  } catch (_) {
    return DEFAULT_SHIPPING;
  }
}
