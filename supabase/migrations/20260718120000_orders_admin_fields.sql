-- Admin order ops fields (fulfillment, tracking, notes, payment method)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shipping_method TEXT,
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS fulfillment_status TEXT DEFAULT 'unfulfilled',
  ADD COLUMN IF NOT EXISTS tracking_number TEXT,
  ADD COLUMN IF NOT EXISTS billing_address TEXT,
  ADD COLUMN IF NOT EXISTS billing_city TEXT,
  ADD COLUMN IF NOT EXISTS billing_state TEXT,
  ADD COLUMN IF NOT EXISTS billing_postcode TEXT,
  ADD COLUMN IF NOT EXISTS billing_country TEXT,
  ADD COLUMN IF NOT EXISTS internal_notes TEXT,
  ADD COLUMN IF NOT EXISTS refund_status TEXT,
  ADD COLUMN IF NOT EXISTS line_items JSONB;

COMMENT ON COLUMN public.orders.shipping_method IS 'Checkout shipping method code (standard/priority/etc)';
COMMENT ON COLUMN public.orders.payment_method IS 'Card brand / wallet from Stripe when known';
COMMENT ON COLUMN public.orders.fulfillment_status IS 'unfulfilled | processing | shipped | delivered | cancelled';
COMMENT ON COLUMN public.orders.tracking_number IS 'Carrier tracking number';
COMMENT ON COLUMN public.orders.internal_notes IS 'Admin-only notes';
COMMENT ON COLUMN public.orders.refund_status IS 'none | partial | full';
COMMENT ON COLUMN public.orders.line_items IS 'Optional JSON array of purchased line items';

-- Allow authenticated admins to update operational fields
DROP POLICY IF EXISTS "Admins can update orders" ON public.orders;
CREATE POLICY "Admins can update orders"
  ON public.orders FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- Temporary anon update for admin SPA when using anon key + admin code gate
-- (matches pattern used by shipping_methods / store pricing admin)
DROP POLICY IF EXISTS "Anon update order ops" ON public.orders;
CREATE POLICY "Anon update order ops"
  ON public.orders FOR UPDATE
  USING (true)
  WITH CHECK (true);
