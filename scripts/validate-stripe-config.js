/**
 * Validate Stripe config consistency against data/products.json + live Stripe prices.
 * Run: node scripts/validate-stripe-config.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Stripe = require('stripe');

const projectRoot = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(projectRoot, '.env') });

const STRIPE_SECRET_KEY = (process.env.STRIPE_SECRET_KEY || '').trim();
if (!STRIPE_SECRET_KEY) {
  console.error('Missing STRIPE_SECRET_KEY in .env');
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY);
const productsPath = path.join(projectRoot, 'data', 'products.json');
const stripeConfigPath = path.join(projectRoot, 'js', 'stripe-config.js');

function loadProductsConfig() {
  const raw = fs.readFileSync(productsPath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || !parsed.pricesBySize || !Array.isArray(parsed.products)) {
    throw new Error('data/products.json must include pricesBySize and products[]');
  }
  return parsed;
}

function loadStripeConfigObject() {
  const source = fs.readFileSync(stripeConfigPath, 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  const cfg = sandbox.window.ZYBAR_STRIPE_CONFIG || {};
  if (!cfg || typeof cfg !== 'object') {
    throw new Error('window.ZYBAR_STRIPE_CONFIG is missing in js/stripe-config.js');
  }
  return cfg;
}

function getExpectedAmountUSD(productsConfig, stripeConfig, slug, size) {
  const fromProductsPerProduct = productsConfig.perProductPricesBySize &&
    productsConfig.perProductPricesBySize[slug] &&
    typeof productsConfig.perProductPricesBySize[slug][size] === 'number'
    ? productsConfig.perProductPricesBySize[slug][size]
    : null;
  if (fromProductsPerProduct !== null) return fromProductsPerProduct;

  const fromStripePerProduct = stripeConfig.perProductSizePricesUSD &&
    stripeConfig.perProductSizePricesUSD[slug] &&
    typeof stripeConfig.perProductSizePricesUSD[slug][size] === 'number'
    ? stripeConfig.perProductSizePricesUSD[slug][size]
    : null;
  if (fromStripePerProduct !== null) return fromStripePerProduct;

  if (typeof productsConfig.pricesBySize[size] === 'number') return productsConfig.pricesBySize[size];
  if (stripeConfig.sizePricesUSD && typeof stripeConfig.sizePricesUSD[size] === 'number') {
    return stripeConfig.sizePricesUSD[size];
  }
  return null;
}

async function run() {
  const productsConfig = loadProductsConfig();
  const stripeConfig = loadStripeConfigObject();
  const sizes = Object.keys(productsConfig.pricesBySize || {});
  const slugs = productsConfig.products.map(function (p) { return p.slug; }).filter(Boolean);
  const errors = [];
  const warnings = [];

  if (!stripeConfig.prices || typeof stripeConfig.prices !== 'object') {
    throw new Error('js/stripe-config.js is missing prices map');
  }

  for (const slug of slugs) {
    if (!stripeConfig.prices[slug]) {
      errors.push('Missing prices entry for slug: ' + slug);
      continue;
    }
    for (const size of sizes) {
      const id = stripeConfig.prices[slug][size];
      if (!id || typeof id !== 'string') {
        errors.push('Missing Stripe price ID for ' + slug + ' / ' + size);
        continue;
      }
      try {
        const price = await stripe.prices.retrieve(id.trim(), { expand: ['product'] });
        if (!price.active) {
          errors.push('Inactive Stripe price ID for ' + slug + ' / ' + size + ': ' + id);
        }
        const expectedAmountUSD = getExpectedAmountUSD(productsConfig, stripeConfig, slug, size);
        if (expectedAmountUSD !== null) {
          const expectedAmountCents = Math.round(Number(expectedAmountUSD) * 100);
          if (price.unit_amount !== expectedAmountCents) {
            errors.push(
              'Amount mismatch for ' + slug + ' / ' + size +
              ': expected $' + Number(expectedAmountUSD).toFixed(2) +
              ' but Stripe ID ' + id + ' is $' + (Number(price.unit_amount || 0) / 100).toFixed(2)
            );
          }
        }
        const product = price.product && typeof price.product === 'object' ? price.product : null;
        const productSlugMeta = product && product.metadata ? product.metadata.slug : '';
        if (productSlugMeta && productSlugMeta !== slug) {
          errors.push('Wrong Stripe product mapped for ' + slug + ' / ' + size + ': ' + id + ' has product metadata.slug=' + productSlugMeta);
        }
      } catch (error) {
        errors.push('Failed to retrieve Stripe price for ' + slug + ' / ' + size + ': ' + id + ' (' + (error.message || 'unknown error') + ')');
      }
    }
  }

  const configuredSlugs = Object.keys(stripeConfig.prices);
  configuredSlugs.forEach(function (slug) {
    if (slugs.indexOf(slug) === -1) warnings.push('prices contains extra slug not in data/products.json: ' + slug);
  });

  if (warnings.length) {
    console.log('Warnings:');
    warnings.forEach(function (w) { console.log('- ' + w); });
    console.log('');
  }
  if (errors.length) {
    console.error('Stripe config validation failed:');
    errors.forEach(function (e) { console.error('- ' + e); });
    process.exit(1);
  }

  console.log('Stripe config validation passed.');
}

run().catch(function (error) {
  console.error(error);
  process.exit(1);
});
