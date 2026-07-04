-- Step 2 — Run after Step 1 succeeds.

CREATE TABLE IF NOT EXISTS public.cart_session_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
