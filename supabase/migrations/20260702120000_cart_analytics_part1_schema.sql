-- PART 1 of 4 — Run first. Schema + tables only (fast).
-- Cart Analytics & Conversion Tracking

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS cart_id UUID,
  ADD COLUMN IF NOT EXISTS customer_id TEXT,
  ADD COLUMN IF NOT EXISTS dedup_key TEXT;

CREATE TABLE IF NOT EXISTS public.cart_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

CREATE TABLE IF NOT EXISTS public.cart_session_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cart_id UUID NOT NULL REFERENCES public.cart_sessions(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  product_name TEXT,
  variant TEXT,
  size TEXT,
  led_color TEXT,
  power_type TEXT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cart_id, product_id, size, power_type)
);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS visitor_id TEXT,
  ADD COLUMN IF NOT EXISTS analytics_session_id TEXT,
  ADD COLUMN IF NOT EXISTS cart_id UUID;
