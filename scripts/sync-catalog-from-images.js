/**
 * Sync website catalog from Image/*-1 assets.
 *
 * What it does:
 * 1) Adds missing slugs to data/products.json
 * 2) Creates missing products/<slug>/index.html pages
 * 3) Rebuilds product cards + JSON-LD ItemList in collections/all/index.html
 *
 * Run: node scripts/sync-catalog-from-images.js
 */
const fs = require('fs');
const path = require('path');
const {
  toDisplayNameFromSlug,
  resolveLedColor,
  formatNeonPosterCardTitle
} = require('./lib/product-led-color');

const root = path.join(__dirname, '..');
const imageDir = path.join(root, 'Image');
const productsJsonPath = path.join(root, 'data', 'products.json');
const productsDir = path.join(root, 'products');
const collectionPath = path.join(root, 'collections', 'all', 'index.html');
const sitemapPath = path.join(root, 'sitemap.xml');

function getPrimaryImageMap() {
  const files = fs.readdirSync(imageDir);
  const map = new Map();
  files.forEach(function (file) {
    const m = file.match(/^(.*)-1\.(webp|jpg|jpeg|png)$/i);
    if (!m) return;
    const slug = m[1];
    const ext = m[2].toLowerCase();
    if (!map.has(slug)) map.set(slug, []);
    map.get(slug).push(ext);
  });
  return map;
}

function getImagePathForSlug(slug, map) {
  const exts = map.get(slug) || [];
  if (exts.indexOf('webp') !== -1) return '/Image/' + slug + '-1.webp';
  if (exts.indexOf('jpg') !== -1) return '/Image/' + slug + '-1.jpg';
  if (exts.indexOf('jpeg') !== -1) return '/Image/' + slug + '-1.jpeg';
  if (exts.indexOf('png') !== -1) return '/Image/' + slug + '-1.png';
  return '/Image/' + slug + '-1.webp';
}

function firstExistingFile(baseName) {
  const exts = ['webp', 'jpg', 'jpeg', 'png'];
  for (let i = 0; i < exts.length; i += 1) {
    const filePath = path.join(imageDir, baseName + '.' + exts[i]);
    if (fs.existsSync(filePath)) return '/Image/' + baseName + '.' + exts[i];
  }
  return '';
}

function getCardImagePaths(slug, map) {
  const offSrc = getImagePathForSlug(slug, map);
  const onSrc = firstExistingFile(slug + '-1-on');
  const cardSrc = onSrc || offSrc;
  return { cardSrc, offSrc, onSrc };
}

function getPriceForCard(slug, productsCfg) {
  const per = productsCfg.perProductPricesBySize &&
    productsCfg.perProductPricesBySize[slug] &&
    typeof productsCfg.perProductPricesBySize[slug]['30x45'] === 'number'
    ? productsCfg.perProductPricesBySize[slug]['30x45']
    : null;
  if (per !== null) return per;
  return Number(productsCfg.pricesBySize && productsCfg.pricesBySize['30x45']) || 98;
}

function productPageTemplate(slug, name, imagePath, price30) {
  const titleName = name + ' Edition';
  const safeName = name.replace(/"/g, '&quot;');
  return [
    '<!doctype html>',
    '<html lang="en">',
    '  <head>',
    '    <meta charset="UTF-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    '    <title>' + name + ' LED Wall Art | ZYBAR</title>',
    '    <meta name="description" content="' + safeName + ' LED wall art by ZYBAR. Premium automotive light painting available in 30x45 and 40x60 cm." />',
    '    <link rel="canonical" href="https://zybar-ledcar.pages.dev/products/' + slug + '/" />',
    '    <link rel="stylesheet" href="/styles.css?v=ql1" />',
    '    <script src="/js/nav-drawer.js?v=conv1" defer></script>',
    '  </head>',
    '  <body>',
    '    <header class="site-header">',
    '      <div class="container header-wrap">',
    '        <a class="brand zybar-logo" href="/"><img src="/Poster/ChatGPT Image 2026年2月9日 15_16_52 1.png" alt="ZYBAR" class="logo-img" loading="eager" width="1304" height="287" /></a>',
    '        <nav class="nav main-nav"><a href="/">Home</a><a href="/collections/all/">Catalog</a><a href="/contact.html">Contact</a></nav>',
    '        <div class="header-actions"><span class="currency">USD ▾</span><button type="button" class="icon-btn" aria-label="Search">⌕</button><a href="/collections/all/" class="icon-btn" aria-label="Cart">🛒</a></div>',
    '      </div>',
    '    </header>',
    '',
    '    <main class="product-showcase-wrap">',
    '      <div class="product-showcase">',
    '        <div class="product-showcase-image">',
    '          <div class="product-showcase-image-inner">',
    '            <img src="' + imagePath + '" alt="' + name + ' LED wall art by ZYBAR" loading="eager" width="990" height="990" />',
    '          </div>',
    '        </div>',
    '        <div class="product-showcase-details">',
    '          <h1>' + titleName + '</h1>',
    '          <p class="product-price">$' + Number(price30).toFixed(2) + '</p>',
    '          <div class="product-showcase-actions">',
    '            <button type="button" class="wishlist-btn" aria-label="Add to wishlist">♡</button>',
    '          </div>',
    '          <ul class="product-features" aria-label="Product features">',
    '            <li>Handmade LED automotive wall art</li>',
    '            <li>Multiple lighting modes with memory function</li>',
    '            <li>Remote control – brightness &amp; speed adjustable</li>',
    '            <li>USB &amp; battery powered options</li>',
    '          </ul>',
    '          <span class="product-option-label">Size</span>',
    '          <div class="product-size-options">',
    '            <button type="button" class="size-option selected" data-size="30x45">30 x 45 cm</button>',
    '            <button type="button" class="size-option" data-size="40x60">40 x 60 cm</button>',
    '          </div>',
    '          <div class="product-cart-row">',
    '            <div class="product-quantity">',
    '              <button type="button" aria-label="Decrease quantity">-</button>',
    '              <span>1</span>',
    '              <button type="button" aria-label="Increase quantity">+</button>',
    '            </div>',
    '            <a href="#" class="product-add-cart" data-stripe-action="checkout">Add to cart</a>',
    '          </div>',
    '          <a href="/collections/all/" class="product-paypal" data-stripe-action="checkout">Pay with card</a>',
    '          <a href="/collections/all/" class="product-more-payment">More payment options</a>',
    '        </div>',
    '      </div>',
    '',
    '      <section class="pdp-section" aria-labelledby="pdp-features-heading">',
    '        <h2 id="pdp-features-heading">Features</h2>',
    '        <ul class="product-features" aria-label="' + safeName + ' specifications">',
    '          <li><strong>Frame material:</strong> Premium acrylic panel with matte-backed diffusion</li>',
    '          <li><strong>LED type:</strong> Integrated LED strips with multiple modes + memory</li>',
    '          <li><strong>Power source:</strong> USB powered + optional AA battery support</li>',
    '          <li><strong>Control:</strong> Remote control for brightness &amp; speed</li>',
    '          <li><strong>Mounting:</strong> Wall-ready, easy install (no drilling required)</li>',
    '          <li><strong>Sizes:</strong> 30×45 cm and 40×60 cm</li>',
    '          <li><strong>Use case:</strong> Luxury garage decor, neon wall art vibe, gift for car lovers</li>',
    '        </ul>',
    '      </section>',
    '      <section class="product-feature section" aria-labelledby="product-feature-heading" id="product-feature">',
    '        <div class="container">',
    '          <header class="product-feature-header">',
    '            <h2 class="product-feature-heading" id="product-feature-heading">Core Features</h2>',
    '            <p class="product-feature-heading-subtitle">The ZYBAR Standard of Excellence</p>',
    '          </header>',
    '          <div class="product-feature-wrap">',
    '            <div class="product-feature-media">',
    '              <img src="/Poster/description1.png?v=space1" alt="ZYBAR precision illumination – LED artwork engineered to shine from within" class="product-feature-img" loading="lazy" width="600" height="400" />',
    '            </div>',
    '            <div class="product-feature-content">',
    '              <h2 class="product-feature-title" id="product-feature-title">ZYBAR PRECISION ILLUMINATION</h2>',
    '              <p class="product-feature-subtitle">Engineered to Shine From Within</p>',
    '              <ul class="product-feature-list">',
    '                <li><strong>More Depth:</strong> Layered internal lighting sculpts body contours.</li>',
    '                <li><strong>More Contrast:</strong> Deepest blacks and brilliant internal highlights.</li>',
    '                <li><strong>Selective Focus:</strong> Precision-lit details and signature lines.</li>',
    '                <li><strong>Remote Controlled:</strong> Full intensity and zone control in your hand.</li>',
    '              </ul>',
    '              <div class="product-feature-callout">',
    '                <p class="product-feature-callout-label">Main Point</p>',
    '                <p class="product-feature-callout-text">ZYBAR lights the art from within, not just the edges, for depth, contrast, and control that set every piece apart.</p>',
    '              </div>',
    '            </div>',
    '          </div>',
    '        </div>',
    '      </section>',
    '      <section class="comparison-section" id="comparison">',
    '        <div class="comparison-grid">',
    '          <div class="comparison-description-wrap">',
    '            <img src="/Poster/description.png" alt="ZYBAR LED artwork – light engineered as art" class="comparison-description-img" loading="lazy" width="1024" height="1536" />',
    '          </div>',
    '          <div class="comparison-overlay-wrap">',
    '            <div class="comparison-overlay" id="comparisonOverlay" aria-label="Lights on vs lights off comparison">',
    '              <img class="comparison-image comparison-image-a" src="/Image/comparison-overlay-top.png" alt="Light on" loading="lazy" width="990" height="990" />',
    '              <img class="comparison-image comparison-image-b" src="/Image/comparison-overlay-bottom.png" alt="Light off" loading="lazy" width="1024" height="1024" />',
    '              <div class="comparison-divider" id="comparisonDivider" role="slider" tabindex="0" aria-valuenow="50" aria-valuemin="0" aria-valuemax="100" aria-label="Adjust comparison split"></div>',
    '            </div>',
    '            <p class="comparison-labels"><span>LIGHT ON</span><span>LIGHT OFF</span></p>',
    '          </div>',
    '        </div>',
    '      </section>',
    '      <section class="technical-deep-dive section" aria-labelledby="technical-deep-dive-title" id="technical-deep-dive">',
    '        <div class="technical-deep-dive-wrap">',
    '          <div class="technical-deep-dive-content">',
    '            <h2 class="technical-deep-dive-title" id="technical-deep-dive-title">THE SECRET BEHIND THE GLOW</h2>',
    '            <p class="technical-deep-dive-subtitle">Premium Materials, Superior Light</p>',
    '            <ul class="technical-deep-dive-list">',
    '              <li><strong>High-Transparency Acrylic:</strong> Optical-grade panels for 99% light transmission.</li>',
    '              <li><strong>Integrated LED Strips:</strong> High-density arrays for uniform brightness.</li>',
    '              <li><strong>Layered Construction:</strong> Multi-layer assembly for a 3D floating effect.</li>',
    '              <li><strong>Heat-Resistant Durability:</strong> Built for 50,000+ hours of performance.</li>',
    '            </ul>',
    '          </div>',
    '          <div class="technical-deep-dive-media">',
    '            <img src="/Poster/description2.png?v=ml1" alt="ZYBAR technical construction – premium materials and superior light" class="technical-deep-dive-img" loading="lazy" width="1024" height="1536" />',
    '          </div>',
    '        </div>',
    '      </section>',
    '      <section class="power-compatibility section" aria-labelledby="power-compatibility-title" id="power-compatibility">',
    '        <div class="power-compatibility-wrap">',
    '          <div class="power-compatibility-media">',
    '            <img src="/Poster/quality-levels.png?v=ql1" alt="ZYBAR premium quality levels – thick foam, strong cardboard, maximum protection" class="power-compatibility-img" loading="lazy" width="1024" height="1024" />',
    '            <img src="/Poster/description4.png?v=gold" alt="ZYBAR power options – versatile plug and play worldwide" class="power-compatibility-img" loading="lazy" width="1536" height="1024" />',
    '          </div>',
    '          <div class="power-compatibility-content">',
    '            <h2 class="power-compatibility-title" id="power-compatibility-title">VERSATILE POWER OPTIONS</h2>',
    '            <p class="power-compatibility-subtitle">Plug &amp; Play, Anywhere in the World</p>',
    '            <ul class="power-compatibility-list">',
    '              <li><strong>Universal USB Plug:</strong> Worldwide compatibility without regional adapters.</li>',
    '              <li><strong>Dual Power Mode:</strong> Support for both USB and 3x AA Batteries.</li>',
    '              <li><strong>Cordless Freedom:</strong> Perfect for clean, cable-free wall mounting.</li>',
    '              <li><strong>Energy Efficient:</strong> Low consumption, high-intensity LED output.</li>',
    '            </ul>',
    '            <div class="power-compatibility-callout">',
    '              <span class="power-compatibility-callout-icon" aria-hidden="true">✓</span>',
    '              <p class="power-compatibility-callout-text">The ZYBAR Advantage: No bulky adapters. No regional limits. Just pure, effortless light.</p>',
    '            </div>',
    '          </div>',
    '        </div>',
    '      </section>',
    '',
    '      <section class="pdp-section pdp-customization">',
    '        <article class="lifestyle-custom-card is-visible pdp-custom-made-card" id="zybar-custom-made-card">',
    '          <a class="lifestyle-custom-card-link" href="/products/custom-led-car-wall-art/" aria-label="Custom Made — turn your dream car into LED wall art">',
    '            <div class="lifestyle-custom-card-media">',
    '              <img src="/Image/custom-led-car-wall-art-1.jpg" alt="Maybach custom LED wall art glowing on a garage pegboard" loading="lazy" width="990" height="990" />',
    '              <div class="lifestyle-custom-card-media-glow" aria-hidden="true"></div>',
    '              <span class="lifestyle-custom-card-badge">Bespoke</span>',
    '            </div>',
    '            <div class="lifestyle-custom-card-body">',
    '              <p class="lifestyle-custom-card-kicker">Custom Made</p>',
    '              <h3 class="lifestyle-custom-card-title">Turn Your Dream Car Into Light.</h3>',
    '              <p class="lifestyle-custom-card-copy">Can\'t find your car in our collection? Upload one photo and we\'ll handcraft a one-of-one illuminated artwork.</p>',
    '              <ul class="lifestyle-custom-card-features" aria-label="Custom order highlights">',
    '                <li>One photo upload</li>',
    '                <li>Any make &amp; model</li>',
    '                <li>Hand-finished LED</li>',
    '              </ul>',
    '              <div class="lifestyle-custom-card-footer">',
    '                <span class="lifestyle-custom-card-price">From <strong>$148</strong></span>',
    '                <span class="lifestyle-custom-card-cta">Customize Yours<span class="lifestyle-custom-card-cta-arrow" aria-hidden="true">→</span></span>',
    '              </div>',
    '            </div>',
    '          </a>',
    '        </article>',
    '        <div class="pdp-custom-process">',
    '          <h2 class="pdp-custom-process-title">Custom Process</h2>',
    '          <ol class="pdp-custom-process-steps">',
    '            <li><span class="pdp-custom-process-num">1</span><span class="pdp-custom-process-label">Upload Your Car</span></li>',
    '            <li><span class="pdp-custom-process-num">2</span><span class="pdp-custom-process-label">Enter Your Car Model</span></li>',
    '            <li><span class="pdp-custom-process-num">3</span><span class="pdp-custom-process-label">Choose Your Lighting Style</span></li>',
    '            <li><span class="pdp-custom-process-num">4</span><span class="pdp-custom-process-label">We Handcraft It</span></li>',
    '            <li><span class="pdp-custom-process-num">5</span><span class="pdp-custom-process-label">Delivered Worldwide</span></li>',
    '          </ol>',
    '        </div>',
    '      </section>',
    '    </main>',
    '',
    '    <script>',
    '      (function () {',
    '        var section = document.getElementById("product-feature");',
    '        if (!section) return;',
    '        if (!window.IntersectionObserver) { section.classList.add("is-visible"); return; }',
    '        var observer = new IntersectionObserver(function (entries) {',
    '          entries.forEach(function (entry) {',
    '            if (entry.isIntersecting) { section.classList.add("is-visible"); observer.disconnect(); }',
    '          });',
    '        }, { threshold: 0.2, rootMargin: "0px 0px -40px 0px" });',
    '        observer.observe(section);',
    '      })();',
    '    </script>',
    '    <script>',
    '      (function () {',
    '        var overlay = document.getElementById("comparisonOverlay");',
    '        var divider = document.getElementById("comparisonDivider");',
    '        if (!overlay || !divider) return;',
    '        var dragging = false;',
    '        function clamp(value, min, max) { return Math.min(Math.max(value, min), max); }',
    '        function setPositionFromClientX(clientX) {',
    '          var rect = overlay.getBoundingClientRect();',
    '          var percent = ((clientX - rect.left) / rect.width) * 100;',
    '          percent = clamp(percent, 0, 100);',
    '          overlay.style.setProperty("--position", percent + "%");',
    '          divider.setAttribute("aria-valuenow", String(Math.round(percent)));',
    '        }',
    '        overlay.addEventListener("pointerdown", function (event) { dragging = true; overlay.setPointerCapture(event.pointerId); setPositionFromClientX(event.clientX); });',
    '        overlay.addEventListener("pointermove", function (event) { if (!dragging) return; setPositionFromClientX(event.clientX); });',
    '        overlay.addEventListener("pointerup", function () { dragging = false; });',
    '        overlay.addEventListener("pointercancel", function () { dragging = false; });',
    '      })();',
    '    </script>',
    '    <script src="https://js.stripe.com/v3/"></script>',
    '    <script src="/js/stripe-config.js"></script>',
    '    <script src="/js/mini-cart-drawer.js"></script>',
    '    <script src="/js/pdp-luxury-ui.js?v=value1"></script>',
    '    <script src="/js/stripe-checkout.js"></script>',
    '    <script src="/js/customer-reviews.js?v=contact1"></script>',
    '    <script src="/js/image-hover-toggle.js"></script>',
    '    <script src="/js/chatbot.js"></script>',
    '  </body>',
    '</html>',
    ''
  ].join('\n');
}

async function updateCollectionsAll(productsCfg, imageMap) {
  let html = fs.readFileSync(collectionPath, 'utf8');
  const products = productsCfg.products || [];

  const items = products.map(function (p, idx) {
    return '              { "@type": "ListItem", "position": ' + (idx + 1) + ', "url": "https://zybar-ledcar.pages.dev/products/' + p.slug + '/" }';
  }).join(',\n');
  html = html.replace(
    /("itemListElement"\s*:\s*\[)[\s\S]*?(\n\s*\]\s*\n\s*\}\s*\n\s*\]\s*\n\s*\}\s*<\/script>)/,
    function (_m, p1, p2) {
      return p1 + '\n' + items + p2;
    }
  );

  const cardBlocks = await Promise.all(products.map(async function (p) {
    const slug = p.slug;
    const name = p.name;
    const ledColor = await resolveLedColor(slug, name, { ledColor: p.ledColor });
    const cardTitle = formatNeonPosterCardTitle(name, slug, ledColor);
    const price = getPriceForCard(slug, productsCfg);
    const defaultPrice = Number(productsCfg.pricesBySize && productsCfg.pricesBySize['30x45']) || 138;
    const compareAt = Number(productsCfg.compareAtPricesBySize && productsCfg.compareAtPricesBySize['30x45']) || 198;
    // Sale items: show previous list price ($138). Full-price items: show compare-at MSRP.
    const comparePrice = Number(price) < defaultPrice ? defaultPrice : compareAt;
    const paths = getCardImagePaths(slug, imageMap);
    const offAttr = paths.onSrc && paths.offSrc && paths.offSrc !== paths.cardSrc
      ? ' data-off-src="' + paths.offSrc + '"'
      : '';
    return [
      '      <article class="product-card">',
      '        <a class="product-image-link" href="/products/' + slug + '/">',
      '          <img class="product-image" src="' + paths.cardSrc + '"' + offAttr + ' alt="' + name + ' - LED Light Painting Wall Art" loading="lazy" width="990" height="990" />',
      '        </a>',
      '        <div class="product-card-meta">',
      '          <a class="product-card-link" href="/products/' + slug + '/">',
      '            <p class="product-card-kicker">LED WALL ART</p>',
      '            <h3 class="product-card-title">' + cardTitle + '</h3>',
      '          </a>',
      '          <div class="product-card-pricing">',
      '            <p class="product-card-price-compare">$' + Number(comparePrice).toFixed(2) + '</p>',
      '            <p class="product-card-price"><span class="product-card-price-from">From</span> $' + Number(price).toFixed(2) + '</p>',
      '          </div>',
      '        </div>',
      '      </article>'
    ].join('\n');
  }));
  const cards = cardBlocks.join('\n');

  html = html.replace(
    /(<div class="products-grid">\n)[\s\S]*?(\n\s*<\/div>\n\s*<\/div>\n\s*<\/main>)/,
    function (_m, p1, p2) {
      return p1 + cards + p2;
    }
  );

  fs.writeFileSync(collectionPath, html, 'utf8');
}

async function run() {
  const imageMap = getPrimaryImageMap();
  const imageSlugs = Array.from(imageMap.keys()).sort();
  const productsCfg = JSON.parse(fs.readFileSync(productsJsonPath, 'utf8'));
  const known = new Set((productsCfg.products || []).map(function (p) { return p.slug; }));

  const added = [];
  imageSlugs.forEach(function (slug) {
    if (!known.has(slug)) {
      const name = toDisplayNameFromSlug(slug);
      productsCfg.products.push({ slug: slug, name: name });
      known.add(slug);
      added.push(slug);
    }
  });

  // Keep deterministic order.
  productsCfg.products.sort(function (a, b) {
    return a.slug.localeCompare(b.slug);
  });
  fs.writeFileSync(productsJsonPath, JSON.stringify(productsCfg, null, 2) + '\n', 'utf8');

  const createdPages = [];
  const refreshedPages = [];
  productsCfg.products.forEach(function (p) {
    const slug = p.slug;
    const dir = path.join(productsDir, slug);
    const indexPath = path.join(dir, 'index.html');
    const image = getImagePathForSlug(slug, imageMap);
    const price30 = getPriceForCard(slug, productsCfg);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(indexPath)) {
      fs.writeFileSync(indexPath, productPageTemplate(slug, p.name, image, price30), 'utf8');
      createdPages.push(slug);
      return;
    }
    // Upgrade older minimal auto-generated pages to include description sections.
    const existing = fs.readFileSync(indexPath, 'utf8');
    const isMinimalTemplate = existing.indexOf('class="product-showcase-wrap"') !== -1 &&
      existing.indexOf('class="product-feature section"') === -1;
    if (isMinimalTemplate) {
      fs.writeFileSync(indexPath, productPageTemplate(slug, p.name, image, price30), 'utf8');
      refreshedPages.push(slug);
    }
  });

  await updateCollectionsAll(productsCfg, imageMap);
  updateSitemap(productsCfg);

  console.log('Added products to data/products.json:', added.length);
  if (added.length) console.log(added.join(', '));
  console.log('Created product pages:', createdPages.length);
  if (createdPages.length) console.log(createdPages.join(', '));
  console.log('Refreshed minimal pages:', refreshedPages.length);
  if (refreshedPages.length) console.log(refreshedPages.join(', '));
  console.log('Updated collections/all/index.html');
  console.log('Updated sitemap.xml');
}

run().catch(function (err) {
  console.error(err);
  process.exit(1);
});

function updateSitemap(productsCfg) {
  const staticEntries = [
    { loc: 'https://zybar-ledcar.pages.dev/', changefreq: 'weekly', priority: '1.0' },
    { loc: 'https://zybar-ledcar.pages.dev/contact.html', changefreq: 'monthly', priority: '0.8' }
  ];
  const productEntries = (productsCfg.products || []).map(function (p) {
    return {
      loc: 'https://zybar-ledcar.pages.dev/products/' + p.slug + '/',
      changefreq: 'monthly',
      priority: '0.8'
    };
  });
  const rows = staticEntries.concat(productEntries).map(function (row) {
    return [
      '  <url>',
      '    <loc>' + row.loc + '</loc>',
      '    <changefreq>' + row.changefreq + '</changefreq>',
      '    <priority>' + row.priority + '</priority>',
      '  </url>'
    ].join('\n');
  }).join('\n');

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    rows,
    '</urlset>',
    ''
  ].join('\n');
  fs.writeFileSync(sitemapPath, xml, 'utf8');
}
