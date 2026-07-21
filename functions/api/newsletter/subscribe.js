import { createClient } from '@supabase/supabase-js';

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

const DISCOUNT_CODE = 'ZYBAR15';
const TOKEN_TTL_SECONDS = 180 * 24 * 60 * 60;
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

function base64Url(bytes) {
  var binary = '';
  new Uint8Array(bytes).forEach(function (byte) {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function memberPayload(subscriber, env) {
  var secret = String(env.MEMBER_PRICING_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || '');
  if (!subscriber || !subscriber.id || !secret) return { active: false };
  var now = Math.floor(Date.now() / 1000);
  var encodedPayload = base64Url(
    new TextEncoder().encode(
      JSON.stringify({
        v: 1,
        sid: String(subscriber.id),
        tier: 'welcome',
        iat: now,
        exp: now + TOKEN_TTL_SECONDS
      })
    )
  );
  var key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  var signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(encodedPayload)
  );
  return {
    active: true,
    tier: 'welcome',
    tierLabel: 'Welcome Member',
    eyebrow: 'Member Exclusive',
    benefit: 'Extra 15% Savings Applied',
    percent: 15,
    discountCode: DISCOUNT_CODE,
    credential: encodedPayload + '.' + base64Url(signature)
  };
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
    var recognitionPatch = { status: 'active' };
    if (body.visitor_id || body.visitorId) {
      recognitionPatch.visitor_id = String(body.visitor_id || body.visitorId).slice(0, 80);
    }
    if (body.session_id || body.sessionId) {
      recognitionPatch.session_id = String(body.session_id || body.sessionId).slice(0, 80);
    }
    var refreshedResult = await supabase
      .from('newsletter_subscribers')
      .update(recognitionPatch)
      .eq('id', existingResult.data.id)
      .select('id, status, discount_code')
      .single();
    var recognized = refreshedResult.data || existingResult.data;
    return json({
      ok: true,
      alreadyMember: true,
      message: "You're already a member.",
      member: await memberPayload(recognized, env)
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
      var duplicateResult = await supabase
        .from('newsletter_subscribers')
        .select('id, status, discount_code')
        .ilike('email', email)
        .maybeSingle();
      return json({
        ok: true,
        alreadyMember: true,
        message: "You're already a member.",
        member: await memberPayload(duplicateResult.data, env)
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
    member: await memberPayload(insertResult.data, env),
    subscriberId: insertResult.data && insertResult.data.id,
    journeyEnrolled: journeyEnrolled,
    message: 'Welcome to ZYBAR Garage'
  });
}
