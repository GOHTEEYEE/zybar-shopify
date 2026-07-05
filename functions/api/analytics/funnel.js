import { json, parseRange, rpc, funnelFallback } from '../../_lib/analytics.js';

export async function onRequestGet(context) {
  const env = context.env || {};
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Analytics not configured' }, 503);
  }

  const range = parseRange(new URL(context.request.url));
  try {
    const data = await rpc(env, 'get_conversion_funnel', { p_start: range.start, p_end: range.end });
    if (Array.isArray(data)) return json({ steps: data });
    return json({ steps: await funnelFallback(env, range) });
  } catch (err) {
    return json({ error: (err && err.message) || 'Funnel failed' }, 500);
  }
}
