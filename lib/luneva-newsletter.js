/**
 * LUNEVA email capture — 15% welcome discount (LUNEVA5).
 * Never overwrites ZYBAR automotive newsletter rows.
 */
const DISCOUNT_CODE = 'LUNEVA5';
const DISCOUNT_PERCENT = 15;
const MemberPricing = require('./member-pricing.js');
const BrandAnalytics = require('./brand-analytics.js');

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
      label: 'LUNEVA welcome — 15% off',
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

async function findLunevaLead(supabase, email) {
  const branded = await supabase
    .from('newsletter_subscribers')
    .select('id, email, discount_code, status, created_at, source, brand')
    .ilike('email', email)
    .eq('brand', BrandAnalytics.BRAND_LUNEVA)
    .maybeSingle();
  if (!branded.error) return { row: branded.data, brandReady: true };

  const legacy = await supabase
    .from('newsletter_subscribers')
    .select('id, email, discount_code, status, created_at, source, brand')
    .ilike('email', email)
    .maybeSingle();
  if (legacy.error) return { error: legacy.error };
  if (legacy.data && BrandAnalytics.isLunevaLead(legacy.data)) {
    return { row: legacy.data, brandReady: false };
  }
  return { row: null, brandReady: false, zybarRow: legacy.data || null };
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

  const found = await findLunevaLead(supabase, email);
  if (found.error) {
    console.error('luneva newsletter lookup error:', found.error);
    return { status: 500, json: { error: 'Unable to verify email. Please try again.' } };
  }

  function memberResponse(subscriber, alreadyMember) {
    const credential = MemberPricing.issueCredential(subscriber, 'luneva', env);
    return {
      status: 200,
      json: {
        ok: true,
        alreadyMember: !!alreadyMember,
        message: alreadyMember ? 'Your 15% savings are active.' : 'Welcome to LUNEVA',
        member: MemberPricing.publicMember(subscriber, tier, credential)
      }
    };
  }

  const existing = found.row;
  if (existing) {
    const patch = {
      status: 'active',
      discount_code: DISCOUNT_CODE,
      source: String(body.source || 'luneva_popup').slice(0, 80),
      brand: BrandAnalytics.BRAND_LUNEVA
    };
    if (body.visitor_id || body.visitorId) {
      patch.visitor_id = String(body.visitor_id || body.visitorId).slice(0, 80);
    }
    if (body.session_id || body.sessionId) {
      patch.session_id = String(body.session_id || body.sessionId).slice(0, 80);
    }
    let refreshed = await supabase
      .from('newsletter_subscribers')
      .update(patch)
      .eq('id', existing.id)
      .select('id, email, discount_code, status, created_at, brand')
      .single();
    if (refreshed.error && /brand|column/i.test(String(refreshed.error.message || ''))) {
      delete patch.brand;
      refreshed = await supabase
        .from('newsletter_subscribers')
        .update(patch)
        .eq('id', existing.id)
        .select('id, email, discount_code, status, created_at')
        .single();
    }
    const row = refreshed.data || existing;
    return memberResponse(row, true);
  }

  const row = {
    email: email,
    language: 'en',
    discount_code: DISCOUNT_CODE,
    source: String(body.source || 'luneva_popup').slice(0, 80),
    brand: BrandAnalytics.BRAND_LUNEVA,
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

  let { data: inserted, error: insertError } = await supabase
    .from('newsletter_subscribers')
    .insert(row)
    .select('id, email, discount_code, created_at, status, brand')
    .single();

  if (insertError && /brand|column/i.test(String(insertError.message || ''))) {
    const legacyRow = Object.assign({}, row);
    delete legacyRow.brand;
    // Without brand column, never overwrite an existing ZYBAR automotive lead.
    if (found.zybarRow && BrandAnalytics.isZybarLead(found.zybarRow)) {
      return memberResponse(
        {
          id: found.zybarRow.id,
          email: email,
          discount_code: DISCOUNT_CODE,
          status: 'active',
          created_at: found.zybarRow.created_at || new Date().toISOString()
        },
        true
      );
    }
    const retry = await supabase
      .from('newsletter_subscribers')
      .insert(legacyRow)
      .select('id, email, discount_code, created_at, status')
      .single();
    inserted = retry.data;
    insertError = retry.error;
  }

  if (insertError) {
    if (String(insertError.code) === '23505' || /duplicate|unique/i.test(String(insertError.message || ''))) {
      // Unique on email only (pre-migration): do not clobber ZYBAR.
      if (found.zybarRow && BrandAnalytics.isZybarLead(found.zybarRow)) {
        return memberResponse(
          {
            id: found.zybarRow.id,
            email: email,
            discount_code: DISCOUNT_CODE,
            status: 'active',
            created_at: found.zybarRow.created_at || new Date().toISOString()
          },
          true
        );
      }
      const duplicate = await findLunevaLead(supabase, email);
      if (duplicate.row) return memberResponse(duplicate.row, true);
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
