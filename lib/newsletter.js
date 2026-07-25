/**
 * Newsletter subscribe helpers (server-side).
 */
const DISCOUNT_CODE = 'ZYBAR15';
const DISCOUNT_PERCENT = 15;
const EmailTemplates = require('./email-templates.js');
const MemberPricing = require('./member-pricing.js');
const Unsubscribe = require('./unsubscribe.js');

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

async function sendWelcomeEmail(env, payload) {
  const Email = require('./email.js');
  const storeUrl =
    (env && env.STORE_URL) ||
    process.env.STORE_URL ||
    'https://www.zybar.shop';

  const memberCredential =
    payload.memberCredential ||
    MemberPricing.issueCredential(
      payload.subscriber || { id: payload.subscriberId, discount_code: payload.discountCode },
      'welcome',
      env
    );
  const rendered = EmailTemplates.renderTemplate('welcome_email', {
    storeName: (env && env.STORE_NAME) || process.env.STORE_NAME || EmailTemplates.DEFAULT_STORE_NAME,
    storeUrl: storeUrl,
    discountCode: payload.discountCode || DISCOUNT_CODE
  });
  rendered.html = Unsubscribe.applyUrlToHtml(
    MemberPricing.decorateStoreLinks(rendered.html, storeUrl, memberCredential),
    Unsubscribe.buildUrl(payload.email, env || process.env)
  );

  const result = await Email.sendEmail({
    to: payload.email,
    subject: rendered.subject,
    html: rendered.html,
    headers: Unsubscribe.buildHeaders(payload.email, env || process.env),
    env: env || process.env
  });

  if (!result.ok) {
    console.error('Resend welcome email failed:', result.error);
    return { sent: false, reason: result.error || 'email_provider_error' };
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
    const recognitionPatch = { status: 'active' };
    if (body.visitor_id || body.visitorId) {
      recognitionPatch.visitor_id = String(body.visitor_id || body.visitorId).slice(0, 80);
    }
    if (body.session_id || body.sessionId) {
      recognitionPatch.session_id = String(body.session_id || body.sessionId).slice(0, 80);
    }
    const refreshedResult = await supabase
      .from('newsletter_subscribers')
      .update(recognitionPatch)
      .eq('id', existing.id)
      .select('id, status, discount_code')
      .single();
    const recognized = refreshedResult.data || existing;
    const credential = MemberPricing.issueCredential(recognized, 'welcome', env);
    return {
      status: 200,
      json: {
        ok: true,
        alreadyMember: true,
        message: "You're already a member.",
        member: MemberPricing.publicMember(
          recognized,
          MemberPricing.TIERS.welcome,
          credential
        )
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
    .select('id, email, discount_code, created_at')
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
      .select('id, email, discount_code, created_at')
      .single();
    inserted = retry.data;
    insertError = retry.error;
  }

  if (insertError) {
    if (String(insertError.code) === '23505' || /duplicate|unique/i.test(String(insertError.message || ''))) {
      const duplicate = await supabase
        .from('newsletter_subscribers')
        .select('id, status, discount_code')
        .ilike('email', email)
        .maybeSingle();
      const memberRow = duplicate.data || { id: null, status: 'active' };
      const credential = MemberPricing.issueCredential(memberRow, 'welcome', env);
      return {
        status: 200,
        json: {
          ok: true,
          alreadyMember: true,
          message: "You're already a member.",
          member: MemberPricing.publicMember(
            memberRow,
            MemberPricing.TIERS.welcome,
            credential
          )
        }
      };
    }
    console.error('newsletter insert error:', insertError);
    return { status: 500, json: { error: 'Unable to join right now. Please try again.' } };
  }

  try {
    const CustomerActivity = require('./customer-activity.js');
    await CustomerActivity.mergeProfileFromLead(supabase, row);
  } catch (mergeErr) {
    console.warn('newsletter merge profile:', mergeErr && mergeErr.message ? mergeErr.message : mergeErr);
  }

  let enrolledJourneys = [];
  try {
    const JourneyEngine = require('./journey-engine.js');
    enrolledJourneys = await JourneyEngine.enrollLeadOnSignup(
      supabase,
      Object.assign({}, row, {
        id: inserted && inserted.id ? inserted.id : null,
        created_at: inserted && inserted.created_at ? inserted.created_at : nowIsoForLead()
      })
    );
  } catch (journeyErr) {
    console.warn('newsletter enroll journey:', journeyErr && journeyErr.message ? journeyErr.message : journeyErr);
  }

  return {
    status: 200,
    json: {
      ok: true,
      alreadyMember: false,
      member: MemberPricing.publicMember(
        inserted,
        MemberPricing.TIERS.welcome,
        MemberPricing.issueCredential(inserted, 'welcome', env)
      ),
      subscriberId: inserted && inserted.id,
      journeyEnrolled: enrolledJourneys.length > 0,
      journeysEnrolled: enrolledJourneys.length,
      message: 'Welcome to ZYBAR Garage'
    }
  };
}

function nowIsoForLead() {
  return new Date().toISOString();
}

module.exports = {
  DISCOUNT_CODE,
  LANGUAGE_LABELS,
  normalizeEmail,
  isValidEmail,
  subscribeNewsletter,
  sendWelcomeEmail,
  ensureDiscountCode
};
