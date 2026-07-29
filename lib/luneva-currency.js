/**
 * LUNEVA regional pricing — Malaysia (MYR) vs international (USD).
 */

const PROFILES = {
  usd: {
    currency: 'usd',
    kit: { '30x45': 39, '40x60': 49 },
    compare: { '30x45': 109, '40x60': 119 },
    shipping: 8.99
  },
  myr: {
    currency: 'myr',
    kit: { '30x45': 129, '40x60': 149 },
    compare: null,
    shipping: 9
  }
};

function normalizeSize(size) {
  const raw = String(size || '30x45').trim().toLowerCase();
  return raw === '40x60' ? '40x60' : '30x45';
}

function isMalaysiaCountry(country) {
  return String(country || '').trim().toUpperCase() === 'MY';
}

function getProfile(country) {
  return isMalaysiaCountry(country) ? PROFILES.myr : PROFILES.usd;
}

function kitPrice(size, country) {
  const profile = getProfile(country);
  return profile.kit[normalizeSize(size)] || profile.kit['30x45'];
}

function shippingAmount(country) {
  return getProfile(country).shipping;
}

function currencyCode(country) {
  return getProfile(country).currency;
}

function toStripeMinorUnits(amount, currency) {
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
