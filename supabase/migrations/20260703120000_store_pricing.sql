-- Store pricing — single source of truth (shipping, power upgrades, discounts)
-- Product size prices live on public.products (price_30x45_rm, price_40x60_rm)

-- --------------------------------------------
-- Shipping methods
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS public.shipping_methods (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  price_usd NUMERIC(10, 2) NOT NULL CHECK (price_usd >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --------------------------------------------
-- Power type upgrades (added to product size price)
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS public.power_upgrades (
  power_type TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  price_usd NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (price_usd >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- --------------------------------------------
-- Discount codes (future-ready)
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS public.discount_codes (
  code TEXT PRIMARY KEY,
  label TEXT,
  discount_type TEXT NOT NULL DEFAULT 'fixed'
    CHECK (discount_type IN ('fixed', 'percent')),
  value_usd NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (value_usd >= 0),
  min_order_usd NUMERIC(10, 2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discount_codes_active ON public.discount_codes (active);

-- --------------------------------------------
-- RLS — public read, admin manages via anon policy (matches products pattern)
-- --------------------------------------------
ALTER TABLE public.shipping_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.power_upgrades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discount_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read shipping_methods" ON public.shipping_methods;
CREATE POLICY "Public read shipping_methods"
  ON public.shipping_methods FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anon manage shipping_methods" ON public.shipping_methods;
CREATE POLICY "Anon manage shipping_methods"
  ON public.shipping_methods FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public read power_upgrades" ON public.power_upgrades;
CREATE POLICY "Public read power_upgrades"
  ON public.power_upgrades FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anon manage power_upgrades" ON public.power_upgrades;
CREATE POLICY "Anon manage power_upgrades"
  ON public.power_upgrades FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public read discount_codes" ON public.discount_codes;
CREATE POLICY "Public read discount_codes"
  ON public.discount_codes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anon manage discount_codes" ON public.discount_codes;
CREATE POLICY "Anon manage discount_codes"
  ON public.discount_codes FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------
-- Seed defaults (match prior storefront values; edit in Admin → Pricing)
-- --------------------------------------------
INSERT INTO public.shipping_methods (code, label, description, price_usd, sort_order, is_default, active)
VALUES
  ('standard', 'Standard Shipping', 'Estimated delivery: 14–18 business days', 23.99, 1, true, true),
  ('priority', 'Priority Shipping', 'Estimated delivery: 7–14 business days', 26.99, 2, false, true)
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  price_usd = EXCLUDED.price_usd,
  sort_order = EXCLUDED.sort_order,
  is_default = EXCLUDED.is_default,
  active = EXCLUDED.active,
  updated_at = NOW();

INSERT INTO public.power_upgrades (power_type, label, price_usd, active)
VALUES
  ('usb', 'USB Only', 0, true),
  ('dual', 'USB + Battery', 12, true)
ON CONFLICT (power_type) DO UPDATE SET
  label = EXCLUDED.label,
  price_usd = EXCLUDED.price_usd,
  active = EXCLUDED.active,
  updated_at = NOW();

-- Backfill product prices from legacy base if null (one-time; adjust in Admin → Products)
UPDATE public.products
SET
  price_30x45_rm = COALESCE(price_30x45_rm, price_rm, 76),
  price_40x60_rm = COALESCE(price_40x60_rm, price_rm, 91),
  price_rm = COALESCE(price_rm, price_30x45_rm, 76)
WHERE price_30x45_rm IS NULL OR price_40x60_rm IS NULL OR price_rm IS NULL;

-- --------------------------------------------
-- RPC: full pricing catalog for storefront + server
-- --------------------------------------------
CREATE OR REPLACE FUNCTION public.get_store_pricing()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT jsonb_build_object(
    'currency', 'USD',
    'updatedAt', NOW(),
    'products', COALESCE((
      SELECT jsonb_object_agg(
        p.id,
        jsonb_build_object(
          'id', p.id,
          'name', p.name,
          'slug', COALESCE(p.slug, p.id),
          'status', COALESCE(p.status, 'active'),
          'prices', jsonb_build_object(
            '30x45', COALESCE(p.price_30x45_rm, p.price_rm, 0)::numeric,
            '40x60', COALESCE(p.price_40x60_rm, p.price_rm, 0)::numeric
          )
        )
      )
      FROM public.products p
      WHERE COALESCE(p.status, 'active') = 'active'
    ), '{}'::jsonb),
    'shippingMethods', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'code', s.code,
          'label', s.label,
          'description', s.description,
          'priceUsd', s.price_usd::numeric,
          'sortOrder', s.sort_order,
          'isDefault', s.is_default
        ) ORDER BY s.sort_order, s.code
      )
      FROM public.shipping_methods s
      WHERE s.active = true
    ), '[]'::jsonb),
    'powerUpgrades', COALESCE((
      SELECT jsonb_object_agg(
        pu.power_type,
        jsonb_build_object(
          'powerType', pu.power_type,
          'label', pu.label,
          'priceUsd', pu.price_usd::numeric
        )
      )
      FROM public.power_upgrades pu
      WHERE pu.active = true
    ), '{}'::jsonb),
    'discountCodes', COALESCE((
      SELECT jsonb_object_agg(
        lower(d.code),
        jsonb_build_object(
          'code', d.code,
          'label', d.label,
          'discountType', d.discount_type,
          'valueUsd', d.value_usd::numeric,
          'minOrderUsd', d.min_order_usd::numeric
        )
      )
      FROM public.discount_codes d
      WHERE d.active = true
        AND (d.starts_at IS NULL OR d.starts_at <= NOW())
        AND (d.ends_at IS NULL OR d.ends_at > NOW())
    ), '{}'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_store_pricing() TO anon;
GRANT EXECUTE ON FUNCTION public.get_store_pricing() TO authenticated;
