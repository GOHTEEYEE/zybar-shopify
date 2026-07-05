import { json, rpc } from '../../_lib/analytics.js';

export async function onRequestGet(context) {
  const env = context.env || {};
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Analytics not configured' }, 503);
  }

  const url = new URL(context.request.url);
  const limit = Math.min(200, parseInt(url.searchParams.get('limit'), 10) || 50);
  const offset = Math.max(0, parseInt(url.searchParams.get('offset'), 10) || 0);

  try {
    const data = await rpc(env, 'get_abandoned_carts', { p_limit: limit, p_offset: offset });
    if (Array.isArray(data)) return json({ carts: data });
    return json({ carts: [] });
  } catch (err) {
    return json({ error: (err && err.message) || 'Abandoned carts failed' }, 500);
  }
}
