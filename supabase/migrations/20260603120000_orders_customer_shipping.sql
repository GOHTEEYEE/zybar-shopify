-- Phase 2: persist customer shipping details on orders (Stripe checkout.session.completed)
-- Run in Supabase SQL Editor or: supabase db push (if using Supabase CLI linked to project)

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS customer_phone TEXT,
  ADD COLUMN IF NOT EXISTS shipping_address TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS postcode TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT;

COMMENT ON COLUMN public.orders.shipping_address IS 'Street address (line1 + line2), not full formatted address';
COMMENT ON COLUMN public.orders.city IS 'Shipping city from Stripe customer_details.address';
COMMENT ON COLUMN public.orders.country IS 'ISO 3166-1 alpha-2 country code from Stripe';
