-- Step 1 — Run this ALONE first (should finish in under 2 seconds).
-- If this times out, the problem is Supabase connection (paused project / network), not SQL.

CREATE TABLE IF NOT EXISTS public.cart_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id TEXT NOT NULL,
  session_id TEXT,
  customer_id TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'checkout_started', 'abandoned', 'recovered', 'purchased', 'expired')),
  recovery_status TEXT NOT NULL DEFAULT 'none'
    CHECK (recovery_status IN ('none', 'recovered', 'purchased_later', 'expired')),
  currency TEXT NOT NULL DEFAULT 'USD',
  cart_value_cents INTEGER NOT NULL DEFAULT 0,
  item_count INTEGER NOT NULL DEFAULT 0,
  country TEXT,
  device_type TEXT,
  referrer TEXT,
  last_shipping_method TEXT,
  last_payment_method TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  abandoned_at TIMESTAMPTZ,
  purchased_at TIMESTAMPTZ,
  converted_order_id UUID,
  stripe_session_id TEXT
);
