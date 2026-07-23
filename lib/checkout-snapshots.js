/**
 * Persist full checkout cart payloads outside Stripe metadata.
 * Stripe metadata values max out at 500 characters — cart JSON must live here.
 */
'use strict';

var ProductTypes = require('./product-types.js');

var META_VALUE_MAX = 450;

function nowIso() {
  return new Date().toISOString();
}

function truncateMeta(value, maxLen) {
  var limit = typeof maxLen === 'number' ? maxLen : META_VALUE_MAX;
  var str = value == null ? '' : String(value);
  if (str.length <= limit) return str;
  return str.slice(0, limit);
}

function assertMetadataSafe(metadata) {
  var meta = metadata || {};
  var keys = Object.keys(meta);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var val = meta[key] == null ? '' : String(meta[key]);
    if (val.length > 500) {
      throw new Error(
        'Stripe metadata "' + key + '" is ' + val.length + ' chars (max 500).'
      );
    }
  }
  return meta;
}

function buildVariantDetails(lineItems) {
  if (!Array.isArray(lineItems) || !lineItems.length) return [];
  return lineItems
    .map(function (item) {
      if (!item || typeof item !== 'object') return null;
      var slug =
        typeof item.productSlug === 'string'
          ? item.productSlug.trim()
          : typeof item.slug === 'string'
            ? item.slug.trim()
            : '';
      var itemSize = typeof item.size === 'string' ? item.size.trim() : '';
      var itemPower = typeof item.powerType === 'string' ? item.powerType.trim() : 'usb';
      if (!slug && !itemSize) return null;
      return {
        productSlug: slug,
        slug: slug,
        size: itemSize,
        powerType: itemPower || 'usb',
        name: typeof item.name === 'string' ? item.name.trim() : '',
        quantity: Number(item.quantity) || 1,
        productType:
          item.productType || (ProductTypes.isCustomSlug(slug) ? 'custom' : 'standard'),
        unitAmountUSD: item.unitAmountUSD,
        baseUnitPriceUSD: item.baseUnitPriceUSD,
        customDesignFeeUSD: item.customDesignFeeUSD,
        customConfig: item.customConfig || null
      };
    })
    .filter(Boolean);
}

async function createSnapshot(supabase, options) {
  options = options || {};
  if (!supabase) return null;

  var lineItems = Array.isArray(options.lineItems)
    ? options.lineItems
    : buildVariantDetails(options.rawLineItems || []);

  var row = {
    cart_id: options.cartId || null,
    visitor_id: options.visitorId ? String(options.visitorId) : null,
    analytics_session_id: options.sessionId ? String(options.sessionId) : null,
    upload_session_id: options.uploadSessionId ? String(options.uploadSessionId) : null,
    shipping_method: options.shippingMethod ? String(options.shippingMethod) : null,
    discount_code: options.discountCode ? String(options.discountCode) : null,
    discount_usd:
      options.discountUSD != null && Number.isFinite(Number(options.discountUSD))
        ? Number(options.discountUSD)
        : null,
    line_items: lineItems,
    stripe_session_id: options.stripeSessionId || null,
    updated_at: nowIso()
  };

  var result = await supabase.from('checkout_snapshots').insert(row).select('id').maybeSingle();
  if (result.error) throw result.error;
  return result.data && result.data.id ? String(result.data.id) : null;
}

async function attachStripeSession(supabase, snapshotId, stripeSessionId) {
  if (!supabase || !snapshotId || !stripeSessionId) return;
  await supabase
    .from('checkout_snapshots')
    .update({
      stripe_session_id: String(stripeSessionId),
      updated_at: nowIso()
    })
    .eq('id', String(snapshotId));
}

async function getById(supabase, snapshotId) {
  if (!supabase || !snapshotId) return null;
  var result = await supabase
    .from('checkout_snapshots')
    .select('*')
    .eq('id', String(snapshotId))
    .maybeSingle();
  if (result.error || !result.data) return null;
  return result.data;
}

async function getByStripeSessionId(supabase, stripeSessionId) {
  if (!supabase || !stripeSessionId) return null;
  var result = await supabase
    .from('checkout_snapshots')
    .select('*')
    .eq('stripe_session_id', String(stripeSessionId))
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error || !result.data) return null;
  return result.data;
}

async function getByCartId(supabase, cartId) {
  if (!supabase || !cartId) return null;
  var result = await supabase
    .from('checkout_snapshots')
    .select('*')
    .eq('cart_id', String(cartId))
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error || !result.data) return null;
  return result.data;
}

/**
 * Resolve line items for a paid Checkout Session.
 * Prefer DB snapshot; fall back to legacy metadata.variantDetails.
 */
async function resolveLineItemsForSession(supabase, session) {
  var meta = (session && session.metadata) || {};
  var snapshot = null;

  if (meta.checkoutSnapshotId) {
    snapshot = await getById(supabase, meta.checkoutSnapshotId);
  }
  if (!snapshot && session && session.id) {
    snapshot = await getByStripeSessionId(supabase, session.id);
  }
  if (!snapshot && meta.cartId) {
    snapshot = await getByCartId(supabase, meta.cartId);
  }

  if (snapshot && Array.isArray(snapshot.line_items) && snapshot.line_items.length) {
    return { lineItems: snapshot.line_items, snapshot: snapshot, source: 'snapshot' };
  }

  try {
    if (meta.variantDetails) {
      var parsed = JSON.parse(meta.variantDetails);
      if (Array.isArray(parsed) && parsed.length) {
        return { lineItems: parsed, snapshot: null, source: 'legacy_metadata' };
      }
    }
  } catch (_) {}

  return { lineItems: [], snapshot: snapshot, source: 'none' };
}

module.exports = {
  META_VALUE_MAX: META_VALUE_MAX,
  truncateMeta: truncateMeta,
  assertMetadataSafe: assertMetadataSafe,
  buildVariantDetails: buildVariantDetails,
  createSnapshot: createSnapshot,
  attachStripeSession: attachStripeSession,
  getById: getById,
  getByStripeSessionId: getByStripeSessionId,
  getByCartId: getByCartId,
  resolveLineItemsForSession: resolveLineItemsForSession
};
