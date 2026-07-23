/**
 * ZYBAR Welcome Journey — 7-Day Lifecycle System
 *
 * Source of truth for Day 0–7 welcome emails.
 * HTML previews live in /emails/welcome/. Export via:
 *   node scripts/export-welcome-emails.js
 *
 * Philosophy: introduce the brand, build desire, educate, then invite.
 * Never sound like a dropshipping store.
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
  key: 'welcome_journey',
  name: 'ZYBAR Welcome Journey',
  description:
    '7-day welcome sequence that introduces atmosphere, craft, identity, collectors, custom, and invitation.',
  days: [
    { day: 0, templateKey: 'welcome_day0', delayValue: 5, delayUnit: 'minutes', stepName: 'Welcome to ZYBAR' },
    { day: 1, templateKey: 'welcome_day1', delayValue: 1, delayUnit: 'days', stepName: 'The Art of Living With Light' },
    { day: 2, templateKey: 'welcome_day2', delayValue: 1, delayUnit: 'days', stepName: 'Behind Every Piece' },
    { day: 3, templateKey: 'welcome_day3', delayValue: 1, delayUnit: 'days', stepName: 'Find Your Style' },
    { day: 4, templateKey: 'welcome_day4', delayValue: 1, delayUnit: 'days', stepName: 'Collector Stories' },
    { day: 5, templateKey: 'welcome_day5', delayValue: 1, delayUnit: 'days', stepName: 'Turn Your Own Car Into Light' },
    { day: 6, templateKey: 'welcome_day6', delayValue: 1, delayUnit: 'days', stepName: 'Why ZYBAR?' },
    { day: 7, templateKey: 'welcome_day7', delayValue: 1, delayUnit: 'days', stepName: 'Your Invitation' }
  ]
};

function withUtm(url, campaign) {
  const sep = url.indexOf('?') === -1 ? '?' : '&';
  return (
    url +
    sep +
    'utm_source=email&utm_medium=welcome_journey&utm_campaign=' +
    encodeURIComponent(campaign || 'welcome')
  );
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
    identity: storeName + ' · Mantin, Negeri Sembilan, Malaysia',
    reason: reason || 'You joined the ' + storeName + ' Welcome Journey.',
    unsubscribeHref:
      'mailto:support@zybar.shop?subject=Unsubscribe&body=Please%20unsubscribe%20me%20from%20ZYBAR%20emails.',
    contactHref: 'mailto:support@zybar.shop'
  });
}

function memberCoupon() {
  return C.Coupon.render({
    offer: 'COLLECTOR WELCOME',
    label: '15% savings',
    code: 'Automatically Applied',
    note: 'Open the store from this email. Your welcome savings apply at checkout.'
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

/* -------------------------------------------------------------------------- */
/* Day 0 — Welcome to ZYBAR                                                   */
/* -------------------------------------------------------------------------- */

function renderDay0(options) {
  const ctx = resolveContext(options);
  const campaign = 'welcome_day0';
  const shopHref = withUtm(ctx.storeUrl + '/collections/all/', campaign);
  const greeting = ctx.customerName
    ? ctx.customerName + ' — welcome into the world of ZYBAR.'
    : 'Welcome into the world of ZYBAR.';

  return {
    subject: 'Welcome to ZYBAR',
    preheader: 'Identity. Atmosphere. Pride. Your collector welcome is ready.',
    html: C.Shell.render({
      title: 'Welcome to ZYBAR',
      preheader: 'Identity. Atmosphere. Pride. Your collector welcome is ready.',
      sections: [
        header(ctx.storeUrl, ctx.storeName, campaign),
        C.Hero.render({
          href: shopHref,
          imageUrl: img(ctx.storeUrl, '/Image/email/welcome-hero.jpg'),
          alt: 'ZYBAR LED car artwork glowing in a garage office',
          height: 420
        }),
        C.RichText.render({
          eyebrow: 'Day 0',
          headline: 'Welcome to ZYBAR',
          subhead: greeting,
          body:
            'We do not sell decoration.<br/><br/>We craft automotive light painting for people who want their rooms to feel like theirs &mdash; cinematic, personal, and quietly powerful.'
        }),
        C.SoftPanel.render({
          eyebrow: 'Why we exist',
          headline: 'Car culture deserves a better wall.',
          body:
            'Most people never own the cars they dream about. The feeling remains. ZYBAR turns that feeling into presence &mdash; light, depth, and atmosphere you can live with.'
        }),
        C.ImageBlock.render({
          href: shopHref,
          imageUrl: img(ctx.storeUrl, '/Poster/night.jpg'),
          alt: 'ZYBAR LED artwork glowing at night',
          caption: 'Atmosphere, engineered',
          height: 400
        }),
        memberCoupon(),
        C.Button.render({
          href: shopHref,
          label: 'Explore Collection'
        }),
        C.FeatureIcons.render({
          items: ['Hand-finished', 'Selective light', 'Ships worldwide', '30-day guarantee']
        }),
        footer(ctx.storeName, 'You joined the ZYBAR Garage.')
      ]
    })
  };
}

/* -------------------------------------------------------------------------- */
/* Day 1 — The Art of Living With Light                                       */
/* -------------------------------------------------------------------------- */

function renderDay1(options) {
  const ctx = resolveContext(options);
  const campaign = 'welcome_day1';
  const shopHref = withUtm(ctx.storeUrl + '/collections/all/', campaign);

  const rooms = [
    {
      src: '/Poster/popup-garage-hero.png',
      caption: 'Garage',
      alt: 'ZYBAR LED wall art in a luxury garage'
    },
    {
      src: '/lifestyle-gallery/styled/maybach-bedroom.jpg',
      caption: 'Bedroom',
      alt: 'Maybach LED artwork above a modern bedroom headboard'
    },
    {
      src: '/lifestyle-gallery/styled/cls-hallway.jpg',
      caption: 'Living space',
      alt: 'Mercedes CLS LED artwork in a luxury hallway'
    },
    {
      src: '/lifestyle-gallery/styled/mclaren-bedroom.jpg',
      caption: 'Private room',
      alt: 'McLaren LED artwork glowing above a minimalist bed'
    },
    {
      src: '/lifestyle-gallery/styled/amg-spotlight-wall.png',
      caption: 'Studio wall',
      alt: 'AMG LED artwork spotlighted on a clean gallery wall'
    }
  ];

  const imageSections = rooms.map(function (room) {
    return C.ImageBlock.render({
      href: shopHref,
      imageUrl: img(ctx.storeUrl, room.src),
      alt: room.alt,
      caption: room.caption,
      height: 380
    });
  });

  return {
    subject: 'The art of living with light',
    preheader: 'Garage. Bedroom. Office. Watch how atmosphere changes a room.',
    html: C.Shell.render({
      title: 'The Art of Living With Light',
      preheader: 'Garage. Bedroom. Office. Watch how atmosphere changes a room.',
      sections: [
        header(ctx.storeUrl, ctx.storeName, campaign),
        C.RichText.render({
          eyebrow: 'Day 1',
          headline: 'The Art of Living With Light',
          body: 'A room is not finished until the light feels intentional.'
        })
      ]
        .concat(imageSections)
        .concat([
          C.SoftPanel.render({
            headline: 'Turn it on.',
            body: 'The mood arrives.'
          }),
          C.Button.render({
            href: shopHref,
            label: 'See Real Setups'
          }),
          footer(ctx.storeName)
        ])
    })
  };
}

/* -------------------------------------------------------------------------- */
/* Day 2 — Behind Every Piece                                                 */
/* -------------------------------------------------------------------------- */

function renderDay2(options) {
  const ctx = resolveContext(options);
  const campaign = 'welcome_day2';
  const shopHref = withUtm(ctx.storeUrl + '/collections/all/', campaign);

  return {
    subject: 'Behind every piece',
    preheader: 'Selective light. Layered depth. Made with intention.',
    html: C.Shell.render({
      title: 'Behind Every Piece',
      preheader: 'Selective light. Layered depth. Made with intention.',
      sections: [
        header(ctx.storeUrl, ctx.storeName, campaign),
        C.Hero.render({
          href: shopHref,
          imageUrl: img(ctx.storeUrl, '/Poster/description1.png'),
          alt: 'ZYBAR precision illumination engineered from within',
          height: 420
        }),
        C.RichText.render({
          eyebrow: 'Day 2',
          headline: 'Behind Every Piece',
          body: 'This is not edge-lit novelty.<br/><br/>It is light placed with intention.'
        }),
        C.ImageBlock.render({
          href: shopHref,
          imageUrl: img(ctx.storeUrl, '/Image/comparison-overlay-top.png'),
          alt: 'ZYBAR LED artwork with lights on',
          caption: 'Light on',
          height: 400
        }),
        C.ImageBlock.render({
          href: shopHref,
          imageUrl: img(ctx.storeUrl, '/Image/comparison-overlay-bottom.png'),
          alt: 'ZYBAR LED artwork with lights off',
          caption: 'Light off',
          height: 400
        }),
        C.SoftPanel.render({
          eyebrow: 'The ZYBAR standard',
          headline: 'Selective illumination.',
          body:
            'We light the form from within &mdash; headlights, calipers, contours &mdash; so depth and contrast feel cinematic, not flooded.'
        }),
        C.ImageBlock.render({
          href: shopHref,
          imageUrl: img(ctx.storeUrl, '/Poster/description2.png'),
          alt: 'ZYBAR layered materials and construction',
          caption: 'Layered. Optical. Built to last.',
          height: 420
        }),
        C.RichText.render({
          headline: 'Made with intention.',
          body: 'Acrylic chosen for clarity.<br/>Light chosen for presence.<br/>Finish chosen for pride.'
        }),
        C.Button.render({
          href: shopHref,
          label: 'Discover More'
        }),
        footer(ctx.storeName)
      ]
    })
  };
}

/* -------------------------------------------------------------------------- */
/* Day 3 — Find Your Style                                                    */
/* -------------------------------------------------------------------------- */

function renderDay3(options) {
  const ctx = resolveContext(options);
  const campaign = 'welcome_day3';
  const catalogHref = withUtm(ctx.storeUrl + '/collections/all/', campaign);

  const collections = [
    {
      title: 'German',
      line: 'Precision. Quiet power. Night drive elegance.',
      href: withUtm(ctx.storeUrl + '/products/porsche-gt3-rs/', campaign),
      imageUrl: img(ctx.storeUrl, '/Image/email/product-porsche-gt3-rs.jpg'),
      alt: 'Porsche GT3 RS LED wall art',
      cta: 'Find Your Style'
    },
    {
      title: 'JDM',
      line: 'Icons of midnight. Legends that never sleep.',
      href: withUtm(ctx.storeUrl + '/products/nissan-gtr/', campaign),
      imageUrl: img(ctx.storeUrl, '/Image/email/product-nissan-gtr.jpg'),
      alt: 'Nissan GT-R LED wall art',
      cta: 'Find Your Style'
    },
    {
      title: 'American Muscle',
      line: 'Force, silhouette, and unapologetic presence.',
      href: withUtm(ctx.storeUrl + '/products/dodge-srt-hellcat-01/', campaign),
      imageUrl: img(ctx.storeUrl, '/Image/dodge-srt-hellcat-01-1-on.webp'),
      alt: 'Dodge Hellcat LED wall art',
      cta: 'Find Your Style'
    },
    {
      title: 'Supercars',
      line: 'Drama in form. Desire in light.',
      href: withUtm(ctx.storeUrl + '/products/ferrari-f8/', campaign),
      imageUrl: img(ctx.storeUrl, '/Image/email/product-ferrari-f8.jpg'),
      alt: 'Ferrari F8 LED wall art',
      cta: 'Find Your Style'
    },
    {
      title: 'Custom',
      line: 'Your car. Your story. Your wall.',
      href: withUtm(ctx.storeUrl + '/products/custom-led-car-wall-art/', campaign),
      imageUrl: img(ctx.storeUrl, '/Image/custom-led-car-wall-art-1-on.jpg'),
      alt: 'Custom ZYBAR LED car wall art',
      cta: 'Customize Yours'
    }
  ];

  const cards = collections.map(function (c) {
    return C.CollectionCard.render(c);
  });

  return {
    subject: 'Find your style',
    preheader: 'German. JDM. Muscle. Supercars. Custom. Choose your identity.',
    html: C.Shell.render({
      title: 'Find Your Style',
      preheader: 'German. JDM. Muscle. Supercars. Custom. Choose your identity.',
      sections: [
        header(ctx.storeUrl, ctx.storeName, campaign),
        C.RichText.render({
          eyebrow: 'Day 3',
          headline: 'Find Your Style',
          body: 'Taste is identity.<br/>Start with the culture that feels like yours.'
        })
      ]
        .concat(cards)
        .concat([
          C.Button.render({
            href: catalogHref,
            label: 'Explore Collection'
          }),
          footer(ctx.storeName)
        ])
    })
  };
}

/* -------------------------------------------------------------------------- */
/* Day 4 — Collector Stories                                                  */
/* -------------------------------------------------------------------------- */

function renderDay4(options) {
  const ctx = resolveContext(options);
  const campaign = 'welcome_day4';
  const shopHref = withUtm(ctx.storeUrl + '/collections/all/', campaign);
  const reviewsHref = withUtm(ctx.storeUrl + '/customer-reviews.html', campaign);

  return {
    subject: 'Collector stories',
    preheader: 'Real rooms. Real light. Imagine yours.',
    html: C.Shell.render({
      title: 'Collector Stories',
      preheader: 'Real rooms. Real light. Imagine yours.',
      sections: [
        header(ctx.storeUrl, ctx.storeName, campaign),
        C.RichText.render({
          eyebrow: 'Day 4',
          headline: 'Collector Stories',
          body: 'These are not product shots.<br/>These are rooms that finally feel finished.'
        }),
        C.QuoteWithImage.render({
          href: shopHref,
          imageUrl: img(ctx.storeUrl, '/lifestyle-gallery/styled/cls-sideboard.png'),
          alt: 'Dual Mercedes LED panels styled on a sideboard',
          caption: 'Living room presence',
          quote:
            'The craftsmanship is excellent, and the working headlights make it feel incredibly realistic and collectible.',
          author: 'SK Moon · Verified collector'
        }),
        C.QuoteWithImage.render({
          href: shopHref,
          imageUrl: img(ctx.storeUrl, '/lifestyle-gallery/wild/porsche-designer-figure.png'),
          alt: 'Porsche LED artwork glowing in a customer space',
          caption: 'Collector shelf',
          quote: 'Looks like a real showroom piece on my wall. The lighting quality is unreal.',
          author: 'Verified collector · Garage setup'
        }),
        C.QuoteWithImage.render({
          href: shopHref,
          imageUrl: img(ctx.storeUrl, '/lifestyle-gallery/wild/rolls-royce-shelf.png'),
          alt: 'Rolls-Royce LED artwork on a customer shelf',
          caption: 'Quiet luxury',
          quote:
            'Received so many compliments already. Feels premium in person — lighting is the real differentiator.',
          author: 'Verified buyer · Home install'
        }),
        C.Button.render({
          href: reviewsHref,
          label: 'See Real Setups'
        }),
        footer(ctx.storeName)
      ]
    })
  };
}

/* -------------------------------------------------------------------------- */
/* Day 5 — Turn Your Own Car Into Light                                       */
/* -------------------------------------------------------------------------- */

function renderDay5(options) {
  const ctx = resolveContext(options);
  const campaign = 'welcome_day5';
  const customHref = withUtm(ctx.storeUrl + '/products/custom-led-car-wall-art/', campaign);

  return {
    subject: 'Turn your own car into light',
    preheader: 'Your car. Your story. Handcrafted into atmosphere.',
    html: C.Shell.render({
      title: 'Turn Your Own Car Into Light',
      preheader: 'Your car. Your story. Handcrafted into atmosphere.',
      sections: [
        header(ctx.storeUrl, ctx.storeName, campaign),
        C.Hero.render({
          href: customHref,
          imageUrl: img(ctx.storeUrl, '/Image/custom-led-car-wall-art-1.jpg'),
          alt: 'Custom Maybach LED wall art glowing on a garage wall',
          height: 420
        }),
        C.RichText.render({
          eyebrow: 'Day 5',
          headline: 'Turn Your Own Car Into Light',
          body:
            'Catalog icons are for shared culture.<br/>Custom is for the car that is already yours.'
        }),
        C.SoftPanel.render({
          eyebrow: 'Emotional value',
          headline: 'Not a print of a dream.',
          body: 'A glowing portrait of the machine you love &mdash; made to hang where you live.'
        }),
        C.ImageBlock.render({
          href: customHref,
          imageUrl: img(ctx.storeUrl, '/Image/custom-led-car-wall-art-8.jpg'),
          alt: 'Custom ZYBAR LED car artwork in lifestyle setting',
          caption: 'After — presence on the wall',
          height: 400
        }),
        C.ImageBlock.render({
          href: customHref,
          imageUrl: img(ctx.storeUrl, '/Image/custom-led-car-wall-art-3.jpg'),
          alt: 'Custom ZYBAR process and finish detail',
          caption: 'Crafted from your photos',
          height: 380
        }),
        C.ImageBlock.render({
          href: customHref,
          imageUrl: img(ctx.storeUrl, '/Image/custom-led-car-wall-art-6.jpg'),
          alt: 'Custom ZYBAR LED wall art detail',
          caption: 'Selective light. Your silhouette.',
          height: 380
        }),
        C.RichText.render({
          headline: 'The process is simple.',
          body:
            'Share your photos.<br/>We craft the light.<br/>You unbox something that feels personal.'
        }),
        C.Button.render({
          href: customHref,
          label: 'Customize Yours'
        }),
        footer(ctx.storeName)
      ]
    })
  };
}

/* -------------------------------------------------------------------------- */
/* Day 6 — Why ZYBAR?                                                         */
/* -------------------------------------------------------------------------- */

function renderDay6(options) {
  const ctx = resolveContext(options);
  const campaign = 'welcome_day6';
  const shopHref = withUtm(ctx.storeUrl + '/collections/all/', campaign);

  return {
    subject: 'Why ZYBAR?',
    preheader: 'Craft. Light. Atmosphere. Emotion. The difference you feel.',
    html: C.Shell.render({
      title: 'Why ZYBAR?',
      preheader: 'Craft. Light. Atmosphere. Emotion. The difference you feel.',
      sections: [
        header(ctx.storeUrl, ctx.storeName, campaign),
        C.Hero.render({
          href: shopHref,
          imageUrl: img(
            ctx.storeUrl,
            '/Poster/caris%20expensive%20but%20dream%20is%20priceless%20.png'
          ),
          alt: 'ZYBAR premium LED automotive wall art in a collector garage',
          height: 420
        }),
        C.RichText.render({
          eyebrow: 'Day 6',
          headline: 'Why ZYBAR?',
          body: 'Generic LED frames light a rectangle.<br/>ZYBAR lights a feeling.'
        }),
        C.SoftPanel.render({
          eyebrow: 'Craft',
          headline: 'Built as collectors, for collectors.',
          body: 'We hang these ourselves. If a piece fails that test, it never ships.'
        }),
        C.ImageBlock.render({
          href: shopHref,
          imageUrl: img(ctx.storeUrl, '/Poster/description.png'),
          alt: 'ZYBAR LED artwork — light engineered as art',
          caption: 'Lighting — selective, not flooded',
          height: 420
        }),
        C.RichText.render({
          headline: 'Atmosphere over novelty.',
          body:
            'Depth. Contrast. Silence between the highlights.<br/>Design that holds after the first glance fades.'
        }),
        C.ImageBlock.render({
          href: shopHref,
          imageUrl: img(ctx.storeUrl, '/Poster/description4.png'),
          alt: 'ZYBAR versatile power and collector experience',
          caption: 'Experience — worldwide, effortless, considered',
          height: 360
        }),
        C.RichText.render({
          headline: 'Emotion is the product.',
          body:
            'Pride when guests notice.<br/>Calm when the room goes dark.<br/>Belonging when the light comes on.'
        }),
        C.Button.render({
          href: shopHref,
          label: 'Explore Collection'
        }),
        footer(ctx.storeName)
      ]
    })
  };
}

/* -------------------------------------------------------------------------- */
/* Day 7 — Your Invitation                                                    */
/* -------------------------------------------------------------------------- */

function renderDay7(options) {
  const ctx = resolveContext(options);
  const campaign = 'welcome_day7';
  const shopHref = withUtm(ctx.storeUrl + '/collections/all/', campaign);
  const customHref = withUtm(ctx.storeUrl + '/products/custom-led-car-wall-art/', campaign);

  return {
    subject: 'Your invitation',
    preheader: 'Your welcome savings are waiting. Enter the collector community.',
    html: C.Shell.render({
      title: 'Your Invitation',
      preheader: 'Your welcome savings are waiting. Enter the collector community.',
      sections: [
        header(ctx.storeUrl, ctx.storeName, campaign),
        C.Hero.render({
          href: shopHref,
          imageUrl: img(ctx.storeUrl, '/Poster/night.jpg'),
          alt: 'ZYBAR LED artwork glowing at night — collector atmosphere',
          height: 420
        }),
        C.RichText.render({
          eyebrow: 'Day 7',
          headline: 'Your Invitation',
          body:
            'You have seen the rooms.<br/>You have felt the craft.<br/><br/>Now the wall is waiting for you.'
        }),
        C.ImageBlock.render({
          href: shopHref,
          imageUrl: img(ctx.storeUrl, '/lifestyle-gallery/styled/maybach-sakura-easel.png'),
          alt: 'Maybach sakura LED artwork on a studio easel',
          caption: 'A space that feels like yours',
          height: 400
        }),
        memberCoupon(),
        C.SoftPanel.render({
          eyebrow: 'Become a collector',
          headline: 'This is not the end of a sequence.',
          body:
            'It is the beginning of a space that feels like yours &mdash; cinematic, personal, unmistakably ZYBAR.'
        }),
        C.Button.render({
          href: shopHref,
          label: 'Become a Collector'
        }),
        C.TextLink.render({
          href: customHref,
          label: 'Or turn your own car into light →'
        }),
        C.FeatureIcons.render({
          items: ['Welcome 15%', 'Hand-finished', 'Ships worldwide', '30-day guarantee']
        }),
        C.CtaBanner.render({
          headline: 'Your room is waiting.',
          body: 'Welcome savings apply when you open the store from this email.',
          href: shopHref,
          label: 'Become a Collector'
        }),
        footer(ctx.storeName, 'This closes your ZYBAR Welcome Journey — the Garage remains open.')
      ]
    })
  };
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

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
  const n = Number(day);
  const fn = DAY_RENDERERS[n];
  if (!fn) throw new Error('Unknown welcome journey day: ' + day);
  return fn(options);
}

function renderWelcomeDayByKey(templateKey, options) {
  const key = String(templateKey || '');
  if (key === 'welcome_email' || key === 'welcome_day0') return renderDay0(options);
  const match = /^welcome_day([0-7])$/.exec(key);
  if (!match) throw new Error('Unknown welcome template key: ' + templateKey);
  return renderWelcomeDay(Number(match[1]), options);
}

function listWelcomeTemplates() {
  return JOURNEY.days.map(function (d) {
    const rendered = renderWelcomeDay(d.day, {});
    return {
      key: d.templateKey,
      day: d.day,
      name: d.stepName,
      description: 'Welcome Journey Day ' + d.day + ' — ' + d.stepName,
      subject: rendered.subject,
      journeys: ['welcome_journey'],
      delayValue: d.delayValue,
      delayUnit: d.delayUnit
    };
  });
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
  renderWelcomeDayByKey,
  listWelcomeTemplates
};
