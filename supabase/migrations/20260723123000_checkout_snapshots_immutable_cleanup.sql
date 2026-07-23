-- Harden checkout_snapshots: immutable cart payload + cleanup helper.

-- Never allow line_items (or core cart fields) to change after insert.
CREATE OR REPLACE FUNCTION public.checkout_snapshots_enforce_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.line_items IS DISTINCT FROM OLD.line_items THEN
    RAISE EXCEPTION 'checkout_snapshots.line_items is immutable';
  END IF;
  IF NEW.cart_id IS DISTINCT FROM OLD.cart_id THEN
    RAISE EXCEPTION 'checkout_snapshots.cart_id is immutable';
  END IF;
  IF NEW.visitor_id IS DISTINCT FROM OLD.visitor_id THEN
    RAISE EXCEPTION 'checkout_snapshots.visitor_id is immutable';
  END IF;
  IF NEW.shipping_method IS DISTINCT FROM OLD.shipping_method THEN
    RAISE EXCEPTION 'checkout_snapshots.shipping_method is immutable';
  END IF;
  IF NEW.discount_code IS DISTINCT FROM OLD.discount_code THEN
    RAISE EXCEPTION 'checkout_snapshots.discount_code is immutable';
  END IF;
  IF NEW.discount_usd IS DISTINCT FROM OLD.discount_usd THEN
    RAISE EXCEPTION 'checkout_snapshots.discount_usd is immutable';
  END IF;
  -- stripe_session_id may be set once (null -> value), never reassigned.
  IF OLD.stripe_session_id IS NOT NULL
     AND NEW.stripe_session_id IS DISTINCT FROM OLD.stripe_session_id THEN
    RAISE EXCEPTION 'checkout_snapshots.stripe_session_id is immutable once set';
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_checkout_snapshots_immutable ON public.checkout_snapshots;
CREATE TRIGGER trg_checkout_snapshots_immutable
  BEFORE UPDATE ON public.checkout_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.checkout_snapshots_enforce_immutable();

-- Delete abandoned / stale snapshots to bound table growth.
-- - Never linked to a Stripe session and older than p_unattached_days
-- - Linked but never resulted in an order, older than p_unpaid_days
-- Paid snapshots are kept (orders already copy line_items; retain for audit).
CREATE OR REPLACE FUNCTION public.cleanup_abandoned_checkout_snapshots(
  p_unattached_days integer DEFAULT 7,
  p_unpaid_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_unattached integer := 0;
  deleted_unpaid integer := 0;
BEGIN
  IF p_unattached_days IS NULL OR p_unattached_days < 1 THEN
    p_unattached_days := 7;
  END IF;
  IF p_unpaid_days IS NULL OR p_unpaid_days < 1 THEN
    p_unpaid_days := 30;
  END IF;

  WITH doomed AS (
    SELECT id
    FROM public.checkout_snapshots
    WHERE stripe_session_id IS NULL
      AND created_at < NOW() - make_interval(days => p_unattached_days)
  ),
  gone AS (
    DELETE FROM public.checkout_snapshots s
    USING doomed d
    WHERE s.id = d.id
    RETURNING 1
  )
  SELECT COUNT(*)::integer INTO deleted_unattached FROM gone;

  WITH doomed AS (
    SELECT s.id
    FROM public.checkout_snapshots s
    WHERE s.stripe_session_id IS NOT NULL
      AND s.created_at < NOW() - make_interval(days => p_unpaid_days)
      AND NOT EXISTS (
        SELECT 1
        FROM public.orders o
        WHERE o.stripe_session_id = s.stripe_session_id
      )
  ),
  gone AS (
    DELETE FROM public.checkout_snapshots s
    USING doomed d
    WHERE s.id = d.id
    RETURNING 1
  )
  SELECT COUNT(*)::integer INTO deleted_unpaid FROM gone;

  RETURN jsonb_build_object(
    'deleted_unattached', deleted_unattached,
    'deleted_unpaid', deleted_unpaid,
    'unattached_days', p_unattached_days,
    'unpaid_days', p_unpaid_days,
    'ran_at', NOW()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_abandoned_checkout_snapshots(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_abandoned_checkout_snapshots(integer, integer) TO service_role;
