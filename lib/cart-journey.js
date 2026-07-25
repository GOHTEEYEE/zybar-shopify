/**
 * ZYBAR Cart Recovery Journey — 7-Day Lifecycle
 * Trigger: add_to_cart | Exit: purchase → Customer Journey
 *
 * Purpose: recover abandoned carts with atmosphere and trust — not spam urgency.
 */
const C = require('./email-components.js');

const DEFAULT_STORE_NAME = 'ZYBAR';
const DEFAULT_STORE_URL = 'https://www.zybar.shop';
const DEFAULT_DISCOUNT_CODE = 'ZYBAR15';

const SOCIAL_LINKS = [
  { label: 'Instagram', href: 'https://www.instagram.com/zybar.shop' },
  { label: 'TikTok', href: 'https://www.tiktok.com/@zybar.shop' },
  { label: 'Facebook', href: 'https://www.facebook.com/people/ZY-Bar/61552413785446/' }
];

const JOURNEY = {
  key: 'cart_journey',
  name: 'ZYBAR Cart Recovery Journey',
  description: '7-day abandoned cart recovery: reminder, atmosphere, help, proof, craft, value, invitation.',
  days: [
    { day: 0, templateKey: 'cart_day0', delayValue: 30, delayUnit: 'minutes', stepName: 'Your Cart Is Waiting' },
    { day: 1, templateKey: 'cart_day1', delayValue: 1, delayUnit: 'days', stepName: 'Imagine It On Your Wall' },
    { day: 2, templateKey: 'cart_day2', delayValue: 1, delayUnit: 'days', stepName: 'Need A Hand?' },
    { day: 3, templateKey: 'cart_day3', delayValue: 1, delayUnit: 'days', stepName: 'What Collectors Say' },
    { day: 4, templateKey: 'cart_day4', delayValue: 1, delayUnit: 'days', stepName: 'Why The Craft Matters' },
    { day: 5, templateKey: 'cart_day5', delayValue: 1, delayUnit: 'days', stepName: 'Your Savings Still Apply' },
    { day: 6, templateKey: 'cart_day6', delayValue: 1, delayUnit: 'days', stepName: 'Make It Yours' },
    { day: 7, templateKey: 'cart_day7', delayValue: 1, delayUnit: 'days', stepName: 'Last Soft Invitation' }
  ]
};

function withUtm(url, campaign) {
  const sep = url.indexOf('?') === -1 ? '?' : '&';
  return url + sep + 'utm_source=email&utm_medium=cart_journey&utm_campaign=' + encodeURIComponent(campaign || 'cart');
}
function img(storeUrl, path) {
  return storeUrl + path;
}
function header(storeUrl, storeName, campaign) {
  return C.Header.render({
    href: withUtm(storeUrl + '/', campaign),
    logoUrl: img(storeUrl, '/Image/email/zybar-logo.png'),
    alt: storeName,
    width: 132
  });
}
function footer(storeName, reason) {
  return C.Footer.render({
    socials: SOCIAL_LINKS,
    identity: storeName + ' · Tokyo, Japan',
    reason: reason || 'You left a piece in your ZYBAR cart.',
    unsubscribeHref: '{{unsubscribe_url}}',
    contactHref: 'mailto:support@zybar.shop'
  });
}
function memberCoupon() {
  return C.Coupon.render({
    offer: 'MEMBER PRICING',
    label: '15% savings',
    code: 'Automatically Applied',
    note: 'Open the store from this email. Savings apply at checkout.'
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

function renderDay0(options) {
  const c = ctx(options);
  const campaign = 'cart_day0';
  const cartHref = withUtm(c.storeUrl + '/cart/', campaign);
  return {
    subject: 'Your cart is waiting',
    preheader: 'Your LED piece is still here — finish when you are ready.',
    html: C.Shell.render({
      title: 'Your Cart Is Waiting',
      preheader: 'Your LED piece is still here — finish when you are ready.',
      sections: [
        header(c.storeUrl, c.storeName, campaign),
        C.Hero.render({
          href: cartHref,
          imageUrl: img(c.storeUrl, '/Image/email/welcome-hero.jpg'),
          alt: 'ZYBAR LED artwork waiting to finish checkout',
          height: 400
        }),
        C.RichText.render({
          eyebrow: 'Cart',
          headline: c.customerName ? c.customerName + ', your piece is waiting.' : 'Your piece is waiting.',
          body: 'No rush.<br/>Just a quiet reminder that your cart still holds something cinematic.'
        }),
        C.Button.render({ href: cartHref, label: 'Return to Cart' }),
        footer(c.storeName)
      ]
    })
  };
}

function renderDay1(options) {
  const c = ctx(options);
  const campaign = 'cart_day1';
  const cartHref = withUtm(c.storeUrl + '/cart/', campaign);
  return {
    subject: 'Imagine it on your wall',
    preheader: 'Turn the lights down. Picture the glow.',
    html: C.Shell.render({
      title: 'Imagine It On Your Wall',
      preheader: 'Turn the lights down. Picture the glow.',
      sections: [
        header(c.storeUrl, c.storeName, campaign),
        C.RichText.render({
          eyebrow: 'Atmosphere',
          headline: 'Imagine it on your wall.',
          body: 'Dark room. Soft glow. A silhouette that feels like yours.'
        }),
        C.ImageBlock.render({
          href: cartHref,
          imageUrl: img(c.storeUrl, '/Poster/night.jpg'),
          alt: 'ZYBAR LED artwork glowing at night',
          caption: 'Night presence',
          height: 400
        }),
        C.ImageBlock.render({
          href: cartHref,
          imageUrl: img(c.storeUrl, '/lifestyle-gallery/styled/maybach-bedroom.jpg'),
          alt: 'LED artwork in a bedroom',
          caption: 'Lived-in atmosphere',
          height: 380
        }),
        C.Button.render({ href: cartHref, label: 'Return to Cart' }),
        footer(c.storeName)
      ]
    })
  };
}

function renderDay2(options) {
  const c = ctx(options);
  const campaign = 'cart_day2';
  const cartHref = withUtm(c.storeUrl + '/cart/', campaign);
  return {
    subject: 'Need a hand finishing?',
    preheader: 'Sizing, shipping, or payment — reply anytime.',
    html: C.Shell.render({
      title: 'Need A Hand?',
      preheader: 'Sizing, shipping, or payment — reply anytime.',
      sections: [
        header(c.storeUrl, c.storeName, campaign),
        C.RichText.render({
          eyebrow: 'Support',
          headline: 'Stuck on a detail?',
          body: 'Sizing. Shipping. Payment.<br/>Reply to this email — we will help you finish calmly.'
        }),
        C.SoftPanel.render({
          headline: 'We ship worldwide.',
          body: 'Universal USB power. Easy wall mount. Built for collectors, not complications.'
        }),
        C.Button.render({ href: cartHref, label: 'Return to Cart' }),
        C.TextLink.render({ href: 'mailto:support@zybar.shop', label: 'Ask us anything →' }),
        footer(c.storeName)
      ]
    })
  };
}

function renderDay3(options) {
  const c = ctx(options);
  const campaign = 'cart_day3';
  const cartHref = withUtm(c.storeUrl + '/cart/', campaign);
  return {
    subject: 'What collectors say',
    preheader: 'Real rooms. Real light. Real pride.',
    html: C.Shell.render({
      title: 'What Collectors Say',
      preheader: 'Real rooms. Real light. Real pride.',
      sections: [
        header(c.storeUrl, c.storeName, campaign),
        C.RichText.render({
          eyebrow: 'Social proof',
          headline: 'What collectors say.',
          body: 'People do not buy light.<br/>They buy the moment guests notice.'
        }),
        C.QuoteWithImage.render({
          href: cartHref,
          imageUrl: img(c.storeUrl, '/lifestyle-gallery/styled/cls-sideboard.png'),
          alt: 'Mercedes LED panels in a living room',
          caption: 'Collector install',
          quote:
            'The craftsmanship is excellent, and the working headlights make it feel incredibly realistic and collectible.',
          author: 'SK Moon · Verified collector'
        }),
        C.Button.render({ href: cartHref, label: 'Return to Cart' }),
        footer(c.storeName)
      ]
    })
  };
}

function renderDay4(options) {
  const c = ctx(options);
  const campaign = 'cart_day4';
  const cartHref = withUtm(c.storeUrl + '/cart/', campaign);
  return {
    subject: 'Why the craft matters',
    preheader: 'Selective light. Depth. Presence that lasts.',
    html: C.Shell.render({
      title: 'Why The Craft Matters',
      preheader: 'Selective light. Depth. Presence that lasts.',
      sections: [
        header(c.storeUrl, c.storeName, campaign),
        C.Hero.render({
          href: cartHref,
          imageUrl: img(c.storeUrl, '/Poster/description1.png'),
          alt: 'ZYBAR precision illumination',
          height: 400
        }),
        C.RichText.render({
          eyebrow: 'Craft',
          headline: 'Why the craft matters.',
          body: 'Generic frames flood light.<br/>ZYBAR places it with intention.'
        }),
        C.SoftPanel.render({
          headline: 'Selective illumination.',
          body: 'Headlights. Contours. Contrast. Atmosphere that still feels premium months later.'
        }),
        C.Button.render({ href: cartHref, label: 'Return to Cart' }),
        footer(c.storeName)
      ]
    })
  };
}

function renderDay5(options) {
  const c = ctx(options);
  const campaign = 'cart_day5';
  const cartHref = withUtm(c.storeUrl + '/cart/', campaign);
  return {
    subject: 'Your savings still apply',
    preheader: 'Member pricing is ready whenever you finish.',
    html: C.Shell.render({
      title: 'Your Savings Still Apply',
      preheader: 'Member pricing is ready whenever you finish.',
      sections: [
        header(c.storeUrl, c.storeName, campaign),
        C.RichText.render({
          eyebrow: 'Member pricing',
          headline: 'Your savings still apply.',
          body: 'Not a countdown scream.<br/>Just a quiet door still open.'
        }),
        memberCoupon(),
        C.Button.render({ href: cartHref, label: 'Return to Cart' }),
        footer(c.storeName)
      ]
    })
  };
}

function renderDay6(options) {
  const c = ctx(options);
  const campaign = 'cart_day6';
  const cartHref = withUtm(c.storeUrl + '/cart/', campaign);
  const customHref = withUtm(c.storeUrl + '/products/custom-led-car-wall-art/', campaign);
  return {
    subject: 'Make it yours',
    preheader: 'Finish the piece in your cart — or turn your own car into light.',
    html: C.Shell.render({
      title: 'Make It Yours',
      preheader: 'Finish the piece in your cart — or turn your own car into light.',
      sections: [
        header(c.storeUrl, c.storeName, campaign),
        C.Hero.render({
          href: customHref,
          imageUrl: img(c.storeUrl, '/Image/custom-led-car-wall-art-1.jpg'),
          alt: 'Custom ZYBAR LED car wall art',
          height: 400
        }),
        C.RichText.render({
          eyebrow: 'Identity',
          headline: 'Make it yours.',
          body: 'Finish what is already in your cart.<br/>Or start a custom of the car that is already yours.'
        }),
        C.Button.render({ href: cartHref, label: 'Return to Cart' }),
        C.TextLink.render({ href: customHref, label: 'Explore Custom →' }),
        footer(c.storeName)
      ]
    })
  };
}

function renderDay7(options) {
  const c = ctx(options);
  const campaign = 'cart_day7';
  const cartHref = withUtm(c.storeUrl + '/cart/', campaign);
  return {
    subject: 'A quiet last invitation',
    preheader: 'Your cart remains — no pressure, only presence.',
    html: C.Shell.render({
      title: 'Last Soft Invitation',
      preheader: 'Your cart remains — no pressure, only presence.',
      sections: [
        header(c.storeUrl, c.storeName, campaign),
        C.Hero.render({
          href: cartHref,
          imageUrl: img(c.storeUrl, '/Poster/popup-garage-hero.png'),
          alt: 'ZYBAR LED wall art in a garage',
          height: 400
        }),
        C.RichText.render({
          eyebrow: 'Invitation',
          headline: 'A quiet last invitation.',
          body: 'Your cart is still here.<br/>If the room is calling for it — this is a good moment.'
        }),
        memberCoupon(),
        C.Button.render({ href: cartHref, label: 'Return to Cart' }),
        C.FeatureIcons.render({
          items: ['15% member', 'Hand-finished', 'Ships worldwide', '30-day guarantee']
        }),
        footer(c.storeName, 'This closes your cart recovery sequence.')
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
  if (!fn) throw new Error('Unknown cart journey day: ' + day);
  return fn(options);
}

function renderCartDayByKey(templateKey, options) {
  const key = String(templateKey || '');
  if (key === 'cart_reminder') return renderDay0(options);
  if (key === 'need_help') return renderDay2(options);
  const match = /^cart_day([0-7])$/.exec(key);
  if (!match) throw new Error('Unknown cart template key: ' + templateKey);
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
