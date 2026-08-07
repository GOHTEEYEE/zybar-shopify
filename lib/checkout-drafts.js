/**
 * Progressive checkout drafts — save email/name/address before payment.
 * Stored on cart_sessions.metadata.checkout_draft + analytics events.
 */
'use strict';

const BrandAnalytics = require('./brand-analytics.js');

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function clean(value, max) {
  const s = String(value == null ? '' : value).trim();
  if (!s) return '';
  return s.slice(0, max || 200);
}

function buildDraft(body) {
  const email = normalizeEmail(body.email);
  const firstName = clean(body.firstName || body.first_name, 80);
  const lastName = clean(body.lastName || body.last_name, 80);
  const name = clean(
    body.name || [firstName, lastName].filter(Boolean).join(' '),
    160
  );
  const draft = {
    email: email || null,
    first_name: firstName || null,
    last_name: lastName || null,
    name: name || null,
    phone: clean(body.phone, 40) || null,
    address: clean(body.address, 200) || null,
    apartment: clean(body.apartment, 120) || null,
    city: clean(body.city, 80) || null,
    state: clean(body.state, 80) || null,
    postcode: clean(body.postcode, 40) || null,
    country: clean(body.country, 8).toUpperCase() || null,
    shipping_method: clean(body.shippingMethod || body.shipping_method, 40) || null,
    brand: clean(body.brand || body.collection, 20).toLowerCase() || null,
    visitor_id: clean(body.visitor_id || body.visitorId, 80) || null,
    session_id: clean(body.session_id || body.sessionId, 80) || null,
    cart_id: clean(body.cart_id || body.cartId, 80) || null,
    updated_at: new Date().toISOString()
  };

  const fields = [];
  if (draft.email && isValidEmail(draft.email)) fields.push('email');
  if (draft.first_name || draft.last_name || draft.name) fields.push('name');
  if (draft.phone) fields.push('phone');
  if (draft.address) fields.push('address');
  if (draft.city) fields.push('city');
  if (draft.postcode) fields.push('postcode');
  if (draft.country) fields.push('country');
  draft.fields_filled = fields;

  let stage = 'started';
  if (fields.indexOf('email') !== -1) stage = 'email';
  if (fields.indexOf('name') !== -1 && fields.indexOf('email') !== -1) stage = 'contact';
  if (
    fields.indexOf('address') !== -1 ||
    fields.indexOf('city') !== -1 ||
    fields.indexOf('postcode') !== -1
  ) {
    stage = 'address_partial';
  }
  if (
    fields.indexOf('email') !== -1 &&
    (fields.indexOf('name') !== -1 || fields.indexOf('phone') !== -1) &&
    fields.indexOf('address') !== -1 &&
    fields.indexOf('city') !== -1 &&
    fields.indexOf('postcode') !== -1 &&
    fields.indexOf('country') !== -1
  ) {
    stage = 'address_complete';
  }
  draft.stage = stage;
  return draft;
}

function stageRank(stage) {
  const order = {
    started: 0,
    email: 1,
    contact: 2,
    address_partial: 3,
    address_complete: 4,
    payment_started: 5,
    purchased: 6
  };
  return order[stage] || 0;
}

async function findOpenCart(supabase, draft) {
  if (draft.cart_id) {
    const byId = await supabase
      .from('cart_sessions')
      .select('id, metadata, status, visitor_id, brand')
      .eq('id', draft.cart_id)
      .maybeSingle();
    if (!byId.error && byId.data) return byId.data;
  }
  if (!draft.visitor_id) return null;
  const brand = draft.brand === 'luneva' ? 'luneva' : draft.brand === 'zybar' ? 'zybar' : null;
  let query = supabase
    .from('cart_sessions')
    .select('id, metadata, status, visitor_id, brand')
    .eq('visitor_id', draft.visitor_id)
    .in('status', ['active', 'checkout_started'])
    .order('last_activity_at', { ascending: false })
    .limit(10);
  const { data, error } = await query;
  if (error) return null;
  const rows = data || [];
  if (!rows.length) return null;
  if (brand) {
    const match = rows.find(function (row) {
      return BrandAnalytics.inferCartBrand(row) === brand;
    });
    if (match) return match;
  }
  return rows[0];
}

async function upsertCartDraft(supabase, draft) {
  const existing = await findOpenCart(supabase, draft);
  const now = new Date().toISOString();
  const prevMeta =
    existing && existing.metadata && typeof existing.metadata === 'object'
      ? existing.metadata
      : {};
  const prevDraft =
    prevMeta.checkout_draft && typeof prevMeta.checkout_draft === 'object'
      ? prevMeta.checkout_draft
      : {};

  const merged = Object.assign({}, prevDraft, draft);
  // Never wipe previously captured fields with empties.
  Object.keys(prevDraft).forEach(function (key) {
    if (merged[key] == null || merged[key] === '') merged[key] = prevDraft[key];
  });
  if (stageRank(prevDraft.stage) > stageRank(merged.stage)) {
    merged.stage = prevDraft.stage;
  }
  merged.updated_at = now;
  merged.fields_filled = Array.from(
    new Set([].concat(prevDraft.fields_filled || [], merged.fields_filled || []))
  );

  const metadata = Object.assign({}, prevMeta, { checkout_draft: merged });
  const brand =
    draft.brand === 'luneva'
      ? BrandAnalytics.BRAND_LUNEVA
      : draft.brand === 'zybar'
        ? BrandAnalytics.BRAND_ZYBAR
        : BrandAnalytics.inferCartBrand({ brand: draft.brand });

  if (existing && existing.id) {
    const patch = {
      metadata: metadata,
      last_activity_at: now,
      status:
        existing.status === 'purchased' || existing.status === 'recovered'
          ? existing.status
          : 'checkout_started',
      country: merged.country || null
    };
    if (brand) patch.brand = brand;
    let result = await supabase.from('cart_sessions').update(patch).eq('id', existing.id);
    if (result.error && /brand|column/i.test(String(result.error.message || ''))) {
      delete patch.brand;
      result = await supabase.from('cart_sessions').update(patch).eq('id', existing.id);
    }
    if (result.error) throw result.error;
    return { cart_id: existing.id, draft: merged, created: false };
  }

  const insertRow = {
    visitor_id: draft.visitor_id || 'unknown',
    session_id: draft.session_id || null,
    status: 'checkout_started',
    currency: 'USD',
    cart_value_cents: 0,
    item_count: 0,
    country: merged.country || null,
    metadata: metadata,
    last_activity_at: now,
    brand: brand || null
  };
  if (draft.cart_id) insertRow.id = draft.cart_id;
  let inserted = await supabase.from('cart_sessions').insert(insertRow).select('id').single();
  if (inserted.error && /brand|column/i.test(String(inserted.error.message || ''))) {
    delete insertRow.brand;
    inserted = await supabase.from('cart_sessions').insert(insertRow).select('id').single();
  }
  if (inserted.error) throw inserted.error;
  return { cart_id: inserted.data.id, draft: merged, created: true };
}

async function trackDraftEvent(supabase, draft, previousStage) {
  if (!draft.visitor_id) return;
  if (!draft.email && !draft.name && !draft.address) return;
  // Only emit when stage advances (or first save).
  if (previousStage && stageRank(previousStage) >= stageRank(draft.stage)) return;

  const eventType =
    draft.stage === 'address_complete'
      ? 'checkout_address_filled'
      : draft.stage === 'address_partial'
        ? 'checkout_address_partial'
        : draft.stage === 'contact'
          ? 'checkout_contact_filled'
          : 'checkout_email_filled';

  const AnalyticsFallback = require('./analytics-fallback.js');
  await AnalyticsFallback.insertEventSafe(supabase, {
    event_type: eventType,
    visitor_id: draft.visitor_id,
    session_id: draft.session_id || null,
    collection_id: draft.brand === 'luneva' ? 'luneva' : null,
    page_url: draft.brand === 'luneva' ? '/luneva/checkout/' : '/checkout/',
    country: draft.country || null,
    metadata: {
      collection: draft.brand || null,
      email: draft.email || null,
      name: draft.name || null,
      phone: draft.phone || null,
      address: draft.address || null,
      city: draft.city || null,
      state: draft.state || null,
      postcode: draft.postcode || null,
      country: draft.country || null,
      stage: draft.stage,
      source: 'checkout_draft'
    }
  });
}

async function upsertLead(supabase, draft) {
  if (!draft.email || !isValidEmail(draft.email)) return null;
  const brand =
    draft.brand === 'luneva' ? BrandAnalytics.BRAND_LUNEVA : BrandAnalytics.BRAND_ZYBAR;
  const source = brand === BrandAnalytics.BRAND_LUNEVA ? 'luneva_checkout' : 'checkout_email';

  if (brand === BrandAnalytics.BRAND_LUNEVA) {
    const LunevaNewsletter = require('./luneva-newsletter.js');
    try {
      await LunevaNewsletter.ensureDiscountCode(supabase);
    } catch (_) {}
  }

  const existing = await supabase
    .from('newsletter_subscribers')
    .select('id, email, brand, discount_code, source')
    .ilike('email', draft.email)
    .limit(5);
  const rows = existing.data || [];
  const match =
    rows.find(function (row) {
      return BrandAnalytics.inferLeadBrand(row) === brand;
    }) ||
    rows.find(function (row) {
      return !row.brand;
    }) ||
    null;

  const patch = {
    email: draft.email,
    status: 'active',
    source: source,
    brand: brand,
    visitor_id: draft.visitor_id || null,
    session_id: draft.session_id || null,
    country: draft.country || null
  };
  if (brand === BrandAnalytics.BRAND_LUNEVA) {
    patch.discount_code = 'LUNEVA5';
  }

  if (match && match.id) {
    let updated = await supabase
      .from('newsletter_subscribers')
      .update(patch)
      .eq('id', match.id)
      .select('id, email')
      .single();
    if (updated.error && /brand|column/i.test(String(updated.error.message || ''))) {
      delete patch.brand;
      updated = await supabase
        .from('newsletter_subscribers')
        .update(patch)
        .eq('id', match.id)
        .select('id, email')
        .single();
    }
    return updated.data || match;
  }

  let inserted = await supabase
    .from('newsletter_subscribers')
    .insert(
      Object.assign({}, patch, {
        language: 'en',
        browser: 'Other',
        device: 'desktop',
        used_discount: false
      })
    )
    .select('id, email')
    .single();
  if (inserted.error && /brand|column/i.test(String(inserted.error.message || ''))) {
    delete patch.brand;
    inserted = await supabase
      .from('newsletter_subscribers')
      .insert(
        Object.assign({}, patch, {
          language: 'en',
          browser: 'Other',
          device: 'desktop',
          used_discount: false
        })
      )
      .select('id, email')
      .single();
  }
  if (inserted.error && String(inserted.error.code) !== '23505') {
    console.warn('checkout draft lead insert:', inserted.error.message || inserted.error);
  }
  return inserted.data || null;
}

async function upsertProfile(supabase, draft) {
  if (!draft.visitor_id && !draft.email) return;
  const now = new Date().toISOString();
  const row = {
    visitor_id: draft.visitor_id || null,
    email: draft.email || null,
    customer_name: draft.name || null,
    phone: draft.phone || null,
    country: draft.country || null,
    city: draft.city || null,
    status: draft.stage === 'address_complete' ? 'checkout_ready' : 'checkout_lead',
    last_seen_at: now,
    updated_at: now
  };

  try {
    if (draft.visitor_id) {
      const existing = await supabase
        .from('customer_profiles')
        .select('id, email, customer_name, phone, country, city')
        .eq('visitor_id', draft.visitor_id)
        .maybeSingle();
      if (existing.data && existing.data.id) {
        const patch = Object.assign({}, row);
        if (!patch.email) patch.email = existing.data.email;
        if (!patch.customer_name) patch.customer_name = existing.data.customer_name;
        if (!patch.phone) patch.phone = existing.data.phone;
        if (!patch.country) patch.country = existing.data.country;
        if (!patch.city) patch.city = existing.data.city;
        await supabase.from('customer_profiles').update(patch).eq('id', existing.data.id);
        return;
      }
      row.first_seen_at = now;
      await supabase.from('customer_profiles').insert(row);
      return;
    }
  } catch (err) {
    console.warn('checkout draft profile:', err && err.message ? err.message : err);
  }
}

async function saveCheckoutDraft(supabase, body) {
  if (!supabase) {
    return { status: 503, json: { error: 'Service unavailable' } };
  }
  const draft = buildDraft(body || {});
  if (!draft.visitor_id && !draft.email) {
    return { status: 400, json: { error: 'visitor_id or email is required' } };
  }
  // Ignore empty noise (opened form but typed nothing useful yet).
  if (
    !draft.email &&
    !draft.name &&
    !draft.phone &&
    !draft.address &&
    !draft.city &&
    !draft.postcode
  ) {
    return { status: 200, json: { ok: true, skipped: true } };
  }

  const existing = await findOpenCart(supabase, draft);
  const previousStage =
    existing &&
    existing.metadata &&
    existing.metadata.checkout_draft &&
    existing.metadata.checkout_draft.stage
      ? existing.metadata.checkout_draft.stage
      : null;

  const saved = await upsertCartDraft(supabase, draft);
  await trackDraftEvent(supabase, saved.draft, previousStage);
  await upsertLead(supabase, saved.draft);
  await upsertProfile(supabase, saved.draft);

  return {
    status: 200,
    json: {
      ok: true,
      cart_id: saved.cart_id,
      stage: saved.draft.stage,
      fields_filled: saved.draft.fields_filled || []
    }
  };
}

module.exports = {
  buildDraft,
  saveCheckoutDraft,
  stageRank
};
