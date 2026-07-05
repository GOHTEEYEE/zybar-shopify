-- Shopify-style analytics v2 — visitors, enriched events/sessions, dashboard RPCs.
-- Run in Supabase SQL Editor after cart analytics migrations (or standalone).

-- --------------------------------------------
-- Prerequisite columns (safe if already applied)
-- --------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS visitor_id TEXT,
  ADD COLUMN IF NOT EXISTS analytics_session_id TEXT,
  ADD COLUMN IF NOT EXISTS cart_id UUID;

-- --------------------------------------------
-- Visitor registry (permanent visitor_id)
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS public.analytics_visitors (
  visitor_id TEXT PRIMARY KEY,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  first_traffic_source TEXT,
  first_referrer TEXT,
  country TEXT,
  device_type TEXT,
  browser TEXT,
  session_count INTEGER NOT NULL DEFAULT 0,
  order_count INTEGER NOT NULL DEFAULT 0,
  total_spent_cents INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_visitors_first_seen
  ON public.analytics_visitors (first_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_visitors_last_seen
  ON public.analytics_visitors (last_seen_at DESC);

ALTER TABLE public.analytics_visitors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anonymous upsert analytics_visitors" ON public.analytics_visitors;
CREATE POLICY "Allow anonymous upsert analytics_visitors"
  ON public.analytics_visitors FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow anonymous update analytics_visitors" ON public.analytics_visitors;
CREATE POLICY "Allow anonymous update analytics_visitors"
  ON public.analytics_visitors FOR UPDATE USING (true) WITH CHECK (true);

-- --------------------------------------------
-- Extend events (Shopify-style dimensions)
-- --------------------------------------------
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS cart_id UUID,
  ADD COLUMN IF NOT EXISTS customer_id TEXT,
  ADD COLUMN IF NOT EXISTS dedup_key TEXT,
  ADD COLUMN IF NOT EXISTS browser TEXT,
  ADD COLUMN IF NOT EXISTS traffic_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS utm_term TEXT,
  ADD COLUMN IF NOT EXISTS utm_content TEXT,
  ADD COLUMN IF NOT EXISTS collection_id TEXT,
  ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_dedup_key
  ON public.events (dedup_key) WHERE dedup_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_traffic_source
  ON public.events (traffic_source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_type_created
  ON public.events (event_type, created_at DESC);

-- --------------------------------------------
-- Extend sessions
-- --------------------------------------------
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS browser TEXT,
  ADD COLUMN IF NOT EXISTS traffic_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS landing_page TEXT,
  ADD COLUMN IF NOT EXISTS is_new_visitor BOOLEAN NOT NULL DEFAULT true;

-- --------------------------------------------
-- Helper: event quantity (Shopify "products added")
-- --------------------------------------------
CREATE OR REPLACE FUNCTION public.event_quantity(ev public.events)
RETURNS INTEGER
LANGUAGE sql IMMUTABLE AS $$
  SELECT GREATEST(1, COALESCE(
    NULLIF(ev.quantity, 0),
    NULLIF((ev.metadata->>'quantity')::integer, 0),
    1
  ));
$$;

-- --------------------------------------------
-- Shopify overview metrics
-- --------------------------------------------
CREATE OR REPLACE FUNCTION public.get_shopify_analytics_overview(p_start TIMESTAMPTZ, p_end TIMESTAMPTZ)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER STABLE AS $$
DECLARE result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'unique_visitors', (
      SELECT COUNT(DISTINCT visitor_id) FROM public.sessions
      WHERE started_at >= p_start AND started_at < p_end
    ),
    'sessions', (
      SELECT COUNT(DISTINCT id::text) FROM public.sessions
      WHERE started_at >= p_start AND started_at < p_end
    ),
    'new_visitors', (
      SELECT COUNT(*) FROM public.analytics_visitors
      WHERE first_seen_at >= p_start AND first_seen_at < p_end
    ),
    'returning_visitors', (
      SELECT COUNT(DISTINCT s.visitor_id) FROM public.sessions s
      JOIN public.analytics_visitors v ON v.visitor_id = s.visitor_id
      WHERE s.started_at >= p_start AND s.started_at < p_end
        AND v.first_seen_at < p_start
    ),
    'product_views', (
      SELECT COUNT(*) FROM public.events
      WHERE event_type = 'product_view' AND created_at >= p_start AND created_at < p_end
    ),
    'collection_views', (
      SELECT COUNT(*) FROM public.events
      WHERE event_type = 'collection_view' AND created_at >= p_start AND created_at < p_end
    ),
    'add_to_cart', (
      SELECT COUNT(*) FROM public.events
      WHERE event_type = 'add_to_cart' AND created_at >= p_start AND created_at < p_end
    ),
    'products_added', (
      SELECT COALESCE(SUM(public.event_quantity(e)), 0)::integer FROM public.events e
      WHERE e.event_type = 'add_to_cart' AND e.created_at >= p_start AND e.created_at < p_end
    ),
    'remove_from_cart', (
      SELECT COUNT(*) FROM public.events
      WHERE event_type = 'remove_from_cart' AND created_at >= p_start AND created_at < p_end
    ),
    'checkout_started', (
      SELECT COUNT(*) FROM public.events
      WHERE event_type = 'begin_checkout' AND created_at >= p_start AND created_at < p_end
    ),
    'shipping_selected', (
      SELECT COUNT(*) FROM public.events
      WHERE event_type = 'shipping_selected' AND created_at >= p_start AND created_at < p_end
    ),
    'payment_started', (
      SELECT COUNT(*) FROM public.events
      WHERE event_type = 'payment_started' AND created_at >= p_start AND created_at < p_end
    ),
    'orders', (
      SELECT COUNT(*) FROM public.orders
      WHERE created_at >= p_start AND created_at < p_end
        AND COALESCE(status, '') NOT IN ('failed', 'canceled')
    ),
    'purchases', (
      SELECT COUNT(*) FROM public.events
      WHERE event_type IN ('purchase', 'payment_success')
        AND created_at >= p_start AND created_at < p_end
    ),
    'revenue_cents', (
      SELECT COALESCE(SUM(amount_total_cents), 0) FROM public.orders
      WHERE created_at >= p_start AND created_at < p_end
        AND COALESCE(status, '') NOT IN ('failed', 'canceled')
    ),
    'avg_order_value_cents', (
      SELECT CASE WHEN COUNT(*) > 0
        THEN ROUND(AVG(amount_total_cents))::integer ELSE 0 END
      FROM public.orders
      WHERE created_at >= p_start AND created_at < p_end
        AND COALESCE(status, '') NOT IN ('failed', 'canceled')
    ),
    'conversion_rate', (
      SELECT CASE WHEN uv.cnt > 0
        THEN ROUND((ord.cnt::numeric / uv.cnt::numeric) * 100, 2) ELSE 0 END
      FROM (
        SELECT COUNT(DISTINCT visitor_id) AS cnt FROM public.sessions
        WHERE started_at >= p_start AND started_at < p_end
      ) uv,
      (
        SELECT COUNT(*) AS cnt FROM public.orders
        WHERE created_at >= p_start AND created_at < p_end
          AND COALESCE(status, '') NOT IN ('failed', 'canceled')
      ) ord
    ),
    'search_events', (
      SELECT COUNT(*) FROM public.events
      WHERE event_type = 'search' AND created_at >= p_start AND created_at < p_end
    ),
    'contact_submits', (
      SELECT COUNT(*) FROM public.events
      WHERE event_type = 'contact_submit' AND created_at >= p_start AND created_at < p_end
    )
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_shopify_analytics_overview(TIMESTAMPTZ, TIMESTAMPTZ) TO anon, authenticated;

-- --------------------------------------------
-- Shopify conversion funnel (with step rates)
-- --------------------------------------------
CREATE OR REPLACE FUNCTION public.get_shopify_conversion_funnel(p_start TIMESTAMPTZ, p_end TIMESTAMPTZ)
RETURNS JSONB
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  WITH steps AS (
    SELECT 'visitors' AS step, 1 AS ord,
      (SELECT COUNT(DISTINCT visitor_id) FROM public.sessions
       WHERE started_at >= p_start AND started_at < p_end) AS cnt
    UNION ALL SELECT 'product_views', 2,
      (SELECT COUNT(DISTINCT visitor_id) FROM public.events
       WHERE event_type = 'product_view' AND created_at >= p_start AND created_at < p_end)
    UNION ALL SELECT 'add_to_cart', 3,
      (SELECT COUNT(DISTINCT visitor_id) FROM public.events
       WHERE event_type = 'add_to_cart' AND created_at >= p_start AND created_at < p_end)
    UNION ALL SELECT 'checkout_started', 4,
      (SELECT COUNT(DISTINCT visitor_id) FROM public.events
       WHERE event_type = 'begin_checkout' AND created_at >= p_start AND created_at < p_end)
    UNION ALL SELECT 'orders', 5,
      (SELECT COUNT(DISTINCT COALESCE(visitor_id, customer_email)) FROM public.orders
       WHERE created_at >= p_start AND created_at < p_end
         AND COALESCE(status, '') NOT IN ('failed', 'canceled'))
  ),
  with_prev AS (
    SELECT step, ord, cnt,
      LAG(cnt) OVER (ORDER BY ord) AS prev_cnt
    FROM steps
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'step', step,
      'count', cnt,
      'order', ord,
      'rate_from_previous', CASE
        WHEN prev_cnt IS NULL OR prev_cnt = 0 THEN 100
        ELSE ROUND((cnt::numeric / prev_cnt::numeric) * 100, 2)
      END
    ) ORDER BY ord
  ), '[]'::jsonb)
  FROM with_prev;
$$;

GRANT EXECUTE ON FUNCTION public.get_shopify_conversion_funnel(TIMESTAMPTZ, TIMESTAMPTZ) TO anon, authenticated;

-- --------------------------------------------
-- Traffic sources (Shopify-style buckets)
-- --------------------------------------------
CREATE OR REPLACE FUNCTION public.get_shopify_traffic_sources(p_start TIMESTAMPTZ, p_end TIMESTAMPTZ)
RETURNS JSONB
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('label', source, 'sessions', sessions, 'visitors', visitors)
    ORDER BY sessions DESC
  ), '[]'::jsonb)
  FROM (
    SELECT COALESCE(NULLIF(traffic_source, ''), 'direct') AS source,
      COUNT(*)::integer AS sessions,
      COUNT(DISTINCT visitor_id)::integer AS visitors
    FROM public.sessions
    WHERE started_at >= p_start AND started_at < p_end
    GROUP BY 1
    ORDER BY sessions DESC
    LIMIT 25
  ) s;
$$;

GRANT EXECUTE ON FUNCTION public.get_shopify_traffic_sources(TIMESTAMPTZ, TIMESTAMPTZ) TO anon, authenticated;

-- --------------------------------------------
-- UTM campaigns
-- --------------------------------------------
CREATE OR REPLACE FUNCTION public.get_shopify_utm_campaigns(p_start TIMESTAMPTZ, p_end TIMESTAMPTZ)
RETURNS JSONB
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  FROM (
    SELECT COALESCE(utm_source, 'unknown') AS utm_source,
      COALESCE(utm_medium, 'unknown') AS utm_medium,
      COALESCE(utm_campaign, 'none') AS utm_campaign,
      COUNT(*)::integer AS sessions
    FROM public.sessions
    WHERE started_at >= p_start AND started_at < p_end
      AND (utm_source IS NOT NULL OR utm_campaign IS NOT NULL)
    GROUP BY 1, 2, 3
    ORDER BY sessions DESC
    LIMIT 30
  ) t;
$$;

GRANT EXECUTE ON FUNCTION public.get_shopify_utm_campaigns(TIMESTAMPTZ, TIMESTAMPTZ) TO anon, authenticated;

-- --------------------------------------------
-- Device, browser, country breakdowns
-- --------------------------------------------
CREATE OR REPLACE FUNCTION public.get_shopify_device_analytics(p_start TIMESTAMPTZ, p_end TIMESTAMPTZ)
RETURNS JSONB
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT jsonb_build_object(
    'devices', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('label', COALESCE(device_type, 'unknown'), 'value', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (
        SELECT COALESCE(device_type, 'unknown') AS device_type, COUNT(DISTINCT visitor_id)::integer AS cnt
        FROM public.sessions WHERE started_at >= p_start AND started_at < p_end
        GROUP BY 1 ORDER BY cnt DESC
      ) d
    ),
    'browsers', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('label', COALESCE(browser, 'other'), 'value', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (
        SELECT COALESCE(browser, 'other') AS browser, COUNT(DISTINCT visitor_id)::integer AS cnt
        FROM public.sessions WHERE started_at >= p_start AND started_at < p_end
        GROUP BY 1 ORDER BY cnt DESC LIMIT 10
      ) b
    ),
    'countries', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('label', COALESCE(country, 'Unknown'), 'value', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (
        SELECT COALESCE(country, 'Unknown') AS country, COUNT(DISTINCT visitor_id)::integer AS cnt
        FROM public.sessions WHERE started_at >= p_start AND started_at < p_end
        GROUP BY 1 ORDER BY cnt DESC LIMIT 25
      ) c
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_shopify_device_analytics(TIMESTAMPTZ, TIMESTAMPTZ) TO anon, authenticated;

-- --------------------------------------------
-- Top products (views, adds, conversion, revenue)
-- --------------------------------------------
CREATE OR REPLACE FUNCTION public.get_shopify_top_products(p_start TIMESTAMPTZ, p_end TIMESTAMPTZ)
RETURNS JSONB
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT jsonb_build_object(
    'most_viewed', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT product_id, COUNT(*)::integer AS views
        FROM public.events
        WHERE event_type = 'product_view' AND created_at >= p_start AND created_at < p_end
          AND product_id IS NOT NULL
        GROUP BY product_id ORDER BY views DESC LIMIT 15
      ) t
    ),
    'most_added', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT product_id,
          COUNT(*)::integer AS add_events,
          SUM(public.event_quantity(e))::integer AS products_added
        FROM public.events e
        WHERE event_type = 'add_to_cart' AND created_at >= p_start AND created_at < p_end
          AND product_id IS NOT NULL
        GROUP BY product_id ORDER BY products_added DESC LIMIT 15
      ) t
    ),
    'highest_revenue', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT product_slug AS product_id,
          SUM(amount_total_cents)::integer AS revenue_cents,
          COUNT(*)::integer AS orders
        FROM public.orders
        WHERE created_at >= p_start AND created_at < p_end
          AND product_slug IS NOT NULL
          AND COALESCE(status, '') NOT IN ('failed', 'canceled')
        GROUP BY product_slug ORDER BY revenue_cents DESC LIMIT 15
      ) t
    ),
    'highest_conversion', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT v.product_id,
          v.views,
          COALESCE(o.orders, 0) AS orders,
          CASE WHEN v.views > 0
            THEN ROUND((COALESCE(o.orders, 0)::numeric / v.views::numeric) * 100, 2)
            ELSE 0 END AS conversion_rate
        FROM (
          SELECT product_id, COUNT(DISTINCT visitor_id)::integer AS views
          FROM public.events
          WHERE event_type = 'product_view' AND created_at >= p_start AND created_at < p_end
            AND product_id IS NOT NULL
          GROUP BY product_id
        ) v
        LEFT JOIN (
          SELECT product_slug AS product_id, COUNT(*)::integer AS orders
          FROM public.orders
          WHERE created_at >= p_start AND created_at < p_end
            AND COALESCE(status, '') NOT IN ('failed', 'canceled')
          GROUP BY product_slug
        ) o ON o.product_id = v.product_id
        WHERE v.views >= 3
        ORDER BY conversion_rate DESC, orders DESC
        LIMIT 15
      ) t
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_shopify_top_products(TIMESTAMPTZ, TIMESTAMPTZ) TO anon, authenticated;

-- --------------------------------------------
-- Realtime (last 5 minutes)
-- --------------------------------------------
CREATE OR REPLACE FUNCTION public.get_shopify_realtime()
RETURNS JSONB
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT jsonb_build_object(
    'active_visitors', (
      SELECT COUNT(DISTINCT visitor_id)::integer FROM public.sessions
      WHERE last_activity_at >= (NOW() - INTERVAL '5 minutes')
    ),
    'active_sessions', (
      SELECT COUNT(*)::integer FROM public.sessions
      WHERE last_activity_at >= (NOW() - INTERVAL '5 minutes')
    ),
    'active_carts', (
      SELECT COUNT(*)::integer FROM public.cart_sessions
      WHERE status = 'active' AND last_activity_at >= (NOW() - INTERVAL '30 minutes')
        AND item_count > 0
    ),
    'checkout_users', (
      SELECT COUNT(DISTINCT visitor_id)::integer FROM public.cart_sessions
      WHERE status = 'checkout_started' AND last_activity_at >= (NOW() - INTERVAL '30 minutes')
    ),
    'recent_events', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT event_type, product_id, visitor_id, page_url, created_at
        FROM public.events
        WHERE created_at >= (NOW() - INTERVAL '5 minutes')
        ORDER BY created_at DESC LIMIT 20
      ) t
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_shopify_realtime() TO anon, authenticated;

-- Alias legacy RPC to Shopify overview for backward compatibility
CREATE OR REPLACE FUNCTION public.get_analytics_overview(p_start TIMESTAMPTZ, p_end TIMESTAMPTZ)
RETURNS JSONB
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT public.get_shopify_analytics_overview(p_start, p_end)
    || jsonb_build_object(
      'visitors', (SELECT (public.get_shopify_analytics_overview(p_start, p_end)->>'unique_visitors')::integer),
      'checkout_started', (SELECT (public.get_shopify_analytics_overview(p_start, p_end)->>'checkout_started')::integer)
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_analytics_overview(TIMESTAMPTZ, TIMESTAMPTZ) TO anon, authenticated;
