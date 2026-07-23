/**
 * Custom Made lead tracking — uploads, cart, checkout, purchase.
 * Enriches each lead with client identity from analytics + newsletter when known.
 */
'use strict';

var CustomerActivity = require('./customer-activity.js');

var STATUS_RANK = {
  started: 1,
  uploaded: 2,
  configured: 3,
  added_to_cart: 4,
  checkout_started: 5,
  purchased: 6
};

var ABANDONED_HOURS = Math.max(
  1,
  parseInt(process.env.CUSTOMER_ABANDONED_HOURS || '24', 10) || 24
);

function nowIso() {
  return new Date().toISOString();
}

function normalizeStatus(status) {
  var value = String(status || 'started').trim().toLowerCase();
  return STATUS_RANK[value] ? value : 'started';
}

function shouldUpgrade(current, next) {
  return (STATUS_RANK[next] || 0) > (STATUS_RANK[current] || 0);
}

function sanitizeText(value, maxLen) {
  var text = String(value == null ? '' : value).trim();
  if (!text) return null;
  return text.slice(0, maxLen || 240);
}

function normalizePhotos(photos) {
  if (!Array.isArray(photos)) return [];
  return photos
    .map(function (photo) {
      if (!photo || typeof photo !== 'object') return null;
      var url = photo.url || photo.publicUrl || null;
      var path = photo.path || photo.id || null;
      if (!url && !path) return null;
      return {
        id: path || photo.id || null,
        path: path,
        url: url,
        name: photo.name || null
      };
    })
    .filter(Boolean)
    .slice(0, 5);
}

function deriveStatusFromPayload(payload) {
  var explicit = normalizeStatus(payload.status);
  if (explicit !== 'started') return explicit;
  var photos = normalizePhotos(payload.photos || payload.uploadedPhotos);
  if (photos.length) return 'uploaded';
  if (sanitizeText(payload.vehicleModel, 160)) return 'configured';
  return 'started';
}

function displayStatus(row) {
  var status = normalizeStatus(row && row.status);
  if (status === 'purchased') return 'purchased';
  if (status === 'added_to_cart' || status === 'checkout_started') {
    var hours = CustomerActivity.hoursSince
      ? CustomerActivity.hoursSince(row.last_event_at)
      : null;
    if (hours != null && hours >= ABANDONED_HOURS) return 'abandoned';
  }
  return status;
}

function fillIfEmpty(target, key, value) {
  if (value == null || value === '') return;
  if (target[key] == null || target[key] === '') target[key] = value;
}

async function resolveClientContext(supabase, payload, existing) {
  var context = {
    customer_email: sanitizeText(payload.customerEmail || payload.customer_email, 320),
    customer_name: sanitizeText(payload.customerName || payload.customer_name, 160),
    country: sanitizeText(payload.country, 8),
    device_type: sanitizeText(payload.deviceType || payload.device_type, 32),
    browser: sanitizeText(payload.browser, 64),
    traffic_source: sanitizeText(payload.trafficSource || payload.traffic_source, 64),
    referrer: sanitizeText(payload.referrer, 500)
  };

  if (existing) {
    fillIfEmpty(context, 'customer_email', existing.customer_email);
    fillIfEmpty(context, 'customer_name', existing.customer_name);
    fillIfEmpty(context, 'country', existing.country);
    fillIfEmpty(context, 'device_type', existing.device_type);
    fillIfEmpty(context, 'browser', existing.browser);
    fillIfEmpty(context, 'traffic_source', existing.traffic_source);
    fillIfEmpty(context, 'referrer', existing.referrer);
  }

  var visitorId = String(payload.visitorId || (existing && existing.visitor_id) || '').trim();
  var sessionId = String(payload.sessionId || (existing && existing.analytics_session_id) || '').trim();
  if (!supabase || (!visitorId && !sessionId)) return context;

  try {
    if (sessionId) {
      var sessionRes = await supabase
        .from('sessions')
        .select('country,device_type,browser,traffic_source,referrer,utm_source')
        .eq('id', sessionId)
        .maybeSingle();
      if (!sessionRes.error && sessionRes.data) {
        fillIfEmpty(context, 'country', sessionRes.data.country);
        fillIfEmpty(context, 'device_type', sessionRes.data.device_type);
        fillIfEmpty(context, 'browser', sessionRes.data.browser);
        fillIfEmpty(
          context,
          'traffic_source',
          sessionRes.data.traffic_source || sessionRes.data.utm_source
        );
        fillIfEmpty(context, 'referrer', sessionRes.data.referrer);
      }
    }

    if (visitorId) {
      var visitorRes = await supabase
        .from('analytics_visitors')
        .select('country,device_type,browser,first_traffic_source')
        .eq('visitor_id', visitorId)
        .maybeSingle();
      if (!visitorRes.error && visitorRes.data) {
        fillIfEmpty(context, 'country', visitorRes.data.country);
        fillIfEmpty(context, 'device_type', visitorRes.data.device_type);
        fillIfEmpty(context, 'browser', visitorRes.data.browser);
        fillIfEmpty(context, 'traffic_source', visitorRes.data.first_traffic_source);
      }

      var profileRes = await supabase
        .from('customer_profiles')
        .select('email,customer_name,country,device_type,browser,traffic_source')
        .eq('visitor_id', visitorId)
        .maybeSingle();
      if (!profileRes.error && profileRes.data) {
        fillIfEmpty(context, 'customer_email', profileRes.data.email);
        fillIfEmpty(context, 'customer_name', profileRes.data.customer_name);
        fillIfEmpty(context, 'country', profileRes.data.country);
        fillIfEmpty(context, 'device_type', profileRes.data.device_type);
        fillIfEmpty(context, 'browser', profileRes.data.browser);
        fillIfEmpty(context, 'traffic_source', profileRes.data.traffic_source);
      }

      var leadRes = await supabase
        .from('newsletter_subscribers')
        .select('email,country')
        .eq('visitor_id', visitorId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!leadRes.error && leadRes.data) {
        fillIfEmpty(context, 'customer_email', leadRes.data.email);
        fillIfEmpty(context, 'country', leadRes.data.country);
      }

      if (!sessionId) {
        var latestSession = await supabase
          .from('sessions')
          .select('country,device_type,browser,traffic_source,referrer')
          .eq('visitor_id', visitorId)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!latestSession.error && latestSession.data) {
          fillIfEmpty(context, 'country', latestSession.data.country);
          fillIfEmpty(context, 'device_type', latestSession.data.device_type);
          fillIfEmpty(context, 'browser', latestSession.data.browser);
          fillIfEmpty(context, 'traffic_source', latestSession.data.traffic_source);
          fillIfEmpty(context, 'referrer', latestSession.data.referrer);
        }
      }
    }
  } catch (_) {}

  if (context.traffic_source && CustomerActivity.normalizeSource) {
    context.traffic_source = CustomerActivity.normalizeSource(context.traffic_source);
  }

  return context;
}

async function buildPatch(supabase, payload, existing) {
  var patch = { updated_at: nowIso(), last_event_at: nowIso() };
  var nextStatus = deriveStatusFromPayload(payload);
  var currentStatus = existing ? normalizeStatus(existing.status) : 'started';

  if (!existing) {
    patch.status = nextStatus;
  } else if (currentStatus === 'purchased') {
    patch.status = 'purchased';
  } else if (shouldUpgrade(currentStatus, nextStatus)) {
    patch.status = nextStatus;
  } else {
    patch.status = currentStatus;
  }

  if (payload.visitorId) patch.visitor_id = String(payload.visitorId).slice(0, 64);
  if (payload.sessionId) patch.analytics_session_id = String(payload.sessionId).slice(0, 64);
  if (payload.cartId) patch.cart_id = String(payload.cartId).slice(0, 64);
  if (payload.vehicleModel != null) patch.vehicle_model = sanitizeText(payload.vehicleModel, 160);
  if (payload.lightingPreference != null) {
    patch.lighting_preference = sanitizeText(payload.lightingPreference, 240);
  }
  if (payload.size) patch.size = sanitizeText(payload.size, 32);
  if (payload.powerType) patch.power_type = sanitizeText(payload.powerType, 32);
  if (payload.pageUrl) patch.page_url = sanitizeText(payload.pageUrl, 500);
  if (Number.isFinite(Number(payload.cartValueCents))) {
    patch.cart_value_cents = Math.max(0, Math.round(Number(payload.cartValueCents)));
  }

  var photos = normalizePhotos(payload.photos || payload.uploadedPhotos);
  if (photos.length) {
    patch.uploaded_photos = photos;
    if (patch.status !== 'purchased' && shouldUpgrade(patch.status, 'uploaded')) {
      patch.status = 'uploaded';
    }
  } else if (existing && Array.isArray(existing.uploaded_photos) && existing.uploaded_photos.length) {
    patch.uploaded_photos = existing.uploaded_photos;
  } else {
    patch.uploaded_photos = [];
  }

  if (sanitizeText(payload.vehicleModel, 160) && patch.status !== 'purchased') {
    if (shouldUpgrade(patch.status, 'configured')) patch.status = 'configured';
  }

  var client = await resolveClientContext(supabase, payload, existing);
  if (client.customer_email) patch.customer_email = client.customer_email;
  if (client.customer_name) patch.customer_name = client.customer_name;
  if (client.country) patch.country = client.country;
  if (client.device_type) patch.device_type = client.device_type;
  if (client.browser) patch.browser = client.browser;
  if (client.traffic_source) patch.traffic_source = client.traffic_source;
  if (client.referrer) patch.referrer = client.referrer;

  return patch;
}

/**
 * When a Custom Made lead has an email, ensure they exist as an email lead
 * (source=custom_made) and enroll Welcome if they are not already in a journey.
 */
async function ensureWelcomeFromCustomLead(supabase, leadRow) {
  if (!supabase || !leadRow) return null;
  var Newsletter = require('./newsletter.js');
  var email = Newsletter.normalizeEmail(leadRow.customer_email);
  if (!Newsletter.isValidEmail(email)) return null;

  try {
    await Newsletter.ensureDiscountCode(supabase);
  } catch (_) {}

  var lookup = await supabase
    .from('newsletter_subscribers')
    .select(
      'id, email, discount_code, status, current_journey_id, visitor_id, session_id, source, created_at'
    )
    .ilike('email', email)
    .maybeSingle();
  if (lookup.error) throw lookup.error;

  var lead = lookup.data || null;
  var created = false;

  if (!lead) {
    var insertPayload = {
      email: email,
      language: 'en',
      discount_code: Newsletter.DISCOUNT_CODE,
      source: 'custom_made',
      country: leadRow.country ? String(leadRow.country).toUpperCase().slice(0, 2) : null,
      device: leadRow.device_type || null,
      browser: leadRow.browser || null,
      status: 'active',
      used_discount: false,
      visitor_id: leadRow.visitor_id ? String(leadRow.visitor_id).slice(0, 80) : null,
      session_id: leadRow.analytics_session_id
        ? String(leadRow.analytics_session_id).slice(0, 80)
        : null
    };
    var inserted = await supabase
      .from('newsletter_subscribers')
      .insert(insertPayload)
      .select('id, email, discount_code, status, current_journey_id, visitor_id, session_id, source, created_at')
      .single();
    if (inserted.error) {
      if (String(inserted.error.code) === '23505' || /duplicate|unique/i.test(String(inserted.error.message || ''))) {
        var again = await supabase
          .from('newsletter_subscribers')
          .select(
            'id, email, discount_code, status, current_journey_id, visitor_id, session_id, source, created_at'
          )
          .ilike('email', email)
          .maybeSingle();
        if (again.error) throw again.error;
        lead = again.data;
      } else {
        throw inserted.error;
      }
    } else {
      lead = inserted.data;
      created = true;
      try {
        await CustomerActivity.mergeProfileFromLead(supabase, Object.assign({}, insertPayload, lead));
      } catch (_) {}
    }
  } else {
    var recognition = { status: 'active' };
    if (!lead.visitor_id && leadRow.visitor_id) {
      recognition.visitor_id = String(leadRow.visitor_id).slice(0, 80);
    }
    if (!lead.session_id && leadRow.analytics_session_id) {
      recognition.session_id = String(leadRow.analytics_session_id).slice(0, 80);
    }
    if (Object.keys(recognition).length > 1) {
      var refreshed = await supabase
        .from('newsletter_subscribers')
        .update(recognition)
        .eq('id', lead.id)
        .select(
          'id, email, discount_code, status, current_journey_id, visitor_id, session_id, source, created_at'
        )
        .maybeSingle();
      if (!refreshed.error && refreshed.data) lead = refreshed.data;
    }
  }

  if (!lead || !lead.id) return null;
  if (lead.current_journey_id) {
    return { lead: lead, created: created, enrolled: false };
  }

  try {
    var JourneyEngine = require('./journey-engine.js');
    var enrolled = await JourneyEngine.enrollLeadOnSignup(supabase, lead);
    return {
      lead: lead,
      created: created,
      enrolled: !!(enrolled && enrolled.length)
    };
  } catch (err) {
    console.warn(
      'custom lead welcome enroll:',
      err && err.message ? err.message : err
    );
    return { lead: lead, created: created, enrolled: false };
  }
}

async function upsert(supabase, payload) {
  if (!supabase) throw new Error('Database not configured');
  var uploadSessionId = String(payload.uploadSessionId || payload.upload_session_id || '').trim();
  if (!uploadSessionId) throw new Error('uploadSessionId is required');

  var existingRes = await supabase
    .from('custom_leads')
    .select('*')
    .eq('upload_session_id', uploadSessionId)
    .maybeSingle();
  if (existingRes.error) throw existingRes.error;

  var existing = existingRes.data || null;
  var patch = await buildPatch(supabase, payload, existing);
  var row = Object.assign(
    {
      upload_session_id: uploadSessionId,
      created_at: existing ? existing.created_at : nowIso()
    },
    patch
  );

  var result = await supabase
    .from('custom_leads')
    .upsert(row, { onConflict: 'upload_session_id' })
    .select('*')
    .maybeSingle();
  if (result.error) throw result.error;

  try {
    await ensureWelcomeFromCustomLead(supabase, result.data);
  } catch (err) {
    console.warn(
      'custom lead email sync:',
      err && err.message ? err.message : err
    );
  }

  return result.data;
}

async function enrichRows(supabase, rows) {
  if (!supabase || !rows || !rows.length) return rows || [];
  var enriched = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var needs =
      !row.customer_email ||
      !row.country ||
      !row.device_type ||
      !row.browser ||
      !row.traffic_source;
    if (!needs) {
      enriched.push(row);
      continue;
    }
    var client = await resolveClientContext(
      supabase,
      {
        visitorId: row.visitor_id,
        sessionId: row.analytics_session_id,
        customerEmail: row.customer_email,
        customerName: row.customer_name,
        country: row.country,
        deviceType: row.device_type,
        browser: row.browser,
        trafficSource: row.traffic_source,
        referrer: row.referrer
      },
      row
    );
    var next = Object.assign({}, row);
    fillIfEmpty(next, 'customer_email', client.customer_email);
    fillIfEmpty(next, 'customer_name', client.customer_name);
    fillIfEmpty(next, 'country', client.country);
    fillIfEmpty(next, 'device_type', client.device_type);
    fillIfEmpty(next, 'browser', client.browser);
    fillIfEmpty(next, 'traffic_source', client.traffic_source);
    fillIfEmpty(next, 'referrer', client.referrer);

    var changed =
      next.customer_email !== row.customer_email ||
      next.customer_name !== row.customer_name ||
      next.country !== row.country ||
      next.device_type !== row.device_type ||
      next.browser !== row.browser ||
      next.traffic_source !== row.traffic_source;
    if (changed) {
      try {
        await supabase
          .from('custom_leads')
          .update({
            customer_email: next.customer_email,
            customer_name: next.customer_name,
            country: next.country,
            device_type: next.device_type,
            browser: next.browser,
            traffic_source: next.traffic_source,
            referrer: next.referrer,
            updated_at: nowIso()
          })
          .eq('id', row.id);
      } catch (_) {}
    }
    if (next.customer_email) {
      try {
        await ensureWelcomeFromCustomLead(supabase, next);
      } catch (_) {}
    }
    enriched.push(next);
  }
  return enriched;
}

async function list(supabase, query) {
  if (!supabase) throw new Error('Database not configured');
  query = query || {};
  var range = CustomerActivity.parseRange ? CustomerActivity.parseRange(query) : { start: null, end: null };
  var limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 200);
  var offset = Math.max(parseInt(query.offset, 10) || 0, 0);
  var statusFilter = String(query.status || '').trim().toLowerCase();
  var search = String(query.search || '').trim().toLowerCase();

  var request = supabase
    .from('custom_leads')
    .select('*', { count: 'exact' })
    .gte('created_at', range.start)
    .lt('created_at', range.end)
    .order('last_event_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (statusFilter && statusFilter !== 'all') {
    if (statusFilter === 'abandoned') {
      request = request.in('status', ['added_to_cart', 'checkout_started']);
    } else {
      request = request.eq('status', statusFilter);
    }
  }

  var result = await request;
  if (result.error) throw result.error;

  var rows = await enrichRows(supabase, result.data || []);
  rows = rows.map(function (row) {
    return Object.assign({}, row, {
      display_status: displayStatus(row),
      client_label: row.customer_name || row.customer_email || 'Anonymous visitor'
    });
  });

  if (statusFilter === 'abandoned') {
    rows = rows.filter(function (row) {
      return row.display_status === 'abandoned';
    });
  }

  if (search) {
    rows = rows.filter(function (row) {
      var hay = [
        row.vehicle_model,
        row.lighting_preference,
        row.customer_email,
        row.customer_name,
        row.country,
        row.device_type,
        row.browser,
        row.traffic_source,
        row.visitor_id,
        row.upload_session_id,
        row.status,
        row.display_status
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.indexOf(search) !== -1;
    });
  }

  return {
    rows: rows,
    total: result.count || rows.length,
    range: range,
    abandoned_hours: ABANDONED_HOURS
  };
}

async function markPurchased(supabase, options) {
  if (!supabase) return null;
  options = options || {};
  var stripeSessionId = options.stripeSessionId ? String(options.stripeSessionId) : '';
  var uploadSessionId = options.uploadSessionId ? String(options.uploadSessionId) : '';
  var visitorId = options.visitorId ? String(options.visitorId) : '';
  var customerEmail = options.customerEmail ? String(options.customerEmail).trim() : '';
  var customerName = options.customerName ? String(options.customerName).trim() : '';
  var orderId = options.orderId || null;
  var customOrderId = options.customOrderId || null;
  var patch = {
    status: 'purchased',
    purchased_at: nowIso(),
    updated_at: nowIso(),
    last_event_at: nowIso()
  };
  if (stripeSessionId) patch.stripe_session_id = stripeSessionId;
  if (orderId) patch.order_id = orderId;
  if (customOrderId) patch.custom_order_id = customOrderId;
  if (customerEmail) patch.customer_email = customerEmail;
  if (customerName) patch.customer_name = customerName;

  var target = null;
  if (uploadSessionId) {
    var byUpload = await supabase
      .from('custom_leads')
      .select('*')
      .eq('upload_session_id', uploadSessionId)
      .maybeSingle();
    if (!byUpload.error && byUpload.data) target = byUpload.data;
  }
  if (!target && stripeSessionId) {
    var byStripe = await supabase
      .from('custom_leads')
      .select('*')
      .eq('stripe_session_id', stripeSessionId)
      .maybeSingle();
    if (!byStripe.error && byStripe.data) target = byStripe.data;
  }
  if (!target && visitorId) {
    var byVisitor = await supabase
      .from('custom_leads')
      .select('*')
      .eq('visitor_id', visitorId)
      .in('status', ['added_to_cart', 'checkout_started', 'configured', 'uploaded'])
      .order('last_event_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!byVisitor.error && byVisitor.data) target = byVisitor.data;
  }

  if (!target) return null;

  var result = await supabase
    .from('custom_leads')
    .update(patch)
    .eq('id', target.id)
    .select('*')
    .maybeSingle();
  if (result.error) throw result.error;
  try {
    await ensureWelcomeFromCustomLead(supabase, result.data);
  } catch (err) {
    console.warn(
      'custom lead purchase email sync:',
      err && err.message ? err.message : err
    );
  }
  return result.data;
}

module.exports = {
  ABANDONED_HOURS: ABANDONED_HOURS,
  displayStatus: displayStatus,
  upsert: upsert,
  list: list,
  markPurchased: markPurchased,
  ensureWelcomeFromCustomLead: ensureWelcomeFromCustomLead
};
