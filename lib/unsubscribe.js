/**
 * One-click unsubscribe (RFC 8058) for ZYBAR marketing email.
 *
 * Links carry a signed token so a recipient can only unsubscribe their own
 * address, and the whole payload sits in a single query parameter so the same
 * URL is safe to drop into both an HTML href and a List-Unsubscribe header
 * without escaping differences.
 */
const crypto = require('crypto');

const DEFAULT_STORE_URL = 'https://www.zybar.shop';
const SUPPORT_EMAIL = 'support@zybar.shop';
const MAILTO_UNSUBSCRIBE =
  'mailto:' + SUPPORT_EMAIL + '?subject=Unsubscribe&body=Please%20unsubscribe%20me%20from%20ZYBAR%20emails.';
const SIGNATURE_LENGTH = 32;

/**
 * Templates embed this instead of a finished link, so a single rendered body
 * can be personalised per recipient at send time.
 */
const PLACEHOLDER = /\{\{\s*unsubscribe_url\s*\}\}/gi;

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

function storeUrl(env) {
  const e = env || process.env;
  return String((e && e.STORE_URL) || DEFAULT_STORE_URL).replace(/\/+$/, '');
}

/**
 * Any of these are always present server-side, so unsubscribe links keep
 * working without adding a new required env var.
 */
function getSecret(env) {
  const e = env || process.env;
  return String(
    (e && (e.UNSUBSCRIBE_SECRET || e.ADMIN_SESSION_SECRET || e.CRON_SECRET || e.SUPABASE_SERVICE_ROLE_KEY)) || ''
  );
}

function toBase64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64Url(input) {
  const padded = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64').toString('utf8');
}

function sign(email, secret) {
  return toBase64Url(
    crypto.createHmac('sha256', secret).update('zybar:unsubscribe:' + email).digest()
  ).slice(0, SIGNATURE_LENGTH);
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/**
 * Opaque single-parameter payload: "<base64url(email)>.<signature>".
 */
function buildToken(email, env) {
  const address = normalizeEmail(email);
  const secret = getSecret(env);
  if (!address || !secret) return '';
  return toBase64Url(address) + '.' + sign(address, secret);
}

/** @returns {string} the verified email address, or '' when the token is invalid. */
function verifyToken(token, env) {
  const raw = String(token || '');
  const dot = raw.lastIndexOf('.');
  const secret = getSecret(env);
  if (dot <= 0 || !secret) return '';

  let address = '';
  try {
    address = normalizeEmail(fromBase64Url(raw.slice(0, dot)));
  } catch (_) {
    return '';
  }
  if (!address) return '';

  return safeEqual(raw.slice(dot + 1), sign(address, secret)) ? address : '';
}

function buildUrl(email, env) {
  const token = buildToken(email, env);
  if (!token) return '';
  return storeUrl(env) + '/api/unsubscribe?u=' + token;
}

/** Swap {{unsubscribe_url}} for a real link, falling back to the support mailto. */
function applyUrlToHtml(html, url) {
  return String(html || '').replace(PLACEHOLDER, url || MAILTO_UNSUBSCRIBE);
}

/**
 * List-Unsubscribe plus the RFC 8058 one-click header. Gmail and Yahoo bulk
 * sender rules require both, and the mailto is kept as a fallback for clients
 * that do not support one-click.
 */
function buildHeaders(email, env) {
  const url = buildUrl(email, env);
  if (!url) return {};
  return {
    'List-Unsubscribe': '<' + url + '>, <' + MAILTO_UNSUBSCRIBE + '>',
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
  };
}

/**
 * Suppress the address and stop anything already queued for it.
 * Idempotent: repeat calls on an already-unsubscribed address still succeed.
 */
async function unsubscribeLead(supabase, email) {
  const address = normalizeEmail(email);
  if (!supabase || !address) return { ok: false, error: 'Missing email' };

  const now = new Date().toISOString();
  const leadResult = await supabase
    .from('newsletter_subscribers')
    .select('id, email, status')
    .ilike('email', address)
    .maybeSingle();
  if (leadResult.error) throw leadResult.error;

  const lead = leadResult.data;
  if (!lead) return { ok: true, email: address, found: false };

  if (lead.status !== 'unsubscribed') {
    const update = await supabase
      .from('newsletter_subscribers')
      .update({ status: 'unsubscribed', journey_status: 'cancelled' })
      .eq('id', lead.id);
    if (update.error) throw update.error;
  }

  await supabase
    .from('action_queue')
    .update({
      status: 'cancelled',
      error_message: 'Cancelled because the recipient unsubscribed',
      updated_at: now
    })
    .eq('lead_id', lead.id)
    .eq('status', 'pending');

  await supabase
    .from('lead_journeys')
    .update({ status: 'cancelled', completed_at: now, updated_at: now })
    .eq('lead_id', lead.id)
    .in('status', ['waiting', 'ready']);

  return { ok: true, email: address, found: true };
}

module.exports = {
  MAILTO_UNSUBSCRIBE,
  SUPPORT_EMAIL,
  PLACEHOLDER,
  normalizeEmail,
  buildToken,
  verifyToken,
  buildUrl,
  buildHeaders,
  applyUrlToHtml,
  unsubscribeLead
};
