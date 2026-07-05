import { json, parseRange, rpc, overviewFallback } from '../../_lib/analytics.js';

export async function onRequestGet(context) {
  const env = context.env || {};
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Analytics not configured' }, 503);
  }

  const range = parseRange(new URL(context.request.url));
  try {
    const data = await rpc(env, 'get_cart_analytics_summary', { p_start: range.start, p_end: range.end });
    if (data && typeof data === 'object') return json(data);
    const overview = await overviewFallback(env, range);
    return json({
      total_add_to_cart: overview.add_to_cart,
      unique_cart_sessions: overview.unique_cart_sessions,
      avg_cart_value_cents: 0,
      avg_items_per_cart: 0,
      top_products: [],
      top_sizes: [],
      top_power_types: [],
      top_led_colors: []
    });
  } catch (err) {
    return json({ error: (err && err.message) || 'Cart analytics failed' }, 500);
  }
}
