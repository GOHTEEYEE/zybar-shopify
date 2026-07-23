-- 7-day retention for abandoned checkout_snapshots only.
-- Snapshots linked to successful orders are never deleted.

ALTER TABLE public.checkout_snapshots
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'abandoned';

ALTER TABLE public.checkout_snapshots
  DROP CONSTRAINT IF EXISTS checkout_snapshots_status_check;

ALTER TABLE public.checkout_snapshots
  ADD CONSTRAINT checkout_snapshots_status_check
  CHECK (status IN ('abandoned', 'completed'));

CREATE INDEX IF NOT EXISTS idx_checkout_snapshots_status_created
  ON public.checkout_snapshots (status, created_at);

-- Backfill: any snapshot already tied to a paid order is completed.
UPDATE public.checkout_snapshots s
SET status = 'completed',
    updated_at = NOW()
WHERE s.status = 'abandoned'
  AND s.stripe_session_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.stripe_session_id = s.stripe_session_id
  );

-- Allow status updates (abandoned -> completed) while keeping cart payload immutable.
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
  IF OLD.stripe_session_id IS NOT NULL
     AND NEW.stripe_session_id IS DISTINCT FROM OLD.stripe_session_id THEN
    RAISE EXCEPTION 'checkout_snapshots.stripe_session_id is immutable once set';
  END IF;
  -- status may move abandoned -> completed only.
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT (OLD.status = 'abandoned' AND NEW.status = 'completed') THEN
    RAISE EXCEPTION 'checkout_snapshots.status can only move from abandoned to completed';
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- Replace dual-retention cleanup with a single 7-day abandoned rule.
DROP FUNCTION IF EXISTS public.cleanup_abandoned_checkout_snapshots(integer, integer);

CREATE OR REPLACE FUNCTION public.cleanup_abandoned_checkout_snapshots(
  p_retention_days integer DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer := 0;
BEGIN
  IF p_retention_days IS NULL OR p_retention_days < 1 THEN
    p_retention_days := 7;
  END IF;

  -- Never delete snapshots linked to successful orders (defense in depth).
  WITH doomed AS (
    SELECT s.id
    FROM public.checkout_snapshots s
    WHERE s.status = 'abandoned'
      AND s.created_at < NOW() - make_interval(days => p_retention_days)
      AND NOT EXISTS (
        SELECT 1
        FROM public.orders o
        WHERE o.stripe_session_id IS NOT NULL
          AND o.stripe_session_id = s.stripe_session_id
      )
  ),
  gone AS (
    DELETE FROM public.checkout_snapshots s
    USING doomed d
    WHERE s.id = d.id
    RETURNING 1
  )
  SELECT COUNT(*)::integer INTO deleted_count FROM gone;

  RETURN jsonb_build_object(
    'deleted_abandoned', deleted_count,
    'retention_days', p_retention_days,
    'ran_at', NOW()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_abandoned_checkout_snapshots(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_abandoned_checkout_snapshots(integer) TO service_role;
