/**
 * LUNEVA Welcome Journey — 7-Day Lifecycle
 * DIY LED mechanical butterfly kits. Brand-scoped; never share ZYBAR car templates.
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
  key: 'luneva_welcome_journey',
  name: 'LUNEVA Welcome Journey',
  description:
    '7-day welcome for LUNEVA butterfly kits: gift, motion, collection, craft, invitation.',
  days: [
    { day: 0, templateKey: 'luneva_welcome_day0', delayValue: 5, delayUnit: 'minutes', stepName: 'Welcome to LUNEVA' },
    { day: 1, templateKey: 'luneva_welcome_day1', delayValue: 1, delayUnit: 'days', stepName: 'Beauty in Motion' },
    { day: 2, templateKey: 'luneva_welcome_day2', delayValue: 1, delayUnit: 'days', stepName: 'Made for Gifting' },
    { day: 3, templateKey: 'luneva_welcome_day3', delayValue: 1, delayUnit: 'days', stepName: 'Meet the Collection' },
    { day: 4, templateKey: 'luneva_welcome_day4', delayValue: 1, delayUnit: 'days', stepName: 'What Makers Say' },
    { day: 5, templateKey: 'luneva_welcome_day5', delayValue: 1, delayUnit: 'days', stepName: 'Assemble in an Evening' },
    { day: 6, templateKey: 'luneva_welcome_day6', delayValue: 1, delayUnit: 'days', stepName: 'Why LUNEVA' },
    { day: 7, templateKey: 'luneva_welcome_day7', delayValue: 1, delayUnit: 'days', stepName: 'Your Invitation' }
  ]
};

function withUtm(url, campaign) {
  const sep = url.indexOf('?') === -1 ? '?' : '&';
  return (
    url +
    sep +
    'utm_source=email&utm_medium=luneva_welcome&utm_campaign=' +
    encodeURIComponent(campaign || 'welcome')
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
    reason: reason || 'You joined the LUNEVA Welcome Journey.',
    unsubscribeHref: '{{unsubscribe_url}}',
    contactHref: 'mailto:support@zybar.shop'
  });
}

function memberCoupon() {
  return C.Coupon.render({
    offer: 'WELCOME 15%',
    label: '15% savings',
    code: 'Automatically Applied',
    note: 'Open LUNEVA from this email. Your welcome savings apply at checkout.'
  });
}

function resolveContext(options) {
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

function shopHref(storeUrl, campaign) {
  return withUtm(storeUrl + LUNEVA_BASE + '/shop/', campaign);
}

function productHref(storeUrl, slug, campaign) {
  return withUtm(storeUrl + '/products/' + slug + '/', campaign);
}

function renderDay0(options) {
  const ctx = resolveContext(options);
  const campaign = 'luneva_welcome_day0';
  const href = shopHref(ctx.storeUrl, campaign);
  const greeting = ctx.customerName
    ? ctx.customerName + ' — welcome to LUNEVA.'
    : 'Welcome to LUNEVA.';

  return {
    subject: 'Welcome to LUNEVA',
    preheader: 'Mechanical butterflies, warm LED glow, and 15% welcome savings.',
    html: C.Shell.render({
      title: 'Welcome to LUNEVA',
      preheader: 'Mechanical butterflies, warm LED glow, and 15% welcome savings.',
      sections: [
        header(ctx.storeUrl, ctx.storeName, campaign),
        C.Hero.render({
          href: href,
          imageUrl: img(ctx.storeUrl, '/luneva/assets/hero/gift-moment-43.png'),
          alt: 'LUNEVA mechanical butterfly kit as a glowing gift',
          height: 420
        }),
        C.RichText.render({
          eyebrow: 'Welcome',
          headline: greeting,
          body:
            'LUNEVA is a DIY LED butterfly kit — premium acrylic, soft light, and gentle motion made to assemble, gift, and display.'
        }),
        memberCoupon(),
        C.Button.render({ href: href, label: 'Shop LUNEVA' }),
        C.FeatureIcons.render({
          items: ['15% welcome', 'Free shipping', '60-day returns', 'Ships in 5–7 days']
        }),
        footer(ctx.storeName)
      ]
    })
  };
}

function renderDay1(options) {
  const ctx = resolveContext(options);
  const campaign = 'luneva_welcome_day1';
  const href = shopHref(ctx.storeUrl, campaign);
  return {
    subject: 'Beauty in motion',
    preheader: 'Wings that move. Light that softens a room.',
    html: C.Shell.render({
      title: 'Beauty in Motion',
      preheader: 'Wings that move. Light that softens a room.',
      sections: [
        header(ctx.storeUrl, ctx.storeName, campaign),
        C.RichText.render({
          eyebrow: 'Day 1',
          headline: 'Beauty in motion.',
          body: 'A LUNEVA kit is not a flat print.<br/>It is light, craft, and quiet mechanical wings.'
        }),
        C.ImageBlock.render({
          href: href,
          imageUrl: img(ctx.storeUrl, '/luneva/assets/dreamy-garden/lifestyle.png'),
          alt: 'Dreamy Garden LUNEVA kit glowing on a desk',
          caption: 'Soft presence on a desk or shelf',
          height: 400
        }),
        C.Button.render({ href: href, label: 'Explore the kits' }),
        footer(ctx.storeName)
      ]
    })
  };
}

function renderDay2(options) {
  const ctx = resolveContext(options);
  const campaign = 'luneva_welcome_day2';
  const href = shopHref(ctx.storeUrl, campaign);
  return {
    subject: 'Made for gifting',
    preheader: 'For her. Anniversary. Mother’s Day. A desk that feels finished.',
    html: C.Shell.render({
      title: 'Made for Gifting',
      preheader: 'For her. Anniversary. Mother’s Day. A desk that feels finished.',
      sections: [
        header(ctx.storeUrl, ctx.storeName, campaign),
        C.Hero.render({
          href: href,
          imageUrl: img(ctx.storeUrl, '/luneva/assets/hero/beauty-in-motion-43.png'),
          alt: 'LUNEVA butterfly kit gift moment',
          height: 400
        }),
        C.RichText.render({
          eyebrow: 'Day 2',
          headline: 'Made for gifting.',
          body:
            'An evening of assembling together.<br/>Then a glow that stays — romantic, thoughtful, and personal.'
        }),
        C.SoftPanel.render({
          eyebrow: 'Occasions',
          headline: 'Occasions that fit',
          body: 'Anniversary · Mother’s Day · Birthday · Desk gift · “just because”'
        }),
        C.Button.render({ href: href, label: 'Find a gift kit' }),
        footer(ctx.storeName)
      ]
    })
  };
}

function renderDay3(options) {
  const ctx = resolveContext(options);
  const campaign = 'luneva_welcome_day3';
  const kits = [
    {
      title: 'Dreamy Garden',
      line: 'Soft pastel glow — from $59',
      cta: 'View kit',
      href: productHref(ctx.storeUrl, 'luneva-dreamy-garden', campaign),
      imageUrl: img(ctx.storeUrl, '/luneva/assets/dreamy-garden/hero.png'),
      alt: 'LUNEVA Dreamy Garden'
    },
    {
      title: 'Cyan Blue',
      line: 'Cool luminous wings — from $59',
      cta: 'View kit',
      href: productHref(ctx.storeUrl, 'luneva-cyan-blue', campaign),
      imageUrl: img(ctx.storeUrl, '/luneva/assets/cyan-blue/hero.png'),
      alt: 'LUNEVA Cyan Blue'
    },
    {
      title: 'Glowing Garden',
      line: 'Warm garden light — from $59',
      cta: 'View kit',
      href: productHref(ctx.storeUrl, 'luneva-glowing-garden', campaign),
      imageUrl: img(ctx.storeUrl, '/luneva/assets/glowing-garden/hero.png'),
      alt: 'LUNEVA Glowing Garden'
    },
    {
      title: 'Starlit Garden',
      line: 'Night-sky presence — from $59',
      cta: 'View kit',
      href: productHref(ctx.storeUrl, 'luneva-starlit-garden', campaign),
      imageUrl: img(ctx.storeUrl, '/luneva/assets/starlit-garden/hero.png'),
      alt: 'LUNEVA Starlit Garden'
    }
  ];
  const cards = kits.map(function (k) {
    return C.CollectionCard.render(k);
  });
  return {
    subject: 'Meet the collection',
    preheader: 'Dreamy Garden · Cyan Blue · Glowing Garden · Starlit Garden.',
    html: C.Shell.render({
      title: 'Meet the Collection',
      preheader: 'Dreamy Garden · Cyan Blue · Glowing Garden · Starlit Garden.',
      sections: [header(ctx.storeUrl, ctx.storeName, campaign)]
        .concat([
          C.RichText.render({
            eyebrow: 'Day 3',
            headline: 'Meet the collection.',
            body: 'Four mechanical butterfly kits.<br/>Same craft language — different atmospheres.'
          })
        ])
        .concat(cards)
        .concat([
          C.Button.render({ href: shopHref(ctx.storeUrl, campaign), label: 'Shop all kits' }),
          footer(ctx.storeName)
        ])
    })
  };
}

function renderDay4(options) {
  const ctx = resolveContext(options);
  const campaign = 'luneva_welcome_day4';
  const reviewsHref = withUtm(ctx.storeUrl + LUNEVA_BASE + '/reviews/', campaign);
  const href = shopHref(ctx.storeUrl, campaign);
  return {
    subject: 'What makers say',
    preheader: '4.88 ★ from real builders and gifters.',
    html: C.Shell.render({
      title: 'What Makers Say',
      preheader: '4.88 ★ from real builders and gifters.',
      sections: [
        header(ctx.storeUrl, ctx.storeName, campaign),
        C.RichText.render({
          eyebrow: 'Day 4',
          headline: 'What makers say.',
          body: 'Real kits. Real desks. Real gifts that landed.'
        }),
        C.QuoteWithImage.render({
          href: href,
          imageUrl: img(ctx.storeUrl, '/luneva/assets/dreamy-garden/reviews/01.png'),
          alt: 'Customer LUNEVA Dreamy Garden display',
          caption: 'Desk glow',
          quote: 'Assembled it together on a Friday night — the light is softer and prettier than I expected.',
          author: 'Verified buyer · Gift kit'
        }),
        C.QuoteWithImage.render({
          href: href,
          imageUrl: img(ctx.storeUrl, '/luneva/assets/cyan-blue/reviews/02.png'),
          alt: 'Customer LUNEVA Cyan Blue display',
          caption: 'Shelf presence',
          quote: 'The wings actually move. It feels special, not mass-market LED decor.',
          author: 'Verified buyer · Cyan Blue'
        }),
        C.Button.render({ href: reviewsHref, label: 'Read reviews' }),
        footer(ctx.storeName)
      ]
    })
  };
}

function renderDay5(options) {
  const ctx = resolveContext(options);
  const campaign = 'luneva_welcome_day5';
  const href = shopHref(ctx.storeUrl, campaign);
  return {
    subject: 'Assemble in an evening',
    preheader: 'Clear steps. Premium parts. A glow when you finish.',
    html: C.Shell.render({
      title: 'Assemble in an Evening',
      preheader: 'Clear steps. Premium parts. A glow when you finish.',
      sections: [
        header(ctx.storeUrl, ctx.storeName, campaign),
        C.Hero.render({
          href: href,
          imageUrl: img(ctx.storeUrl, '/luneva/assets/glowing-garden/details.png'),
          alt: 'LUNEVA kit detail — acrylic and LED craft',
          height: 400
        }),
        C.RichText.render({
          eyebrow: 'Day 5',
          headline: 'Assemble in an evening.',
          body:
            'Designed as a DIY experience — not a plastic toy rush.<br/>Take your time. Finish with light.'
        }),
        C.SoftPanel.render({
          eyebrow: 'In the box',
          headline: 'What arrives',
          body: 'Precision acrylic · LED module · mechanical butterfly · clear guide'
        }),
        C.Button.render({ href: href, label: 'Choose your kit' }),
        footer(ctx.storeName)
      ]
    })
  };
}

function renderDay6(options) {
  const ctx = resolveContext(options);
  const campaign = 'luneva_welcome_day6';
  const href = shopHref(ctx.storeUrl, campaign);
  return {
    subject: 'Why LUNEVA',
    preheader: 'Craft, motion, and gift-ready presence — designed since 2025.',
    html: C.Shell.render({
      title: 'Why LUNEVA',
      preheader: 'Craft, motion, and gift-ready presence — designed since 2025.',
      sections: [
        header(ctx.storeUrl, ctx.storeName, campaign),
        C.RichText.render({
          eyebrow: 'Day 6',
          headline: 'Why LUNEVA.',
          body:
            'Generic LED decor is loud.<br/>LUNEVA is quieter — selective light, mechanical wings, and a kit meant to be kept.'
        }),
        C.ImageBlock.render({
          href: href,
          imageUrl: img(ctx.storeUrl, '/luneva/assets/starlit-garden/lifestyle.png'),
          alt: 'Starlit Garden LUNEVA lifestyle',
          caption: 'Designed for gifting since 2025',
          height: 380
        }),
        C.FeatureIcons.render({
          items: ['Free worldwide shipping', '60-day free returns', 'Welcome 15%', '5–7 day ship']
        }),
        C.Button.render({ href: href, label: 'Shop LUNEVA' }),
        footer(ctx.storeName)
      ]
    })
  };
}

function renderDay7(options) {
  const ctx = resolveContext(options);
  const campaign = 'luneva_welcome_day7';
  const href = shopHref(ctx.storeUrl, campaign);
  return {
    subject: 'Your LUNEVA invitation',
    preheader: 'Your 15% welcome is ready whenever you are.',
    html: C.Shell.render({
      title: 'Your Invitation',
      preheader: 'Your 15% welcome is ready whenever you are.',
      sections: [
        header(ctx.storeUrl, ctx.storeName, campaign),
        C.Hero.render({
          href: href,
          imageUrl: img(ctx.storeUrl, '/luneva/assets/starlit-garden/hero.png'),
          alt: 'LUNEVA Starlit Garden kit',
          height: 420
        }),
        C.RichText.render({
          eyebrow: 'Invitation',
          headline: ctx.customerName
            ? ctx.customerName + ', your invitation is open.'
            : 'Your invitation is open.',
          body: 'Pick a kit. Assemble it. Let the room keep the glow.'
        }),
        memberCoupon(),
        C.Button.render({ href: href, label: 'Shop with 15% welcome' }),
        C.TextLink.render({
          href: withUtm(ctx.storeUrl + LUNEVA_BASE + '/faqs/', campaign),
          label: 'Read FAQs →'
        }),
        footer(ctx.storeName, 'This closes your LUNEVA welcome sequence.')
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

function renderWelcomeDay(day, options) {
  const fn = DAY_RENDERERS[Number(day)];
  if (!fn) throw new Error('Unknown LUNEVA welcome journey day: ' + day);
  return fn(options);
}

function renderWelcomeDayByKey(templateKey, options) {
  const key = String(templateKey || '');
  const match = /^luneva_welcome_day([0-7])$/.exec(key);
  if (!match) throw new Error('Unknown LUNEVA welcome template key: ' + templateKey);
  return renderWelcomeDay(Number(match[1]), options);
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
  renderWelcomeDay,
  renderWelcomeDayByKey
};
