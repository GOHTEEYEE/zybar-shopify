/**
 * Custom order persistence and admin workflow helpers.
 */
'use strict';

var ProductTypes = require('./product-types.js');

var DESIGN_STATUS_LABELS = {
  pending_review: 'Pending Review',
  designing: 'Designing',
  waiting_for_approval: 'Waiting For Approval',
  approved: 'Approved',
  producing: 'Producing',
  quality_check: 'Quality Check',
  shipped: 'Shipped'
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeDesignStatus(status) {
  var value = String(status || 'pending_review').trim().toLowerCase();
  var allowed = ProductTypes.PRODUCT_TYPES.custom.designStatuses;
  return allowed.indexOf(value) !== -1 ? value : 'pending_review';
}

function designStatusLabel(status) {
  return DESIGN_STATUS_LABELS[normalizeDesignStatus(status)] || status;
}

function buildCustomOrderRow(options) {
  options = options || {};
  var config = ProductTypes.normalizeCustomConfig(options.customConfig || options);
  var fee = Number(options.customDesignFeeUsd);
  if (!Number.isFinite(fee) || fee < 0) {
    fee = ProductTypes.DEFAULT_CUSTOM_DESIGN_FEE_USD;
  }
  return {
    order_id: options.orderId || null,
    stripe_session_id: options.stripeSessionId || null,
    product_slug: options.productSlug || ProductTypes.CUSTOM_SLUG,
    product_type: options.productType || 'custom',
    customer_email: options.customerEmail || null,
    customer_name: options.customerName || null,
    vehicle_brand: config.vehicleBrand || null,
    vehicle_model: config.vehicleModel || null,
    vehicle_year: config.vehicleYear || null,
    special_requests: config.specialRequests || null,
    uploaded_photos: config.photos || [],
    custom_design_fee_usd: fee,
    size: options.size || null,
    power_type: options.powerType || null,
    design_status: normalizeDesignStatus(options.designStatus),
    estimated_completion_at: options.estimatedCompletionAt || null,
    tracking_number: options.trackingNumber || null,
    admin_notes: options.adminNotes || null,
    updated_at: nowIso()
  };
}

async function createFromLineItem(supabase, orderRow, lineItem) {
  if (!supabase || !orderRow || !lineItem) return null;
  var slug = lineItem.productSlug || lineItem.slug || '';
  if (!ProductTypes.isCustomSlug(slug) && lineItem.productType !== 'custom') return null;

  var row = buildCustomOrderRow({
    orderId: orderRow.id,
    stripeSessionId: orderRow.stripe_session_id,
    productSlug: slug,
    productType: lineItem.productType || 'custom',
    customerEmail: orderRow.customer_email,
    customerName: orderRow.customer_name,
    customConfig: lineItem.customConfig,
    customDesignFeeUsd: lineItem.customDesignFeeUSD,
    size: lineItem.size,
    powerType: lineItem.powerType
  });

  var result = await supabase.from('custom_orders').insert(row).select('*').maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}

async function syncFromPaidSession(supabase, session, orderRow) {
  if (!supabase || !orderRow) return [];
  var lineItems = [];
  try {
    if (session && session.metadata && session.metadata.variantDetails) {
      lineItems = JSON.parse(session.metadata.variantDetails);
    }
  } catch (_) {
    lineItems = Array.isArray(orderRow.line_items) ? orderRow.line_items : [];
  }
  if (!Array.isArray(lineItems) || !lineItems.length) {
    lineItems = Array.isArray(orderRow.line_items) ? orderRow.line_items : [];
  }

  var created = [];
  for (var i = 0; i < lineItems.length; i++) {
    var li = lineItems[i];
    if (!li) continue;
    var slug = li.productSlug || li.slug || '';
    if (!ProductTypes.isCustomSlug(slug) && li.productType !== 'custom') continue;
    var existing = await supabase
      .from('custom_orders')
      .select('id')
      .eq('stripe_session_id', orderRow.stripe_session_id)
      .eq('product_slug', slug)
      .maybeSingle();
    if (existing.data && existing.data.id) continue;
    var row = await createFromLineItem(supabase, orderRow, li);
    if (row) created.push(row);
  }
  return created;
}

async function getByStripeSession(supabase, stripeSessionId) {
  if (!supabase || !stripeSessionId) return [];
  var result = await supabase
    .from('custom_orders')
    .select('*')
    .eq('stripe_session_id', stripeSessionId)
    .order('created_at', { ascending: true });
  if (result.error) throw result.error;
  return result.data || [];
}

async function getByEmail(supabase, email) {
  if (!supabase || !email) return [];
  var result = await supabase
    .from('custom_orders')
    .select('*')
    .ilike('customer_email', String(email).trim())
    .order('created_at', { ascending: false })
    .limit(20);
  if (result.error) throw result.error;
  return result.data || [];
}

async function updateDesignStatus(supabase, id, patch) {
  if (!supabase || !id) throw new Error('Custom order id required');
  var update = { updated_at: nowIso() };
  if (patch.designStatus != null) update.design_status = normalizeDesignStatus(patch.designStatus);
  if (patch.trackingNumber !== undefined) update.tracking_number = patch.trackingNumber || null;
  if (patch.adminNotes !== undefined) update.admin_notes = patch.adminNotes || null;
  if (patch.estimatedCompletionAt !== undefined) {
    update.estimated_completion_at = patch.estimatedCompletionAt || null;
  }
  var result = await supabase.from('custom_orders').update(update).eq('id', id).select('*').maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}

module.exports = {
  DESIGN_STATUS_LABELS: DESIGN_STATUS_LABELS,
  designStatusLabel: designStatusLabel,
  normalizeDesignStatus: normalizeDesignStatus,
  buildCustomOrderRow: buildCustomOrderRow,
  createFromLineItem: createFromLineItem,
  syncFromPaidSession: syncFromPaidSession,
  getByStripeSession: getByStripeSession,
  getByEmail: getByEmail,
  updateDesignStatus: updateDesignStatus
};
