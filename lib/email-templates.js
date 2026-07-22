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

function featuredBestsellers(storeUrl, campaign) {
  return [
    {
      name: 'Porsche GT3 RS',
      meta: '30 \u00D7 45 cm',
      price: 'From $138',
      href: withUtm(storeUrl + '/products/porsche-gt3-rs/', campaign),
      imageUrl: storeUrl + '/Image/email/product-porsche-gt3-rs.jpg'
    },
    {
      name: 'Lamborghini SVJ',
      meta: '30 \u00D7 45 cm',
      price: 'From $138',
      href: withUtm(storeUrl + '/products/lambrghini-svj-tailights/', campaign),
      imageUrl: storeUrl + '/Image/email/product-lamborghini-svj.jpg'
    },
    {
      name: 'Ferrari F8',
      meta: '30 \u00D7 45 cm',
      price: 'From $138',
      href: withUtm(storeUrl + '/products/ferrari-f8/', campaign),
      imageUrl: storeUrl + '/Image/email/product-ferrari-f8.jpg'
    }
  ];
}

function featuredWelcomeProducts(storeUrl, campaign) {
  return [
    {
      name: 'Porsche GT3 RS',
      meta: '30 \u00D7 45 cm',
      price: 'From $138',
      href: withUtm(storeUrl + '/products/porsche-gt3-rs/', campaign),
      imageUrl: storeUrl + '/Image/email/product-porsche-gt3-rs.jpg'
    },
    {
      name: 'Ferrari F8',
      meta: '30 \u00D7 45 cm',
      price: 'From $138',
      href: withUtm(storeUrl + '/products/ferrari-f8/', campaign),
      imageUrl: storeUrl + '/Image/email/product-ferrari-f8.jpg'
    },
    {
      name: 'Nissan GT-R',
      meta: '30 \u00D7 45 cm',
      price: 'From $138',
      href: withUtm(storeUrl + '/products/nissan-gtr/', campaign),
      imageUrl: storeUrl + '/Image/email/product-nissan-gtr.jpg'
    }
  ];
}

/**
 * Lightweight template assembly used by Cart / Customer / Win Back emails.
 * Reuses Header + Rich Text + optional Member Pricing + products + reputation + Button + Footer.
 */
function assembleSimpleEmail(options) {
  options = options || {};
  const storeUrl = options.storeUrl || DEFAULT_STORE_URL;
  const storeName = options.storeName || DEFAULT_STORE_NAME;
  const campaign = options.campaign || 'journey';
  const showCoupon = options.showCoupon !== false;
  const shopHref = options.ctaHref || withUtm(storeUrl + '/collections/all/', campaign);
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
        offer: 'MEMBER PRICING',
        label: 'Extra 15% savings',
        code: 'Automatically Applied',
        note: 'Open the store from this email. No code required.'
      })
    );
  }
  if (options.products && options.products.length) {
    sections.push(
      C.SectionTitle.render({
        title: options.productsTitle || 'Collector favorites',
        headline: options.productsHeadline || 'Choose your icon'
      }),
      C.ProductGrid.render({ products: options.products })
    );
  }
  sections.push(
    C.Button.render({
      href: shopHref,
      label: options.ctaLabel || 'Shop Now'
    })
  );
  if (options.showReputation !== false && options.products && options.products.length) {
    sections.push(
      C.Review.render({
        quote:
          options.reviewQuote ||
          'The craftsmanship is excellent, and the working headlights make it feel incredibly realistic and collectible.',
        author: options.reviewAuthor || 'SK Moon \u00B7 Verified buyer'
      }),
      C.FeatureIcons.render({
        items: options.trustItems || ['Hand-finished', '4.9 rated', 'Ships worldwide', '30-day guarantee']
      })
    );
  }
  sections.push(standardFooter(storeName, options.reason));
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
  const campaign = 'welcome_v1';
  const firstName =
    options.customerName && String(options.customerName).trim()
      ? String(options.customerName).trim().split(' ')[0]
      : null;
  const shopHref = withUtm(storeUrl + '/collections/all/', campaign);
  const featured = options.featuredProducts || featuredWelcomeProducts(storeUrl, campaign);

  const body = firstName
    ? C.esc(firstName) +
      ' &mdash; hand-finished acrylic with real working headlights and taillights, built so your wall feels like a showroom.'
    : 'Hand-finished acrylic with real working headlights and taillights &mdash; built so your wall feels like a showroom.';

  return C.Shell.render({
    title: 'Welcome to ' + storeName,
    preheader: 'Your ZYBAR member pricing is active — extra 15% savings apply automatically.',
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
        offer: 'MEMBER PRICING',
        label: 'Extra 15% savings',
        code: 'Automatically Applied',
        note: 'No code required.'
      }),
      C.Button.render({
        href: shopHref,
        label: 'Shop with Member Pricing'
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
        items: ['Hand-finished', '4.9 rated', 'Ships worldwide', '30-day guarantee']
      }),
      C.CtaBanner.render({
        headline: 'Your wall is waiting.',
        body: 'Your member pricing is already active.',
        href: shopHref,
        label: 'Shop with Member Pricing'
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
      preheader: 'Your member savings are ready whenever you are.',
      eyebrow: 'Pick up where you left off',
      headline: 'Find your next LED poster',
      body: 'You were browsing the garage. Come back and your member savings apply automatically at checkout.',
      ctaLabel: 'Continue Browsing',
      ctaHref: withUtm(storeUrl + '/collections/all/', 'browsing_nudge'),
      products: featuredBestsellers(storeUrl, 'browsing_nudge'),
      productsTitle: 'Popular right now',
      productsHeadline: 'Start with a bestseller'
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
      ctaHref: withUtm(storeUrl + '/collections/all/', 'brand_story'),
      products: featuredBestsellers(storeUrl, 'brand_story'),
      productsTitle: 'Made for collectors',
      productsHeadline: 'Icons that define the garage',
      reviewQuote:
        'Looks like a real showroom piece on my wall. The lighting quality is unreal for the price.',
      reviewAuthor: 'Verified collector \u00B7 ZYBAR buyer'
    })
  };
}

function renderBestSellerEmail(vars) {
  vars = vars || {};
  const storeUrl = vars.storeUrl || DEFAULT_STORE_URL;
  const storeName = vars.storeName || DEFAULT_STORE_NAME;
  const campaign = 'best_seller';
  const shopHref = withUtm(storeUrl + '/collections/all/', campaign);
  const products = vars.featuredProducts || featuredBestsellers(storeUrl, campaign);

  return {
    subject: vars.subject || 'ZYBAR bestsellers our collectors love',
    html: C.Shell.render({
      title: 'Bestsellers',
      preheader: 'Porsche GT3 RS, Lamborghini SVJ, Ferrari F8 — icons collectors choose first.',
      sections: [
        standardHeader(storeUrl, storeName, campaign),
        C.RichText.render({
          eyebrow: 'Bestsellers',
          headline: 'Icons that sell out fast',
          body: 'Porsche GT3 RS, Lamborghini SVJ, Ferrari F8 &mdash; see why these LED posters dominate the ZYBAR garage.'
        }),
        C.Coupon.render({
          offer: 'MEMBER PRICING',
          label: 'Extra 15% savings',
          code: 'Automatically Applied',
          note: 'Open the store from this email. No code required.'
        }),
        C.SectionTitle.render({
          title: 'Collector favorites',
          headline: 'Shop the icons'
        }),
        C.ProductGrid.render({ products: products }),
        C.Button.render({
          href: shopHref,
          label: 'Shop Bestsellers'
        }),
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
          items: ['Hand-finished', '4.9 rated', 'Ships worldwide', '30-day guarantee']
        }),
        C.CtaBanner.render({
          headline: 'Your wall is waiting.',
          body: 'Member pricing applies automatically when you open the store from this email.',
          href: shopHref,
          label: 'Shop Bestsellers'
        }),
        standardFooter(storeName, 'You are receiving this from the ' + storeName + ' Garage.')
      ]
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
      preheader: 'Extra 15% member savings apply automatically — no code needed.',
      eyebrow: 'Member exclusive',
      headline: 'Your member savings are ready',
      body: 'Open the store from this email and your extra 15% member savings apply automatically at checkout.',
      ctaLabel: 'Shop with Member Pricing',
      ctaHref: withUtm(storeUrl + '/collections/all/', 'discount_offer'),
      products: featuredBestsellers(storeUrl, 'discount_offer'),
      productsTitle: 'Start with an icon',
      productsHeadline: 'Collectors choose these first'
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
      reason: 'You are a ZYBAR customer.',
      products: featuredBestsellers(storeUrl, 'new_collection'),
      productsTitle: 'In the garage now',
      productsHeadline: 'Icons worth the wall space',
      reviewQuote:
        'Received so many compliments already. Feels premium in person — lighting is the real differentiator.',
      reviewAuthor: 'Verified buyer \u00B7 Garage setup'
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
    components: [
      'header',
      'rich_text',
      'coupon',
      'section_title',
      'product_grid',
      'button',
      'review',
      'feature_icons',
      'footer'
    ]
  },
  {
    key: 'best_seller',
    name: 'Best Seller',
    description: 'Highlight top-selling LED posters with product photos and social proof.',
    journeys: ['welcome_journey'],
    components: [
      'header',
      'rich_text',
      'coupon',
      'section_title',
      'product_grid',
      'button',
      'text_link',
      'review',
      'feature_icons',
      'cta_banner',
      'footer'
    ]
  },
  {
    key: 'discount_offer',
    name: 'Discount Offer',
    description: 'Remind leads / cart abandoners of their member savings with featured products.',
    journeys: ['welcome_journey', 'cart_journey'],
    components: [
      'header',
      'rich_text',
      'coupon',
      'section_title',
      'product_grid',
      'button',
      'review',
      'feature_icons',
      'footer'
    ]
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
    components: [
      'header',
      'rich_text',
      'coupon',
      'section_title',
      'product_grid',
      'button',
      'review',
      'feature_icons',
      'footer'
    ]
  },
  {
    key: 'browsing_nudge',
    name: 'Browsing Nudge',
    description: 'Bring product browsers back with their member savings.',
    journeys: [],
    components: [
      'header',
      'rich_text',
      'coupon',
      'section_title',
      'product_grid',
      'button',
      'review',
      'feature_icons',
      'footer'
    ]
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
