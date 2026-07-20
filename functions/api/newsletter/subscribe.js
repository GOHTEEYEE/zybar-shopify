import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '../../__lib/email/resend.js';

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

const DISCOUNT_CODE = 'ZYBAR15';
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
  var raw = String(lang || 'en').trim().toLowerCase().slice(0, 2);
  return LANGUAGE_LABELS[raw] ? raw : 'en';
}

function detectDevice(userAgent) {
  var ua = String(userAgent || '').toLowerCase();
  if (/ipad|tablet/.test(ua)) return 'tablet';
  if (/mobi|iphone|android/.test(ua)) return 'mobile';
  return 'desktop';
}

function detectBrowser(userAgent) {
  var ua = String(userAgent || '');
  if (/Edg\//.test(ua)) return 'Edge';
  if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'Safari';
  if (/Firefox\//.test(ua)) return 'Firefox';
  return 'Other';
}

async function ensureDiscountCode(supabase) {
  await supabase.from('discount_codes').upsert(
    {
      code: DISCOUNT_CODE,
      label: 'ZYBAR Garage welcome — 15% off first order',
      discount_type: 'percent',
      value_usd: 15,
      min_order_usd: 0,
      active: true,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'code' }
  );
}

async function sendWelcomeEmail(env, email) {
  if (!env.RESEND_API_KEY) return { sent: false };
  var storeUrl = env.STORE_URL || 'https://www.zybar.shop';
  var html =
    '<div style="background:#0b0b0b;padding:32px;font-family:Georgia,serif;color:#fff;text-align:center;">' +
    '<div style="letter-spacing:.28em;font-size:12px;opacity:.55;">WELCOME TO</div>' +
    '<div style="font-size:28px;margin-top:8px;">THE ZYBAR GARAGE</div>' +
    '<p style="font-family:Helvetica,Arial,sans-serif;opacity:.72;">Your 15% first-order discount is ready.</p>' +
    '<div style="display:inline-block;margin:18px 0;padding:16px 24px;border:1px solid rgba(255,255,255,.18);border-radius:12px;">' +
    '<div style="font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:.18em;opacity:.5;">DISCOUNT CODE</div>' +
    '<div style="font-size:28px;letter-spacing:.12em;margin-top:6px;">' +
    DISCOUNT_CODE +
    '</div></div>' +
    '<div><a href="' +
    storeUrl +
    '/collections/all/" style="display:inline-block;background:#fff;color:#111;text-decoration:none;padding:14px 24px;border-radius:999px;font-family:Helvetica,Arial,sans-serif;font-weight:600;">Shop the Collection</a></div>' +
    '<p style="font-family:Helvetica,Arial,sans-serif;font-size:13px;opacity:.55;margin-top:28px;">Shipping: Standard 14–18 days · Priority 7–14 days</p>' +
    '</div>';

  try {
    await sendEmail({
      env: env,
      to: email,
      subject: 'Welcome to ZYBAR Garage',
      html: html
    });
    return { sent: true };
  } catch (_) {
    return { sent: false };
  }
}

export async function onRequestPost(context) {
  var env = context.env || {};
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Newsletter service is unavailable.' }, 503);
  }

  var body;
  try {
    body = await context.request.json();
  } catch (_) {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  var email = normalizeEmail(body.email);
  if (!isValidEmail(email)) {
    return json({ error: 'Please enter a valid email address.' }, 400);
  }

  var language = normalizeLanguage(body.language);
  var userAgent = context.request.headers.get('user-agent') || String(body.userAgent || '');
  var country =
    context.request.headers.get('cf-ipcountry') ||
    context.request.headers.get('x-vercel-ip-country') ||
    null;

  var supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });

  await ensureDiscountCode(supabase);

  var existingResult = await supabase
    .from('newsletter_subscribers')
    .select('id, email, discount_code, status')
    .ilike('email', email)
    .maybeSingle();

  if (existingResult.error) {
    return json({ error: 'Unable to verify membership. Please try again.' }, 500);
  }

  if (existingResult.data) {
    return json({
      ok: true,
      alreadyMember: true,
      message: "You're already a member.",
      discountCode: existingResult.data.discount_code || DISCOUNT_CODE
    });
  }

  var row = {
    email: email,
    language: language,
    discount_code: DISCOUNT_CODE,
    source: String(body.source || 'premium_popup').slice(0, 80),
    browser: detectBrowser(userAgent),
    country: country,
    device: detectDevice(userAgent),
    status: 'active',
    used_discount: false,
    utm_source: body.utm_source ? String(body.utm_source).slice(0, 120) : null,
    utm_medium: body.utm_medium ? String(body.utm_medium).slice(0, 120) : null,
    utm_campaign: body.utm_campaign ? String(body.utm_campaign).slice(0, 120) : null
  };

  var insertResult = await supabase
    .from('newsletter_subscribers')
    .insert(row)
    .select('id, email, discount_code')
    .single();

  if (insertResult.error) {
    if (String(insertResult.error.code) === '23505') {
      return json({
        ok: true,
        alreadyMember: true,
        message: "You're already a member.",
        discountCode: DISCOUNT_CODE
      });
    }
    return json({ error: 'Unable to join right now. Please try again.' }, 500);
  }

  var emailResult = await sendWelcomeEmail(env, email);

  return json({
    ok: true,
    alreadyMember: false,
    discountCode: (insertResult.data && insertResult.data.discount_code) || DISCOUNT_CODE,
    subscriberId: insertResult.data && insertResult.data.id,
    emailSent: Boolean(emailResult && emailResult.sent),
    message: 'Welcome to ZYBAR Garage'
  });
}
