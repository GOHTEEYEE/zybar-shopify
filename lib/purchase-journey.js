/**
 * ZYBAR Purchase / Customer Journey — 7-Day Lifecycle
 * Trigger: purchase | Exit: no_purchase_90_days → Win Back
 *
 * Purpose: post-purchase belonging — thank, guide, celebrate, invite the next chapter.
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
  key: 'customer_journey',
  name: 'ZYBAR Purchase Journey',
  description: '7-day post-purchase care: thank you, anticipation, install, atmosphere, share, review, next piece.',
  days: [
    { day: 0, templateKey: 'purchase_day0', delayValue: 0, delayUnit: 'minutes', stepName: 'Thank You' },
    { day: 1, templateKey: 'purchase_day1', delayValue: 1, delayUnit: 'days', stepName: 'Your Piece Is Being Prepared' },
    { day: 2, templateKey: 'purchase_day2', delayValue: 1, delayUnit: 'days', stepName: 'How To Live With Light' },
    { day: 3, templateKey: 'purchase_day3', delayValue: 1, delayUnit: 'days', stepName: 'Install With Ease' },
    { day: 4, templateKey: 'purchase_day4', delayValue: 1, delayUnit: 'days', stepName: 'Share Your Setup' },
    { day: 5, templateKey: 'purchase_day5', delayValue: 1, delayUnit: 'days', stepName: 'Leave A Collector Review' },
    { day: 6, templateKey: 'purchase_day6', delayValue: 1, delayUnit: 'days', stepName: 'Your Next Chapter' },
    { day: 7, templateKey: 'purchase_day7', delayValue: 1, delayUnit: 'days', stepName: 'Welcome To The Garage' }
  ]
};

function withUtm(url, campaign) {
  const sep = url.indexOf('?') === -1 ? '?' : '&';
  return (
    url +
    sep +
    'utm_source=email&utm_medium=purchase_journey&utm_campaign=' +
    encodeURIComponent(campaign || 'purchase')
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
    reason: reason || 'You purchased from ZYBAR.',
    unsubscribeHref:
      'mailto:support@zybar.shop?subject=Unsubscribe&body=Please%20unsubscribe%20me%20from%20ZYBAR%20emails.',
    contactHref: 'mailto:support@zybar.shop'
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
  const campaign = 'purchase_day0';
  const shopHref = withUtm(c.storeUrl + '/collections/all/', campaign);
  return {
    subject: 'Thank you for your order',
    preheader: 'Welcome to the ZYBAR garage — your piece is being prepared.',
    html: C.Shell.render({
      title: 'Thank You',
      preheader: 'Welcome to the ZYBAR garage — your piece is being prepared.',
      sections: [
        header(c.storeUrl, c.storeName, campaign),
        C.Hero.render({
          href: shopHref,
          imageUrl: img(c.storeUrl, '/Poster/night.jpg'),
          alt: 'ZYBAR LED artwork glowing at night',
          height: 400
        }),
        C.RichText.render({
          eyebrow: 'Order confirmed',
          headline: c.customerName ? 'Thank you, ' + c.customerName + '.' : 'Thank you for your order.',
          body: 'You are now part of the garage.<br/>Your piece is being prepared with care.'
        }),
        C.SoftPanel.render({
          headline: 'What happens next.',
          body: 'We craft. We pack. We ship worldwide. You will hear from us as it moves.'
        }),
        C.Button.render({ href: shopHref, label: 'Explore Collection' }),
        footer(c.storeName)
      ]
    })
  };
}

function renderDay1(options) {
  const c = ctx(options);
  const campaign = 'purchase_day1';
  const shopHref = withUtm(c.storeUrl + '/collections/all/', campaign);
  return {
    subject: 'Your piece is being prepared',
    preheader: 'Hand-finished. Packed with intention. On its way to your wall.',
    html: C.Shell.render({
      title: 'Your Piece Is Being Prepared',
      preheader: 'Hand-finished. Packed with intention. On its way to your wall.',
      sections: [
        header(c.storeUrl, c.storeName, campaign),
        C.Hero.render({
          href: shopHref,
          imageUrl: img(c.storeUrl, '/Poster/description2.png'),
          alt: 'ZYBAR craft and materials',
          height: 400
        }),
        C.RichText.render({
          eyebrow: 'Anticipation',
          headline: 'Your piece is being prepared.',
          body: 'Hand-finished acrylic.<br/>Selective light.<br/>Packed like something worth waiting for.'
        }),
        C.Button.render({ href: shopHref, label: 'Discover More' }),
        footer(c.storeName)
      ]
    })
  };
}

function renderDay2(options) {
  const c = ctx(options);
  const campaign = 'purchase_day2';
  const shopHref = withUtm(c.storeUrl + '/collections/all/', campaign);
  return {
    subject: 'How to live with light',
    preheader: 'A few quiet ways collectors style ZYBAR.',
    html: C.Shell.render({
      title: 'How To Live With Light',
      preheader: 'A few quiet ways collectors style ZYBAR.',
      sections: [
        header(c.storeUrl, c.storeName, campaign),
        C.RichText.render({
          eyebrow: 'Living with it',
          headline: 'How to live with light.',
          body: 'Garage. Bedroom. Office.<br/>Let the room go dark — then turn it on.'
        }),
        C.ImageBlock.render({
          href: shopHref,
          imageUrl: img(c.storeUrl, '/lifestyle-gallery/styled/amg-spotlight-wall.png'),
          alt: 'AMG LED artwork on a gallery wall',
          caption: 'Gallery wall',
          height: 380
        }),
        C.ImageBlock.render({
          href: shopHref,
          imageUrl: img(c.storeUrl, '/lifestyle-gallery/styled/mclaren-bedroom.jpg'),
          alt: 'McLaren LED artwork in a bedroom',
          caption: 'Private room',
          height: 380
        }),
        C.Button.render({ href: shopHref, label: 'See Real Setups' }),
        footer(c.storeName)
      ]
    })
  };
}

function renderDay3(options) {
  const c = ctx(options);
  const campaign = 'purchase_day3';
  const faqHref = withUtm(c.storeUrl + '/policies/faq.html', campaign);
  return {
    subject: 'Install with ease',
    preheader: 'USB power. Easy mount. No drama.',
    html: C.Shell.render({
      title: 'Install With Ease',
      preheader: 'USB power. Easy mount. No drama.',
      sections: [
        header(c.storeUrl, c.storeName, campaign),
        C.Hero.render({
          href: faqHref,
          imageUrl: img(c.storeUrl, '/Poster/description4.png'),
          alt: 'ZYBAR versatile power options',
          height: 380
        }),
        C.RichText.render({
          eyebrow: 'Setup',
          headline: 'Install with ease.',
          body: 'Universal USB.<br/>Easy wall mount.<br/>Remote in hand — brightness yours to control.'
        }),
        C.SoftPanel.render({
          headline: 'Need help?',
          body: 'Reply to this email. We are here for missing parts, mounting questions, or first-light guidance.'
        }),
        C.Button.render({ href: faqHref, label: 'Read FAQ' }),
        footer(c.storeName)
      ]
    })
  };
}

function renderDay4(options) {
  const c = ctx(options);
  const campaign = 'purchase_day4';
  const reviewsHref = withUtm(c.storeUrl + '/customer-reviews.html', campaign);
  return {
    subject: 'Share your setup',
    preheader: 'When the light comes on, tag @zybar.shop — we love collector rooms.',
    html: C.Shell.render({
      title: 'Share Your Setup',
      preheader: 'When the light comes on, tag @zybar.shop — we love collector rooms.',
      sections: [
        header(c.storeUrl, c.storeName, campaign),
        C.ImageBlock.render({
          href: reviewsHref,
          imageUrl: img(c.storeUrl, '/lifestyle-gallery/wild/porsche-designer-figure.png'),
          alt: 'Porsche LED artwork in a collector space',
          caption: 'Collector spaces',
          height: 400
        }),
        C.RichText.render({
          eyebrow: 'Community',
          headline: 'Share your setup.',
          body: 'When the first glow hits the wall — capture it.<br/>Tag @zybar.shop. Join the garage.'
        }),
        C.Button.render({ href: 'https://www.instagram.com/zybar.shop', label: 'Visit Instagram' }),
        footer(c.storeName)
      ]
    })
  };
}

function renderDay5(options) {
  const c = ctx(options);
  const campaign = 'purchase_day5';
  const reviewsHref = withUtm(c.storeUrl + '/customer-reviews.html', campaign);
  return {
    subject: 'How does it look on your wall?',
    preheader: 'A short collector review helps the next enthusiast choose with confidence.',
    html: C.Shell.render({
      title: 'Leave A Collector Review',
      preheader: 'A short collector review helps the next enthusiast choose with confidence.',
      sections: [
        header(c.storeUrl, c.storeName, campaign),
        C.RichText.render({
          eyebrow: 'Review',
          headline: 'How does it look on your wall?',
          body: 'One photo. A few words.<br/>Help the next collector feel the atmosphere before they order.'
        }),
        C.Review.render({
          quote: 'Looks like a real showroom piece on my wall. The lighting quality is unreal.',
          author: 'Verified collector · Garage setup'
        }),
        C.Button.render({ href: reviewsHref, label: 'Leave a Review' }),
        footer(c.storeName)
      ]
    })
  };
}

function renderDay6(options) {
  const c = ctx(options);
  const campaign = 'purchase_day6';
  const shopHref = withUtm(c.storeUrl + '/collections/all/', campaign);
  const customHref = withUtm(c.storeUrl + '/products/custom-led-car-wall-art/', campaign);
  return {
    subject: 'Your next chapter',
    preheader: 'A companion piece. A second car. Or custom of your own.',
    html: C.Shell.render({
      title: 'Your Next Chapter',
      preheader: 'A companion piece. A second car. Or custom of your own.',
      sections: [
        header(c.storeUrl, c.storeName, campaign),
        C.Hero.render({
          href: customHref,
          imageUrl: img(c.storeUrl, '/Image/custom-led-car-wall-art-8.jpg'),
          alt: 'Custom ZYBAR LED artwork',
          height: 400
        }),
        C.RichText.render({
          eyebrow: 'Collectors keep going',
          headline: 'Your next chapter.',
          body: 'One piece starts the room.<br/>The second finishes the story.'
        }),
        C.Button.render({ href: shopHref, label: 'Explore Collection' }),
        C.TextLink.render({ href: customHref, label: 'Customize Yours →' }),
        footer(c.storeName)
      ]
    })
  };
}

function renderDay7(options) {
  const c = ctx(options);
  const campaign = 'purchase_day7';
  const shopHref = withUtm(c.storeUrl + '/collections/all/', campaign);
  return {
    subject: 'Welcome to the garage',
    preheader: 'You are not just a buyer — you are a ZYBAR collector.',
    html: C.Shell.render({
      title: 'Welcome To The Garage',
      preheader: 'You are not just a buyer — you are a ZYBAR collector.',
      sections: [
        header(c.storeUrl, c.storeName, campaign),
        C.Hero.render({
          href: shopHref,
          imageUrl: img(
            c.storeUrl,
            '/Poster/caris%20expensive%20but%20dream%20is%20priceless%20.png'
          ),
          alt: 'ZYBAR collector garage atmosphere',
          height: 400
        }),
        C.RichText.render({
          eyebrow: 'Belonging',
          headline: 'Welcome to the garage.',
          body: 'This closes your first week as a collector.<br/>The door stays open for whatever comes next.'
        }),
        C.SoftPanel.render({
          headline: 'Identity. Atmosphere. Pride.',
          body: 'Whenever you are ready for the next wall — we will be here.'
        }),
        C.Button.render({ href: shopHref, label: 'Become a Collector' }),
        C.FeatureIcons.render({
          items: ['Hand-finished', 'Worldwide shipping', 'Collector care', 'Custom available']
        }),
        footer(c.storeName, 'This closes your ZYBAR purchase journey week.')
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

function renderPurchaseDay(day, options) {
  const fn = DAY_RENDERERS[Number(day)];
  if (!fn) throw new Error('Unknown purchase journey day: ' + day);
  return fn(options);
}

function renderPurchaseDayByKey(templateKey, options) {
  const key = String(templateKey || '');
  if (key === 'thank_you') return renderDay0(options);
  if (key === 'review_request') return renderDay5(options);
  if (key === 'new_collection') return renderDay6(options);
  const match = /^purchase_day([0-7])$/.exec(key);
  if (!match) throw new Error('Unknown purchase template key: ' + templateKey);
  return renderPurchaseDay(Number(match[1]), options);
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
  renderPurchaseDay,
  renderPurchaseDayByKey
};
