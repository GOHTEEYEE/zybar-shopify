/**
 * LUNEVA post-purchase journey — short thank-you + review invite.
 * Exists so purchase exits cart recovery without ZYBAR car emails.
 */
const C = require('./email-components.js');

const DEFAULT_STORE_NAME = 'LUNEVA';
const DEFAULT_STORE_URL = 'https://www.zybar.shop';
const DEFAULT_DISCOUNT_CODE = 'LUNEVA5';
const LUNEVA_BASE = '/luneva';

const SOCIAL_LINKS = [
  { label: 'Instagram', href: 'https://www.instagram.com/zybar.shop' },
  { label: 'TikTok', href: 'https://www.tiktok.com/@zybar.shop' }
];

const JOURNEY = {
  key: 'luneva_customer_journey',
  name: 'LUNEVA Customer Journey',
  description: 'Post-purchase thank-you and review invite for LUNEVA kits.',
  days: [
    {
      day: 0,
      templateKey: 'luneva_purchase_day0',
      delayValue: 5,
      delayUnit: 'minutes',
      stepName: 'Thank You'
    },
    {
      day: 1,
      templateKey: 'luneva_purchase_day1',
      delayValue: 5,
      delayUnit: 'days',
      stepName: 'Share Your Glow'
    }
  ]
};

function withUtm(url, campaign) {
  const sep = url.indexOf('?') === -1 ? '?' : '&';
  return (
    url +
    sep +
    'utm_source=email&utm_medium=luneva_purchase&utm_campaign=' +
    encodeURIComponent(campaign || 'purchase')
  );
}

function img(storeUrl, path) {
  return storeUrl + path;
}

function header(storeUrl, storeName, campaign) {
  return C.Header.render({
    href: withUtm(storeUrl + LUNEVA_BASE + '/', campaign),
    textLabel: storeName || DEFAULT_STORE_NAME
  });
}

function footer(storeName, reason) {
  return C.Footer.render({
    socials: SOCIAL_LINKS,
    identity: (storeName || DEFAULT_STORE_NAME) + ' · Mechanical Butterfly Series',
    reason: reason || 'You purchased a LUNEVA kit.',
    unsubscribeHref: '{{unsubscribe_url}}',
    contactHref: 'mailto:support@zybar.shop'
  });
}

function ctx(options) {
  options = options || {};
  return {
    storeUrl: options.storeUrl || DEFAULT_STORE_URL,
    storeName: options.storeName || DEFAULT_STORE_NAME,
    customerName:
      options.customerName && String(options.customerName).trim()
        ? String(options.customerName).trim().split(' ')[0]
        : null
  };
}

function renderDay0(options) {
  const c = ctx(options);
  const campaign = 'luneva_purchase_day0';
  const shop = withUtm(c.storeUrl + LUNEVA_BASE + '/shop/', campaign);
  const faqs = withUtm(c.storeUrl + LUNEVA_BASE + '/faqs/', campaign);
  return {
    subject: 'Thank you — your LUNEVA kit is on the way',
    preheader: 'Ships in 5–7 days. Free worldwide shipping. We’re glad you’re here.',
    html: C.Shell.render({
      title: 'Thank You',
      preheader: 'Ships in 5–7 days. Free worldwide shipping. We’re glad you’re here.',
      sections: [
        header(c.storeUrl, c.storeName, campaign),
        C.Hero.render({
          href: shop,
          imageUrl: img(c.storeUrl, '/luneva/assets/hero/gift-moment-43.png'),
          alt: 'LUNEVA kit thank you',
          height: 400
        }),
        C.RichText.render({
          eyebrow: 'Order confirmed',
          headline: c.customerName ? 'Thank you, ' + c.customerName + '.' : 'Thank you.',
          body:
            'Your mechanical butterfly kit is being prepared.<br/>Expect shipping in about 5–7 days — free worldwide.'
        }),
        C.SoftPanel.render({
          eyebrow: 'Next',
          headline: 'Assemble when it arrives',
          body: 'Clear guide included. Take an evening. Finish with soft LED glow.'
        }),
        C.Button.render({ href: faqs, label: 'Assembly & shipping FAQs' }),
        footer(c.storeName)
      ]
    })
  };
}

function renderDay1(options) {
  const c = ctx(options);
  const campaign = 'luneva_purchase_day1';
  const reviews = withUtm(c.storeUrl + LUNEVA_BASE + '/reviews/', campaign);
  return {
    subject: 'How does your LUNEVA glow?',
    preheader: 'A short review helps the next gifter choose with confidence.',
    html: C.Shell.render({
      title: 'Share Your Glow',
      preheader: 'A short review helps the next gifter choose with confidence.',
      sections: [
        header(c.storeUrl, c.storeName, campaign),
        C.RichText.render({
          eyebrow: 'Community',
          headline: 'Share your glow.',
          body:
            'If your kit is assembled — or even still on the desk — we’d love a quick note on how it feels in the room.'
        }),
        C.ImageBlock.render({
          href: reviews,
          imageUrl: img(c.storeUrl, '/luneva/assets/dreamy-garden/lifestyle.png'),
          alt: 'LUNEVA lifestyle glow',
          caption: 'Real desks. Real gifts.',
          height: 380
        }),
        C.Button.render({ href: reviews, label: 'Leave a review' }),
        footer(c.storeName, 'This closes your LUNEVA post-purchase sequence.')
      ]
    })
  };
}

const DAY_RENDERERS = { 0: renderDay0, 1: renderDay1 };

function renderPurchaseDay(day, options) {
  const fn = DAY_RENDERERS[Number(day)];
  if (!fn) throw new Error('Unknown LUNEVA purchase journey day: ' + day);
  return fn(options);
}

function renderPurchaseDayByKey(templateKey, options) {
  const key = String(templateKey || '');
  const match = /^luneva_purchase_day([01])$/.exec(key);
  if (!match) throw new Error('Unknown LUNEVA purchase template key: ' + templateKey);
  return renderPurchaseDay(Number(match[1]), options);
}

module.exports = {
  JOURNEY,
  DEFAULT_STORE_NAME,
  DEFAULT_STORE_URL,
  DEFAULT_DISCOUNT_CODE,
  renderDay0,
  renderDay1,
  renderPurchaseDay,
  renderPurchaseDayByKey
};
