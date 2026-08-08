/**
 * LUNEVA Cart Recovery Journey — 7-Day Lifecycle
 * Trigger: add_to_cart (LUNEVA brand) | Exit: purchase
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
  key: 'luneva_cart_journey',
  name: 'LUNEVA Cart Recovery Journey',
  description: '7-day abandoned cart recovery for LUNEVA butterfly kits.',
  days: [
    { day: 0, templateKey: 'luneva_cart_day0', delayValue: 30, delayUnit: 'minutes', stepName: 'Your Kit Is Waiting' },
    { day: 1, templateKey: 'luneva_cart_day1', delayValue: 1, delayUnit: 'days', stepName: 'Picture the Glow' },
    { day: 2, templateKey: 'luneva_cart_day2', delayValue: 1, delayUnit: 'days', stepName: 'Need A Hand?' },
    { day: 3, templateKey: 'luneva_cart_day3', delayValue: 1, delayUnit: 'days', stepName: 'Gift Stories' },
    { day: 4, templateKey: 'luneva_cart_day4', delayValue: 1, delayUnit: 'days', stepName: 'Why The Craft Matters' },
    { day: 5, templateKey: 'luneva_cart_day5', delayValue: 1, delayUnit: 'days', stepName: 'Your Savings Still Apply' },
    { day: 6, templateKey: 'luneva_cart_day6', delayValue: 1, delayUnit: 'days', stepName: 'Finish Your Gift' },
    { day: 7, templateKey: 'luneva_cart_day7', delayValue: 1, delayUnit: 'days', stepName: 'Last Soft Invitation' }
  ]
};

function withUtm(url, campaign) {
  const sep = url.indexOf('?') === -1 ? '?' : '&';
  return (
    url +
    sep +
    'utm_source=email&utm_medium=luneva_cart&utm_campaign=' +
    encodeURIComponent(campaign || 'cart')
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
    reason: reason || 'You left a LUNEVA kit in your cart.',
    unsubscribeHref: '{{unsubscribe_url}}',
    contactHref: 'mailto:support@zybar.shop'
  });
}

function memberCoupon() {
  return C.Coupon.render({
    offer: 'MEMBER PRICING',
    label: '15% savings',
    code: 'Automatically Applied',
    note: 'Open LUNEVA from this email. Savings apply at checkout.'
  });
}

function ctx(options) {
  options = options || {};
  return {
    storeUrl: options.storeUrl || DEFAULT_STORE_URL,
    storeName: options.storeName || DEFAULT_STORE_NAME,
    discountCode: options.discountCode || DEFAULT_DISCOUNT_CODE,
    customerName:
      options.customerName && String(options.customerName).trim()
        ? String(options.customerName).trim().split(' ')[0]
        : null
  };
}

function cartHref(storeUrl, campaign) {
  return withUtm(storeUrl + LUNEVA_BASE + '/cart/', campaign);
}

function renderDay0(options) {
  const c = ctx(options);
  const campaign = 'luneva_cart_day0';
  const href = cartHref(c.storeUrl, campaign);
  return {
    subject: 'Your LUNEVA kit is waiting',
    preheader: 'Your butterfly kit is still in the cart — finish when you are ready.',
    html: C.Shell.render({
      title: 'Your Kit Is Waiting',
      preheader: 'Your butterfly kit is still in the cart — finish when you are ready.',
      sections: [
        header(c.storeUrl, c.storeName, campaign),
        C.Hero.render({
          href: href,
          imageUrl: img(c.storeUrl, '/luneva/assets/hero/dreamy-garden-43.png'),
          alt: 'LUNEVA kit waiting in cart',
          height: 400
        }),
        C.RichText.render({
          eyebrow: 'Cart',
          headline: c.customerName ? c.customerName + ', your kit is waiting.' : 'Your kit is waiting.',
          body: 'No rush.<br/>Just a quiet reminder that your cart still holds a LUNEVA kit.'
        }),
        C.Button.render({ href: href, label: 'Return to Cart' }),
        footer(c.storeName)
      ]
    })
  };
}

function renderDay1(options) {
  const c = ctx(options);
  const campaign = 'luneva_cart_day1';
  const href = cartHref(c.storeUrl, campaign);
  return {
    subject: 'Picture the glow',
    preheader: 'Lights down. Soft wings. A desk that feels finished.',
    html: C.Shell.render({
      title: 'Picture the Glow',
      preheader: 'Lights down. Soft wings. A desk that feels finished.',
      sections: [
        header(c.storeUrl, c.storeName, campaign),
        C.RichText.render({
          eyebrow: 'Atmosphere',
          headline: 'Picture the glow.',
          body: 'Evening light. Gentle motion.<br/>A mechanical butterfly that belongs in the room.'
        }),
        C.ImageBlock.render({
          href: href,
          imageUrl: img(c.storeUrl, '/luneva/assets/glowing-garden/lifestyle.png'),
          alt: 'LUNEVA Glowing Garden lifestyle',
          caption: 'Lived-in presence',
          height: 400
        }),
        C.Button.render({ href: href, label: 'Return to Cart' }),
        footer(c.storeName)
      ]
    })
  };
}

function renderDay2(options) {
  const c = ctx(options);
  const campaign = 'luneva_cart_day2';
  const href = cartHref(c.storeUrl, campaign);
  const faqs = withUtm(c.storeUrl + LUNEVA_BASE + '/faqs/', campaign);
  return {
    subject: 'Need a hand with your kit?',
    preheader: 'Shipping, assembly, returns — we are here.',
    html: C.Shell.render({
      title: 'Need A Hand?',
      preheader: 'Shipping, assembly, returns — we are here.',
      sections: [
        header(c.storeUrl, c.storeName, campaign),
        C.RichText.render({
          eyebrow: 'Help',
          headline: 'Need a hand?',
          body:
            'Free worldwide shipping · Ships in 5–7 days · 60-day free returns.<br/>Questions about assembly? We answer quickly.'
        }),
        C.Button.render({ href: href, label: 'Return to Cart' }),
        C.TextLink.render({ href: faqs, label: 'Read FAQs →' }),
        footer(c.storeName)
      ]
    })
  };
}

function renderDay3(options) {
  const c = ctx(options);
  const campaign = 'luneva_cart_day3';
  const href = cartHref(c.storeUrl, campaign);
  return {
    subject: 'What gifters say',
    preheader: '4.88 ★ — kits that landed as thoughtful gifts.',
    html: C.Shell.render({
      title: 'Gift Stories',
      preheader: '4.88 ★ — kits that landed as thoughtful gifts.',
      sections: [
        header(c.storeUrl, c.storeName, campaign),
        C.RichText.render({
          eyebrow: 'Social proof',
          headline: 'What gifters say.',
          body: 'The kit in your cart has already been a favorite gift for others.'
        }),
        C.QuoteWithImage.render({
          href: href,
          imageUrl: img(c.storeUrl, '/luneva/assets/starlit-garden/reviews/01.png'),
          alt: 'LUNEVA customer review photo',
          caption: 'Gift unboxing',
          quote: 'She loved building it — and the glow at night is the part we did not expect.',
          author: 'Verified buyer · Anniversary gift'
        }),
        C.Button.render({ href: href, label: 'Return to Cart' }),
        footer(c.storeName)
      ]
    })
  };
}

function renderDay4(options) {
  const c = ctx(options);
  const campaign = 'luneva_cart_day4';
  const href = cartHref(c.storeUrl, campaign);
  return {
    subject: 'Why the craft matters',
    preheader: 'Acrylic, LED, and mechanical wings — built to keep.',
    html: C.Shell.render({
      title: 'Why The Craft Matters',
      preheader: 'Acrylic, LED, and mechanical wings — built to keep.',
      sections: [
        header(c.storeUrl, c.storeName, campaign),
        C.Hero.render({
          href: href,
          imageUrl: img(c.storeUrl, '/luneva/assets/cyan-blue/details.png'),
          alt: 'LUNEVA craft details',
          height: 400
        }),
        C.RichText.render({
          eyebrow: 'Craft',
          headline: 'Why the craft matters.',
          body: 'This is not disposable décor.<br/>It is a kit you assemble once — and display for years.'
        }),
        C.Button.render({ href: href, label: 'Return to Cart' }),
        footer(c.storeName)
      ]
    })
  };
}

function renderDay5(options) {
  const c = ctx(options);
  const campaign = 'luneva_cart_day5';
  const href = cartHref(c.storeUrl, campaign);
  return {
    subject: 'Your 15% still applies',
    preheader: 'Welcome savings are ready whenever you finish.',
    html: C.Shell.render({
      title: 'Your Savings Still Apply',
      preheader: 'Welcome savings are ready whenever you finish.',
      sections: [
        header(c.storeUrl, c.storeName, campaign),
        C.RichText.render({
          eyebrow: 'Member pricing',
          headline: 'Your savings still apply.',
          body: 'Not a countdown scream.<br/>Just a quiet door still open.'
        }),
        memberCoupon(),
        C.Button.render({ href: href, label: 'Return to Cart' }),
        footer(c.storeName)
      ]
    })
  };
}

function renderDay6(options) {
  const c = ctx(options);
  const campaign = 'luneva_cart_day6';
  const href = cartHref(c.storeUrl, campaign);
  const shop = withUtm(c.storeUrl + LUNEVA_BASE + '/shop/', campaign);
  return {
    subject: 'Finish your gift',
    preheader: 'Complete checkout — or browse one more kit.',
    html: C.Shell.render({
      title: 'Finish Your Gift',
      preheader: 'Complete checkout — or browse one more kit.',
      sections: [
        header(c.storeUrl, c.storeName, campaign),
        C.Hero.render({
          href: href,
          imageUrl: img(c.storeUrl, '/luneva/assets/hero/gift-moment-43.png'),
          alt: 'LUNEVA gift moment',
          height: 400
        }),
        C.RichText.render({
          eyebrow: 'Gift',
          headline: 'Finish your gift.',
          body: 'The kit in your cart is ready to ship.<br/>If you want a second look, the full collection is open.'
        }),
        C.Button.render({ href: href, label: 'Return to Cart' }),
        C.TextLink.render({ href: shop, label: 'Browse collection →' }),
        footer(c.storeName)
      ]
    })
  };
}

function renderDay7(options) {
  const c = ctx(options);
  const campaign = 'luneva_cart_day7';
  const href = cartHref(c.storeUrl, campaign);
  return {
    subject: 'A quiet last invitation',
    preheader: 'Your LUNEVA cart remains — no pressure, only presence.',
    html: C.Shell.render({
      title: 'Last Soft Invitation',
      preheader: 'Your LUNEVA cart remains — no pressure, only presence.',
      sections: [
        header(c.storeUrl, c.storeName, campaign),
        C.Hero.render({
          href: href,
          imageUrl: img(c.storeUrl, '/luneva/assets/hero/glowing-garden-43.png'),
          alt: 'LUNEVA Glowing Garden',
          height: 400
        }),
        C.RichText.render({
          eyebrow: 'Invitation',
          headline: 'A quiet last invitation.',
          body: 'Your cart is still here.<br/>If the room — or the gift — is calling for it, this is a good moment.'
        }),
        memberCoupon(),
        C.Button.render({ href: href, label: 'Return to Cart' }),
        C.FeatureIcons.render({
          items: ['15% welcome', 'Free shipping', '60-day returns', 'Ships worldwide']
        }),
        footer(c.storeName, 'This closes your LUNEVA cart recovery sequence.')
      ]
    })
  };
}

const DAY_RENDERERS = {
  0: renderDay0,
  1: renderDay1,
  2: renderDay2,
  3: renderDay3,
  4: renderDay4,
  5: renderDay5,
  6: renderDay6,
  7: renderDay7
};

function renderCartDay(day, options) {
  const fn = DAY_RENDERERS[Number(day)];
  if (!fn) throw new Error('Unknown LUNEVA cart journey day: ' + day);
  return fn(options);
}

function renderCartDayByKey(templateKey, options) {
  const key = String(templateKey || '');
  const match = /^luneva_cart_day([0-7])$/.exec(key);
  if (!match) throw new Error('Unknown LUNEVA cart template key: ' + templateKey);
  return renderCartDay(Number(match[1]), options);
}

module.exports = {
  JOURNEY,
  DEFAULT_STORE_NAME,
  DEFAULT_STORE_URL,
  DEFAULT_DISCOUNT_CODE,
  renderDay0,
  renderDay1,
  renderDay2,
  renderDay3,
  renderDay4,
  renderDay5,
  renderDay6,
  renderDay7,
  renderCartDay,
  renderCartDayByKey
};
