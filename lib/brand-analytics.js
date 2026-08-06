/**
 * Brand scoping for shared analytics tables (ZYBAR automotive vs LUNEVA butterfly).
 */

const LUNEVA_SLUG_PREFIX = 'luneva-';
const BRAND_ZYBAR = 'zybar';
const BRAND_LUNEVA = 'luneva';

function isLunevaPath(path) {
  const p = String(path || '');
  return p.indexOf('/luneva') !== -1 || p.indexOf('/products/luneva-') !== -1;
}

function isLunevaProductId(productId) {
  return String(productId || '').indexOf(LUNEVA_SLUG_PREFIX) === 0;
}

function isLunevaEvent(row) {
  if (!row || typeof row !== 'object') return false;
  if (String(row.collection_id || '') === 'luneva') return true;
  if (isLunevaPath(row.page_url)) return true;
  if (isLunevaProductId(row.product_id)) return true;
  return false;
}

function isLunevaSession(row) {
  if (!row || typeof row !== 'object') return false;
  return isLunevaPath(row.landing_page);
}

function lineItemSlug(item) {
  if (!item || typeof item !== 'object') return '';
  return String(item.slug || item.productSlug || item.product_slug || item.product_id || '');
}

function isLunevaOrder(row) {
  if (!row || typeof row !== 'object') return false;
  if (isLunevaProductId(row.product_slug)) return true;
  const items = row.line_items;
  if (!Array.isArray(items)) return false;
  return items.some(function (item) {
    return lineItemSlug(item).indexOf(LUNEVA_SLUG_PREFIX) === 0;
  });
}

/**
 * Infer brand for newsletter_subscribers (works before/after brand column).
 */
function inferLeadBrand(row) {
  if (!row || typeof row !== 'object') return BRAND_ZYBAR;
  const explicit = String(row.brand || '')
    .trim()
    .toLowerCase();
  if (explicit === BRAND_LUNEVA || explicit === BRAND_ZYBAR) return explicit;
  const source = String(row.source || '').toLowerCase();
  if (source.indexOf('luneva') !== -1) return BRAND_LUNEVA;
  if (String(row.discount_code || '').toUpperCase() === 'LUNEVA5') return BRAND_LUNEVA;
  return BRAND_ZYBAR;
}

function isLunevaLead(row) {
  return inferLeadBrand(row) === BRAND_LUNEVA;
}

function isZybarLead(row) {
  return !isLunevaLead(row);
}

function cartItemsAreLuneva(items) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return false;
  return list.every(function (item) {
    return isLunevaProductId(lineItemSlug(item));
  });
}

function cartItemsAreZybar(items) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return true;
  return list.every(function (item) {
    return !isLunevaProductId(lineItemSlug(item));
  });
}

/**
 * Cart brand from cart_sessions.brand or line items / product ids.
 */
function inferCartBrand(row, items) {
  if (!row || typeof row !== 'object') return BRAND_ZYBAR;
  const explicit = String(row.brand || '')
    .trim()
    .toLowerCase();
  if (explicit === BRAND_LUNEVA || explicit === BRAND_ZYBAR) return explicit;
  const list = items || row.items || row.line_items || null;
  if (Array.isArray(list) && list.length) {
    if (cartItemsAreLuneva(list)) return BRAND_LUNEVA;
    if (cartItemsAreZybar(list)) return BRAND_ZYBAR;
    // Mixed cart — treat as Zybar automotive unless every item is LUNEVA.
    return BRAND_ZYBAR;
  }
  if (row.collection === 'luneva' || row.collection_id === 'luneva') return BRAND_LUNEVA;
  return BRAND_ZYBAR;
}

function isLunevaCart(row, items) {
  return inferCartBrand(row, items) === BRAND_LUNEVA;
}

function isZybarCart(row, items) {
  return !isLunevaCart(row, items);
}

function isZybarEvent(row) {
  return !isLunevaEvent(row);
}

function isZybarSession(row) {
  return !isLunevaSession(row);
}

function isZybarOrder(row) {
  return !isLunevaOrder(row);
}

function filterZybarEvents(rows) {
  return (rows || []).filter(isZybarEvent);
}

function filterZybarSessions(rows) {
  return (rows || []).filter(isZybarSession);
}

function filterZybarOrders(rows) {
  return (rows || []).filter(isZybarOrder);
}

function filterZybarLeads(rows) {
  return (rows || []).filter(isZybarLead);
}

function filterLunevaLeads(rows) {
  return (rows || []).filter(isLunevaLead);
}

function filterZybarCarts(rows, itemsByCartId) {
  const map = itemsByCartId || {};
  return (rows || []).filter(function (row) {
    return isZybarCart(row, map[row.id] || map[row.cart_id]);
  });
}

/**
 * Apply PostgREST filters for ZYBAR newsletter leads.
 * Prefers brand=zybar; falls back to excluding LUNEVA source/discount signals.
 */
function applyZybarLeadFilters(query) {
  return query.or(
    'brand.eq.zybar,and(brand.is.null,source.not.ilike.%luneva%,or(discount_code.is.null,discount_code.neq.LUNEVA5))'
  );
}

function applyLunevaLeadFilters(query) {
  return query.or(
    'brand.eq.luneva,and(brand.is.null,or(source.ilike.%luneva%,discount_code.eq.LUNEVA5))'
  );
}

function lunevaEventFilter() {
  return (
    'collection_id.eq.luneva,page_url.ilike.%/luneva%,page_url.ilike.%/products/luneva-%,product_id.ilike.luneva-%'
  );
}

function filterZybarTopProducts(data) {
  const payload = data && typeof data === 'object' ? data : {};
  function strip(list) {
    return (list || []).filter(function (row) {
      return !isLunevaProductId(row && row.product_id);
    });
  }
  return {
    most_viewed: strip(payload.most_viewed),
    most_added: strip(payload.most_added),
    highest_revenue: strip(payload.highest_revenue),
    highest_conversion: strip(payload.highest_conversion)
  };
}

/**
 * Load cart_session_items for cart ids and return { cartId: [items] }.
 */
async function loadCartItemsByCartId(supabase, cartIds) {
  const ids = Array.from(
    new Set(
      (cartIds || []).filter(Boolean).map(function (id) {
        return String(id);
      })
    )
  );
  const map = {};
  if (!ids.length || !supabase) return map;
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data, error } = await supabase
      .from('cart_session_items')
      .select('cart_id,product_id,product_name')
      .in('cart_id', chunk);
    if (error) break;
    (data || []).forEach(function (item) {
      const cid = item.cart_id;
      if (!map[cid]) map[cid] = [];
      map[cid].push(item);
    });
  }
  return map;
}

module.exports = {
  LUNEVA_SLUG_PREFIX,
  BRAND_ZYBAR,
  BRAND_LUNEVA,
  isLunevaPath,
  isLunevaProductId,
  isLunevaEvent,
  isLunevaSession,
  isLunevaOrder,
  isLunevaLead,
  isZybarLead,
  isLunevaCart,
  isZybarCart,
  inferLeadBrand,
  inferCartBrand,
  isZybarEvent,
  isZybarSession,
  isZybarOrder,
  filterZybarEvents,
  filterZybarSessions,
  filterZybarOrders,
  filterZybarLeads,
  filterLunevaLeads,
  filterZybarCarts,
  applyZybarLeadFilters,
  applyLunevaLeadFilters,
  lunevaEventFilter,
  filterZybarTopProducts,
  loadCartItemsByCartId
};
