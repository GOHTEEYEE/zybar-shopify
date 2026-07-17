-- Newsletter / premium garage lead capture
CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  discount_code TEXT NOT NULL DEFAULT 'ZYBAR15',
  source TEXT NOT NULL DEFAULT 'premium_popup',
  browser TEXT,
  country TEXT,
  device TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'unsubscribed', 'bounced')),
  used_discount BOOLEAN NOT NULL DEFAULT false,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS newsletter_subscribers_email_unique
  ON public.newsletter_subscribers (lower(email));

CREATE INDEX IF NOT EXISTS newsletter_subscribers_created_at_idx
  ON public.newsletter_subscribers (created_at DESC);

CREATE INDEX IF NOT EXISTS newsletter_subscribers_status_idx
  ON public.newsletter_subscribers (status);

ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

-- Public clients must not read/write directly; service role bypasses RLS.
DROP POLICY IF EXISTS "No public access newsletter_subscribers" ON public.newsletter_subscribers;
CREATE POLICY "No public access newsletter_subscribers"
  ON public.newsletter_subscribers
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- Seed the shared 15% welcome code used by the garage popup.
INSERT INTO public.discount_codes (code, label, discount_type, value_usd, min_order_usd, active)
VALUES (
  'ZYBAR15',
  'ZYBAR Garage welcome — 15% off first order',
  'percent',
  15.00,
  0,
  true
)
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  discount_type = EXCLUDED.discount_type,
  value_usd = EXCLUDED.value_usd,
  min_order_usd = EXCLUDED.min_order_usd,
  active = true,
  updated_at = NOW();
