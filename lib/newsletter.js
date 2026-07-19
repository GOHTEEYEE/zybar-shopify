/**
 * Newsletter subscribe + welcome email helpers (server-side).
 */
const DISCOUNT_CODE = 'ZYBAR15';
const DISCOUNT_PERCENT = 15;

const LANGUAGE_LABELS = {
  en: 'English',
  fr: 'Français',
  de: 'Deutsch',
  es: 'Español',
  it: 'Italiano',
  nl: 'Nederlands'
};

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeLanguage(lang) {
  const raw = String(lang || 'en').trim().toLowerCase().slice(0, 2);
  return LANGUAGE_LABELS[raw] ? raw : 'en';
}

function detectDevice(userAgent) {
  const ua = String(userAgent || '').toLowerCase();
  if (/ipad|tablet/.test(ua)) return 'tablet';
  if (/mobi|iphone|android/.test(ua)) return 'mobile';
  return 'desktop';
}

function detectBrowser(userAgent) {
  const ua = String(userAgent || '');
  if (/Edg\//.test(ua)) return 'Edge';
  if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'Safari';
  if (/Firefox\//.test(ua)) return 'Firefox';
  return 'Other';
}

function readHeaderCountry(req) {
  if (!req || !req.headers) return '';
  const h = req.headers;
  return (
    h['cf-ipcountry'] ||
    h['x-vercel-ip-country'] ||
    h['x-country-code'] ||
    ''
  );
}

async function ensureDiscountCode(supabase) {
  if (!supabase) return;
  const { error } = await supabase.from('discount_codes').upsert(
    {
      code: DISCOUNT_CODE,
      label: 'ZYBAR Garage welcome — 15% off first order',
      discount_type: 'percent',
      value_usd: DISCOUNT_PERCENT,
      min_order_usd: 0,
      active: true,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'code' }
  );
  if (error) {
    console.error('ensureDiscountCode error:', error);
  }
}

function buildWelcomeEmailHtml(options) {
  const storeUrl = options.storeUrl || 'https://zybar-ledcar.pages.dev';
  const code = options.discountCode || DISCOUNT_CODE;
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
    '<div style="font-family:Georgia,\'Times New Roman\',serif;font-size:28px;line-height:1.2;color:#fff;margin-top:8px;">THE ZYBAR GARAGE</div>' +
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

async function sendWelcomeEmail(env, payload) {
  const apiKey = (env && env.RESEND_API_KEY) || process.env.RESEND_API_KEY || '';
  const from =
    (env && env.RESEND_FROM_EMAIL) ||
    process.env.RESEND_FROM_EMAIL ||
    'ZYBAR Garage <onboarding@resend.dev>';
  const storeUrl =
    (env && env.STORE_URL) ||
    process.env.STORE_URL ||
    'https://zybar-ledcar.pages.dev';

  if (!apiKey) {
    return { sent: false, reason: 'RESEND_API_KEY not configured' };
  }

  const html = buildWelcomeEmailHtml({
    storeUrl: storeUrl,
    discountCode: payload.discountCode || DISCOUNT_CODE
  });

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: from,
      to: [payload.email],
      subject: 'Welcome to ZYBAR Garage',
      html: html
    })
  });

  if (!response.ok) {
    const text = await response.text().catch(function () {
      return '';
    });
    console.error('Resend welcome email failed:', response.status, text);
    return { sent: false, reason: 'email_provider_error' };
  }

  return { sent: true };
}

/**
 * @param {object} options
 * @param {import('@supabase/supabase-js').SupabaseClient} options.supabase
 * @param {object} options.body
 * @param {object} [options.req]
 * @param {object} [env]
 */
async function subscribeNewsletter(options, env) {
  const supabase = options.supabase;
  const body = options.body || {};
  const req = options.req || null;

  if (!supabase) {
    return { status: 503, json: { error: 'Newsletter service is unavailable.' } };
  }

  const email = normalizeEmail(body.email);
  if (!isValidEmail(email)) {
    return { status: 400, json: { error: 'Please enter a valid email address.' } };
  }

  const language = normalizeLanguage(body.language);
  const userAgent = req && req.headers ? req.headers['user-agent'] || '' : String(body.userAgent || '');
  const country =
    readHeaderCountry(req) ||
    String(body.country || '')
      .trim()
      .toUpperCase()
      .slice(0, 2) ||
    null;

  await ensureDiscountCode(supabase);

  const { data: existing, error: lookupError } = await supabase
    .from('newsletter_subscribers')
    .select('id, email, discount_code, status')
    .ilike('email', email)
    .maybeSingle();

  if (lookupError) {
    console.error('newsletter lookup error:', lookupError);
    return { status: 500, json: { error: 'Unable to verify membership. Please try again.' } };
  }

  if (existing) {
    return {
      status: 200,
      json: {
        ok: true,
        alreadyMember: true,
        message: "You're already a member.",
        discountCode: existing.discount_code || DISCOUNT_CODE
      }
    };
  }

  const row = {
    email: email,
    language: language,
    discount_code: DISCOUNT_CODE,
    source: String(body.source || 'premium_popup').slice(0, 80),
    browser: detectBrowser(userAgent),
    country: country,
    device: detectDevice(userAgent),
    status: 'active',
    used_discount: false,
    visitor_id: body.visitor_id || body.visitorId ? String(body.visitor_id || body.visitorId).slice(0, 80) : null,
    session_id: body.session_id || body.sessionId ? String(body.session_id || body.sessionId).slice(0, 80) : null,
    utm_source: body.utm_source ? String(body.utm_source).slice(0, 120) : null,
    utm_medium: body.utm_medium ? String(body.utm_medium).slice(0, 120) : null,
    utm_campaign: body.utm_campaign ? String(body.utm_campaign).slice(0, 120) : null
  };

  // Graceful: newsletter columns may not be migrated yet
  const insertPayload = { ...row };
  let { data: inserted, error: insertError } = await supabase
    .from('newsletter_subscribers')
    .insert(insertPayload)
    .select('id, email, discount_code')
    .single();

  if (insertError && /visitor_id|session_id|column/i.test(String(insertError.message || ''))) {
    delete insertPayload.visitor_id;
    delete insertPayload.session_id;
    delete insertPayload.purchased;
    delete insertPayload.order_count;
    delete insertPayload.revenue_cents;
    const retry = await supabase
      .from('newsletter_subscribers')
      .insert(insertPayload)
      .select('id, email, discount_code')
      .single();
    inserted = retry.data;
    insertError = retry.error;
  }

  if (insertError) {
    if (String(insertError.code) === '23505' || /duplicate|unique/i.test(String(insertError.message || ''))) {
      return {
        status: 200,
        json: {
          ok: true,
          alreadyMember: true,
          message: "You're already a member.",
          discountCode: DISCOUNT_CODE
        }
      };
    }
    console.error('newsletter insert error:', insertError);
    return { status: 500, json: { error: 'Unable to join right now. Please try again.' } };
  }

  const emailResult = await sendWelcomeEmail(env || process.env, {
    email: email,
    discountCode: DISCOUNT_CODE
  });

  try {
    const CustomerActivity = require('./customer-activity.js');
    await CustomerActivity.mergeProfileFromLead(supabase, row);
  } catch (mergeErr) {
    console.warn('newsletter merge profile:', mergeErr && mergeErr.message ? mergeErr.message : mergeErr);
  }

  return {
    status: 200,
    json: {
      ok: true,
      alreadyMember: false,
      discountCode: (inserted && inserted.discount_code) || DISCOUNT_CODE,
      subscriberId: inserted && inserted.id,
      emailSent: Boolean(emailResult && emailResult.sent),
      message: 'Welcome to ZYBAR Garage'
    }
  };
}

module.exports = {
  DISCOUNT_CODE,
  LANGUAGE_LABELS,
  normalizeEmail,
  isValidEmail,
  subscribeNewsletter,
  buildWelcomeEmailHtml,
  sendWelcomeEmail,
  ensureDiscountCode
};
