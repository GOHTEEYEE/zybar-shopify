/**
 * Custom Made lead tracking — uploads, cart, checkout, purchase.
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

function buildPatch(payload, existing) {
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
  if (payload.country) patch.country = sanitizeText(payload.country, 8);
  if (payload.deviceType) patch.device_type = sanitizeText(payload.deviceType, 32);
  if (payload.referrer) patch.referrer = sanitizeText(payload.referrer, 500);
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

  return patch;
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
  var patch = buildPatch(payload, existing);
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
  return result.data;
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

  var rows = (result.data || []).map(function (row) {
    var item = Object.assign({}, row, {
      display_status: displayStatus(row)
    });
    return item;
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
  return result.data;
}

module.exports = {
  ABANDONED_HOURS: ABANDONED_HOURS,
  displayStatus: displayStatus,
  upsert: upsert,
  list: list,
  markPurchased: markPurchased
};
