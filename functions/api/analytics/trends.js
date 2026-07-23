import { json, parseRange, rpc, trendsFallback } from '../../_lib/analytics.js';

export async function onRequestGet(context) {
  const env = context.env || {};
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Analytics not configured' }, 503);
  }

  const url = new URL(context.request.url);
  const range = parseRange(url);
  const granularity =
    url.searchParams.get('granularity') === 'hour' ||
    url.searchParams.get('granularity') === 'week' ||
    url.searchParams.get('granularity') === 'month' ||
    url.searchParams.get('granularity') === 'year'
      ? url.searchParams.get('granularity')
      : 'day';

  try {
    const data = await rpc(env, 'get_analytics_trends', {
      p_start: range.start,
      p_end: range.end,
      p_granularity: granularity
    });
    if (data && typeof data === 'object') return json(data);
    return json(await trendsFallback(env, range, granularity));
  } catch (err) {
    return json({ error: (err && err.message) || 'Trends failed' }, 500);
  }
}
