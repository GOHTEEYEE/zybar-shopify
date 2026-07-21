import { createClient } from '@supabase/supabase-js';

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

  var journeyEnrolled = false;
  var journeyResult = await supabase
    .from('journeys')
    .select('id')
    .eq('trigger_type', 'signup')
    .eq('status', 'published')
    .maybeSingle();
  if (!journeyResult.error && journeyResult.data) {
    var transitionResult = await supabase.rpc('transition_lead_journey', {
      p_lead_id: insertResult.data.id,
      p_journey_id: journeyResult.data.id
    });
    journeyEnrolled = !transitionResult.error && Boolean(transitionResult.data);
  }

  return json({
    ok: true,
    alreadyMember: false,
    discountCode: (insertResult.data && insertResult.data.discount_code) || DISCOUNT_CODE,
    subscriberId: insertResult.data && insertResult.data.id,
    journeyEnrolled: journeyEnrolled,
    message: 'Welcome to ZYBAR Garage'
  });
}
