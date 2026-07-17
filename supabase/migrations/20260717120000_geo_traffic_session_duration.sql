-- Geo × traffic source × campaign cross-report + session duration metrics.

-- --------------------------------------------
-- Overview: add avg session duration
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
    'avg_session_duration_seconds', (
      SELECT COALESCE(ROUND(AVG(
        GREATEST(0, EXTRACT(EPOCH FROM (last_activity_at - started_at)))
      ))::integer, 0)
      FROM public.sessions
      WHERE started_at >= p_start AND started_at < p_end
        AND last_activity_at IS NOT NULL
    ),
    'median_session_duration_seconds', (
      SELECT COALESCE(ROUND(
        PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY GREATEST(0, EXTRACT(EPOCH FROM (last_activity_at - started_at)))
        )
      )::integer, 0)
      FROM public.sessions
      WHERE started_at >= p_start AND started_at < p_end
        AND last_activity_at IS NOT NULL
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

-- --------------------------------------------
-- Country × source × campaign (first-touch in range)
-- --------------------------------------------
CREATE OR REPLACE FUNCTION public.get_shopify_geo_traffic(p_start TIMESTAMPTZ, p_end TIMESTAMPTZ)
RETURNS JSONB
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  WITH session_dims AS (
    SELECT
      id,
      visitor_id,
      started_at,
      COALESCE(NULLIF(country, ''), 'Unknown') AS country,
      COALESCE(NULLIF(traffic_source, ''), 'direct') AS traffic_source,
      COALESCE(NULLIF(utm_source, ''), '—') AS utm_source,
      COALESCE(NULLIF(utm_campaign, ''), '—') AS utm_campaign,
      GREATEST(0, EXTRACT(EPOCH FROM (last_activity_at - started_at)))::numeric AS duration_seconds
    FROM public.sessions
    WHERE started_at >= p_start AND started_at < p_end
      AND last_activity_at IS NOT NULL
  ),
  first_touch AS (
    SELECT DISTINCT ON (visitor_id)
      visitor_id,
      country,
      traffic_source,
      utm_source,
      utm_campaign
    FROM session_dims
    ORDER BY visitor_id, started_at ASC
  ),
  session_agg AS (
    SELECT
      country,
      traffic_source,
      utm_source,
      utm_campaign,
      COUNT(*)::integer AS sessions,
      COUNT(DISTINCT visitor_id)::integer AS visitors,
      ROUND(AVG(duration_seconds))::integer AS avg_duration_seconds
    FROM session_dims
    GROUP BY 1, 2, 3, 4
  ),
  atc_agg AS (
    SELECT
      sd.country,
      sd.traffic_source,
      sd.utm_source,
      sd.utm_campaign,
      COUNT(DISTINCT e.visitor_id)::integer AS add_to_cart_visitors
    FROM public.events e
    JOIN session_dims sd ON sd.id::text = e.session_id
    WHERE e.event_type = 'add_to_cart'
      AND e.created_at >= p_start AND e.created_at < p_end
    GROUP BY 1, 2, 3, 4
  ),
  order_agg AS (
    SELECT
      ft.country,
      ft.traffic_source,
      ft.utm_source,
      ft.utm_campaign,
      COUNT(*)::integer AS orders,
      COALESCE(SUM(o.amount_total_cents), 0)::integer AS revenue_cents
    FROM public.orders o
    JOIN first_touch ft ON ft.visitor_id = o.visitor_id
    WHERE o.created_at >= p_start AND o.created_at < p_end
      AND COALESCE(o.status, '') NOT IN ('failed', 'canceled')
    GROUP BY 1, 2, 3, 4
  ),
  merged AS (
    SELECT
      sa.country,
      sa.traffic_source,
      sa.utm_source,
      sa.utm_campaign,
      sa.sessions,
      sa.visitors,
      sa.avg_duration_seconds,
      COALESCE(a.add_to_cart_visitors, 0) AS add_to_cart_visitors,
      COALESCE(oa.orders, 0) AS orders,
      COALESCE(oa.revenue_cents, 0) AS revenue_cents,
      CASE WHEN sa.visitors > 0
        THEN ROUND((COALESCE(oa.orders, 0)::numeric / sa.visitors::numeric) * 100, 2)
        ELSE 0 END AS conversion_rate
    FROM session_agg sa
    LEFT JOIN atc_agg a USING (country, traffic_source, utm_source, utm_campaign)
    LEFT JOIN order_agg oa USING (country, traffic_source, utm_source, utm_campaign)
  ),
  country_duration AS (
    SELECT
      country,
      COUNT(*)::integer AS sessions,
      ROUND(AVG(duration_seconds))::integer AS avg_duration_seconds
    FROM session_dims
    GROUP BY 1
    ORDER BY sessions DESC
    LIMIT 30
  )
  SELECT jsonb_build_object(
    'summary', jsonb_build_object(
      'avg_session_duration_seconds', (
        SELECT COALESCE(ROUND(AVG(duration_seconds))::integer, 0) FROM session_dims
      ),
      'median_session_duration_seconds', (
        SELECT COALESCE(ROUND(
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_seconds)
        )::integer, 0)
        FROM session_dims
      ),
      'total_sessions', (SELECT COUNT(*)::integer FROM session_dims),
      'total_visitors', (SELECT COUNT(DISTINCT visitor_id)::integer FROM session_dims)
    ),
    'rows', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'country', country,
          'traffic_source', traffic_source,
          'utm_source', utm_source,
          'utm_campaign', utm_campaign,
          'sessions', sessions,
          'visitors', visitors,
          'avg_duration_seconds', avg_duration_seconds,
          'add_to_cart_visitors', add_to_cart_visitors,
          'orders', orders,
          'revenue_cents', revenue_cents,
          'conversion_rate', conversion_rate
        )
        ORDER BY sessions DESC, visitors DESC
      )
      FROM merged
      LIMIT 100
    ), '[]'::jsonb),
    'by_country', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'country', country,
          'sessions', sessions,
          'avg_duration_seconds', avg_duration_seconds
        )
        ORDER BY sessions DESC
      )
      FROM country_duration
    ), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_shopify_geo_traffic(TIMESTAMPTZ, TIMESTAMPTZ) TO anon, authenticated;
