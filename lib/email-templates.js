/**
 * Centralized email templates for transactional and automated emails.
 *
 * Templates are assemblies of reusable components from ./email-components.js.
 * Do not embed large HTML blocks here — compose Shell + section components.
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

function withUtm(url, campaign) {
  const sep = url.indexOf('?') === -1 ? '?' : '&';
  return (
    url +
    sep +
    'utm_source=email&utm_medium=journey&utm_campaign=' +
    encodeURIComponent(campaign || 'zybar')
  );
}

function standardHeader(storeUrl, storeName, campaign) {
  return C.Header.render({
    href: withUtm(storeUrl + '/', campaign),
    logoUrl: storeUrl + '/Image/email/zybar-logo.png',
    alt: storeName,
    width: 132
  });
}

function standardFooter(storeName, reason) {
  return C.Footer.render({
    socials: SOCIAL_LINKS,
    identity: storeName + ' \u00B7 Mantin, Negeri Sembilan, Malaysia',
    reason: reason || 'You are receiving this from the ' + storeName + ' Garage.',
    unsubscribeHref:
      'mailto:support@zybar.shop?subject=Unsubscribe&body=Please%20unsubscribe%20me%20from%20ZYBAR%20emails.',
    contactHref: 'mailto:support@zybar.shop'
  });
}

/**
 * Lightweight template assembly used by Cart / Customer / Win Back emails.
 * Reuses Header + Rich Text + optional Coupon + Button + Footer.
 */
function assembleSimpleEmail(options) {
  options = options || {};
  const storeUrl = options.storeUrl || DEFAULT_STORE_URL;
  const storeName = options.storeName || DEFAULT_STORE_NAME;
  const code = options.discountCode || DEFAULT_DISCOUNT_CODE;
  const campaign = options.campaign || 'journey';
  const showCoupon = options.showCoupon !== false;
  const sections = [
    standardHeader(storeUrl, storeName, campaign),
    C.RichText.render({
      eyebrow: options.eyebrow,
      headline: options.headline,
      body: options.body
    })
  ];
  if (showCoupon) {
    sections.push(
      C.Coupon.render({
        offer: options.offer || '15% OFF',
        label: options.couponLabel || 'Your code',
        code: code,
        note: options.couponNote || 'Enter at checkout.'
      })
    );
  }
  sections.push(
    C.Button.render({
      href: options.ctaHref || withUtm(storeUrl + '/collections/all/', campaign),
      label: options.ctaLabel || 'Shop Now'
    }),
    standardFooter(storeName, options.reason)
  );
  return C.Shell.render({
    title: options.title || storeName,
    preheader: options.preheader || '',
    sections: sections
  });
}

/* ========== Welcome — full component assembly ========== */

function buildWelcomeEmailHtml(options) {
  options = options || {};
  const storeUrl = options.storeUrl || DEFAULT_STORE_URL;
  const storeName = options.storeName || DEFAULT_STORE_NAME;
  const code = options.discountCode || DEFAULT_DISCOUNT_CODE;
  const campaign = 'welcome_v1';
  const firstName =
    options.customerName && String(options.customerName).trim()
      ? String(options.customerName).trim().split(' ')[0]
      : null;
  const shopHref = withUtm(storeUrl + '/collections/all/', campaign);
  const featured = options.featuredProducts || [
    {
      name: 'Porsche GT3 RS',
      meta: '30 \u00D7 45 cm',
      price: 'From $98',
      href: withUtm(storeUrl + '/products/porsche-gt3-rs/', campaign),
      imageUrl: storeUrl + '/Image/email/product-porsche-gt3-rs.jpg'
    },
    {
      name: 'Ferrari F8',
      meta: '30 \u00D7 45 cm',
      price: 'From $98',
      href: withUtm(storeUrl + '/products/ferrari-f8/', campaign),
      imageUrl: storeUrl + '/Image/email/product-ferrari-f8.jpg'
    },
    {
      name: 'Nissan GT-R',
      meta: '30 \u00D7 45 cm',
      price: 'From $98',
      href: withUtm(storeUrl + '/products/nissan-gtr/', campaign),
      imageUrl: storeUrl + '/Image/email/product-nissan-gtr.jpg'
    }
  ];

  const body = firstName
    ? C.esc(firstName) +
      ' &mdash; hand-finished acrylic with real working headlights and taillights, built so your wall feels like a showroom.'
    : 'Hand-finished acrylic with real working headlights and taillights &mdash; built so your wall feels like a showroom.';

  return C.Shell.render({
    title: 'Welcome to ' + storeName,
    preheader: 'Hand-finished acrylic LED car art. Code ' + code + ' for 15% off your first piece.',
    sections: [
      C.Header.render({
        href: withUtm(storeUrl + '/', campaign),
        logoUrl: storeUrl + '/Image/email/zybar-logo.png',
        alt: storeName,
        width: 132
      }),
      C.Hero.render({
        href: shopHref,
        imageUrl: storeUrl + '/Image/email/welcome-hero.jpg',
        alt: 'ZYBAR LED car artwork glowing on a garage office wall',
        height: 400
      }),
      C.RichText.render({
        eyebrow: storeName,
        headline: 'Welcome to the Garage.',
        subhead: 'Light. Engineered as Art.',
        body: body
      }),
      C.Coupon.render({
        offer: '15% OFF',
        label: 'Welcome code',
        code: code,
        note: 'Enter at checkout on your first order.'
      }),
      C.Button.render({
        href: shopHref,
        label: 'Shop with 15% Off'
      }),
      C.SectionTitle.render({
        title: 'Start here',
        headline: 'Choose your first piece'
      }),
      C.ProductGrid.render({ products: featured }),
      C.TextLink.render({
        href: shopHref,
        label: 'Browse the full collection \u2192'
      }),
      C.Review.render({
        quote:
          'The craftsmanship is excellent, and the working headlights make it feel incredibly realistic and collectible.',
        author: 'SK Moon \u00B7 Verified buyer'
      }),
      C.FeatureIcons.render({
        items: ['Hand-finished', 'Remote lighting', 'Ships worldwide']
      }),
      C.CtaBanner.render({
        headline: 'Your wall is waiting.',
        body: 'Use code ' + code + ' at checkout.',
        href: shopHref,
        label: 'Shop with 15% Off'
      }),
      standardFooter(storeName, 'You joined the ' + storeName + ' Garage.')
    ]
  });
}

function renderWelcomeEmail(vars) {
  vars = vars || {};
  return {
    subject: vars.subject || 'Welcome to ZYBAR — 15% off your first piece',
    html: buildWelcomeEmailHtml({
      storeName: vars.storeName || DEFAULT_STORE_NAME,
      storeUrl: vars.storeUrl || DEFAULT_STORE_URL,
      discountCode: vars.discountCode || DEFAULT_DISCOUNT_CODE,
      customerName: vars.customerName || null,
      featuredProducts: vars.featuredProducts || null
    })
  };
}

/* ========== Journey templates — component assemblies ========== */

function renderCartReminderEmail(vars) {
  vars = vars || {};
  const storeUrl = vars.storeUrl || DEFAULT_STORE_URL;
  return {
    subject: vars.subject || 'Your cart is waiting at ZYBAR',
    html: assembleSimpleEmail({
      storeName: vars.storeName,
      storeUrl: storeUrl,
      discountCode: vars.discountCode,
      campaign: 'cart_reminder',
      title: 'Your cart is waiting',
      preheader: 'Your LED piece is still in your cart. Complete checkout with your code.',
      eyebrow: 'Still in your cart',
      headline: 'Finish your LED piece',
      body: 'Your selected LED poster is still waiting. Complete checkout and use your code for 15% off.',
      ctaLabel: 'Return to Cart',
      ctaHref: withUtm(storeUrl + '/cart/', 'cart_reminder'),
      reason: 'You left items in your ZYBAR cart.'
    })
  };
}

function renderBrowsingNudgeEmail(vars) {
  vars = vars || {};
  const storeUrl = vars.storeUrl || DEFAULT_STORE_URL;
  return {
    subject: vars.subject || 'Still browsing? Your ZYBAR discount is ready',
    html: assembleSimpleEmail({
      storeName: vars.storeName,
      storeUrl: storeUrl,
      discountCode: vars.discountCode,
      campaign: 'browsing_nudge',
      title: 'Continue browsing',
      preheader: 'Your first-order discount is ready whenever you are.',
      eyebrow: 'Pick up where you left off',
      headline: 'Find your next LED poster',
      body: 'You were browsing the garage. Come back and apply your first-order discount at checkout.',
      ctaLabel: 'Continue Browsing',
      ctaHref: withUtm(storeUrl + '/collections/all/', 'browsing_nudge')
    })
  };
}

function renderBrandStoryEmail(vars) {
  vars = vars || {};
  const storeUrl = vars.storeUrl || DEFAULT_STORE_URL;
  return {
    subject: vars.subject || 'The story behind ZYBAR LED art',
    html: assembleSimpleEmail({
      storeName: vars.storeName,
      storeUrl: storeUrl,
      discountCode: vars.discountCode,
      campaign: 'brand_story',
      title: 'Brand story',
      preheader: 'Precision LED posters that turn walls into showrooms.',
      eyebrow: 'Brand story',
      headline: 'Built for car culture',
      body: 'Every ZYBAR piece is crafted for collectors who live the garage life &mdash; precision LED posters that turn walls into showrooms.',
      ctaLabel: 'Explore the Garage',
      ctaHref: withUtm(storeUrl + '/collections/all/', 'brand_story')
    })
  };
}

function renderBestSellerEmail(vars) {
  vars = vars || {};
  const storeUrl = vars.storeUrl || DEFAULT_STORE_URL;
  return {
    subject: vars.subject || 'ZYBAR bestsellers our collectors love',
    html: assembleSimpleEmail({
      storeName: vars.storeName,
      storeUrl: storeUrl,
      discountCode: vars.discountCode,
      campaign: 'best_seller',
      title: 'Bestsellers',
      preheader: 'Porsche GT3 RS, Lamborghini SVJ, Ferrari F8 — icons collectors choose first.',
      eyebrow: 'Bestsellers',
      headline: 'Icons that sell out fast',
      body: 'Porsche GT3 RS, Lamborghini SVJ, Ferrari F8 &mdash; see why these LED posters dominate the ZYBAR garage.',
      ctaLabel: 'Shop Bestsellers',
      ctaHref: withUtm(storeUrl + '/collections/all/', 'best_seller')
    })
  };
}

function renderDiscountOfferEmail(vars) {
  vars = vars || {};
  const storeUrl = vars.storeUrl || DEFAULT_STORE_URL;
  return {
    subject: vars.subject || 'Your ZYBAR discount is waiting',
    html: assembleSimpleEmail({
      storeName: vars.storeName,
      storeUrl: storeUrl,
      discountCode: vars.discountCode,
      campaign: 'discount_offer',
      title: 'Your discount',
      preheader: '15% off your next LED piece — enter your code at checkout.',
      eyebrow: 'Exclusive offer',
      headline: '15% off your next piece',
      body: 'Use your member code at checkout and lock in your LED poster.',
      ctaLabel: 'Redeem Discount',
      ctaHref: withUtm(storeUrl + '/collections/all/', 'discount_offer')
    })
  };
}

function renderNeedHelpEmail(vars) {
  vars = vars || {};
  const storeUrl = vars.storeUrl || DEFAULT_STORE_URL;
  return {
    subject: vars.subject || 'Need help finishing your ZYBAR order?',
    html: assembleSimpleEmail({
      storeName: vars.storeName,
      storeUrl: storeUrl,
      discountCode: vars.discountCode,
      campaign: 'need_help',
      showCoupon: false,
      title: 'Need help?',
      preheader: 'Sizing, shipping, or payment — reply and we will help.',
      eyebrow: 'We are here',
      headline: 'Stuck at checkout?',
      body: 'Sizing, shipping, or payment questions &mdash; reply to this email and we will help you finish your order.',
      ctaLabel: 'Return to Cart',
      ctaHref: withUtm(storeUrl + '/cart/', 'need_help'),
      reason: 'You started a ZYBAR checkout.'
    })
  };
}

function renderThankYouEmail(vars) {
  vars = vars || {};
  const storeUrl = vars.storeUrl || DEFAULT_STORE_URL;
  const name = vars.customerName ? String(vars.customerName).split(' ')[0] : null;
  return {
    subject: vars.subject || 'Thank you for your ZYBAR order',
    html: assembleSimpleEmail({
      storeName: vars.storeName,
      storeUrl: storeUrl,
      discountCode: vars.discountCode,
      campaign: 'thank_you',
      showCoupon: false,
      title: 'Thank you',
      preheader: 'Your LED piece is being prepared.',
      eyebrow: 'Order confirmed',
      headline: name ? 'Thank you, ' + name : 'Thank you for your order',
      body: 'Your LED piece is being prepared. We will keep you posted on shipping &mdash; welcome to the ZYBAR garage.',
      ctaLabel: 'View Collections',
      ctaHref: withUtm(storeUrl + '/collections/all/', 'thank_you'),
      reason: 'You placed an order with ZYBAR.'
    })
  };
}

function renderReviewRequestEmail(vars) {
  vars = vars || {};
  const storeUrl = vars.storeUrl || DEFAULT_STORE_URL;
  return {
    subject: vars.subject || 'How is your ZYBAR LED piece?',
    html: assembleSimpleEmail({
      storeName: vars.storeName,
      storeUrl: storeUrl,
      discountCode: vars.discountCode,
      campaign: 'review_request',
      showCoupon: false,
      title: 'Leave a review',
      preheader: 'Tell other collectors how your LED piece looks on your wall.',
      eyebrow: 'Share your setup',
      headline: 'Leave a quick review',
      body: 'Your feedback helps other collectors choose the right LED poster. Tell us how it looks on your wall.',
      ctaLabel: 'Leave a Review',
      ctaHref: withUtm(storeUrl + '/#reviews', 'review_request'),
      reason: 'You purchased from ZYBAR.'
    })
  };
}

function renderNewCollectionEmail(vars) {
  vars = vars || {};
  const storeUrl = vars.storeUrl || DEFAULT_STORE_URL;
  return {
    subject: vars.subject || 'New arrivals in the ZYBAR garage',
    html: assembleSimpleEmail({
      storeName: vars.storeName,
      storeUrl: storeUrl,
      discountCode: vars.discountCode,
      campaign: 'new_collection',
      title: 'New collection',
      preheader: 'Fresh LED icons just dropped — first look for ZYBAR customers.',
      eyebrow: 'New collection',
      headline: 'Fresh LED icons just dropped',
      body: 'As a ZYBAR customer, you get first look at the latest designs. Explore the new collection.',
      ctaLabel: 'Shop New Arrivals',
      ctaHref: withUtm(storeUrl + '/collections/all/', 'new_collection'),
      reason: 'You are a ZYBAR customer.'
    })
  };
}

const TEMPLATE_CATALOG = [
  {
    key: 'welcome_email',
    name: 'Welcome Email',
    description: 'Luxury welcome email assembled from the full component set.',
    journeys: ['welcome_journey'],
    components: [
      'header',
      'hero',
      'rich_text',
      'coupon',
      'button',
      'section_title',
      'product_grid',
      'text_link',
      'review',
      'feature_icons',
      'cta_banner',
      'footer'
    ]
  },
  {
    key: 'brand_story',
    name: 'Brand Story',
    description: 'Introduce ZYBAR brand and car culture positioning.',
    journeys: ['welcome_journey'],
    components: ['header', 'rich_text', 'coupon', 'button', 'footer']
  },
  {
    key: 'best_seller',
    name: 'Best Seller',
    description: 'Highlight top-selling LED posters.',
    journeys: ['welcome_journey'],
    components: ['header', 'rich_text', 'coupon', 'button', 'footer']
  },
  {
    key: 'discount_offer',
    name: 'Discount Offer',
    description: 'Remind leads / cart abandoners of their discount code.',
    journeys: ['welcome_journey', 'cart_journey'],
    components: ['header', 'rich_text', 'coupon', 'button', 'footer']
  },
  {
    key: 'cart_reminder',
    name: 'Cart Reminder',
    description: 'Nudge leads who still have items in cart to complete checkout.',
    journeys: ['cart_journey'],
    components: ['header', 'rich_text', 'coupon', 'button', 'footer']
  },
  {
    key: 'need_help',
    name: 'Need Help',
    description: 'Offer support to shoppers stuck at checkout.',
    journeys: ['cart_journey'],
    components: ['header', 'rich_text', 'button', 'footer']
  },
  {
    key: 'thank_you',
    name: 'Thank You',
    description: 'Immediate post-purchase thank you.',
    journeys: ['customer_journey'],
    components: ['header', 'rich_text', 'button', 'footer']
  },
  {
    key: 'review_request',
    name: 'Review Request',
    description: 'Ask customers for a review after delivery window.',
    journeys: ['customer_journey'],
    components: ['header', 'rich_text', 'button', 'footer']
  },
  {
    key: 'new_collection',
    name: 'New Collection',
    description: 'Re-engage past customers with new arrivals.',
    journeys: ['customer_journey'],
    components: ['header', 'rich_text', 'coupon', 'button', 'footer']
  },
  {
    key: 'browsing_nudge',
    name: 'Browsing Nudge',
    description: 'Bring product browsers back with their discount code.',
    journeys: [],
    components: ['header', 'rich_text', 'coupon', 'button', 'footer']
  }
];

function listTemplates() {
  return TEMPLATE_CATALOG.slice();
}

function getTemplateDefinition(templateKey) {
  const key = String(templateKey || '');
  for (let i = 0; i < TEMPLATE_CATALOG.length; i++) {
    if (TEMPLATE_CATALOG[i].key === key) return TEMPLATE_CATALOG[i];
  }
  return null;
}

function renderTemplate(templateKey, vars) {
  switch (String(templateKey || '')) {
    case 'welcome_email':
      return renderWelcomeEmail(vars);
    case 'brand_story':
      return renderBrandStoryEmail(vars);
    case 'best_seller':
      return renderBestSellerEmail(vars);
    case 'discount_offer':
      return renderDiscountOfferEmail(vars);
    case 'cart_reminder':
      return renderCartReminderEmail(vars);
    case 'need_help':
      return renderNeedHelpEmail(vars);
    case 'thank_you':
      return renderThankYouEmail(vars);
    case 'review_request':
      return renderReviewRequestEmail(vars);
    case 'new_collection':
      return renderNewCollectionEmail(vars);
    case 'browsing_nudge':
      return renderBrowsingNudgeEmail(vars);
    default:
      throw new Error('Unknown email template: ' + templateKey);
  }
}

module.exports = {
  DEFAULT_STORE_NAME,
  DEFAULT_STORE_URL,
  DEFAULT_DISCOUNT_CODE,
  TEMPLATE_CATALOG,
  buildWelcomeEmailHtml,
  assembleSimpleEmail,
  listTemplates,
  getTemplateDefinition,
  renderTemplate,
  // Re-export component catalog so admin / docs can inspect it from one place
  listComponents: C.listComponents,
  getComponent: C.getComponent,
  COMPONENT_CATALOG: C.COMPONENT_CATALOG
};
