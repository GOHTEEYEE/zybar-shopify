-- Restore abandoned-cart RPCs used by admin analytics / recovery flows.
-- These read cart_sessions + cart_session_items (not checkout_snapshots).

CREATE OR REPLACE FUNCTION public.mark_abandoned_carts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE public.cart_sessions
  SET
    status = 'abandoned',
    recovery_status = CASE WHEN recovery_status = 'none' THEN 'none' ELSE recovery_status END,
    abandoned_at = COALESCE(abandoned_at, NOW())
  WHERE status IN ('active', 'checkout_started')
    AND last_activity_at < (NOW() - INTERVAL '24 hours')
    AND purchased_at IS NULL;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_abandoned_carts() TO anon;
GRANT EXECUTE ON FUNCTION public.mark_abandoned_carts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_abandoned_carts() TO service_role;

CREATE OR REPLACE FUNCTION public.get_abandoned_carts(p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  PERFORM public.mark_abandoned_carts();

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    FROM (
      SELECT
        c.id AS cart_id,
        c.visitor_id,
        c.customer_id,
        c.created_at,
        c.last_activity_at,
        c.cart_value_cents,
        c.item_count,
        c.status,
        c.recovery_status,
        c.country,
        c.device_type,
        (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'product_id', i.product_id,
            'product_name', i.product_name,
            'size', i.size,
            'power_type', i.power_type,
            'quantity', i.quantity
          )), '[]'::jsonb)
          FROM public.cart_session_items i WHERE i.cart_id = c.id
        ) AS products
      FROM public.cart_sessions c
      WHERE c.status IN ('abandoned', 'checkout_started')
        AND c.purchased_at IS NULL
        AND c.item_count > 0
      ORDER BY c.last_activity_at DESC
      LIMIT GREATEST(1, LEAST(p_limit, 200))
      OFFSET GREATEST(0, p_offset)
    ) t
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_abandoned_carts(integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_abandoned_carts(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_abandoned_carts(integer, integer) TO service_role;
