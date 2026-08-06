/**
 * Meta Marketing API — read campaign / ad set / ad insights.
 *
 * Env:
 *   META_ADS_ACCESS_TOKEN  — System User or User token with ads_read
 *   META_AD_ACCOUNT_ID     — act_XXXXXXXXX (or bare digits)
 *   META_ADS_API_VERSION   — optional, default v21.0
 */

const DEFAULT_API_VERSION = 'v21.0';

const INSIGHT_FIELDS = [
  'campaign_id',
  'campaign_name',
  'adset_id',
  'adset_name',
  'ad_id',
  'ad_name',
  'objective',
  'impressions',
  'reach',
  'frequency',
  'clicks',
  'unique_clicks',
  'ctr',
  'unique_ctr',
  'cpc',
  'cpm',
  'cpp',
  'spend',
  'account_currency',
  'actions',
  'action_values',
  'cost_per_action_type',
  'purchase_roas',
  'date_start',
  'date_stop'
].join(',');

const DATE_PRESET_MAP = {
  today: 'today',
  yesterday: 'yesterday',
  '7': 'last_7d',
  '30': 'last_30d',
  last_7d: 'last_7d',
  last_30d: 'last_30d',
  last_14d: 'last_14d',
  this_month: 'this_month'
};

function configured() {
  return Boolean(getAccessToken() && getAdAccountId());
}

function getAccessToken() {
  return String(process.env.META_ADS_ACCESS_TOKEN || '').trim();
}

function getAdAccountId() {
  const raw = String(process.env.META_AD_ACCOUNT_ID || '').trim();
  if (!raw) return '';
  return raw.indexOf('act_') === 0 ? raw : 'act_' + raw.replace(/^act_/i, '');
}

function getApiVersion() {
  return String(process.env.META_ADS_API_VERSION || DEFAULT_API_VERSION).trim() || DEFAULT_API_VERSION;
}

function resolveDatePreset(raw) {
  const key = String(raw || '7').trim().toLowerCase();
  return DATE_PRESET_MAP[key] || DATE_PRESET_MAP['7'];
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function findAction(actions, types) {
  const list = Array.isArray(actions) ? actions : [];
  const wanted = Array.isArray(types) ? types : [types];
  for (let i = 0; i < wanted.length; i++) {
    const hit = list.find(function (row) {
      return row && String(row.action_type) === wanted[i];
    });
    if (hit) return num(hit.value);
  }
  return 0;
}

function findCostPerAction(costs, types) {
  const list = Array.isArray(costs) ? costs : [];
  const wanted = Array.isArray(types) ? types : [types];
  for (let i = 0; i < wanted.length; i++) {
    const hit = list.find(function (row) {
      return row && String(row.action_type) === wanted[i];
    });
    if (hit) return num(hit.value);
  }
  return 0;
}

function findRoas(purchaseRoas) {
  const list = Array.isArray(purchaseRoas) ? purchaseRoas : [];
  if (!list.length) return 0;
  return num(list[0].value);
}

function normalizeInsightRow(row, level) {
  const purchases = findAction(row.actions, [
    'purchase',
    'omni_purchase',
    'offsite_conversion.fb_pixel_purchase'
  ]);
  const addToCart = findAction(row.actions, [
    'add_to_cart',
    'omni_add_to_cart',
    'offsite_conversion.fb_pixel_add_to_cart'
  ]);
  const viewContent = findAction(row.actions, [
    'view_content',
    'omni_view_content',
    'offsite_conversion.fb_pixel_view_content'
  ]);
  const initiateCheckout = findAction(row.actions, [
    'initiate_checkout',
    'omni_initiated_checkout',
    'offsite_conversion.fb_pixel_initiate_checkout'
  ]);
  const purchaseValue = findAction(row.action_values, [
    'purchase',
    'omni_purchase',
    'offsite_conversion.fb_pixel_purchase'
  ]);
  const spend = num(row.spend);
  const clicks = num(row.clicks);
  const impressions = num(row.impressions);
  const costPerVc = viewContent > 0 ? spend / viewContent : 0;
  const costPerAtc = addToCart > 0 ? spend / addToCart : 0;

  return {
    level: level,
    account_currency: row.account_currency || null,
    campaign_id: row.campaign_id || null,
    campaign_name: row.campaign_name || null,
    adset_id: row.adset_id || null,
    adset_name: row.adset_name || null,
    ad_id: row.ad_id || null,
    ad_name: row.ad_name || null,
    objective: row.objective || null,
    impressions: impressions,
    reach: num(row.reach),
    frequency: num(row.frequency),
    clicks: clicks,
    unique_clicks: num(row.unique_clicks),
    ctr: num(row.ctr),
    cpc: num(row.cpc),
    cpm: num(row.cpm),
    spend: spend,
    view_content: viewContent,
    cost_per_view_content: costPerVc,
    add_to_cart: addToCart,
    cost_per_add_to_cart: costPerAtc,
    initiate_checkout: initiateCheckout,
    purchases: purchases,
    purchase_value: purchaseValue,
    cost_per_purchase: findCostPerAction(row.cost_per_action_type, [
      'purchase',
      'omni_purchase',
      'offsite_conversion.fb_pixel_purchase'
    ]),
    roas: findRoas(row.purchase_roas) || (spend > 0 && purchaseValue > 0 ? purchaseValue / spend : 0),
    date_start: row.date_start || null,
    date_stop: row.date_stop || null
  };
}

function sumRows(rows) {
  const list = rows || [];
  const totals = {
    impressions: 0,
    reach: 0,
    clicks: 0,
    spend: 0,
    view_content: 0,
    cost_per_view_content: 0,
    add_to_cart: 0,
    cost_per_add_to_cart: 0,
    initiate_checkout: 0,
    purchases: 0,
    purchase_value: 0
  };
  list.forEach(function (row) {
    totals.impressions += row.impressions || 0;
    totals.reach += row.reach || 0;
    totals.clicks += row.clicks || 0;
    totals.spend += row.spend || 0;
    totals.view_content += row.view_content || 0;
    totals.add_to_cart += row.add_to_cart || 0;
    totals.initiate_checkout += row.initiate_checkout || 0;
    totals.purchases += row.purchases || 0;
    totals.purchase_value += row.purchase_value || 0;
  });
  totals.ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
  totals.cpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0;
  totals.cpm = totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0;
  totals.roas = totals.spend > 0 ? totals.purchase_value / totals.spend : 0;
  totals.cost_per_purchase = totals.purchases > 0 ? totals.spend / totals.purchases : 0;
  totals.cost_per_view_content =
    totals.view_content > 0 ? totals.spend / totals.view_content : 0;
  totals.cost_per_add_to_cart = totals.add_to_cart > 0 ? totals.spend / totals.add_to_cart : 0;
  return totals;
}

async function graphGet(path, params) {
  const token = getAccessToken();
  if (!token) {
    const err = new Error('META_ADS_ACCESS_TOKEN is not configured');
    err.code = 'META_ADS_NOT_CONFIGURED';
    throw err;
  }
  const query = new URLSearchParams(params || {});
  query.set('access_token', token);
  const url =
    'https://graph.facebook.com/' +
    getApiVersion() +
    '/' +
    String(path || '').replace(/^\//, '') +
    '?' +
    query.toString();

  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' }
  });
  const body = await res.json().catch(function () {
    return {};
  });
  if (!res.ok || (body && body.error)) {
    const metaErr = (body && body.error) || {};
    const err = new Error(metaErr.message || 'Meta Ads API request failed');
    err.code = metaErr.code || res.status;
    err.type = metaErr.type || null;
    err.fbtrace_id = metaErr.fbtrace_id || null;
    throw err;
  }
  return body;
}

async function fetchAllPages(path, params, maxPages) {
  const limit = Math.max(1, Math.min(10, Number(maxPages) || 5));
  let page = await graphGet(path, params);
  const rows = Array.isArray(page.data) ? page.data.slice() : [];
  let pages = 1;
  while (pages < limit && page.paging && page.paging.next) {
    const nextUrl = page.paging.next;
    const res = await fetch(nextUrl, { headers: { Accept: 'application/json' } });
    page = await res.json().catch(function () {
      return {};
    });
    if (!res.ok || (page && page.error)) break;
    if (Array.isArray(page.data)) rows.push.apply(rows, page.data);
    pages += 1;
  }
  return rows;
}

async function getInsights(opts) {
  const options = opts || {};
  if (!configured()) {
    const err = new Error(
      'Meta Ads not configured. Set META_ADS_ACCESS_TOKEN and META_AD_ACCOUNT_ID.'
    );
    err.code = 'META_ADS_NOT_CONFIGURED';
    throw err;
  }

  const level = String(options.level || 'campaign').toLowerCase();
  const allowed = { campaign: true, adset: true, ad: true };
  const safeLevel = allowed[level] ? level : 'campaign';
  const datePreset = resolveDatePreset(options.date_preset || options.range || '7');
  const accountId = getAdAccountId();
  const account = await getAccountSummary();
  const accountCurrency = account.currency || null;

  const params = {
    level: safeLevel,
    fields: INSIGHT_FIELDS,
    date_preset: datePreset,
    limit: String(Math.min(200, Math.max(1, parseInt(options.limit, 10) || 100)))
  };

  let raw;
  try {
    raw = await fetchAllPages(
      accountId + '/insights',
      Object.assign({}, params, {
        sort: JSON.stringify([{ field: 'spend', direction: 'descending' }])
      })
    );
  } catch (err) {
    raw = await fetchAllPages(accountId + '/insights', params);
  }

  const rows = raw
    .map(function (row) {
      return normalizeInsightRow(row, safeLevel);
    })
    .sort(function (a, b) {
      return (b.spend || 0) - (a.spend || 0);
    });

  return {
    configured: true,
    account_id: accountId,
    account: account,
    currency: accountCurrency,
    level: safeLevel,
    date_preset: datePreset,
    totals: sumRows(rows),
    rows: rows
  };
}

async function getAccountSummary() {
  if (!configured()) {
    return {
      configured: false,
      account_id: null,
      name: null,
      currency: null,
      timezone_name: null,
      account_status: null
    };
  }
  const accountId = getAdAccountId();
  const data = await graphGet(accountId, {
    fields: 'id,name,account_id,currency,timezone_name,account_status,amount_spent,balance'
  });
  return {
    configured: true,
    account_id: accountId,
    name: data.name || null,
    currency: data.currency || null,
    timezone_name: data.timezone_name || null,
    account_status: data.account_status,
    amount_spent: num(data.amount_spent) / 100,
    balance: num(data.balance) / 100
  };
}

module.exports = {
  configured,
  getAccessToken,
  getAdAccountId,
  resolveDatePreset,
  getInsights,
  getAccountSummary
};
