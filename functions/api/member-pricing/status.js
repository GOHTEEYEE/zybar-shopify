import { createClient } from '@supabase/supabase-js';

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

function decodeBase64Url(value) {
  var normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  while (normalized.length % 4) normalized += '=';
  var binary = atob(normalized);
  var bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function encodeBase64Url(bytes) {
  var binary = '';
  new Uint8Array(bytes).forEach(function (byte) {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function verifyCredential(token, secret) {
  var parts = String(token || '').split('.');
  if (!secret || parts.length !== 2) return null;
  var key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  var valid = await crypto.subtle.verify(
    'HMAC',
    key,
    decodeBase64Url(parts[1]),
    new TextEncoder().encode(parts[0])
  );
  if (!valid) return null;
  try {
    var payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0])));
    if (payload.v !== 1 || !payload.sid || payload.tier !== 'welcome') return null;
    if (!Number.isFinite(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

async function issueCredential(subscriberId, secret) {
  var now = Math.floor(Date.now() / 1000);
  var payload = encodeBase64Url(
    new TextEncoder().encode(
      JSON.stringify({
        v: 1,
        sid: String(subscriberId),
        tier: 'welcome',
        iat: now,
        exp: now + 180 * 24 * 60 * 60
      })
    )
  );
  var key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  var signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(payload)
  );
  return payload + '.' + encodeBase64Url(signature);
}

export async function onRequestPost(context) {
  var env = context.env || {};
  var secret = String(env.MEMBER_PRICING_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || '');
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !secret) {
    return json({ active: false }, 503);
  }
  var body = await context.request.json().catch(function () {
    return {};
  });
  var verified = await verifyCredential(body.credential, secret);
  var supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });
  var query = supabase
    .from('newsletter_subscribers')
    .select('id, status, discount_code');
  if (verified) query = query.eq('id', verified.sid);
  else if (body.visitorId) query = query.eq('visitor_id', String(body.visitorId).slice(0, 80));
  else if (body.sessionId) query = query.eq('session_id', String(body.sessionId).slice(0, 80));
  else return json({ active: false });

  var result = await query.eq('status', 'active').limit(1).maybeSingle();
  if (result.error || !result.data) return json({ active: false });
  return json({
    active: true,
    tier: 'welcome',
    tierLabel: 'Welcome Member',
    eyebrow: 'Member Exclusive',
    benefit: 'Extra 15% Savings Applied',
    percent: 15,
    discountCode: result.data.discount_code || 'ZYBAR15',
    credential: await issueCredential(result.data.id, secret)
  });
}
