/**
 * LUNEVA pricing — USD worldwide (no regional MYR override).
 */

const PROFILES = {
  usd: {
    currency: 'usd',
    kit: { '30x45': 59, '40x60': 69 },
    compare: { '30x45': 109, '40x60': 119 },
    shipping: 0
  }
};

function normalizeSize(size) {
  const raw = String(size || '30x45').trim().toLowerCase();
  return raw === '40x60' ? '40x60' : '30x45';
}

function isMalaysiaCountry() {
  return false;
}

function getProfile() {
  return PROFILES.usd;
}

function kitPrice(size) {
  const profile = getProfile();
  return profile.kit[normalizeSize(size)] || profile.kit['30x45'];
}

function shippingAmount() {
  return getProfile().shipping;
}

function currencyCode() {
  return getProfile().currency;
}

function toStripeMinorUnits(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * 100);
}

module.exports = {
  PROFILES,
  normalizeSize,
  isMalaysiaCountry,
  getProfile,
  kitPrice,
  shippingAmount,
  currencyCode,
  toStripeMinorUnits
};
