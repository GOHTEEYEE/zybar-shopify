/**
 * Sync product data from static HTML pages to Supabase.
 * Extracts price and image from each product page's ld+json and main image.
 * Run: node scripts/sync-products-to-supabase.js  (or npm run sync-products)
 * Requires: SUPABASE_URL and SUPABASE_ANON_KEY in .env (or uses admin defaults).
 */
const path = require('path');
const fs = require('fs');

const projectRoot = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(projectRoot, '.env') });

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl =
  (process.env.SUPABASE_URL || '').trim() || 'https://haebgpoowyrsufhqfexw.supabase.co';
const supabaseKey =
  (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim() ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhZWJncG9vd3lyc3VmaHFmZXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxODgwNTMsImV4cCI6MjA4ODc2NDA1M30.pMmj4-9-s7sAlYBIVm6ZU-ixxRa4aiBUyPTM9XOlnXQ';

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY. Set them in .env or use defaults.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

const productsDir = path.join(projectRoot, 'products');

function extractFromPage(htmlPath, slug) {
  const html = fs.readFileSync(htmlPath, 'utf8');

  // ld+json schema: price, image
  const ldMatch = html.match(
    /<script\s+type="application\/ld\+json">\s*(\{[\s\S]*?\})\s*<\/script>/
  );
  let price = null;
  let imageUrl = null;
  let name = null;
  let description = null;

  if (ldMatch) {
    try {
      const schema = JSON.parse(ldMatch[1]);
      const offers = schema.offers || (schema['@graph'] && schema['@graph'].find((n) => n.offers));
      if (offers) {
        price = parseFloat(offers.price);
        if (isNaN(price)) price = null;
      }
      imageUrl = schema.image || (Array.isArray(schema.image) ? schema.image[0] : null);
      name = schema.name || null;
      description = schema.description || null;
    } catch (_) {}
  }

  // Preferred: product features list (the bullet points on the right) — one per line
  const ulMatch = html.match(/<ul\s+class="product-features"[\s\S]*?<\/ul>/);
  if (ulMatch) {
    const liMatches = ulMatch[0].match(/<li>([\s\S]*?)<\/li>/g);
    if (liMatches && liMatches.length) {
      const lines = liMatches.map(function (li) {
        return li.replace(/<\/?li>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
      });
      description = lines.join('\n');
    }
  }
  // Fallback: ld+json or meta description
  if (!description && ldMatch) {
    try {
      const schema = JSON.parse(ldMatch[1]);
      description = schema.description || null;
    } catch (_) {}
  }
  if (!description) {
    const metaMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/);
    if (metaMatch) description = metaMatch[1];
  }

  // Fallback: product-price ($140.00)
  if (price == null) {
    const priceMatch = html.match(/<p\s+class="product-price">\s*\$?([\d.]+)\s*<\/p>/);
    if (priceMatch) price = parseFloat(priceMatch[1]);
  }

  // Fallback: main product img src
  if (!imageUrl) {
    const imgMatch = html.match(
      /<div\s+class="product-showcase-image-inner">\s*<img\s+src="([^"]+)"/
    );
    if (imgMatch) {
      const src = imgMatch[1];
      imageUrl = src.startsWith('/') ? src : '/' + src.replace(/^\//, '');
    }
  }

  // Normalize to relative path so thumbnails load in admin (localhost or production)
  if (imageUrl && imageUrl.startsWith('http')) {
    try {
      const u = new URL(imageUrl);
      imageUrl = u.pathname || imageUrl;
    } catch (_) {}
  }
  if (imageUrl && !imageUrl.startsWith('/')) imageUrl = '/' + imageUrl;

  return { price, imageUrl, name, description };
}

async function run() {
  const dirs = fs.readdirSync(productsDir);
  const results = [];

  for (const dir of dirs) {
    const indexPath = path.join(productsDir, dir, 'index.html');
    if (!fs.existsSync(indexPath)) continue;

    const slug = dir;
    const { price, imageUrl, name, description } = extractFromPage(indexPath, slug);

    const price30 = price != null && !isNaN(price) ? price : null;
    const price40 = price != null && !isNaN(price) ? price : null; // pages use same price for both sizes

    const update = {
      price_rm: price30,
      price_30x45_rm: price30,
      price_40x60_rm: price40,
      image_url: imageUrl || null,
      description: description || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from('products').update(update).eq('id', slug).select();

    if (error) {
      console.error(slug, error.message);
      results.push({ slug, ok: false, error: error.message });
    } else {
      console.log(slug, '→ price:', price30, 'image:', imageUrl ? 'yes' : 'no', 'description:', description ? 'yes' : 'no');
      results.push({ slug, ok: true, price30, price40, imageUrl: !!imageUrl });
    }
  }

  const ok = results.filter((r) => r.ok).length;
  console.log('\nDone. Updated', ok, 'of', results.length, 'products in Supabase.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
