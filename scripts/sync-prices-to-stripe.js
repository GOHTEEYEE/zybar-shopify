/**
 * Sync product prices to Stripe.
 * Creates or reuses Stripe Products and Prices from data/products.json.
 * Run: node scripts/sync-prices-to-stripe.js   (or npm run sync-stripe)
 * Requires: STRIPE_SECRET_KEY in .env (no quotes, no trailing spaces).
 */
const path = require('path');
const fs = require('fs');

const projectRoot = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(projectRoot, '.env') });

const STRIPE_SECRET_KEY = (process.env.STRIPE_SECRET_KEY || '').trim();
if (!STRIPE_SECRET_KEY) {
  console.error('Missing STRIPE_SECRET_KEY in .env');
  console.error('Add: STRIPE_SECRET_KEY=sk_test_... (from https://dashboard.stripe.com/apikeys)');
  process.exit(1);
}
if (!STRIPE_SECRET_KEY.startsWith('sk_test_') && !STRIPE_SECRET_KEY.startsWith('sk_live_')) {
  console.error('STRIPE_SECRET_KEY must start with sk_test_ or sk_live_');
  process.exit(1);
}
if (STRIPE_SECRET_KEY.length < 50 || /xxxx|REPLACE_ME|xxx/.test(STRIPE_SECRET_KEY)) {
  console.error('STRIPE_SECRET_KEY looks like a placeholder. Use a real key from https://dashboard.stripe.com/apikeys');
  process.exit(1);
}

const Stripe = require('stripe');

const dataPath = path.join(__dirname, '..', 'data', 'products.json');
let data;
try {
  data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
} catch (e) {
  console.error('Failed to read data/products.json:', e.message);
  process.exit(1);
}

const { currency = 'usd', pricesBySize, perProductPricesBySize = {}, products } = data;
if (!pricesBySize || !products || !Array.isArray(products)) {
  console.error('data/products.json must have pricesBySize and products array');
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY);

async function findProductBySlug(slug) {
  const list = await stripe.products.list({ limit: 100 });
  return list.data.find((p) => p.metadata && p.metadata.slug === slug) || null;
}

async function findPriceByProductAndSize(productId, size) {
  const list = await stripe.prices.list({ product: productId, active: true });
  return list.data.find((p) => p.metadata && p.metadata.size === size) || null;
}

async function getOrCreateProduct(slug, name) {
  let product = await findProductBySlug(slug);
  if (product) return product;
  product = await stripe.products.create({
    name,
    metadata: { slug },
  });
  console.log('Created product:', slug, product.id);
  return product;
}

async function getOrCreatePrice(productId, size, amountUSD) {
  const amountCents = Math.round(Number(amountUSD) * 100);
  let price = await findPriceByProductAndSize(productId, size);
  if (price && price.unit_amount === amountCents) return price;
  if (price) {
    await stripe.prices.update(price.id, { active: false });
    price = null;
  }
  price = await stripe.prices.create({
    product: productId,
    currency: (currency || 'usd').toLowerCase(),
    unit_amount: amountCents,
    metadata: { size },
  });
  console.log('Created price:', productId, size, amountUSD, '->', price.id);
  return price;
}

async function run() {
  const output = {
    prices: {},
    sizePricesUSD: { ...pricesBySize },
    perProductSizePricesUSD: { ...perProductPricesBySize }
  };
  const sizes = Object.keys(pricesBySize);

  for (const prod of products) {
    const { slug, name } = prod;
    const product = await getOrCreateProduct(slug, name);
    output.prices[slug] = {};
    for (const size of sizes) {
      const perProduct = perProductPricesBySize && perProductPricesBySize[slug];
      const amount = perProduct && typeof perProduct[size] === 'number'
        ? perProduct[size]
        : pricesBySize[size];
      const price = await getOrCreatePrice(product.id, size, amount);
      output.prices[slug][size] = price.id;
    }
  }

  const outPath = path.join(__dirname, '..', 'data', 'stripe-price-ids.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');
  console.log('\nWrote', outPath);

  const configPath = path.join(__dirname, '..', 'js', 'stripe-config.js');
  try {
    let config = fs.readFileSync(configPath, 'utf8');
    const sizePricesRepl = 'sizePricesUSD: ' + JSON.stringify(output.sizePricesUSD);
    config = config.replace(/sizePricesUSD:\s*\{[^}]*\}/, sizePricesRepl);
    const perProductRepl = 'perProductSizePricesUSD: ' + JSON.stringify(output.perProductSizePricesUSD, null, 2).replace(/\n/g, '\n    ');
    config = replaceJsObjectAfterKey(config, 'perProductSizePricesUSD', perProductRepl);

    const pricesJson = JSON.stringify(output.prices, null, 2);
    // Do not prefix "    " — slice(0, start) already ends with the line indent before `prices:`.
    const pricesRepl = 'prices: ' + pricesJson.replace(/\n/g, '\n    ');
    config = replaceJsObjectAfterKey(config, 'prices', pricesRepl);

    fs.writeFileSync(configPath, config, 'utf8');
    console.log('Updated js/stripe-config.js with new price IDs.');
  } catch (e) {
    console.warn('Could not update stripe-config.js:', e.message);
    console.log('\nManually copy "prices" and "sizePricesUSD" from', outPath, 'into js/stripe-config.js');
  }
}

/** Replace `key: { ... }` where `{` may contain nested braces (safe for prices map). */
function replaceJsObjectAfterKey(source, key, replacement) {
  const needle = key + ':';
  const start = source.indexOf(needle);
  if (start === -1) throw new Error('Key not found: ' + key);
  const braceStart = source.indexOf('{', start + needle.length);
  if (braceStart === -1) throw new Error('Expected { after ' + key);
  let depth = 0;
  let inString = false;
  let stringQuote = '';
  let escape = false;
  for (let i = braceStart; i < source.length; i++) {
    const c = source[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === '\\') {
        escape = true;
        continue;
      }
      if (c === stringQuote) inString = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inString = true;
      stringQuote = c;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        return source.slice(0, start) + replacement + source.slice(i + 1);
      }
    }
  }
  throw new Error('Unclosed object for key: ' + key);
}

run().catch((err) => {
  if (err.type === 'StripeAuthenticationError') {
    console.error('\nStripe rejected your API key. Common causes:');
    console.error('  • Key was revoked or is from a deleted/test account');
    console.error('  • Copy-paste error (extra space, missing characters)');
    console.error('  • Using a Publishable key (pk_) instead of Secret key (sk_)');
    console.error('\nFix: get a new Secret key from https://dashboard.stripe.com/apikeys');
    console.error('      Put it in .env as: STRIPE_SECRET_KEY=sk_test_... (no quotes)');
  } else {
    console.error(err);
  }
  process.exit(1);
});
