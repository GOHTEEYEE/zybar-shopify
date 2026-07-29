-- Exclude LUNEVA butterfly traffic from ZYBAR automotive analytics RPCs.

CREATE OR REPLACE FUNCTION public.is_luneva_landing_page(p text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p, '') ILIKE '%/luneva%'
    OR COALESCE(p, '') ILIKE '%/products/luneva-%';
$$;

CREATE OR REPLACE FUNCTION public.is_luneva_event_row(
  p_collection_id text,
  p_page_url text,
  p_product_id text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_collection_id, '') = 'luneva'
    OR COALESCE(p_page_url, '') ILIKE '%/luneva%'
    OR COALESCE(p_page_url, '') ILIKE '%/products/luneva-%'
    OR COALESCE(p_product_id, '') ILIKE 'luneva-%';
$$;

CREATE OR REPLACE FUNCTION public.is_luneva_order_row(
  p_product_slug text,
  p_line_items jsonb
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(p_product_slug, '') ILIKE 'luneva-%'
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(p_line_items, '[]'::jsonb)) AS item
      WHERE COALESCE(
        item->>'slug',
        item->>'productSlug',
        item->>'product_slug',
        ''
      ) ILIKE 'luneva-%'
    );
$$;

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
        AND NOT public.is_luneva_landing_page(landing_page)
    ),
    'sessions', (
      SELECT COUNT(DISTINCT id::text) FROM public.sessions
      WHERE started_at >= p_start AND started_at < p_end
        AND NOT public.is_luneva_landing_page(landing_page)
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
        AND NOT public.is_luneva_landing_page(s.landing_page)
    ),
    'product_views', (
      SELECT COUNT(*) FROM public.events e
      WHERE e.event_type = 'product_view' AND e.created_at >= p_start AND e.created_at < p_end
        AND NOT public.is_luneva_event_row(e.collection_id, e.page_url, e.product_id)
    ),
    'collection_views', (
      SELECT COUNT(*) FROM public.events e
      WHERE e.event_type = 'collection_view' AND e.created_at >= p_start AND e.created_at < p_end
        AND NOT public.is_luneva_event_row(e.collection_id, e.page_url, e.product_id)
    ),
    'add_to_cart', (
      SELECT COUNT(*) FROM public.events e
      WHERE e.event_type = 'add_to_cart' AND e.created_at >= p_start AND e.created_at < p_end
        AND NOT public.is_luneva_event_row(e.collection_id, e.page_url, e.product_id)
    ),
    'products_added', (
      SELECT COALESCE(SUM(public.event_quantity(e)), 0)::integer FROM public.events e
      WHERE e.event_type = 'add_to_cart' AND e.created_at >= p_start AND e.created_at < p_end
        AND NOT public.is_luneva_event_row(e.collection_id, e.page_url, e.product_id)
    ),
    'remove_from_cart', (
      SELECT COUNT(*) FROM public.events e
      WHERE e.event_type = 'remove_from_cart' AND e.created_at >= p_start AND e.created_at < p_end
        AND NOT public.is_luneva_event_row(e.collection_id, e.page_url, e.product_id)
    ),
    'checkout_started', (
      SELECT COUNT(*) FROM public.events e
      WHERE e.event_type = 'begin_checkout' AND e.created_at >= p_start AND e.created_at < p_end
        AND NOT public.is_luneva_event_row(e.collection_id, e.page_url, e.product_id)
    ),
    'shipping_selected', (
      SELECT COUNT(*) FROM public.events e
      WHERE e.event_type = 'shipping_selected' AND e.created_at >= p_start AND e.created_at < p_end
        AND NOT public.is_luneva_event_row(e.collection_id, e.page_url, e.product_id)
    ),
    'payment_started', (
      SELECT COUNT(*) FROM public.events e
      WHERE e.event_type = 'payment_started' AND e.created_at >= p_start AND e.created_at < p_end
        AND NOT public.is_luneva_event_row(e.collection_id, e.page_url, e.product_id)
    ),
    'orders', (
      SELECT COUNT(*) FROM public.orders o
      WHERE o.created_at >= p_start AND o.created_at < p_end
        AND COALESCE(o.status, '') NOT IN ('failed', 'canceled')
        AND NOT public.is_luneva_order_row(o.product_slug, o.line_items)
    ),
    'purchases', (
      SELECT COUNT(*) FROM public.events e
      WHERE e.event_type IN ('purchase', 'payment_success')
        AND e.created_at >= p_start AND e.created_at < p_end
        AND NOT public.is_luneva_event_row(e.collection_id, e.page_url, e.product_id)
    ),
    'revenue_cents', (
      SELECT COALESCE(SUM(amount_total_cents), 0) FROM public.orders o
      WHERE o.created_at >= p_start AND o.created_at < p_end
        AND COALESCE(o.status, '') NOT IN ('failed', 'canceled')
        AND NOT public.is_luneva_order_row(o.product_slug, o.line_items)
    ),
    'avg_order_value_cents', (
      SELECT CASE WHEN COUNT(*) > 0
        THEN ROUND(AVG(amount_total_cents))::integer ELSE 0 END
      FROM public.orders o
      WHERE o.created_at >= p_start AND o.created_at < p_end
        AND COALESCE(o.status, '') NOT IN ('failed', 'canceled')
        AND NOT public.is_luneva_order_row(o.product_slug, o.line_items)
    ),
    'conversion_rate', (
      SELECT CASE WHEN uv.cnt > 0
        THEN ROUND((ord.cnt::numeric / uv.cnt::numeric) * 100, 2) ELSE 0 END
      FROM (
        SELECT COUNT(DISTINCT visitor_id) AS cnt FROM public.sessions
        WHERE started_at >= p_start AND started_at < p_end
          AND NOT public.is_luneva_landing_page(landing_page)
      ) uv,
      (
        SELECT COUNT(*) AS cnt FROM public.orders o
        WHERE o.created_at >= p_start AND o.created_at < p_end
          AND COALESCE(o.status, '') NOT IN ('failed', 'canceled')
          AND NOT public.is_luneva_order_row(o.product_slug, o.line_items)
      ) ord
    ),
    'search_events', (
      SELECT COUNT(*) FROM public.events e
      WHERE e.event_type = 'search' AND e.created_at >= p_start AND e.created_at < p_end
        AND NOT public.is_luneva_event_row(e.collection_id, e.page_url, e.product_id)
    ),
    'contact_submits', (
      SELECT COUNT(*) FROM public.events e
      WHERE e.event_type = 'contact_submit' AND e.created_at >= p_start AND e.created_at < p_end
        AND NOT public.is_luneva_event_row(e.collection_id, e.page_url, e.product_id)
    )
  ) INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_shopify_top_products(p_start TIMESTAMPTZ, p_end TIMESTAMPTZ)
RETURNS JSONB
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT jsonb_build_object(
    'most_viewed', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT product_id, COUNT(*)::integer AS views
        FROM public.events e
        WHERE event_type = 'product_view' AND created_at >= p_start AND created_at < p_end
          AND product_id IS NOT NULL
          AND NOT public.is_luneva_event_row(e.collection_id, e.page_url, e.product_id)
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
          AND NOT public.is_luneva_event_row(e.collection_id, e.page_url, e.product_id)
        GROUP BY product_id ORDER BY products_added DESC LIMIT 15
      ) t
    ),
    'highest_revenue', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT product_slug AS product_id,
          SUM(amount_total_cents)::integer AS revenue_cents,
          COUNT(*)::integer AS orders
        FROM public.orders o
        WHERE created_at >= p_start AND created_at < p_end
          AND product_slug IS NOT NULL
          AND COALESCE(status, '') NOT IN ('failed', 'canceled')
          AND NOT public.is_luneva_order_row(o.product_slug, o.line_items)
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
          FROM public.events e
          WHERE event_type = 'product_view' AND created_at >= p_start AND created_at < p_end
            AND product_id IS NOT NULL
            AND NOT public.is_luneva_event_row(e.collection_id, e.page_url, e.product_id)
          GROUP BY product_id
        ) v
        LEFT JOIN (
          SELECT product_slug AS product_id, COUNT(*)::integer AS orders
          FROM public.orders o
          WHERE created_at >= p_start AND created_at < p_end
            AND COALESCE(status, '') NOT IN ('failed', 'canceled')
            AND NOT public.is_luneva_order_row(o.product_slug, o.line_items)
          GROUP BY product_slug
        ) o ON o.product_id = v.product_id
        WHERE v.views >= 3
        ORDER BY conversion_rate DESC, orders DESC
        LIMIT 15
      ) t
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.get_shopify_realtime()
RETURNS JSONB
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT jsonb_build_object(
    'active_visitors', (
      SELECT COUNT(DISTINCT visitor_id) FROM public.sessions
      WHERE last_activity_at >= (NOW() - INTERVAL '5 minutes')
        AND NOT public.is_luneva_landing_page(landing_page)
    ),
    'active_sessions', (
      SELECT COUNT(*) FROM public.sessions
      WHERE last_activity_at >= (NOW() - INTERVAL '5 minutes')
        AND NOT public.is_luneva_landing_page(landing_page)
    )
  );
$$;
