import { json, parseRange, rpc, distributionsFallback } from '../../_lib/analytics.js';

export async function onRequestGet(context) {
  const env = context.env || {};
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Analytics not configured' }, 503);
  }

  const range = parseRange(new URL(context.request.url));
  try {
    const data = await rpc(env, 'get_analytics_distributions', { p_start: range.start, p_end: range.end });
    if (data && typeof data === 'object') return json(data);
    return json(await distributionsFallback(env, range));
  } catch (err) {
    return json({ error: (err && err.message) || 'Distributions failed' }, 500);
  }
}
