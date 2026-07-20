/**
 * Centralized email templates for transactional and automated emails.
 * All email HTML should be rendered here so workflows only select a template.
 */
const DEFAULT_STORE_NAME = 'ZYBAR';
const DEFAULT_STORE_URL = 'https://www.zybar.shop';
const DEFAULT_DISCOUNT_CODE = 'ZYBAR15';

function buildWelcomeEmailHtml(options) {
  options = options || {};
  const storeUrl = options.storeUrl || DEFAULT_STORE_URL;
  const storeName = options.storeName || DEFAULT_STORE_NAME;
  const code = options.discountCode || DEFAULT_DISCOUNT_CODE;
  const featured = options.featuredProducts || [
    { name: 'Porsche GT3 RS', href: storeUrl + '/products/porsche-gt3-rs/' },
    { name: 'Lamborghini SVJ', href: storeUrl + '/products/lambrghini-svj-tailights/' },
    { name: 'Ferrari F8', href: storeUrl + '/products/ferrari-f8/' }
  ];

  const featuredHtml = featured
    .map(function (item) {
      return (
        '<tr><td style="padding:8px 0;font-family:Georgia,serif;font-size:15px;color:#111;">' +
        '<a href="' +
        item.href +
        '" style="color:#111;text-decoration:none;border-bottom:1px solid #ccc;">' +
        item.name +
        '</a></td></tr>'
      );
    })
    .join('');

  return (
    '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0b0b0b;">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0b0b0b;padding:32px 12px;">' +
    '<tr><td align="center">' +
    '<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;background:#171717;border:1px solid rgba(255,255,255,0.08);border-radius:18px;overflow:hidden;">' +
    '<tr><td style="padding:36px 32px 12px;text-align:center;">' +
    '<div style="font-family:Georgia,\'Times New Roman\',serif;font-size:13px;letter-spacing:0.28em;color:rgba(255,255,255,0.55);">WELCOME TO</div>' +
    '<div style="font-family:Georgia,\'Times New Roman\',serif;font-size:28px;line-height:1.2;color:#fff;margin-top:8px;">THE ' +
    storeName.toUpperCase() +
    ' GARAGE</div>' +
    '</td></tr>' +
    '<tr><td style="padding:8px 32px 24px;text-align:center;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:rgba(255,255,255,0.72);">' +
    'Your 15% first-order discount is ready.' +
    '</td></tr>' +
    '<tr><td align="center" style="padding:0 32px 28px;">' +
    '<div style="display:inline-block;padding:16px 28px;border:1px solid rgba(255,255,255,0.18);border-radius:12px;background:#111;">' +
    '<div style="font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.18em;color:rgba(255,255,255,0.5);text-transform:uppercase;">Discount Code</div>' +
    '<div style="font-family:Georgia,serif;font-size:28px;letter-spacing:0.12em;color:#fff;margin-top:6px;">' +
    code +
    '</div></div></td></tr>' +
    '<tr><td align="center" style="padding:0 32px 32px;">' +
    '<a href="' +
    storeUrl +
    '/collections/all/" style="display:inline-block;background:#fff;color:#111;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;letter-spacing:0.04em;padding:16px 28px;border-radius:999px;">Shop the Collection</a>' +
    '</td></tr>' +
    '<tr><td style="padding:0 32px 8px;font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:rgba(255,255,255,0.4);">Featured</td></tr>' +
    '<tr><td style="padding:0 32px 24px;background:#171717;"><table width="100%">' +
    featuredHtml.replace(/color:#111;/g, 'color:#fff;').replace(/border-bottom:1px solid #ccc;/g, 'border-bottom:1px solid rgba(255,255,255,0.2);') +
    '</table></td></tr>' +
    '<tr><td style="padding:0 32px 36px;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:rgba(255,255,255,0.55);">' +
    '<strong style="color:rgba(255,255,255,0.8);">Shipping</strong><br/>' +
    'Standard: 14–18 business days · Priority: 7–14 business days<br/>' +
    'Worldwide delivery. Apply your code at checkout.' +
    '</td></tr>' +
    '</table></td></tr></table></body></html>'
  );
}

function renderWelcomeEmail(vars) {
  vars = vars || {};
  return {
    subject: vars.subject || 'Welcome to ZYBAR Garage',
    html: buildWelcomeEmailHtml({
      storeName: vars.storeName || DEFAULT_STORE_NAME,
      storeUrl: vars.storeUrl || DEFAULT_STORE_URL,
      discountCode: vars.discountCode || DEFAULT_DISCOUNT_CODE,
      featuredProducts: vars.featuredProducts || null
    })
  };
}

function buildSimpleCampaignHtml(options) {
  options = options || {};
  const storeUrl = options.storeUrl || DEFAULT_STORE_URL;
  const storeName = options.storeName || DEFAULT_STORE_NAME;
  const code = options.discountCode || DEFAULT_DISCOUNT_CODE;
  const eyebrow = options.eyebrow || 'ZYBAR';
  const headline = options.headline || storeName;
  const body = options.body || '';
  const ctaLabel = options.ctaLabel || 'Shop Now';
  const ctaHref = options.ctaHref || storeUrl + '/collections/all/';

  return (
    '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0b0b0b;">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0b0b0b;padding:32px 12px;">' +
    '<tr><td align="center">' +
    '<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;background:#171717;border:1px solid rgba(255,255,255,0.08);border-radius:18px;overflow:hidden;">' +
    '<tr><td style="padding:36px 32px 12px;text-align:center;">' +
    '<div style="font-family:Georgia,\'Times New Roman\',serif;font-size:13px;letter-spacing:0.28em;color:rgba(255,255,255,0.55);">' +
    eyebrow +
    '</div>' +
    '<div style="font-family:Georgia,\'Times New Roman\',serif;font-size:26px;line-height:1.25;color:#fff;margin-top:8px;">' +
    headline +
    '</div></td></tr>' +
    '<tr><td style="padding:8px 32px 24px;text-align:center;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:rgba(255,255,255,0.72);">' +
    body +
    '</td></tr>' +
    '<tr><td align="center" style="padding:0 32px 20px;">' +
    '<div style="display:inline-block;padding:14px 24px;border:1px solid rgba(255,255,255,0.18);border-radius:12px;background:#111;">' +
    '<div style="font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.18em;color:rgba(255,255,255,0.5);text-transform:uppercase;">Discount Code</div>' +
    '<div style="font-family:Georgia,serif;font-size:24px;letter-spacing:0.12em;color:#fff;margin-top:6px;">' +
    code +
    '</div></div></td></tr>' +
    '<tr><td align="center" style="padding:0 32px 36px;">' +
    '<a href="' +
    ctaHref +
    '" style="display:inline-block;background:#fff;color:#111;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;letter-spacing:0.04em;padding:16px 28px;border-radius:999px;">' +
    ctaLabel +
    '</a></td></tr>' +
    '</table></td></tr></table></body></html>'
  );
}

function renderCartReminderEmail(vars) {
  vars = vars || {};
  const storeUrl = vars.storeUrl || DEFAULT_STORE_URL;
  return {
    subject: vars.subject || 'Your cart is waiting at ZYBAR',
    html: buildSimpleCampaignHtml({
      storeName: vars.storeName,
      storeUrl: storeUrl,
      discountCode: vars.discountCode,
      eyebrow: 'STILL IN YOUR CART',
      headline: 'Finish your LED piece',
      body: 'Your selected LED poster is still waiting. Complete checkout and use your code for 15% off.',
      ctaLabel: 'Return to Cart',
      ctaHref: storeUrl + '/cart/'
    })
  };
}

function renderBrowsingNudgeEmail(vars) {
  vars = vars || {};
  const storeUrl = vars.storeUrl || DEFAULT_STORE_URL;
  return {
    subject: vars.subject || 'Still browsing? Your ZYBAR discount is ready',
    html: buildSimpleCampaignHtml({
      storeName: vars.storeName,
      storeUrl: storeUrl,
      discountCode: vars.discountCode,
      eyebrow: 'PICK UP WHERE YOU LEFT OFF',
      headline: 'Find your next LED poster',
      body: 'You were browsing the garage. Come back and apply your first-order discount before it expires.',
      ctaLabel: 'Continue Browsing',
      ctaHref: storeUrl + '/collections/all/'
    })
  };
}

function renderBrandStoryEmail(vars) {
  vars = vars || {};
  const storeUrl = vars.storeUrl || DEFAULT_STORE_URL;
  return {
    subject: vars.subject || 'The story behind ZYBAR LED art',
    html: buildSimpleCampaignHtml({
      storeName: vars.storeName,
      storeUrl: storeUrl,
      discountCode: vars.discountCode,
      eyebrow: 'BRAND STORY',
      headline: 'Built for car culture',
      body: 'Every ZYBAR piece is crafted for collectors who live the garage life — precision LED posters that turn walls into showrooms.',
      ctaLabel: 'Explore the Garage',
      ctaHref: storeUrl + '/collections/all/'
    })
  };
}

function renderBestSellerEmail(vars) {
  vars = vars || {};
  const storeUrl = vars.storeUrl || DEFAULT_STORE_URL;
  return {
    subject: vars.subject || 'ZYBAR bestsellers our collectors love',
    html: buildSimpleCampaignHtml({
      storeName: vars.storeName,
      storeUrl: storeUrl,
      discountCode: vars.discountCode,
      eyebrow: 'BEST SELLERS',
      headline: 'Icons that sell out fast',
      body: 'Porsche GT3 RS, Lamborghini SVJ, Ferrari F8 — see why these LED posters dominate the ZYBAR garage.',
      ctaLabel: 'Shop Bestsellers',
      ctaHref: storeUrl + '/collections/all/'
    })
  };
}

function renderDiscountOfferEmail(vars) {
  vars = vars || {};
  const storeUrl = vars.storeUrl || DEFAULT_STORE_URL;
  return {
    subject: vars.subject || 'Your ZYBAR discount is waiting',
    html: buildSimpleCampaignHtml({
      storeName: vars.storeName,
      storeUrl: storeUrl,
      discountCode: vars.discountCode,
      eyebrow: 'EXCLUSIVE OFFER',
      headline: '15% off your next piece',
      body: 'Use your member code at checkout and lock in your LED poster before the offer ends.',
      ctaLabel: 'Redeem Discount',
      ctaHref: storeUrl + '/collections/all/'
    })
  };
}

function renderNeedHelpEmail(vars) {
  vars = vars || {};
  const storeUrl = vars.storeUrl || DEFAULT_STORE_URL;
  return {
    subject: vars.subject || 'Need help finishing your ZYBAR order?',
    html: buildSimpleCampaignHtml({
      storeName: vars.storeName,
      storeUrl: storeUrl,
      discountCode: vars.discountCode,
      eyebrow: 'WE ARE HERE',
      headline: 'Stuck at checkout?',
      body: 'Sizing, shipping, or payment questions — reply to this email and we will help you finish your order.',
      ctaLabel: 'Return to Cart',
      ctaHref: storeUrl + '/cart/'
    })
  };
}

function renderThankYouEmail(vars) {
  vars = vars || {};
  const storeUrl = vars.storeUrl || DEFAULT_STORE_URL;
  const name = vars.customerName ? String(vars.customerName).split(' ')[0] : null;
  return {
    subject: vars.subject || 'Thank you for your ZYBAR order',
    html: buildSimpleCampaignHtml({
      storeName: vars.storeName,
      storeUrl: storeUrl,
      discountCode: vars.discountCode,
      eyebrow: 'ORDER CONFIRMED',
      headline: name ? 'Thank you, ' + name : 'Thank you for your order',
      body: 'Your LED piece is being prepared. We will keep you posted on shipping — welcome to the ZYBAR garage.',
      ctaLabel: 'View Collections',
      ctaHref: storeUrl + '/collections/all/'
    })
  };
}

function renderReviewRequestEmail(vars) {
  vars = vars || {};
  const storeUrl = vars.storeUrl || DEFAULT_STORE_URL;
  return {
    subject: vars.subject || 'How is your ZYBAR LED piece?',
    html: buildSimpleCampaignHtml({
      storeName: vars.storeName,
      storeUrl: storeUrl,
      discountCode: vars.discountCode,
      eyebrow: 'SHARE YOUR SETUP',
      headline: 'Leave a quick review',
      body: 'Your feedback helps other collectors choose the right LED poster. Tell us how it looks on your wall.',
      ctaLabel: 'Leave a Review',
      ctaHref: storeUrl + '/#reviews'
    })
  };
}

function renderNewCollectionEmail(vars) {
  vars = vars || {};
  const storeUrl = vars.storeUrl || DEFAULT_STORE_URL;
  return {
    subject: vars.subject || 'New arrivals in the ZYBAR garage',
    html: buildSimpleCampaignHtml({
      storeName: vars.storeName,
      storeUrl: storeUrl,
      discountCode: vars.discountCode,
      eyebrow: 'NEW COLLECTION',
      headline: 'Fresh LED icons just dropped',
      body: 'As a ZYBAR customer, you get first look at the latest designs. Explore the new collection before they sell out.',
      ctaLabel: 'Shop New Arrivals',
      ctaHref: storeUrl + '/collections/all/'
    })
  };
}

const TEMPLATE_CATALOG = [
  {
    key: 'welcome_email',
    name: 'Welcome Email',
    description: 'Luxury welcome email with discount code and featured products.',
    journeys: ['welcome_journey']
  },
  {
    key: 'brand_story',
    name: 'Brand Story',
    description: 'Introduce ZYBAR brand and car culture positioning.',
    journeys: ['welcome_journey']
  },
  {
    key: 'best_seller',
    name: 'Best Seller',
    description: 'Highlight top-selling LED posters.',
    journeys: ['welcome_journey']
  },
  {
    key: 'discount_offer',
    name: 'Discount Offer',
    description: 'Remind leads / cart abandoners of their discount code.',
    journeys: ['welcome_journey', 'cart_journey']
  },
  {
    key: 'cart_reminder',
    name: 'Cart Reminder',
    description: 'Nudge leads who still have items in cart to complete checkout.',
    journeys: ['cart_journey']
  },
  {
    key: 'need_help',
    name: 'Need Help',
    description: 'Offer support to shoppers stuck at checkout.',
    journeys: ['cart_journey']
  },
  {
    key: 'thank_you',
    name: 'Thank You',
    description: 'Immediate post-purchase thank you.',
    journeys: ['customer_journey']
  },
  {
    key: 'review_request',
    name: 'Review Request',
    description: 'Ask customers for a review after delivery window.',
    journeys: ['customer_journey']
  },
  {
    key: 'new_collection',
    name: 'New Collection',
    description: 'Re-engage past customers with new arrivals.',
    journeys: ['customer_journey']
  },
  {
    key: 'browsing_nudge',
    name: 'Browsing Nudge',
    description: 'Bring product browsers back with their discount code.',
    journeys: []
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
  listTemplates,
  getTemplateDefinition,
  renderTemplate
};
