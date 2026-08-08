/**
 * Welcome member-pricing identity and tier service.
 *
 * ZYBAR (ZYBAR15): 15% valid for 7 days after signup.
 * LUNEVA (LUNEVA5): 15% never expires.
 * Browser state uses a signed credential; the server remains authoritative.
 */
const crypto = require('crypto');

const TOKEN_VERSION = 1;
const WELCOME_OFFER_DAYS = 7;
const TOKEN_TTL_SECONDS = WELCOME_OFFER_DAYS * 24 * 60 * 60;
/** Far-future exp for never-expiring LUNEVA credentials (2100-01-01 UTC). */
const LUNEVA_NEVER_EXPIRES_AT = 4102444800;

const TIERS = Object.freeze({
  welcome: Object.freeze({
    id: 'welcome',
    label: 'Welcome Member',
    eyebrow: 'Member Exclusive',
    benefit: 'Extra 15% Savings · Valid 7 Days After Signup',
    discountCode: 'ZYBAR15',
    percent: 15
  }),
  luneva: Object.freeze({
    id: 'luneva',
    label: 'LUNEVA Insider',
    eyebrow: 'LUNEVA Exclusive',
    benefit: 'Extra 15% Savings · Never expires · Auto at checkout',
    discountCode: 'LUNEVA5',
    percent: 15,
    neverExpires: true
  })
});

function getTiersForSubscriber(subscriber, preferredTier) {
  if (preferredTier && TIERS[preferredTier]) return TIERS[preferredTier];
  const code = String((subscriber && subscriber.discount_code) || '').toUpperCase();
  const matched = Object.keys(TIERS)
    .map(function (key) {
      return TIERS[key];
    })
    .find(function (tier) {
      return String(tier.discountCode).toUpperCase() === code;
    });
  return matched || TIERS.welcome;
}

function isNeverExpiringTier(tier) {
  return !!(tier && tier.neverExpires);
}

function getSecret(env) {
  const source = env || process.env;
  return String(
    source.MEMBER_PRICING_SECRET ||
      source.SUPABASE_SERVICE_ROLE_KEY ||
      ''
  );
}

function encode(value) {
  return Buffer.from(value).toString('base64url');
}

function sign(encodedPayload, secret) {
  return crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

function welcomeOfferExpiresAt(subscriber, preferredTier) {
  const tier = getTiersForSubscriber(subscriber, preferredTier);
  if (isNeverExpiringTier(tier)) return LUNEVA_NEVER_EXPIRES_AT;
  const createdMs = subscriber && subscriber.created_at
    ? new Date(subscriber.created_at).getTime()
    : Date.now();
  const createdSec = Math.floor(
    (Number.isFinite(createdMs) ? createdMs : Date.now()) / 1000
  );
  return createdSec + TOKEN_TTL_SECONDS;
}

function isWelcomeOfferActive(subscriber, nowSec, preferredTier) {
  const tier = getTiersForSubscriber(subscriber, preferredTier);
  if (isNeverExpiringTier(tier)) return true;
  const now = Number.isFinite(nowSec) ? nowSec : Math.floor(Date.now() / 1000);
  return welcomeOfferExpiresAt(subscriber, preferredTier) > now;
}

function issueCredential(subscriber, tierId, env) {
  if (!subscriber || !subscriber.id) return null;
  if (!isWelcomeOfferActive(subscriber, null, tierId)) return null;
  const secret = getSecret(env);
  if (!secret) return null;
  const now = Math.floor(Date.now() / 1000);
  const tier = getTiersForSubscriber(subscriber, tierId);
  const payload = {
    v: TOKEN_VERSION,
    sid: String(subscriber.id),
    tier: tier.id,
    iat: now,
    exp: welcomeOfferExpiresAt(subscriber, tierId)
  };
  const encoded = encode(JSON.stringify(payload));
  return encoded + '.' + sign(encoded, secret);
}

function verifyCredential(token, env) {
  const secret = getSecret(env);
  const parts = String(token || '').split('.');
  if (!secret || parts.length !== 2) return null;
  const expected = sign(parts[0], secret);
  const actualBuffer = Buffer.from(parts[1]);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    const tier = payload.tier ? TIERS[payload.tier] : null;
    if (
      payload.v !== TOKEN_VERSION ||
      !payload.sid ||
      !tier ||
      !Number.isFinite(payload.exp)
    ) {
      return null;
    }
    // LUNEVA credentials never expire (including older tokens issued with a 7-day exp).
    if (!isNeverExpiringTier(tier) && payload.exp <= now) {
      return null;
    }
    return payload;
  } catch (_) {
    return null;
  }
}

function publicMember(subscriber, tier, credential) {
  const neverExpires = isNeverExpiringTier(tier);
  const expiresAt = welcomeOfferExpiresAt(subscriber, tier && tier.id);
  return {
    active: true,
    tier: tier.id,
    tierLabel: tier.label,
    eyebrow: tier.eyebrow,
    benefit: tier.benefit,
    percent: tier.percent,
    discountCode: tier.discountCode,
    credential: credential,
    expiresAt: neverExpires ? null : expiresAt,
    neverExpires: neverExpires,
    validityDays: neverExpires ? null : WELCOME_OFFER_DAYS,
    validityNote: neverExpires
      ? 'LUNEVA welcome savings · never expires'
      : 'Member pricing · valid 7 days after signup'
  };
}

async function findActiveSubscriber(supabase, options, env) {
  if (!supabase) return null;
  options = options || {};
  const verified = verifyCredential(options.credential, env);

  async function lookupByIdFilters() {
    let query = supabase
      .from('newsletter_subscribers')
      .select('id, status, discount_code, visitor_id, session_id, created_at, brand, source, email');

    if (verified) {
      query = query.eq('id', verified.sid);
    } else if (options.visitorId) {
      query = query.eq('visitor_id', String(options.visitorId).slice(0, 80));
    } else if (options.sessionId) {
      query = query.eq('session_id', String(options.sessionId).slice(0, 80));
    } else {
      return null;
    }

    const result = await query.eq('status', 'active').limit(1).maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) return null;
    const preferredTier = verified && verified.tier;
    if (!isWelcomeOfferActive(result.data, null, preferredTier)) return null;
    return {
      subscriber: result.data,
      tier: getTiersForSubscriber(result.data, preferredTier)
    };
  }

  async function lookupLunevaByEmail() {
    const email = String(options.email || '')
      .trim()
      .toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
    const result = await supabase
      .from('newsletter_subscribers')
      .select('id, status, discount_code, visitor_id, session_id, created_at, brand, source, email')
      .ilike('email', email)
      .eq('status', 'active')
      .limit(5);
    if (result.error) throw result.error;
    const row = (result.data || []).find(function (r) {
      return getTiersForSubscriber(r).id === 'luneva';
    });
    if (!row) return null;
    if (!isWelcomeOfferActive(row, null, 'luneva')) return null;
    return {
      subscriber: row,
      tier: getTiersForSubscriber(row, 'luneva')
    };
  }

  const primary = await lookupByIdFilters();
  if (primary) return primary;
  // Restore never-expiring LUNEVA welcome pricing when checkout email matches.
  if (options.email) return lookupLunevaByEmail();
  return null;
}

async function resolveMember(supabase, options, env) {
  const found = await findActiveSubscriber(supabase, options, env);
  if (!found) return { active: false };
  const credential =
    issueCredential(found.subscriber, found.tier.id, env) ||
    String((options && options.credential) || '');
  if (!credential) return { active: false };
  return publicMember(found.subscriber, found.tier, credential);
}

function decorateStoreLinks(html, storeUrl, credential) {
  if (!html || !storeUrl || !credential) return html;
  const base = String(storeUrl).replace(/\/+$/, '');
  return String(html).replace(/href=(["'])(https?:\/\/[^"']+)\1/gi, function (match, quote, href) {
    if (href.indexOf(base) !== 0) return match;
    try {
      const url = new URL(href);
      url.searchParams.set('member_token', credential);
      return 'href=' + quote + url.toString() + quote;
    } catch (_) {
      return match;
    }
  });
}

module.exports = {
  TIERS,
  WELCOME_OFFER_DAYS,
  TOKEN_TTL_SECONDS,
  LUNEVA_NEVER_EXPIRES_AT,
  getTiersForSubscriber,
  // Alias used by journey/campaign template rendering (singular form).
  getTierForSubscriber: getTiersForSubscriber,
  issueCredential,
  verifyCredential,
  resolveMember,
  publicMember,
  decorateStoreLinks,
  welcomeOfferExpiresAt,
  isWelcomeOfferActive,
  isNeverExpiringTier
};
