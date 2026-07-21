/**
 * ZYBAR Email Component Library
 *
 * Every marketing email is an assembly of these components inside Shell.
 * Do NOT hand-write large HTML blocks in templates — compose components.
 *
 * Usage:
 *   const { Shell, Header, Hero, RichText, Coupon, Button, Footer } = require('./email-components');
 *   Shell.render({ title, preheader, sections: [ Header.render({...}), ... ] });
 *
 * Catalog:
 *   listComponents() → metadata for each component (name, purpose, inputs, optional, reusability)
 */

const BRAND = {
  bg: '#0b0b0c',
  card: '#121214',
  cardSoft: '#1a1a1e',
  line: '#2a2a30',
  text: '#f3f3f4',
  muted: '#a6a8b1',
  faint: '#74767f',
  accent: '#f59e0b',
  white: '#ffffff',
  ink: '#111111',
  width: 600,
  gutter: 36,
  fontDisplay: "Georgia, 'Times New Roman', serif",
  fontBody: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  btnRadius: 8
};

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function defineComponent(meta, renderFn) {
  return {
    id: meta.id,
    name: meta.name,
    purpose: meta.purpose,
    inputs: meta.inputs || [],
    optional: meta.optional || [],
    reusability: meta.reusability,
    render: renderFn
  };
}

/* -------------------------------------------------------------------------- */
/* Shell — document wrapper (not a visual section, but required for assembly) */
/* -------------------------------------------------------------------------- */

const Shell = defineComponent(
  {
    id: 'shell',
    name: 'Shell',
    purpose:
      'Wraps all section rows into a complete HTML email document with mobile media queries, dark color-scheme meta, and a hidden preheader.',
    inputs: [
      { name: 'sections', type: 'string[]', description: 'Ordered array of rendered section HTML (table rows).' }
    ],
    optional: [
      { name: 'title', type: 'string', default: 'ZYBAR', description: 'Document <title>.' },
      { name: 'preheader', type: 'string', default: '', description: 'Inbox preview text (hidden in body).' }
    ],
    reusability: 'Required for every email. Never skip — all templates call Shell.render().'
  },
  function renderShell(options) {
    options = options || {};
    const title = esc(options.title || 'ZYBAR');
    const preheader = esc(options.preheader || '');
    const body = (options.sections || []).join('');

    return (
      '<!DOCTYPE html>' +
      '<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">' +
      '<head>' +
      '<meta charset="utf-8" />' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0" />' +
      '<meta http-equiv="X-UA-Compatible" content="IE=edge" />' +
      '<meta name="color-scheme" content="dark" />' +
      '<meta name="supported-color-schemes" content="dark" />' +
      '<title>' +
      title +
      '</title>' +
      '<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->' +
      '<style>' +
      'html,body{margin:0!important;padding:0!important;height:100%!important;width:100%!important;}' +
      'table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;}' +
      'img{-ms-interpolation-mode:bicubic;border:0;outline:none;text-decoration:none;display:block;}' +
      'a{text-decoration:none;}' +
      'a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important;}' +
      '@media only screen and (max-width:620px){' +
      '.container{width:100%!important;max-width:100%!important;}' +
      '.px{padding-left:20px!important;padding-right:20px!important;}' +
      '.h1{font-size:28px!important;line-height:1.22!important;}' +
      '.h2{font-size:22px!important;}' +
      '.hero-img{height:auto!important;}' +
      '.stack{display:block!important;width:100%!important;max-width:100%!important;}' +
      '.stack-pad{padding-bottom:24px!important;}' +
      '.grid-img{width:100%!important;max-width:100%!important;height:auto!important;}' +
      '.btn a{display:block!important;width:100%!important;max-width:100%!important;}' +
      '.code-lg{font-size:28px!important;letter-spacing:0.1em!important;}' +
      '.trust-item{display:block!important;padding:6px 0!important;}' +
      '.trust-sep{display:none!important;}' +
      '}' +
      '</style>' +
      '</head>' +
      '<body style="margin:0;padding:0;background:' +
      BRAND.bg +
      ';" bgcolor="' +
      BRAND.bg +
      '">' +
      '<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">' +
      preheader +
      '&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;' +
      '</div>' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' +
      BRAND.bg +
      '" style="background:' +
      BRAND.bg +
      ';">' +
      '<tr><td align="center" style="padding:0;">' +
      '<table role="presentation" width="' +
      BRAND.width +
      '" cellpadding="0" cellspacing="0" border="0" class="container" bgcolor="' +
      BRAND.card +
      '" style="width:' +
      BRAND.width +
      'px;max-width:' +
      BRAND.width +
      'px;background:' +
      BRAND.card +
      ';">' +
      body +
      '</table>' +
      '</td></tr>' +
      '</table>' +
      '</body></html>'
    );
  }
);

/* -------------------------------------------------------------------------- */
/* Visual sections                                                            */
/* -------------------------------------------------------------------------- */

const Header = defineComponent(
  {
    id: 'header',
    name: 'Header',
    purpose: 'Brand recognition at the top of every email. Logo links home.',
    inputs: [
      { name: 'href', type: 'url', description: 'Logo destination (usually store home).' },
      { name: 'logoUrl', type: 'url', description: 'Absolute URL to the logo image.' }
    ],
    optional: [
      { name: 'alt', type: 'string', default: 'ZYBAR', description: 'Logo alt text.' },
      { name: 'width', type: 'number', default: 132, description: 'Logo display width in px.' }
    ],
    reusability:
      'Every template (Welcome, Cart, Customer, Win Back, Newsletter, Launch, Order Confirmation). Always first section.'
  },
  function renderHeader(options) {
    options = options || {};
    const href = esc(options.href);
    const logoUrl = esc(options.logoUrl);
    const alt = esc(options.alt || 'ZYBAR');
    const width = options.width || 132;
    return (
      '<tr><td align="center" class="px" style="padding:28px ' +
      BRAND.gutter +
      'px 20px;">' +
      '<a href="' +
      href +
      '" target="_blank">' +
      '<img src="' +
      logoUrl +
      '" width="' +
      width +
      '" alt="' +
      alt +
      '" style="display:block;width:' +
      width +
      'px;max-width:50%;height:auto;" />' +
      '</a>' +
      '</td></tr>'
    );
  }
);

const Hero = defineComponent(
  {
    id: 'hero',
    name: 'Hero',
    purpose: 'Full-bleed lifestyle or product image that sets mood and sells visually.',
    inputs: [
      { name: 'href', type: 'url', description: 'Click target for the image.' },
      { name: 'imageUrl', type: 'url', description: 'Absolute URL to the hero image.' }
    ],
    optional: [
      { name: 'alt', type: 'string', default: '', description: 'Image alt text (critical when images are blocked).' },
      { name: 'height', type: 'number', default: 400, description: 'Hint height for layout; CSS keeps aspect ratio.' }
    ],
    reusability:
      'Welcome, Cart Recovery (cart item), Win Back, Newsletter, Product Launch. Skip for short transactional emails (Order Confirmation, Review Request) when text-first feels more personal.'
  },
  function renderHero(options) {
    options = options || {};
    const href = esc(options.href);
    const imageUrl = esc(options.imageUrl);
    const alt = esc(options.alt || '');
    const height = options.height || 400;
    return (
      '<tr><td style="padding:0;">' +
      '<a href="' +
      href +
      '" target="_blank">' +
      '<img src="' +
      imageUrl +
      '" width="' +
      BRAND.width +
      '" height="' +
      height +
      '" alt="' +
      alt +
      '" class="hero-img" style="display:block;width:100%;height:auto;background:' +
      BRAND.cardSoft +
      ';" />' +
      '</a>' +
      '</td></tr>'
    );
  }
);

const RichText = defineComponent(
  {
    id: 'rich_text',
    name: 'Rich Text',
    purpose:
      'Centered copy block with optional eyebrow, display headline, subhead, and body. Drives the message of the email.',
    inputs: [],
    optional: [
      { name: 'eyebrow', type: 'string', description: 'Small uppercase label above the headline.' },
      { name: 'headline', type: 'string', description: 'Primary serif headline (keep short for mobile).' },
      { name: 'subhead', type: 'string', description: 'Secondary line under the headline.' },
      {
        name: 'body',
        type: 'html-string',
        description: 'Supporting paragraph. May include trusted HTML entities (&mdash;). Escape user input before passing.'
      }
    ],
    reusability:
      'Every template. Welcome greeting, cart nudge copy, thank-you message, launch announcement, win-back lede.'
  },
  function renderRichText(options) {
    options = options || {};
    const eyebrow = options.eyebrow
      ? '<div style="font-family:' +
        BRAND.fontBody +
        ';font-size:11px;letter-spacing:0.28em;text-transform:uppercase;color:' +
        BRAND.faint +
        ';padding-bottom:14px;">' +
        esc(options.eyebrow) +
        '</div>'
      : '';
    const headline = options.headline
      ? '<div class="h1" style="font-family:' +
        BRAND.fontDisplay +
        ';font-size:32px;line-height:1.2;color:' +
        BRAND.text +
        ';padding-bottom:12px;">' +
        esc(options.headline) +
        '</div>'
      : '';
    const subhead = options.subhead
      ? '<div style="font-family:' +
        BRAND.fontDisplay +
        ';font-size:16px;line-height:1.45;color:' +
        BRAND.text +
        ';padding-bottom:14px;">' +
        esc(options.subhead) +
        '</div>'
      : '';
    const body = options.body
      ? '<div style="font-family:' +
        BRAND.fontBody +
        ';font-size:15px;line-height:1.65;color:' +
        BRAND.muted +
        ';max-width:460px;margin:0 auto;">' +
        options.body +
        '</div>'
      : '';
    return (
      '<tr><td align="center" class="px" style="padding:40px ' +
      BRAND.gutter +
      'px 4px;text-align:center;">' +
      eyebrow +
      headline +
      subhead +
      body +
      '</td></tr>'
    );
  }
);

const Coupon = defineComponent(
  {
    id: 'coupon',
    name: 'Coupon',
    purpose: 'Isolated offer panel. Makes the discount code scannable and memorable.',
    inputs: [{ name: 'code', type: 'string', description: 'Discount / promo code (e.g. ZYBAR15).' }],
    optional: [
      { name: 'offer', type: 'string', default: '15% OFF', description: 'Accent offer line above the code.' },
      { name: 'label', type: 'string', default: 'Your code', description: 'Small label above the code.' },
      { name: 'note', type: 'string', description: 'Instruction under the code (e.g. Enter at checkout).' }
    ],
    reusability:
      'Welcome, Cart Recovery, Win Back, Newsletter member perk, Product Launch early-bird. Omit for Order Confirmation / Review Request.'
  },
  function renderCoupon(options) {
    options = options || {};
    const offer = esc(options.offer || '15% OFF');
    const label = esc(options.label || 'Your code');
    const code = esc(options.code);
    const note = options.note
      ? '<div style="font-family:' +
        BRAND.fontBody +
        ';font-size:13px;line-height:1.55;color:' +
        BRAND.muted +
        ';padding-top:14px;">' +
        esc(options.note) +
        '</div>'
      : '';
    return (
      '<tr><td align="center" class="px" style="padding:28px ' +
      BRAND.gutter +
      'px 4px;">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' +
      BRAND.cardSoft +
      '" style="background:' +
      BRAND.cardSoft +
      ';border:1px solid ' +
      BRAND.line +
      ';">' +
      '<tr><td align="center" style="padding:28px 24px;">' +
      '<div style="font-family:' +
      BRAND.fontBody +
      ';font-size:12px;letter-spacing:0.22em;text-transform:uppercase;color:' +
      BRAND.accent +
      ';padding-bottom:8px;">' +
      offer +
      '</div>' +
      '<div style="font-family:' +
      BRAND.fontBody +
      ';font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:' +
      BRAND.faint +
      ';padding-bottom:10px;">' +
      label +
      '</div>' +
      '<div class="code-lg" style="font-family:' +
      BRAND.fontDisplay +
      ';font-size:32px;letter-spacing:0.14em;color:' +
      BRAND.text +
      ';">' +
      code +
      '</div>' +
      note +
      '</td></tr>' +
      '</table>' +
      '</td></tr>'
    );
  }
);

const Button = defineComponent(
  {
    id: 'button',
    name: 'CTA Button',
    purpose: 'Primary call-to-action. Bulletproof VML button for Outlook.',
    inputs: [
      { name: 'href', type: 'url', description: 'Button destination.' },
      { name: 'label', type: 'string', description: 'Button text — prefer benefit-led labels.' }
    ],
    optional: [
      { name: 'width', type: 'number', default: 280, description: 'Button width in px (full-width on mobile).' },
      { name: 'paddingTop', type: 'number', default: 24, description: 'Top padding of the section.' },
      { name: 'paddingBottom', type: 'number', default: 36, description: 'Bottom padding of the section.' }
    ],
    reusability:
      'Every template that needs an action. Use the same label for primary + closing CTA within one email.'
  },
  function renderButton(options) {
    options = options || {};
    const href = esc(options.href);
    const label = esc(options.label);
    const paddingTop = options.paddingTop != null ? options.paddingTop : 24;
    const paddingBottom = options.paddingBottom != null ? options.paddingBottom : 36;
    const width = options.width || 280;
    return (
      '<tr><td align="center" class="px btn" style="padding:' +
      paddingTop +
      'px ' +
      BRAND.gutter +
      'px ' +
      paddingBottom +
      'px;">' +
      '<!--[if mso]>' +
      '<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="' +
      href +
      '" style="height:52px;v-text-anchor:middle;width:' +
      width +
      'px;" arcsize="16%" fillcolor="' +
      BRAND.white +
      '" stroke="f">' +
      '<w:anchorlock/>' +
      '<center style="color:' +
      BRAND.ink +
      ';font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:bold;">' +
      label +
      '</center>' +
      '</v:roundrect>' +
      '<![endif]-->' +
      '<!--[if !mso]><!-->' +
      '<a href="' +
      href +
      '" target="_blank" style="display:inline-block;background:' +
      BRAND.white +
      ';color:' +
      BRAND.ink +
      ';font-family:' +
      BRAND.fontBody +
      ';font-size:15px;font-weight:700;letter-spacing:0.02em;line-height:52px;text-align:center;text-decoration:none;width:' +
      width +
      'px;max-width:100%;border-radius:' +
      BRAND.btnRadius +
      'px;">' +
      label +
      '</a>' +
      '<!--<![endif]-->' +
      '</td></tr>'
    );
  }
);

const SectionTitle = defineComponent(
  {
    id: 'section_title',
    name: 'Section Title',
    purpose: 'Introduces a content block (products, features) with a small label and optional headline.',
    inputs: [{ name: 'title', type: 'string', description: 'Uppercase label (e.g. Start here).' }],
    optional: [{ name: 'headline', type: 'string', description: 'Serif headline under the label.' }],
    reusability: 'Above Product Grid, feature lists, or any mid-email content block.'
  },
  function renderSectionTitle(options) {
    options = options || {};
    return (
      '<tr><td align="center" class="px" style="padding:36px ' +
      BRAND.gutter +
      'px 20px;">' +
      '<div style="font-family:' +
      BRAND.fontBody +
      ';font-size:11px;letter-spacing:0.28em;text-transform:uppercase;color:' +
      BRAND.faint +
      ';">' +
      esc(options.title) +
      '</div>' +
      (options.headline
        ? '<div class="h2" style="font-family:' +
          BRAND.fontDisplay +
          ';font-size:24px;line-height:1.3;color:' +
          BRAND.text +
          ';padding-top:10px;">' +
          esc(options.headline) +
          '</div>'
        : '') +
      '</td></tr>'
    );
  }
);

const ProductGrid = defineComponent(
  {
    id: 'product_grid',
    name: 'Product Grid',
    purpose: 'Shows up to 3 products in a hybrid column grid that stacks on mobile.',
    inputs: [
      {
        name: 'products',
        type: 'array',
        description:
          'Array of { name, href, imageUrl, meta?, price? }. Max 3. Each product is fully clickable.'
      }
    ],
    optional: [],
    reusability:
      'Welcome favorites, Cart abandoned items, Win Back / Newsletter curated picks, Product Launch lineup, Order Confirmation line items.'
  },
  function renderProductGrid(options) {
    options = options || {};
    const products = (options.products || []).slice(0, 3);
    const colWidth = 168;
    const cols = products
      .map(function (p, i) {
        const last = i === products.length - 1;
        return (
          '<!--[if mso]><td width="' +
          (colWidth + (last ? 0 : 12)) +
          '" valign="top" style="padding-right:' +
          (last ? 0 : 12) +
          'px;"><![endif]-->' +
          '<div class="stack stack-pad" style="display:inline-block;width:' +
          colWidth +
          'px;max-width:100%;vertical-align:top;padding:0 4px 4px;">' +
          '<a href="' +
          esc(p.href) +
          '" target="_blank">' +
          '<img src="' +
          esc(p.imageUrl) +
          '" width="' +
          colWidth +
          '" alt="' +
          esc(p.name) +
          '" class="grid-img" style="display:block;width:100%;height:auto;background:' +
          BRAND.cardSoft +
          ';" />' +
          '<div style="font-family:' +
          BRAND.fontBody +
          ';font-size:14px;font-weight:600;color:' +
          BRAND.text +
          ';padding:12px 0 2px;text-align:center;">' +
          esc(p.name) +
          '</div>' +
          (p.meta
            ? '<div style="font-family:' +
              BRAND.fontBody +
              ';font-size:12px;color:' +
              BRAND.faint +
              ';text-align:center;padding-bottom:2px;">' +
              esc(p.meta) +
              '</div>'
            : '') +
          (p.price
            ? '<div style="font-family:' +
              BRAND.fontBody +
              ';font-size:13px;color:' +
              BRAND.muted +
              ';text-align:center;">' +
              esc(p.price) +
              '</div>'
            : '') +
          '<div style="font-family:' +
          BRAND.fontBody +
          ';font-size:12px;letter-spacing:0.04em;color:' +
          BRAND.text +
          ';text-align:center;padding-top:10px;">View &rarr;</div>' +
          '</a>' +
          '</div>' +
          '<!--[if mso]></td><![endif]-->'
        );
      })
      .join('');
    return (
      '<tr><td align="center" class="px" style="padding:0 28px 8px;text-align:center;font-size:0;">' +
      '<!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><![endif]-->' +
      cols +
      '<!--[if mso]></tr></table><![endif]-->' +
      '</td></tr>'
    );
  }
);

const TextLink = defineComponent(
  {
    id: 'text_link',
    name: 'Text Link',
    purpose: 'Quiet secondary path that does not compete with the primary CTA button.',
    inputs: [
      { name: 'href', type: 'url', description: 'Link destination.' },
      { name: 'label', type: 'string', description: 'Link text (e.g. Browse the full collection →).' }
    ],
    optional: [],
    reusability: 'Under Product Grid, after body copy, or as a soft alternate CTA.'
  },
  function renderTextLink(options) {
    options = options || {};
    return (
      '<tr><td align="center" class="px" style="padding:8px ' +
      BRAND.gutter +
      'px 28px;">' +
      '<a href="' +
      esc(options.href) +
      '" target="_blank" style="font-family:' +
      BRAND.fontBody +
      ';font-size:13px;letter-spacing:0.04em;color:' +
      BRAND.muted +
      ';text-decoration:none;border-bottom:1px solid ' +
      BRAND.line +
      ';">' +
      esc(options.label) +
      '</a>' +
      '</td></tr>'
    );
  }
);

const FeatureIcons = defineComponent(
  {
    id: 'feature_icons',
    name: 'Feature Icons / Trust Bar',
    purpose:
      'Compact trust strip of 2–4 short value props. Text-only (no Unicode glyphs) for client-safe rendering.',
    inputs: [
      {
        name: 'items',
        type: 'string[]',
        description: 'Short labels, e.g. ["Hand-finished", "Remote lighting", "Ships worldwide"]. Max 4.'
      }
    ],
    optional: [],
    reusability:
      'Welcome, Cart (shipping reassurance), Product Launch (specs), Customer (care tips). Alias of legacy Feature Icons.'
  },
  function renderFeatureIcons(options) {
    options = options || {};
    const items = (options.items || []).slice(0, 4);
    const row = items
      .map(function (item, i) {
        const sep =
          i < items.length - 1
            ? '<span class="trust-sep" style="color:' +
              BRAND.line +
              ';padding:0 10px;">&middot;</span>'
            : '';
        return (
          '<span class="trust-item" style="font-family:' +
          BRAND.fontBody +
          ';font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:' +
          BRAND.muted +
          ';">' +
          esc(item) +
          '</span>' +
          sep
        );
      })
      .join('');
    return (
      '<tr><td align="center" class="px" style="padding:28px ' +
      BRAND.gutter +
      'px;border-top:1px solid ' +
      BRAND.line +
      ';">' +
      row +
      '</td></tr>'
    );
  }
);

const Review = defineComponent(
  {
    id: 'review',
    name: 'Review',
    purpose: 'Single social-proof quote with stars and attribution.',
    inputs: [
      { name: 'quote', type: 'string', description: 'Short customer quote (1–2 sentences).' },
      { name: 'author', type: 'string', description: 'Attribution, e.g. "SK Moon · Verified buyer".' }
    ],
    optional: [],
    reusability:
      'Welcome, Cart (reduce doubt), Win Back, Newsletter community quote, Product Launch early feedback. One quote only — never a wall of testimonials.'
  },
  function renderReview(options) {
    options = options || {};
    const stars = '&#9733;&#9733;&#9733;&#9733;&#9733;';
    return (
      '<tr><td align="center" class="px" style="padding:36px ' +
      BRAND.gutter +
      'px 28px;border-top:1px solid ' +
      BRAND.line +
      ';">' +
      '<div style="font-family:' +
      BRAND.fontBody +
      ';font-size:13px;letter-spacing:0.18em;color:' +
      BRAND.muted +
      ';padding-bottom:14px;">' +
      stars +
      '</div>' +
      '<div style="font-family:' +
      BRAND.fontDisplay +
      ';font-size:18px;line-height:1.5;color:' +
      BRAND.text +
      ';font-style:italic;max-width:440px;margin:0 auto;">&ldquo;' +
      esc(options.quote) +
      '&rdquo;</div>' +
      '<div style="font-family:' +
      BRAND.fontBody +
      ';font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:' +
      BRAND.faint +
      ';padding-top:14px;">' +
      esc(options.author) +
      '</div>' +
      '</td></tr>'
    );
  }
);

const CtaBanner = defineComponent(
  {
    id: 'cta_banner',
    name: 'CTA Banner',
    purpose:
      'Closing conversion band. Restates the offer once with the same CTA label as the primary button.',
    inputs: [
      { name: 'headline', type: 'string', description: 'Closing headline.' },
      { name: 'href', type: 'url', description: 'Button destination.' },
      { name: 'label', type: 'string', description: 'Button label — match the primary CTA.' }
    ],
    optional: [{ name: 'body', type: 'string', description: 'Short supporting line under the headline.' }],
    reusability:
      'Welcome, Cart Recovery, Win Back, Product Launch. Usually omit for short transactional emails.'
  },
  function renderCtaBanner(options) {
    options = options || {};
    return (
      '<tr><td style="padding:0;">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' +
      BRAND.cardSoft +
      '" style="background:' +
      BRAND.cardSoft +
      ';border-top:1px solid ' +
      BRAND.line +
      ';">' +
      '<tr><td align="center" class="px" style="padding:40px ' +
      BRAND.gutter +
      'px 4px;">' +
      '<div class="h2" style="font-family:' +
      BRAND.fontDisplay +
      ';font-size:24px;line-height:1.3;color:' +
      BRAND.text +
      ';">' +
      esc(options.headline) +
      '</div>' +
      (options.body
        ? '<div style="font-family:' +
          BRAND.fontBody +
          ';font-size:14px;line-height:1.6;color:' +
          BRAND.muted +
          ';padding-top:10px;">' +
          esc(options.body) +
          '</div>'
        : '') +
      '</td></tr>' +
      Button.render({
        href: options.href,
        label: options.label,
        paddingTop: 22,
        paddingBottom: 40
      }).replace(/^<tr><td /, '<tr><td bgcolor="' + BRAND.cardSoft + '" ') +
      '</table>' +
      '</td></tr>'
    );
  }
);

const Footer = defineComponent(
  {
    id: 'footer',
    name: 'Footer',
    purpose: 'Social links, sender identity, reason for receiving, unsubscribe / contact.',
    inputs: [],
    optional: [
      { name: 'socials', type: 'array', description: '[{ label, href }] social links.' },
      { name: 'identity', type: 'string', description: 'Brand + address line.' },
      { name: 'reason', type: 'string', description: 'Why the recipient received this email.' },
      { name: 'unsubscribeHref', type: 'url', description: 'Unsubscribe link.' },
      { name: 'contactHref', type: 'url', description: 'Contact link.' }
    ],
    reusability: 'Every template. Always last section.'
  },
  function renderFooter(options) {
    options = options || {};
    const socials = (options.socials || [])
      .map(function (s) {
        return (
          '<a href="' +
          esc(s.href) +
          '" target="_blank" style="font-family:' +
          BRAND.fontBody +
          ';font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:' +
          BRAND.muted +
          ';text-decoration:none;padding:0 8px;">' +
          esc(s.label) +
          '</a>'
        );
      })
      .join('<span style="color:' + BRAND.line + ';">&#8226;</span>');
    return (
      '<tr><td align="center" class="px" style="padding:28px ' +
      BRAND.gutter +
      'px 36px;border-top:1px solid ' +
      BRAND.line +
      ';">' +
      (socials ? '<div style="padding-bottom:16px;">' + socials + '</div>' : '') +
      '<div style="font-family:' +
      BRAND.fontBody +
      ';font-size:11px;line-height:1.8;color:' +
      BRAND.faint +
      ';">' +
      esc(options.identity || '') +
      (options.reason ? '<br/>' + esc(options.reason) : '') +
      (options.unsubscribeHref
        ? '<br/><a href="' +
          esc(options.unsubscribeHref) +
          '" style="color:' +
          BRAND.faint +
          ';text-decoration:underline;">Unsubscribe</a>' +
          (options.contactHref
            ? ' &nbsp;&#8226;&nbsp; <a href="' +
              esc(options.contactHref) +
              '" style="color:' +
              BRAND.faint +
              ';text-decoration:underline;">Contact us</a>'
            : '')
        : '') +
      '</div>' +
      '</td></tr>'
    );
  }
);

/* -------------------------------------------------------------------------- */
/* Catalog                                                                    */
/* -------------------------------------------------------------------------- */

const COMPONENT_CATALOG = [
  Shell,
  Header,
  Hero,
  RichText,
  Coupon,
  Button,
  SectionTitle,
  ProductGrid,
  TextLink,
  FeatureIcons,
  Review,
  CtaBanner,
  Footer
];

function listComponents() {
  return COMPONENT_CATALOG.map(function (c) {
    return {
      id: c.id,
      name: c.name,
      purpose: c.purpose,
      inputs: c.inputs,
      optional: c.optional,
      reusability: c.reusability
    };
  });
}

function getComponent(id) {
  for (let i = 0; i < COMPONENT_CATALOG.length; i++) {
    if (COMPONENT_CATALOG[i].id === id) return COMPONENT_CATALOG[i];
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Backward-compatible aliases (section* names used during Welcome build)     */
/* -------------------------------------------------------------------------- */

module.exports = {
  BRAND,
  esc,
  COMPONENT_CATALOG,
  listComponents,
  getComponent,
  // Preferred API
  Shell,
  Header,
  Hero,
  RichText,
  Coupon,
  Button,
  SectionTitle,
  ProductGrid,
  TextLink,
  FeatureIcons,
  TrustBar: FeatureIcons,
  Review,
  CtaBanner,
  Footer,
  // Legacy aliases
  renderShell: Shell.render,
  sectionHeader: Header.render,
  sectionHero: Hero.render,
  sectionIntro: RichText.render,
  sectionCoupon: Coupon.render,
  sectionButton: Button.render,
  sectionTitle: SectionTitle.render,
  sectionProductGrid: ProductGrid.render,
  sectionTextLink: TextLink.render,
  sectionTrustBar: FeatureIcons.render,
  sectionFeatureRow: function (options) {
    const items = ((options && options.items) || []).slice(0, 3).map(function (item) {
      return item.title || item;
    });
    return FeatureIcons.render({ items: items });
  },
  sectionReview: Review.render,
  sectionCtaBanner: CtaBanner.render,
  sectionFooter: Footer.render
};
