-- Cart Analytics & Conversion Tracking
-- Run in Supabase SQL Editor or via supabase db push

-- --------------------------------------------
-- Extend events for rich funnel metadata
-- --------------------------------------------
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS cart_id UUID,
  ADD COLUMN IF NOT EXISTS customer_id TEXT,
  ADD COLUMN IF NOT EXISTS dedup_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_dedup_key
  ON public.events (dedup_key)
  WHERE dedup_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_events_type_created
  ON public.events (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_events_cart_id
  ON public.events (cart_id)
  WHERE cart_id IS NOT NULL;

-- --------------------------------------------
-- Cart sessions (persistent cart state for analytics)
-- --------------------------------------------
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

CREATE INDEX IF NOT EXISTS idx_cart_sessions_visitor
  ON public.cart_sessions (visitor_id);

CREATE INDEX IF NOT EXISTS idx_cart_sessions_status_activity
  ON public.cart_sessions (status, last_activity_at DESC);

CREATE INDEX IF NOT EXISTS idx_cart_sessions_created
  ON public.cart_sessions (created_at DESC);

-- One open cart per visitor (active or checkout_started)
CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_sessions_open_visitor
  ON public.cart_sessions (visitor_id)
  WHERE status IN ('active', 'checkout_started');

-- --------------------------------------------
-- Cart session line items
-- --------------------------------------------
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

CREATE INDEX IF NOT EXISTS idx_cart_session_items_cart
  ON public.cart_session_items (cart_id);

-- --------------------------------------------
-- Orders attribution columns
-- --------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS visitor_id TEXT,
  ADD COLUMN IF NOT EXISTS analytics_session_id TEXT,
  ADD COLUMN IF NOT EXISTS cart_id UUID;

CREATE INDEX IF NOT EXISTS idx_orders_visitor_id ON public.orders (visitor_id);
CREATE INDEX IF NOT EXISTS idx_orders_cart_id ON public.orders (cart_id);

-- --------------------------------------------
-- RLS
-- --------------------------------------------
ALTER TABLE public.cart_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_session_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous insert cart_sessions"
  ON public.cart_sessions FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow anonymous update cart_sessions"
  ON public.cart_sessions FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Allow anonymous select own cart by id"
  ON public.cart_sessions FOR SELECT USING (true);

CREATE POLICY "Allow anonymous insert cart_session_items"
  ON public.cart_session_items FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow anonymous update cart_session_items"
  ON public.cart_session_items FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Allow anonymous delete cart_session_items"
  ON public.cart_session_items FOR DELETE USING (true);

CREATE POLICY "Allow anonymous select cart_session_items"
  ON public.cart_session_items FOR SELECT USING (true);

-- --------------------------------------------
-- Mark carts abandoned after 24h inactivity
-- --------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_abandoned_carts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE public.cart_sessions
  SET
    status = 'abandoned',
    recovery_status = CASE WHEN recovery_status = 'none' THEN 'none' ELSE recovery_status END,
    abandoned_at = COALESCE(abandoned_at, NOW())
  WHERE status IN ('active', 'checkout_started')
    AND last_activity_at < (NOW() - INTERVAL '24 hours')
    AND purchased_at IS NULL;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_abandoned_carts() TO anon;
GRANT EXECUTE ON FUNCTION public.mark_abandoned_carts() TO authenticated;

-- --------------------------------------------
-- Analytics overview (admin dashboard via RPC)
-- --------------------------------------------
CREATE OR REPLACE FUNCTION public.get_analytics_overview(p_start TIMESTAMPTZ, p_end TIMESTAMPTZ)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  result JSONB;
BEGIN
  PERFORM public.mark_abandoned_carts();

  SELECT jsonb_build_object(
    'visitors', (SELECT COUNT(DISTINCT visitor_id) FROM public.sessions WHERE started_at >= p_start AND started_at < p_end),
    'product_views', (SELECT COUNT(*) FROM public.events WHERE event_type = 'product_view' AND created_at >= p_start AND created_at < p_end),
    'add_to_cart', (SELECT COUNT(*) FROM public.events WHERE event_type = 'add_to_cart' AND created_at >= p_start AND created_at < p_end),
    'checkout_started', (SELECT COUNT(*) FROM public.events WHERE event_type IN ('begin_checkout', 'checkout_started') AND created_at >= p_start AND created_at < p_end),
    'payment_started', (SELECT COUNT(*) FROM public.events WHERE event_type = 'payment_started' AND created_at >= p_start AND created_at < p_end),
    'orders', (SELECT COUNT(*) FROM public.orders WHERE created_at >= p_start AND created_at < p_end),
    'revenue_cents', (SELECT COALESCE(SUM(amount_total_cents), 0) FROM public.orders WHERE created_at >= p_start AND created_at < p_end),
    'unique_cart_sessions', (SELECT COUNT(DISTINCT id) FROM public.cart_sessions WHERE created_at >= p_start AND created_at < p_end),
    'abandoned_carts', (SELECT COUNT(*) FROM public.cart_sessions WHERE status = 'abandoned' AND abandoned_at >= p_start AND abandoned_at < p_end),
    'avg_order_value_cents', (
      SELECT CASE WHEN COUNT(*) > 0 THEN ROUND(AVG(amount_total_cents))::integer ELSE 0 END
      FROM public.orders WHERE created_at >= p_start AND created_at < p_end
    )
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_analytics_overview(TIMESTAMPTZ, TIMESTAMPTZ) TO anon;
GRANT EXECUTE ON FUNCTION public.get_analytics_overview(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- --------------------------------------------
-- Conversion funnel
-- --------------------------------------------
CREATE OR REPLACE FUNCTION public.get_conversion_funnel(p_start TIMESTAMPTZ, p_end TIMESTAMPTZ)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  WITH steps AS (
    SELECT 'website_visits' AS step, 1 AS ord,
      (SELECT COUNT(DISTINCT visitor_id) FROM public.sessions WHERE started_at >= p_start AND started_at < p_end) AS cnt
    UNION ALL
    SELECT 'product_views', 2,
      (SELECT COUNT(DISTINCT visitor_id) FROM public.events WHERE event_type = 'product_view' AND created_at >= p_start AND created_at < p_end)
    UNION ALL
    SELECT 'add_to_cart', 3,
      (SELECT COUNT(DISTINCT visitor_id) FROM public.events WHERE event_type = 'add_to_cart' AND created_at >= p_start AND created_at < p_end)
    UNION ALL
    SELECT 'checkout_started', 4,
      (SELECT COUNT(DISTINCT visitor_id) FROM public.events WHERE event_type IN ('begin_checkout', 'checkout_started') AND created_at >= p_start AND created_at < p_end)
    UNION ALL
    SELECT 'payment_started', 5,
      (SELECT COUNT(DISTINCT visitor_id) FROM public.events WHERE event_type = 'payment_started' AND created_at >= p_start AND created_at < p_end)
    UNION ALL
    SELECT 'completed_orders', 6,
      (SELECT COUNT(*) FROM public.orders WHERE created_at >= p_start AND created_at < p_end)
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'step', step,
      'count', cnt,
      'order', ord
    ) ORDER BY ord
  ), '[]'::jsonb)
  FROM steps;
$$;

GRANT EXECUTE ON FUNCTION public.get_conversion_funnel(TIMESTAMPTZ, TIMESTAMPTZ) TO anon;
GRANT EXECUTE ON FUNCTION public.get_conversion_funnel(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- --------------------------------------------
-- Cart analytics summary
-- --------------------------------------------
CREATE OR REPLACE FUNCTION public.get_cart_analytics_summary(p_start TIMESTAMPTZ, p_end TIMESTAMPTZ)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_add_to_cart', (SELECT COUNT(*) FROM public.events WHERE event_type = 'add_to_cart' AND created_at >= p_start AND created_at < p_end),
    'unique_cart_sessions', (SELECT COUNT(DISTINCT id) FROM public.cart_sessions WHERE created_at >= p_start AND created_at < p_end),
    'avg_cart_value_cents', (
      SELECT CASE WHEN COUNT(*) > 0 THEN ROUND(AVG(cart_value_cents))::integer ELSE 0 END
      FROM public.cart_sessions WHERE created_at >= p_start AND created_at < p_end AND cart_value_cents > 0
    ),
    'avg_items_per_cart', (
      SELECT CASE WHEN COUNT(*) > 0 THEN ROUND(AVG(item_count)::numeric, 2) ELSE 0 END
      FROM public.cart_sessions WHERE created_at >= p_start AND created_at < p_end AND item_count > 0
    ),
    'top_products', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT product_id, product_name, SUM(quantity)::integer AS total_qty
        FROM public.cart_session_items i
        JOIN public.cart_sessions c ON c.id = i.cart_id
        WHERE c.created_at >= p_start AND c.created_at < p_end
        GROUP BY product_id, product_name
        ORDER BY total_qty DESC
        LIMIT 10
      ) t
    ),
    'top_sizes', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT size, SUM(quantity)::integer AS total_qty
        FROM public.cart_session_items i
        JOIN public.cart_sessions c ON c.id = i.cart_id
        WHERE c.created_at >= p_start AND c.created_at < p_end AND size IS NOT NULL
        GROUP BY size ORDER BY total_qty DESC LIMIT 5
      ) t
    ),
    'top_power_types', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT power_type, SUM(quantity)::integer AS total_qty
        FROM public.cart_session_items i
        JOIN public.cart_sessions c ON c.id = i.cart_id
        WHERE c.created_at >= p_start AND c.created_at < p_end AND power_type IS NOT NULL
        GROUP BY power_type ORDER BY total_qty DESC LIMIT 5
      ) t
    ),
    'top_led_colors', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT led_color, SUM(quantity)::integer AS total_qty
        FROM public.cart_session_items i
        JOIN public.cart_sessions c ON c.id = i.cart_id
        WHERE c.created_at >= p_start AND c.created_at < p_end AND led_color IS NOT NULL AND led_color <> ''
        GROUP BY led_color ORDER BY total_qty DESC LIMIT 5
      ) t
    )
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_cart_analytics_summary(TIMESTAMPTZ, TIMESTAMPTZ) TO anon;
GRANT EXECUTE ON FUNCTION public.get_cart_analytics_summary(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- --------------------------------------------
-- Abandoned carts list
-- --------------------------------------------
CREATE OR REPLACE FUNCTION public.get_abandoned_carts(p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  PERFORM public.mark_abandoned_carts();

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    FROM (
      SELECT
        c.id AS cart_id,
        c.visitor_id,
        c.customer_id,
        c.created_at,
        c.last_activity_at,
        c.cart_value_cents,
        c.item_count,
        c.status,
        c.recovery_status,
        c.country,
        c.device_type,
        (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'product_id', i.product_id,
            'product_name', i.product_name,
            'size', i.size,
            'power_type', i.power_type,
            'quantity', i.quantity
          )), '[]'::jsonb)
          FROM public.cart_session_items i WHERE i.cart_id = c.id
        ) AS products
      FROM public.cart_sessions c
      WHERE c.status IN ('abandoned', 'checkout_started')
        AND c.purchased_at IS NULL
        AND c.item_count > 0
      ORDER BY c.last_activity_at DESC
      LIMIT GREATEST(1, LEAST(p_limit, 200))
      OFFSET GREATEST(0, p_offset)
    ) t
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_abandoned_carts(integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_abandoned_carts(integer, integer) TO authenticated;

-- --------------------------------------------
-- Trend series for charts
-- --------------------------------------------
CREATE OR REPLACE FUNCTION public.get_analytics_trends(
  p_start TIMESTAMPTZ,
  p_end TIMESTAMPTZ,
  p_granularity TEXT DEFAULT 'day'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  trunc_unit TEXT;
BEGIN
  trunc_unit := CASE
    WHEN p_granularity = 'week' THEN 'week'
    WHEN p_granularity = 'month' THEN 'month'
    ELSE 'day'
  END;

  RETURN jsonb_build_object(
    'revenue', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d, 'value', v) ORDER BY d), '[]'::jsonb)
      FROM (
        SELECT date_trunc(trunc_unit, created_at)::date AS d, SUM(amount_total_cents)::integer AS v
        FROM public.orders
        WHERE created_at >= p_start AND created_at < p_end
        GROUP BY 1
      ) s
    ),
    'orders', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d, 'value', v) ORDER BY d), '[]'::jsonb)
      FROM (
        SELECT date_trunc(trunc_unit, created_at)::date AS d, COUNT(*)::integer AS v
        FROM public.orders
        WHERE created_at >= p_start AND created_at < p_end
        GROUP BY 1
      ) s
    ),
    'add_to_cart', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d, 'value', v) ORDER BY d), '[]'::jsonb)
      FROM (
        SELECT date_trunc(trunc_unit, created_at)::date AS d, COUNT(*)::integer AS v
        FROM public.events
        WHERE event_type = 'add_to_cart' AND created_at >= p_start AND created_at < p_end
        GROUP BY 1
      ) s
    ),
    'checkout', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d, 'value', v) ORDER BY d), '[]'::jsonb)
      FROM (
        SELECT date_trunc(trunc_unit, created_at)::date AS d, COUNT(*)::integer AS v
        FROM public.events
        WHERE event_type IN ('begin_checkout', 'checkout_started') AND created_at >= p_start AND created_at < p_end
        GROUP BY 1
      ) s
    ),
    'visitors', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d, 'value', v) ORDER BY d), '[]'::jsonb)
      FROM (
        SELECT date_trunc(trunc_unit, started_at)::date AS d, COUNT(DISTINCT visitor_id)::integer AS v
        FROM public.sessions
        WHERE started_at >= p_start AND started_at < p_end
        GROUP BY 1
      ) s
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_analytics_trends(TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_analytics_trends(TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO authenticated;

-- --------------------------------------------
-- Country & device distribution
-- --------------------------------------------
CREATE OR REPLACE FUNCTION public.get_analytics_distributions(p_start TIMESTAMPTZ, p_end TIMESTAMPTZ)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT jsonb_build_object(
    'countries', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('label', COALESCE(country, 'Unknown'), 'value', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (
        SELECT COALESCE(country, 'Unknown') AS country, COUNT(*)::integer AS cnt
        FROM public.sessions
        WHERE started_at >= p_start AND started_at < p_end
        GROUP BY 1 ORDER BY cnt DESC LIMIT 20
      ) s
    ),
    'devices', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('label', COALESCE(device_type, 'unknown'), 'value', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (
        SELECT COALESCE(device_type, 'unknown') AS device_type, COUNT(*)::integer AS cnt
        FROM public.sessions
        WHERE started_at >= p_start AND started_at < p_end
        GROUP BY 1 ORDER BY cnt DESC
      ) s
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_analytics_distributions(TIMESTAMPTZ, TIMESTAMPTZ) TO anon;
GRANT EXECUTE ON FUNCTION public.get_analytics_distributions(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- --------------------------------------------
-- Top products performance
-- --------------------------------------------
CREATE OR REPLACE FUNCTION public.get_top_products_analytics(p_start TIMESTAMPTZ, p_end TIMESTAMPTZ)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT jsonb_build_object(
    'most_viewed', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT product_id, COUNT(*)::integer AS views
        FROM public.events
        WHERE event_type = 'product_view' AND created_at >= p_start AND created_at < p_end AND product_id IS NOT NULL
        GROUP BY product_id ORDER BY views DESC LIMIT 10
      ) t
    ),
    'most_added', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT product_id, COUNT(*)::integer AS adds
        FROM public.events
        WHERE event_type = 'add_to_cart' AND created_at >= p_start AND created_at < p_end AND product_id IS NOT NULL
        GROUP BY product_id ORDER BY adds DESC LIMIT 10
      ) t
    ),
    'highest_revenue', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT product_slug AS product_id, SUM(amount_total_cents)::integer AS revenue_cents, COUNT(*)::integer AS orders
        FROM public.orders
        WHERE created_at >= p_start AND created_at < p_end AND product_slug IS NOT NULL
        GROUP BY product_slug ORDER BY revenue_cents DESC LIMIT 10
      ) t
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_top_products_analytics(TIMESTAMPTZ, TIMESTAMPTZ) TO anon;
GRANT EXECUTE ON FUNCTION public.get_top_products_analytics(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
