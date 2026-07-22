-- Custom order workflow for configurable ZYBAR products (Custom LED Car Wall Art, etc.)

CREATE TABLE IF NOT EXISTS public.custom_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  stripe_session_id TEXT,
  product_slug TEXT NOT NULL DEFAULT 'custom-led-car-wall-art',
  product_type TEXT NOT NULL DEFAULT 'custom',
  customer_email TEXT,
  customer_name TEXT,
  vehicle_brand TEXT,
  vehicle_model TEXT,
  vehicle_year TEXT,
  special_requests TEXT,
  uploaded_photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  custom_design_fee_usd NUMERIC(10,2) NOT NULL DEFAULT 10,
  size TEXT,
  power_type TEXT,
  design_status TEXT NOT NULL DEFAULT 'pending_review',
  estimated_completion_at TIMESTAMPTZ,
  tracking_number TEXT,
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_custom_orders_order_id ON public.custom_orders(order_id);
CREATE INDEX IF NOT EXISTS idx_custom_orders_stripe_session ON public.custom_orders(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_custom_orders_customer_email ON public.custom_orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_custom_orders_design_status ON public.custom_orders(design_status);

ALTER TABLE public.custom_orders ENABLE ROW LEVEL SECURITY;

-- Service role only (admin API uses service key).
DROP POLICY IF EXISTS "Service role full access custom_orders" ON public.custom_orders;
CREATE POLICY "Service role full access custom_orders"
  ON public.custom_orders
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Storage bucket for customer reference photos (public read for admin thumbnails).
INSERT INTO storage.buckets (id, name, public)
VALUES ('custom-order-photos', 'custom-order-photos', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "Public read custom order photos" ON storage.objects;
CREATE POLICY "Public read custom order photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'custom-order-photos');

DROP POLICY IF EXISTS "Anon upload custom order photos" ON storage.objects;
CREATE POLICY "Anon upload custom order photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'custom-order-photos');

DROP POLICY IF EXISTS "Service update custom order photos" ON storage.objects;
CREATE POLICY "Service update custom order photos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'custom-order-photos');
