/**
 * LUNEVA email capture — 5% welcome discount (LUNEVA5).
 */
const DISCOUNT_CODE = 'LUNEVA5';
const DISCOUNT_PERCENT = 5;
const MemberPricing = require('./member-pricing.js');

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function ensureDiscountCode(supabase) {
  if (!supabase) return;
  const { error } = await supabase.from('discount_codes').upsert(
    {
      code: DISCOUNT_CODE,
      label: 'LUNEVA welcome — 5% off',
      discount_type: 'percent',
      value_usd: DISCOUNT_PERCENT,
      min_order_usd: 0,
      active: true,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'code' }
  );
  if (error) console.error('ensure LUNEVA5 discount error:', error);
}

async function subscribeLunevaNewsletter(options, env) {
  const supabase = options.supabase;
  const body = options.body || {};
  const req = options.req || null;

  if (!supabase) {
    return { status: 503, json: { error: 'Service is temporarily unavailable.' } };
  }

  const email = normalizeEmail(body.email);
  if (!isValidEmail(email)) {
    return { status: 400, json: { error: 'Please enter a valid email address.' } };
  }

  const userAgent = req && req.headers ? req.headers['user-agent'] || '' : String(body.userAgent || '');
  const tier = MemberPricing.TIERS.luneva;

  await ensureDiscountCode(supabase);

  const { data: existing, error: lookupError } = await supabase
    .from('newsletter_subscribers')
    .select('id, email, discount_code, status, created_at')
    .ilike('email', email)
    .maybeSingle();

  if (lookupError) {
    console.error('luneva newsletter lookup error:', lookupError);
    return { status: 500, json: { error: 'Unable to verify email. Please try again.' } };
  }

  function memberResponse(subscriber, alreadyMember) {
    const credential = MemberPricing.issueCredential(subscriber, 'luneva', env);
    return {
      status: 200,
      json: {
        ok: true,
        alreadyMember: !!alreadyMember,
        message: alreadyMember ? 'Your 5% savings are active.' : 'Welcome to LUNEVA',
        member: MemberPricing.publicMember(subscriber, tier, credential)
      }
    };
  }

  if (existing) {
    const patch = {
      status: 'active',
      discount_code: DISCOUNT_CODE,
      source: String(body.source || 'luneva_popup').slice(0, 80),
      created_at: new Date().toISOString()
    };
    if (body.visitor_id || body.visitorId) {
      patch.visitor_id = String(body.visitor_id || body.visitorId).slice(0, 80);
    }
    if (body.session_id || body.sessionId) {
      patch.session_id = String(body.session_id || body.sessionId).slice(0, 80);
    }
    const refreshed = await supabase
      .from('newsletter_subscribers')
      .update(patch)
      .eq('id', existing.id)
      .select('id, email, discount_code, status, created_at')
      .single();
    const row = refreshed.data || existing;
    return memberResponse(row, true);
  }

  const row = {
    email: email,
    language: 'en',
    discount_code: DISCOUNT_CODE,
    source: String(body.source || 'luneva_popup').slice(0, 80),
    browser: 'Other',
    country: null,
    device: 'desktop',
    status: 'active',
    used_discount: false,
    visitor_id: body.visitor_id || body.visitorId ? String(body.visitor_id || body.visitorId).slice(0, 80) : null,
    session_id: body.session_id || body.sessionId ? String(body.session_id || body.sessionId).slice(0, 80) : null,
    utm_source: body.utm_source ? String(body.utm_source).slice(0, 120) : null,
    utm_medium: body.utm_medium ? String(body.utm_medium).slice(0, 120) : null,
    utm_campaign: body.utm_campaign ? String(body.utm_campaign).slice(0, 120) : null
  };

  const { data: inserted, error: insertError } = await supabase
    .from('newsletter_subscribers')
    .insert(row)
    .select('id, email, discount_code, created_at, status')
    .single();

  if (insertError) {
    if (String(insertError.code) === '23505' || /duplicate|unique/i.test(String(insertError.message || ''))) {
      const duplicate = await supabase
        .from('newsletter_subscribers')
        .select('id, email, discount_code, status, created_at')
        .ilike('email', email)
        .maybeSingle();
      if (duplicate.data) return memberResponse(duplicate.data, true);
    }
    console.error('luneva newsletter insert error:', insertError);
    return { status: 500, json: { error: 'Unable to join right now. Please try again.' } };
  }

  try {
    const CustomerActivity = require('./customer-activity.js');
    await CustomerActivity.mergeProfileFromLead(supabase, row);
  } catch (mergeErr) {
    console.warn('luneva merge profile:', mergeErr && mergeErr.message ? mergeErr.message : mergeErr);
  }

  return memberResponse(inserted, false);
}

module.exports = {
  DISCOUNT_CODE,
  DISCOUNT_PERCENT,
  subscribeLunevaNewsletter,
  ensureDiscountCode
};
