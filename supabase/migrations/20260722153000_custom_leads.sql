-- Custom Made lead tracking: uploads, cart, checkout, purchase (even without payment)

CREATE TABLE IF NOT EXISTS public.custom_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_session_id TEXT NOT NULL UNIQUE,
  visitor_id TEXT,
  analytics_session_id TEXT,
  cart_id TEXT,
  status TEXT NOT NULL DEFAULT 'started',
  vehicle_model TEXT,
  lighting_preference TEXT,
  uploaded_photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  size TEXT,
  power_type TEXT,
  cart_value_cents INTEGER NOT NULL DEFAULT 0,
  customer_email TEXT,
  order_id UUID,
  stripe_session_id TEXT,
  custom_order_id UUID,
  country TEXT,
  device_type TEXT,
  referrer TEXT,
  page_url TEXT,
  last_event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  purchased_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_leads_status ON public.custom_leads (status);
CREATE INDEX IF NOT EXISTS idx_custom_leads_visitor_id ON public.custom_leads (visitor_id);
CREATE INDEX IF NOT EXISTS idx_custom_leads_last_event ON public.custom_leads (last_event_at DESC);
CREATE INDEX IF NOT EXISTS idx_custom_leads_created ON public.custom_leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_custom_leads_email ON public.custom_leads (customer_email);
CREATE INDEX IF NOT EXISTS idx_custom_leads_stripe_session ON public.custom_leads (stripe_session_id);

ALTER TABLE public.custom_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access custom_leads" ON public.custom_leads;
CREATE POLICY "Service role full access custom_leads"
  ON public.custom_leads
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.custom_leads IS 'Custom Made funnel leads: photo upload through purchase or abandonment';
