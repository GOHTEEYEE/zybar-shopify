-- Customer Activity support: identity merge fields + indexes
-- Reuses sessions, events, cart_sessions, analytics_visitors, orders, newsletter_subscribers

ALTER TABLE public.newsletter_subscribers
  ADD COLUMN IF NOT EXISTS visitor_id TEXT,
  ADD COLUMN IF NOT EXISTS session_id TEXT,
  ADD COLUMN IF NOT EXISTS purchased BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS order_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revenue_cents INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_visitor_id
  ON public.newsletter_subscribers (visitor_id);
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_email
  ON public.newsletter_subscribers (email);
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_created
  ON public.newsletter_subscribers (created_at DESC);

-- Lightweight customer profile hub (merged visitor + email identity)
CREATE TABLE IF NOT EXISTS public.customer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id TEXT UNIQUE,
  email TEXT,
  customer_name TEXT,
  phone TEXT,
  country TEXT,
  city TEXT,
  language TEXT,
  timezone TEXT,
  traffic_source TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  fbclid TEXT,
  gclid TEXT,
  device_type TEXT,
  browser TEXT,
  os TEXT,
  ip_masked TEXT,
  first_seen_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  session_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'anonymous',
  last_product_id TEXT,
  cart_value_cents INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_profiles_email
  ON public.customer_profiles (email);
CREATE INDEX IF NOT EXISTS idx_customer_profiles_last_seen
  ON public.customer_profiles (last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_profiles_status
  ON public.customer_profiles (status);
CREATE INDEX IF NOT EXISTS idx_customer_profiles_country
  ON public.customer_profiles (country);
CREATE INDEX IF NOT EXISTS idx_customer_profiles_traffic
  ON public.customer_profiles (traffic_source);

ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon read customer_profiles" ON public.customer_profiles;
CREATE POLICY "Anon read customer_profiles"
  ON public.customer_profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Service manage customer_profiles" ON public.customer_profiles;
CREATE POLICY "Service manage customer_profiles"
  ON public.customer_profiles FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Extra event indexes for activity queries
CREATE INDEX IF NOT EXISTS idx_events_visitor_created
  ON public.events (visitor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_type_created
  ON public.events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_visitor_started
  ON public.sessions (visitor_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_visitor_id
  ON public.orders (visitor_id);
CREATE INDEX IF NOT EXISTS idx_orders_email
  ON public.orders (customer_email);

COMMENT ON TABLE public.customer_profiles IS 'Merged customer identity for Customer Activity admin module';
COMMENT ON COLUMN public.newsletter_subscribers.visitor_id IS 'Links popup email lead to analytics visitor_id';
