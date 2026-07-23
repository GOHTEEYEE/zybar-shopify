#!/usr/bin/env node
/**
 * Export Welcome Journey Day 0–7 HTML into /emails/welcome/
 * and write reusable component reference snippets into /emails/components/
 * and /components/.
 *
 * Usage: node scripts/export-welcome-emails.js
 */
const fs = require('fs');
const path = require('path');
const WelcomeJourney = require('../lib/welcome-journey.js');
const C = require('../lib/email-components.js');

const ROOT = path.join(__dirname, '..');
const OUT_WELCOME = path.join(ROOT, 'emails', 'welcome');
const OUT_COMPONENTS_EMAIL = path.join(ROOT, 'emails', 'components');
const OUT_COMPONENTS_ROOT = path.join(ROOT, 'components');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeDay(day) {
  const rendered = WelcomeJourney.renderWelcomeDay(day, {
    storeUrl: WelcomeJourney.DEFAULT_STORE_URL,
    storeName: WelcomeJourney.DEFAULT_STORE_NAME
  });
  const file = path.join(OUT_WELCOME, 'day' + day + '.html');
  fs.writeFileSync(file, rendered.html, 'utf8');
  console.log('Wrote', path.relative(ROOT, file), '—', rendered.subject);
  return rendered;
}

function writeComponentSnippets() {
  const storeUrl = WelcomeJourney.DEFAULT_STORE_URL;
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
        headline: 'This isn\'t decoration.',
        body: 'It\'s presence.'
      }) +
      C.SoftPanel.render({
        eyebrow: 'Atmosphere',
        headline: 'Turn it on. The mood arrives.',
        body: 'Use Soft Panel for light editorial contrast inside dark emails.'
      }) +
      C.ImageBlock.render({
        href: storeUrl + '/collections/all/',
        imageUrl: storeUrl + '/lifestyle-gallery/styled/maybach-bedroom.jpg',
        alt: 'Maybach LED artwork in a bedroom',
        caption: 'Bedroom',
        height: 360
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
      identity: 'ZYBAR · Mantin, Negeri Sembilan, Malaysia',
      reason: 'Component reference — footer used on every Welcome Journey email.',
      unsubscribeHref: 'mailto:support@zybar.shop?subject=Unsubscribe',
      contactHref: 'mailto:support@zybar.shop'
    })
  };

  Object.keys(snippets).forEach(function (name) {
    const wrapped =
      '<!-- ZYBAR email component snippet: ' +
      name +
      ' — table row(s) for use inside Shell -->\n' +
      snippets[name] +
      '\n';
    fs.writeFileSync(path.join(OUT_COMPONENTS_EMAIL, name), wrapped, 'utf8');
    fs.writeFileSync(path.join(OUT_COMPONENTS_ROOT, name), wrapped, 'utf8');
    console.log('Wrote component', name);
  });
}

function writeManifest() {
  const manifest = {
    journey: WelcomeJourney.JOURNEY,
    storeUrl: WelcomeJourney.DEFAULT_STORE_URL,
    imageRoots: {
      emailOptimized: '/Image/email/',
      products: '/Image/',
      lifestyle: '/lifestyle-gallery/',
      posters: '/Poster/'
    },
    note:
      'Production emails use absolute URLs on www.zybar.shop. Local previews require the store to serve these paths.'
  };
  fs.writeFileSync(
    path.join(ROOT, 'assets', 'email', 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    'utf8'
  );
  console.log('Wrote assets/email/manifest.json');
}

ensureDir(OUT_WELCOME);
ensureDir(OUT_COMPONENTS_EMAIL);
ensureDir(OUT_COMPONENTS_ROOT);
ensureDir(path.join(ROOT, 'assets', 'email'));

for (let day = 0; day <= 7; day++) writeDay(day);
writeComponentSnippets();
writeManifest();
console.log('Welcome Journey export complete.');
