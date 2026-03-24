-- ZYBAR Orders - Stripe Checkout sessions mapped into Supabase
-- Run this in Supabase SQL Editor (test mode and live both use same schema).

CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stripe_session_id TEXT UNIQUE NOT NULL,
  stripe_payment_intent TEXT,
  customer_email TEXT,
  currency TEXT NOT NULL DEFAULT 'usd',
  amount_total_cents INTEGER NOT NULL,
  product_slug TEXT,
  size TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'completed',
  test_mode BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Admins can read orders
CREATE POLICY "Admins can read orders"
  ON public.orders FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- (No anon insert/update; rows are written only by the backend using the service role key.)

