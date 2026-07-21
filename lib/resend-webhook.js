/**
 * Resend webhook handling — email open/click/delivery engagement.
 *
 * Resend signs webhooks with the Svix scheme. We verify the signature, then
 * persist each event to email_events and roll first-touch timestamps + counts
 * onto the originating action_queue row so campaigns and journeys can report
 * open/click engagement.
 */
const crypto = require('crypto');

const EVENT_TYPES = {
  'email.sent': 'sent',
  'email.delivered': 'delivered',
  'email.delivery_delayed': 'delivery_delayed',
  'email.opened': 'opened',
  'email.clicked': 'clicked',
  'email.bounced': 'bounced',
  'email.complained': 'complained'
};

function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verify a Svix-signed Resend webhook.
 * @param {Buffer|string} rawBody exact bytes of the request body
 * @param {Record<string,string>} headers request headers (lowercased keys)
 * @param {string} secret RESEND_WEBHOOK_SECRET, e.g. "whsec_base64..."
 * @returns {boolean}
 */
function verifySignature(rawBody, headers, secret) {
  if (!secret) return false;
  const svixId = headers['svix-id'];
  const svixTimestamp = headers['svix-timestamp'];
  const svixSignature = headers['svix-signature'];
  if (!svixId || !svixTimestamp || !svixSignature) return false;

  const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody || '');
  const signedContent = svixId + '.' + svixTimestamp + '.' + bodyStr;

  const secretKey = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  let keyBytes;
  try {
    keyBytes = Buffer.from(secretKey, 'base64');
  } catch (_) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', keyBytes)
    .update(signedContent)
    .digest('base64');

  // Header format: "v1,<sig> v1,<sig2> ..." — accept if any matches.
  const provided = String(svixSignature).split(' ');
  for (let i = 0; i < provided.length; i++) {
    const part = provided[i];
    const comma = part.indexOf(',');
    const sig = comma >= 0 ? part.slice(comma + 1) : part;
    if (sig && timingSafeEqualStr(sig, expected)) return true;
  }
  return false;
}

function firstRecipient(to) {
  if (Array.isArray(to)) return to.length ? String(to[0]) : null;
  return to ? String(to) : null;
}

/**
 * Persist a verified Resend event and update engagement counters.
 * @param {object} supabase service-role client
 * @param {object} event parsed webhook body { type, data, created_at }
 */
async function handleEvent(supabase, event) {
  if (!supabase || !event || !event.type) return { ok: false, error: 'Invalid event' };

  const normalizedType = EVENT_TYPES[event.type] || String(event.type || '').replace(/^email\./, '');
  const data = event.data || {};
  const messageId = data.email_id || data.id || null;
  const recipient = firstRecipient(data.to);
  const linkUrl = (data.click && (data.click.link || data.click.url)) || null;
  const occurredAt = event.created_at || (data.click && data.click.timestamp) || new Date().toISOString();

  let actionId = null;
  let campaignLogId = null;

  if (messageId) {
    try {
      const match = await supabase
        .from('action_queue')
        .select('id, campaign_log_id')
        .eq('provider_message_id', messageId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!match.error && match.data) {
        actionId = match.data.id;
        campaignLogId = match.data.campaign_log_id;
      }
    } catch (_) {}
  }

  try {
    await supabase.from('email_events').insert({
      provider_message_id: messageId,
      event_type: normalizedType,
      recipient: recipient,
      link_url: linkUrl,
      action_id: actionId,
      campaign_log_id: campaignLogId,
      occurred_at: occurredAt,
      raw: event
    });
  } catch (e) {
    return { ok: false, error: (e && e.message) || 'Failed to store event' };
  }

  if (actionId) {
    await applyEngagementToAction(supabase, actionId, normalizedType, occurredAt);
  }

  return { ok: true, event_type: normalizedType, action_id: actionId, campaign_log_id: campaignLogId };
}

async function applyEngagementToAction(supabase, actionId, type, occurredAt) {
  try {
    const current = await supabase
      .from('action_queue')
      .select('open_count, click_count, delivered_at, opened_at, clicked_at')
      .eq('id', actionId)
      .maybeSingle();
    if (current.error || !current.data) return;
    const row = current.data;
    const update = { updated_at: new Date().toISOString() };

    if (type === 'delivered' && !row.delivered_at) update.delivered_at = occurredAt;
    if (type === 'bounced') update.bounced_at = occurredAt;
    if (type === 'complained') update.complained_at = occurredAt;
    if (type === 'opened') {
      update.open_count = (Number(row.open_count) || 0) + 1;
      if (!row.opened_at) update.opened_at = occurredAt;
    }
    if (type === 'clicked') {
      update.click_count = (Number(row.click_count) || 0) + 1;
      if (!row.clicked_at) update.clicked_at = occurredAt;
    }

    await supabase.from('action_queue').update(update).eq('id', actionId);
  } catch (_) {}
}

module.exports = {
  EVENT_TYPES,
  verifySignature,
  handleEvent
};
