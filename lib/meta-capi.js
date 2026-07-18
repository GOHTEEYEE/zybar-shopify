/**
 * Meta Conversions API (CAPI) — server-side Purchase for Zybar.
 *
 * Env:
 *   META_PIXEL_ID          — same as browser Pixel ID
 *   META_CAPI_ACCESS_TOKEN — Events Manager → Settings → Generate access token
 *   META_TEST_EVENT_CODE   — optional (Test Events tab)
 *   META_CAPI_API_VERSION  — optional, default v21.0
 */
const crypto = require('crypto');

const DEFAULT_PIXEL_ID = '1576915907443589';

function configured() {
  const token = String(process.env.META_CAPI_ACCESS_TOKEN || '').trim();
  const pixelId = String(process.env.META_PIXEL_ID || DEFAULT_PIXEL_ID).trim();
  return Boolean(token && /^\d{5,20}$/.test(pixelId));
}

function sha256(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (!normalized) return null;
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

function sha256Phone(phone) {
  // Digits only, keep leading country code if present
  const digits = String(phone || '').replace(/\D+/g, '');
  if (!digits || digits.length < 7) return null;
  return crypto.createHash('sha256').update(digits, 'utf8').digest('hex');
}

function splitName(fullName) {
  const parts = String(fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return { first: null, last: null };
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

function buildUserData(opts) {
  opts = opts || {};
  const nameParts = splitName(opts.customer_name);
  const user = {};

  const em = sha256(opts.customer_email);
  if (em) user.em = [em];

  const ph = sha256Phone(opts.customer_phone);
  if (ph) user.ph = [ph];

  const fn = sha256(nameParts.first);
  if (fn) user.fn = [fn];

  const ln = sha256(nameParts.last);
  if (ln) user.ln = [ln];

  const ct = sha256(opts.city);
  if (ct) user.ct = [ct];

  const st = sha256(opts.state);
  if (st) user.st = [st];

  const zp = sha256(opts.postcode);
  if (zp) user.zp = [zp];

  const country = sha256(opts.country);
  if (country) user.country = [country];

  if (opts.client_ip_address) user.client_ip_address = String(opts.client_ip_address).trim();
  if (opts.client_user_agent) user.client_user_agent = String(opts.client_user_agent).trim();
  if (opts.fbp) user.fbp = String(opts.fbp).trim();
  if (opts.fbc) user.fbc = String(opts.fbc).trim();

  // External id helps match returning buyers (visitor id)
  const external = sha256(opts.visitor_id);
  if (external) user.external_id = [external];

  return user;
}

function contentIdsFromSession(session) {
  const meta = (session && session.metadata) || {};
  const ids = [];
  if (meta.productSlug) ids.push(String(meta.productSlug));
  try {
    if (meta.variantDetails) {
      const rows = JSON.parse(meta.variantDetails);
      if (Array.isArray(rows)) {
        rows.forEach(function (row) {
          if (row && row.productSlug) ids.push(String(row.productSlug));
        });
      }
    }
  } catch (_) {}
  return Array.from(new Set(ids.filter(Boolean)));
}

function purchaseEventId(sessionId) {
  return 'purchase:' + String(sessionId || '');
}

/**
 * Send Purchase via Conversions API. Dedupes with browser Pixel using same event_id.
 */
async function sendPurchaseFromCheckoutSession(session, extras) {
  extras = extras || {};
  if (!configured()) {
    return { ok: false, skipped: true, reason: 'not_configured' };
  }
  if (!session || !session.id) {
    return { ok: false, skipped: true, reason: 'missing_session' };
  }

  const pixelId = String(process.env.META_PIXEL_ID || DEFAULT_PIXEL_ID).trim();
  const token = String(process.env.META_CAPI_ACCESS_TOKEN || '').trim();
  const apiVersion = String(process.env.META_CAPI_API_VERSION || 'v21.0').trim();
  const meta = session.metadata || {};
  const customer = extras.customer || {};

  const amountCents =
    typeof session.amount_total === 'number'
      ? session.amount_total
      : Number(extras.amount_cents) || 0;
  const currency = String(session.currency || 'usd').toLowerCase();
  const contentIds = contentIdsFromSession(session);
  const qty = parseInt(meta.quantity, 10);
  const numItems = Number.isFinite(qty) && qty > 0 ? qty : 1;

  const eventSourceUrl =
    extras.event_source_url ||
    meta.eventSourceUrl ||
    process.env.STORE_URL ||
    'https://www.zybar.shop/purchase-confirmation.html';

  const payload = {
    data: [
      {
        event_name: 'Purchase',
        event_time: Math.floor(Date.now() / 1000),
        event_id: purchaseEventId(session.id),
        event_source_url: String(eventSourceUrl),
        action_source: 'website',
        user_data: buildUserData({
          customer_email: customer.customer_email || session.customer_email,
          customer_phone: customer.customer_phone,
          customer_name: customer.customer_name,
          city: customer.city,
          state: customer.state,
          postcode: customer.postcode,
          country: customer.country,
          client_ip_address: extras.client_ip_address || meta.clientIp || null,
          client_user_agent: extras.client_user_agent || meta.clientUserAgent || null,
          fbp: extras.fbp || meta.fbp || null,
          fbc: extras.fbc || meta.fbc || null,
          visitor_id: meta.visitorId || null
        }),
        custom_data: {
          currency: currency,
          value: Math.round(amountCents) / 100,
          content_type: 'product',
          content_ids: contentIds.length ? contentIds : undefined,
          num_items: numItems,
          order_id: session.id
        }
      }
    ]
  };

  const testCode = String(process.env.META_TEST_EVENT_CODE || '').trim();
  if (testCode) payload.test_event_code = testCode;

  const url =
    'https://graph.facebook.com/' +
    apiVersion +
    '/' +
    encodeURIComponent(pixelId) +
    '/events?access_token=' +
    encodeURIComponent(token);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const body = await res.json().catch(function () {
      return {};
    });
    if (!res.ok) {
      console.error('Meta CAPI Purchase failed:', res.status, body);
      return { ok: false, status: res.status, body: body };
    }
    console.log('Meta CAPI Purchase sent:', session.id, body && body.events_received);
    return { ok: true, body: body };
  } catch (err) {
    console.error('Meta CAPI Purchase exception:', err && err.message ? err.message : err);
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

module.exports = {
  configured: configured,
  purchaseEventId: purchaseEventId,
  sendPurchaseFromCheckoutSession: sendPurchaseFromCheckoutSession
};
