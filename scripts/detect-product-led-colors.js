#!/usr/bin/env node
/**
 * Scan product hero images and write detected LED colors into data/products.json.
 * Run: node scripts/detect-product-led-colors.js
 */
const fs = require('fs');
const path = require('path');
const {
  firstExistingImage,
  resolveLedColor,
  getExplicitLedColorFromSlug
} = require('./lib/product-led-color');

const productsJsonPath = path.join(__dirname, '..', 'data', 'products.json');

async function run() {
  const productsCfg = JSON.parse(fs.readFileSync(productsJsonPath, 'utf8'));
  const products = productsCfg.products || [];
  const report = [];

  for (let i = 0; i < products.length; i += 1) {
    const p = products[i];
    const imagePath = firstExistingImage(p.slug);
    const explicit = getExplicitLedColorFromSlug(p.slug, p.name);
    const detected = await resolveLedColor(p.slug, p.name, { imagePath: imagePath });
    p.ledColor = detected;
    report.push({
      slug: p.slug,
      image: imagePath ? path.basename(imagePath) : '(missing)',
      explicit: explicit || '',
      ledColor: detected
    });
  }

  fs.writeFileSync(productsJsonPath, JSON.stringify(productsCfg, null, 2) + '\n', 'utf8');

  console.log('Detected LED colors:');
  report.forEach(function (row) {
    const note = row.explicit ? ' [slug]' : '';
    console.log('  ' + row.slug.padEnd(32) + row.ledColor.padEnd(8) + note + '  ' + row.image);
  });
}

run().catch(function (err) {
  console.error(err);
  process.exit(1);
});
