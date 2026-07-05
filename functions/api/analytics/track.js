import { json, insertEvent, syncCart, supabaseFetch } from '../../_lib/analytics.js';

export async function onRequestPost(context) {
  const env = context.env || {};
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Analytics not configured' }, 503);
  }

  let body;
  try {
    body = await context.request.json();
  } catch (_) {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const type = body && body.type;
  try {
    if (type === 'event' && body.event) {
      const result = await insertEvent(env, body.event);
      if (!result.ok) return json({ error: result.error || 'Track failed' }, 500);
      return json({ ok: true, deduped: !!result.deduped });
    }

    if (type === 'cart_sync' && body.cart) {
      const result = await syncCart(env, body.cart);
      if (!result.ok) return json({ error: result.error || 'Cart sync failed' }, 500);
      return json({ ok: true, cart_id: result.cart_id });
    }

    if (type === 'purchase') {
      const cartId = body.cart_id;
      if (cartId) {
        await supabaseFetch(env, '/rest/v1/cart_sessions?id=eq.' + encodeURIComponent(cartId), {
          method: 'PATCH',
          body: JSON.stringify({
            status: 'purchased',
            purchased_at: new Date().toISOString(),
            stripe_session_id: body.stripe_session_id || null,
            recovery_status: 'recovered'
          })
        });
      }
      return json({ ok: true });
    }

    return json({ error: 'Invalid analytics payload' }, 400);
  } catch (err) {
    return json({ error: (err && err.message) || 'Track failed' }, 500);
  }
}
