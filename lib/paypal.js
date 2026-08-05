/**
 * PayPal Orders API v2 — create + capture for store checkout.
 *
 * Env:
 *   PAYPAL_CLIENT_ID
 *   PAYPAL_CLIENT_SECRET
 *   PAYPAL_MODE — sandbox | live (default sandbox)
 */

'use strict';

function configured() {
  return Boolean(
    String(process.env.PAYPAL_CLIENT_ID || '').trim() &&
      String(process.env.PAYPAL_CLIENT_SECRET || '').trim()
  );
}

function clientId() {
  return String(process.env.PAYPAL_CLIENT_ID || '').trim();
}

function mode() {
  const m = String(process.env.PAYPAL_MODE || 'sandbox').trim().toLowerCase();
  return m === 'live' ? 'live' : 'sandbox';
}

function apiBase() {
  return mode() === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

let cachedToken = null;
let cachedTokenExpiresAt = 0;

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpiresAt - 60000) {
    return cachedToken;
  }
  const id = clientId();
  const secret = String(process.env.PAYPAL_CLIENT_SECRET || '').trim();
  if (!id || !secret) {
    throw new Error('PayPal is not configured');
  }
  const auth = Buffer.from(id + ':' + secret).toString('base64');
  const res = await fetch(apiBase() + '/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + auth,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  const body = await res.json().catch(function () {
    return {};
  });
  if (!res.ok || !body.access_token) {
    throw new Error(
      (body && body.error_description) || (body && body.error) || 'PayPal auth failed'
    );
  }
  cachedToken = body.access_token;
  const expiresIn = Number(body.expires_in) || 300;
  cachedTokenExpiresAt = now + expiresIn * 1000;
  return cachedToken;
}

async function paypalFetch(path, options) {
  options = options || {};
  const token = await getAccessToken();
  const res = await fetch(apiBase() + path, {
    method: options.method || 'GET',
    headers: Object.assign(
      {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      options.headers || {}
    ),
    body: options.body != null ? JSON.stringify(options.body) : undefined
  });
  const body = await res.json().catch(function () {
    return {};
  });
  if (!res.ok) {
    const msg =
      (body && body.message) ||
      (body && body.error_description) ||
      (body && body.name) ||
      'PayPal request failed';
    const err = new Error(msg);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

function formatPayPalAmount(amountMajor) {
  const n = Number(amountMajor);
  if (!Number.isFinite(n) || n < 0) return '0.00';
  return n.toFixed(2);
}

/**
 * @param {object} opts
 * @param {string} opts.currency — usd | myr
 * @param {number} opts.amountMajor — total in major units
 * @param {string} [opts.description]
 * @param {string} [opts.customId] — checkout snapshot id
 * @param {string} [opts.invoiceId]
 * @param {object} [opts.shipping] — { name, address: { line1, line2, city, state, postal_code, country_code } }
 */
async function createOrder(opts) {
  opts = opts || {};
  const currency = String(opts.currency || 'usd').toUpperCase();
  const amount = formatPayPalAmount(opts.amountMajor);
  const purchaseUnit = {
    amount: {
      currency_code: currency,
      value: amount
    },
    description: String(opts.description || 'ZYBAR order').slice(0, 127)
  };
  if (opts.customId) purchaseUnit.custom_id = String(opts.customId).slice(0, 127);
  if (opts.invoiceId) purchaseUnit.invoice_id = String(opts.invoiceId).slice(0, 127);
  if (opts.shipping && opts.shipping.name && opts.shipping.address) {
    purchaseUnit.shipping = {
      name: { full_name: String(opts.shipping.name).slice(0, 300) },
      address: {
        address_line_1: String(opts.shipping.address.line1 || '').slice(0, 300),
        address_line_2: opts.shipping.address.line2
          ? String(opts.shipping.address.line2).slice(0, 300)
          : undefined,
        admin_area_2: String(opts.shipping.address.city || '').slice(0, 120),
        admin_area_1: opts.shipping.address.state
          ? String(opts.shipping.address.state).slice(0, 120)
          : undefined,
        postal_code: String(opts.shipping.address.postal_code || '').slice(0, 60),
        country_code: String(opts.shipping.address.country_code || 'US')
          .toUpperCase()
          .slice(0, 2)
      }
    };
  }

  return paypalFetch('/v2/checkout/orders', {
    method: 'POST',
    body: {
      intent: 'CAPTURE',
      purchase_units: [purchaseUnit],
      application_context: {
        shipping_preference: opts.shipping ? 'SET_PROVIDED_ADDRESS' : 'GET_FROM_FILE',
        user_action: 'PAY_NOW',
        brand_name: opts.brandName || 'ZYBAR'
      }
    }
  });
}

async function captureOrder(orderId) {
  return paypalFetch('/v2/checkout/orders/' + encodeURIComponent(orderId) + '/capture', {
    method: 'POST',
    body: {}
  });
}

async function getOrder(orderId) {
  return paypalFetch('/v2/checkout/orders/' + encodeURIComponent(orderId), {
    method: 'GET'
  });
}

function capturePaid(captureResult) {
  if (!captureResult) return false;
  const status = String(captureResult.status || '').toUpperCase();
  if (status === 'COMPLETED') return true;
  const units = captureResult.purchase_units || [];
  for (let i = 0; i < units.length; i++) {
    const captures =
      units[i] && units[i].payments && units[i].payments.captures
        ? units[i].payments.captures
        : [];
    for (let j = 0; j < captures.length; j++) {
      if (String(captures[j].status || '').toUpperCase() === 'COMPLETED') return true;
    }
  }
  return false;
}

function extractCaptureAmount(captureResult) {
  const units = (captureResult && captureResult.purchase_units) || [];
  for (let i = 0; i < units.length; i++) {
    const captures =
      units[i] && units[i].payments && units[i].payments.captures
        ? units[i].payments.captures
        : [];
    if (captures[0] && captures[0].amount) {
      return {
        currency: String(captures[0].amount.currency_code || 'USD').toLowerCase(),
        value: Number(captures[0].amount.value) || 0
      };
    }
  }
  const unitAmount =
    units[0] && units[0].amount
      ? units[0].amount
      : null;
  if (unitAmount) {
    return {
      currency: String(unitAmount.currency_code || 'USD').toLowerCase(),
      value: Number(unitAmount.value) || 0
    };
  }
  return { currency: 'usd', value: 0 };
}

function extractPayer(captureResult) {
  const payer = (captureResult && captureResult.payer) || {};
  const nameParts = [];
  if (payer.name && payer.name.given_name) nameParts.push(payer.name.given_name);
  if (payer.name && payer.name.surname) nameParts.push(payer.name.surname);
  return {
    email: payer.email_address || null,
    name: nameParts.length ? nameParts.join(' ') : null,
    payerId: payer.payer_id || null
  };
}

function extractShipping(captureResult) {
  const units = (captureResult && captureResult.purchase_units) || [];
  const shipping = units[0] && units[0].shipping ? units[0].shipping : null;
  if (!shipping) return null;
  const addr = shipping.address || {};
  return {
    name: (shipping.name && shipping.name.full_name) || null,
    line1: addr.address_line_1 || null,
    line2: addr.address_line_2 || null,
    city: addr.admin_area_2 || null,
    state: addr.admin_area_1 || null,
    postcode: addr.postal_code || null,
    country: addr.country_code || null
  };
}

module.exports = {
  configured: configured,
  clientId: clientId,
  mode: mode,
  createOrder: createOrder,
  captureOrder: captureOrder,
  getOrder: getOrder,
  capturePaid: capturePaid,
  extractCaptureAmount: extractCaptureAmount,
  extractPayer: extractPayer,
  extractShipping: extractShipping,
  formatPayPalAmount: formatPayPalAmount
};
