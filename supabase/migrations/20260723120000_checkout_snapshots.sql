-- Checkout snapshots: full cart / custom config for Stripe webhooks.
-- Stripe metadata is limited to 500 chars per value — never store cart JSON there.

CREATE TABLE IF NOT EXISTS public.checkout_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id UUID NULL,
  visitor_id TEXT NULL,
  analytics_session_id TEXT NULL,
  upload_session_id TEXT NULL,
  shipping_method TEXT NULL,
  discount_code TEXT NULL,
  discount_usd NUMERIC(12, 2) NULL,
  line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  stripe_session_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkout_snapshots_cart_id
  ON public.checkout_snapshots (cart_id);

CREATE INDEX IF NOT EXISTS idx_checkout_snapshots_stripe_session_id
  ON public.checkout_snapshots (stripe_session_id);

CREATE INDEX IF NOT EXISTS idx_checkout_snapshots_created_at
  ON public.checkout_snapshots (created_at DESC);

ALTER TABLE public.checkout_snapshots ENABLE ROW LEVEL SECURITY;

-- Service-role only (no anon policies). Server uses SUPABASE_SERVICE_ROLE_KEY.
DROP POLICY IF EXISTS "Service role full access checkout_snapshots" ON public.checkout_snapshots;
