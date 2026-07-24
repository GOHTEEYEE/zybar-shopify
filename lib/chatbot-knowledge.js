/**
 * ZYBAR chatbot knowledge — system prompt with live shipping + store FAQ.
 * Used by server.js (and mirrored for Cloudflare).
 */

var DEFAULT_SHIPPING = [
  {
    code: 'standard',
    label: 'Standard Shipping',
    description: 'Estimated delivery: 14–18 business days',
    priceUsd: 23.99,
    isDefault: true
  },
  {
    code: 'priority',
    label: 'Priority Shipping',
    description: 'Estimated delivery: 7–14 business days',
    priceUsd: 26.99,
    isDefault: false
  }
];

var DEFAULT_PRODUCTS = [
  { name: 'Audi R8 - White', slug: 'audi-r8-white', price: '$98.00', sizes: '30 x 45 cm, 40 x 60 cm' },
  { name: 'Audi R8 - Yellow', slug: 'audi-r8-yellow', price: '$98.00', sizes: '30 x 45 cm, 40 x 60 cm' },
  { name: 'Audi R8 GT3', slug: 'audi-r8-gt3', price: '$98.00', sizes: '30 x 45 cm, 40 x 60 cm' },
  { name: 'Audi RS6', slug: 'audi-rs6', price: '$98.00', sizes: '30 x 45 cm, 40 x 60 cm' },
  { name: 'B Dodge Hellcat 02', slug: 'b-dodge-hellcat-02', price: '$98.00', sizes: '30 x 45 cm, 40 x 60 cm' },
  { name: 'B Dodge Hellcat 03', slug: 'b-dodge-hellcat-03', price: '$98.00', sizes: '30 x 45 cm, 40 x 60 cm' },
  { name: 'B Ferrari F40', slug: 'b-ferrari-f40', price: '$98.00', sizes: '30 x 45 cm, 40 x 60 cm' },
  { name: 'B Maserati MC20', slug: 'b-maserati-mc20', price: '$98.00', sizes: '30 x 45 cm, 40 x 60 cm' }
];

function moneyUsd(n) {
  var v = Number(n);
  if (!Number.isFinite(v)) return 'US$0';
  return (
    'US$' +
    v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  );
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

function productsFromCatalog(catalog) {
  if (!catalog || !catalog.products) return DEFAULT_PRODUCTS.slice();
  var rows = [];
  Object.keys(catalog.products).forEach(function (slug) {
    var p = catalog.products[slug];
    if (!p || p.status === 'deactive') return;
    var prices = p.prices || {};
    var p30 = Number(prices['30x45']);
    var p40 = Number(prices['40x60']);
    var priceLabel =
      Number.isFinite(p30) && Number.isFinite(p40)
        ? moneyUsd(p30) + ' / ' + moneyUsd(p40) + ' (30x45 / 40x60)'
        : Number.isFinite(p30)
          ? moneyUsd(p30)
          : Number.isFinite(p40)
            ? moneyUsd(p40)
            : 'see catalog';
    rows.push({
      name: p.name || slug,
      slug: slug,
      price: priceLabel,
      sizes: '30 x 45 cm, 40 x 60 cm'
    });
  });
  rows.sort(function (a, b) {
    return a.name.localeCompare(b.name);
  });
  return rows.length ? rows.slice(0, 40) : DEFAULT_PRODUCTS.slice();
}

function powerUpgradeLines(catalog) {
  var upgrades = (catalog && catalog.powerUpgrades) || {
    usb: { label: 'USB Only', priceUsd: 0 },
    dual: { label: 'USB + Battery', priceUsd: 12 }
  };
  return Object.keys(upgrades).map(function (key) {
    var u = upgrades[key] || {};
    return (
      '- ' +
      (u.label || key) +
      ' (' +
      key +
      '): ' +
      moneyUsd(u.priceUsd != null ? u.priceUsd : u.price_usd) +
      ' upgrade'
    );
  });
}

function buildSystemPrompt(options) {
  options = options || {};
  var shipping = normalizeShipping(options.shippingMethods);
  var products = options.products || productsFromCatalog(options.catalog);
  var catalog = options.catalog || null;

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
    return '- ' + p.name + ' (' + p.slug + '): ' + p.price + ', sizes ' + p.sizes;
  });

  return [
    'You are the ZYBAR website assistant for LED automotive wall art.',
    'Help with product recommendations, shipping answers, and customer support.',
    'Be concise, friendly, and practical.',
    'If the user wants a recommendation, ask 1-2 short questions if needed, then recommend 1-3 products from the catalog.',
    'Answer support questions using ONLY the store information below.',
    'When asked about shipping fees, prices, or delivery times, quote the exact figures from Shipping methods.',
    'Do not invent policies, prices, shipping times, or unavailable products.',
    'If something is not listed below, say you are not sure and suggest /contact.html or /policies/faq.html.',
    'When useful, mention /collections/all/ for the full catalog and /checkout/ for shipping selection.',
    '',
    'Store facts:',
    '- Brand: ZYBAR',
    '- Products: handmade LED automotive wall art / light painting',
    '- Handcrafted in: Japan',
    '- Ships from: Tokyo, Japan',
    '- Worldwide shipping: yes',
    '- Standard Shipping: 14–18 business days',
    '- Priority Shipping: 7–14 business days',
    '- Tracking number emailed once the order ships',
    '- Ready to hang with mounting hardware included',
    '- Power options: USB Powered, or Dual Power (USB + Battery)',
    '- Custom Made: upload your car photo at /products/custom-led-car-wall-art/',
    '- Damaged in transit: contact within 48 hours with photos',
    '- Returns: 30-day easy returns; custom-made not returnable unless damaged/defective',
    '- Currency on storefront: USD',
    '',
    'Shipping methods (authoritative — use these for fee questions):',
    shippingLines.join('\n'),
    '',
    'Power upgrades:',
    powerUpgradeLines(catalog).join('\n'),
    '',
    'FAQ highlights:',
    '- Full FAQ: /policies/faq.html',
    '- Refund policy: /policies/refund-policy.html',
    '- Contact / Support: /contact.html',
    '- Custom Made: /products/custom-led-car-wall-art/',
    '',
    'Catalog (sample / active products):',
    productLines.join('\n')
  ].join('\n');
}

module.exports = {
  DEFAULT_SHIPPING: DEFAULT_SHIPPING,
  DEFAULT_PRODUCTS: DEFAULT_PRODUCTS,
  normalizeShipping: normalizeShipping,
  productsFromCatalog: productsFromCatalog,
  buildSystemPrompt: buildSystemPrompt
};
