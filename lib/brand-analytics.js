/**
 * Brand scoping for shared analytics tables (ZYBAR automotive vs LUNEVA butterfly).
 */

const LUNEVA_SLUG_PREFIX = 'luneva-';

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
  return String(item.slug || item.productSlug || item.product_slug || '');
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

function isZybarEvent(row) {
  return !isLunevaEvent(row);
}

function isZybarSession(row) {
  return !isLunevaSession(row);
}

function isZybarOrder(row) {
  return !isLunevaOrder(row);
}

/**
 * Session is LUNEVA if landing is LUNEVA, or any LUNEVA-tagged event belongs
 * to this session (covers visitors who land on / then browse /luneva/).
 */
function isLunevaSessionStrict(row, lunevaSessionIds, lunevaVisitorIds) {
  if (isLunevaSession(row)) return true;
  const sessionIds = lunevaSessionIds || {};
  const visitorIds = lunevaVisitorIds || {};
  if (row && row.id && sessionIds[row.id]) return true;
  // Empty / homepage landings whose visitor only appears via LUNEVA activity.
  if (row && row.visitor_id && visitorIds[row.visitor_id]) {
    const landing = String(row.landing_page || '');
    if (
      !landing ||
      landing === '/' ||
      landing.indexOf('/index') === 0 ||
      landing.indexOf('/?') === 0
    ) {
      return true;
    }
  }
  return false;
}

function isZybarSessionStrict(row, lunevaSessionIds, lunevaVisitorIds) {
  return !isLunevaSessionStrict(row, lunevaSessionIds, lunevaVisitorIds);
}

function filterZybarEvents(rows) {
  return (rows || []).filter(isZybarEvent);
}

function filterZybarSessions(rows) {
  return (rows || []).filter(isZybarSession);
}

function filterZybarSessionsStrict(rows, lunevaSessionIds, lunevaVisitorIds) {
  return (rows || []).filter(function (row) {
    return isZybarSessionStrict(row, lunevaSessionIds, lunevaVisitorIds);
  });
}

function filterZybarOrders(rows) {
  return (rows || []).filter(isZybarOrder);
}

function buildLunevaIdentitySets(events) {
  const sessionIds = {};
  const visitorIds = {};
  (events || []).forEach(function (ev) {
    if (!isLunevaEvent(ev)) return;
    if (ev.session_id) sessionIds[ev.session_id] = true;
    if (ev.visitor_id) visitorIds[ev.visitor_id] = true;
  });
  return { sessionIds: sessionIds, visitorIds: visitorIds };
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

module.exports = {
  LUNEVA_SLUG_PREFIX,
  isLunevaPath,
  isLunevaProductId,
  isLunevaEvent,
  isLunevaSession,
  isLunevaSessionStrict,
  isLunevaOrder,
  isZybarEvent,
  isZybarSession,
  isZybarSessionStrict,
  isZybarOrder,
  filterZybarEvents,
  filterZybarSessions,
  filterZybarSessionsStrict,
  filterZybarOrders,
  buildLunevaIdentitySets,
  lunevaEventFilter,
  filterZybarTopProducts
};
