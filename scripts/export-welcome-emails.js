#!/usr/bin/env node
/**
 * Export Welcome / Cart / Purchase Journey Day 0–7 HTML.
 * Usage: node scripts/export-welcome-emails.js
 */
const fs = require('fs');
const path = require('path');
const WelcomeJourney = require('../lib/welcome-journey.js');
const CartJourney = require('../lib/cart-journey.js');
const PurchaseJourney = require('../lib/purchase-journey.js');
const C = require('../lib/email-components.js');
const Unsubscribe = require('../lib/unsubscribe.js');

const ROOT = path.join(__dirname, '..');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJourney(folder, renderFn, storeUrl, storeName) {
  const out = path.join(ROOT, 'emails', folder);
  ensureDir(out);
  for (let day = 0; day <= 7; day++) {
    const rendered = renderFn(day, { storeUrl: storeUrl, storeName: storeName });
    const file = path.join(out, 'day' + day + '.html');
    // Previews have no recipient, so the unsubscribe placeholder resolves to the mailto fallback.
    fs.writeFileSync(file, Unsubscribe.applyUrlToHtml(rendered.html, ''), 'utf8');
    console.log('Wrote', path.relative(ROOT, file), '—', rendered.subject);
  }
}

function writeComponentSnippets() {
  const storeUrl = WelcomeJourney.DEFAULT_STORE_URL;
  const outEmail = path.join(ROOT, 'emails', 'components');
  const outRoot = path.join(ROOT, 'components');
  ensureDir(outEmail);
  ensureDir(outRoot);
  const snippets = {
    'hero.html': C.Hero.render({
      href: storeUrl + '/collections/all/',
      imageUrl: storeUrl + '/Image/email/welcome-hero.jpg',
      alt: 'ZYBAR LED car artwork glowing in a garage office',
      height: 420
    }),
    'section.html':
      C.RichText.render({
        eyebrow: 'ZYBAR',
        headline: "This isn't decoration.",
        body: "It's presence."
      }) +
      C.SoftPanel.render({
        eyebrow: 'Atmosphere',
        headline: 'Turn it on. The mood arrives.',
        body: 'Use Soft Panel for light editorial contrast inside dark emails.'
      }),
    'button.html': C.Button.render({
      href: storeUrl + '/collections/all/',
      label: 'Explore Collection'
    }),
    'footer.html': C.Footer.render({
      socials: [
        { label: 'Instagram', href: 'https://www.instagram.com/zybar.shop' },
        { label: 'TikTok', href: 'https://www.tiktok.com/@zybar.shop' }
      ],
      identity: 'ZYBAR · Tokyo, Japan',
      reason: 'Component reference — footer used on lifecycle emails.',
      unsubscribeHref: 'mailto:support@zybar.shop?subject=Unsubscribe',
      contactHref: 'mailto:support@zybar.shop'
    })
  };
  Object.keys(snippets).forEach(function (name) {
    const wrapped =
      '<!-- ZYBAR email component snippet: ' + name + ' -->\n' + snippets[name] + '\n';
    fs.writeFileSync(path.join(outEmail, name), wrapped, 'utf8');
    fs.writeFileSync(path.join(outRoot, name), wrapped, 'utf8');
  });
}

ensureDir(path.join(ROOT, 'assets', 'email'));
writeJourney('welcome', WelcomeJourney.renderWelcomeDay, WelcomeJourney.DEFAULT_STORE_URL, WelcomeJourney.DEFAULT_STORE_NAME);
writeJourney('cart', CartJourney.renderCartDay, CartJourney.DEFAULT_STORE_URL, CartJourney.DEFAULT_STORE_NAME);
writeJourney('purchase', PurchaseJourney.renderPurchaseDay, PurchaseJourney.DEFAULT_STORE_URL, PurchaseJourney.DEFAULT_STORE_NAME);
writeComponentSnippets();

fs.writeFileSync(
  path.join(ROOT, 'assets', 'email', 'manifest.json'),
  JSON.stringify(
    {
      welcome: WelcomeJourney.JOURNEY,
      cart: CartJourney.JOURNEY,
      purchase: PurchaseJourney.JOURNEY,
      storeUrl: WelcomeJourney.DEFAULT_STORE_URL
    },
    null,
    2
  ) + '\n',
  'utf8'
);

console.log('Lifecycle email export complete.');
