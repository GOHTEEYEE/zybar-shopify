/**
 * Internal production-test discount (hidden from storefront catalog).
 * Code: DEVTEST99 — 99% off products + shipping (+ eligible charges in the session).
 * Only authorized emails in DEVTEST_DISCOUNT_EMAILS may use it.
 */
'use strict';

var CODE = 'DEVTEST99';
var PERCENT_OFF = 99;
var DEFAULT_EMAILS = [
  'teeyeegoh@gmail.com',
  'support@zybar.shop',
  'zybar.info@gmail.com'
];

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

function normalizeCode(code) {
  return String(code || '')
    .trim()
    .toUpperCase();
}

function parseWhitelist(env) {
  env = env || process.env || {};
  var raw = String(env.DEVTEST_DISCOUNT_EMAILS || '').trim();
  var list = raw
    ? raw.split(/[,;\s]+/).map(normalizeEmail).filter(Boolean)
    : DEFAULT_EMAILS.slice();
  // Always keep defaults as a safety net unless explicitly emptied with "none".
  if (raw.toLowerCase() === 'none') return [];
  var seen = {};
  var out = [];
  list.concat(DEFAULT_EMAILS).forEach(function (email) {
    if (!email || seen[email]) return;
    seen[email] = true;
    out.push(email);
  });
  return out;
}

function isWhitelisted(email, env) {
  var normalized = normalizeEmail(email);
  if (!normalized || normalized.indexOf('@') === -1) return false;
  return parseWhitelist(env).indexOf(normalized) !== -1;
}

function isDevtestCode(code) {
  return normalizeCode(code) === CODE;
}

/**
 * Resolve DEVTEST99 for checkout. Returns null when not applicable
 * (wrong code, missing email, or email not on the whitelist).
 * Never reveals whether the code exists to unauthorized callers.
 */
function resolve(code, email, env) {
  if (!isDevtestCode(code)) return null;
  if (!isWhitelisted(email, env)) return null;
  return {
    code: CODE,
    percentOff: PERCENT_OFF,
    label: 'Internal Test Discount',
    email: normalizeEmail(email)
  };
}

function discountAmountUSD(orderTotalUSD, percentOff) {
  var total = Math.round(Number(orderTotalUSD || 0) * 100) / 100;
  var pct = Number(percentOff);
  if (!(total > 0) || !Number.isFinite(pct) || pct <= 0) return 0;
  return Math.round(total * (pct / 100) * 100) / 100;
}

module.exports = {
  CODE: CODE,
  PERCENT_OFF: PERCENT_OFF,
  DEFAULT_EMAILS: DEFAULT_EMAILS,
  normalizeEmail: normalizeEmail,
  normalizeCode: normalizeCode,
  parseWhitelist: parseWhitelist,
  isWhitelisted: isWhitelisted,
  isDevtestCode: isDevtestCode,
  resolve: resolve,
  discountAmountUSD: discountAmountUSD
};
