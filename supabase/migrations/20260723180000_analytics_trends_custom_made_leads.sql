-- Add custom_made_leads series to get_analytics_trends (Custom Made dashboard KPI).

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
  is_hour BOOLEAN := LOWER(COALESCE(p_granularity, 'day')) = 'hour';
BEGIN
  trunc_unit := CASE LOWER(COALESCE(p_granularity, 'day'))
    WHEN 'hour' THEN 'hour'
    WHEN 'week' THEN 'week'
    WHEN 'month' THEN 'month'
    WHEN 'year' THEN 'year'
    ELSE 'day'
  END;

  RETURN jsonb_build_object(
    'granularity', trunc_unit,
    'revenue', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d, 'value', v) ORDER BY d), '[]'::jsonb)
      FROM (
        SELECT
          CASE WHEN is_hour
            THEN to_char(date_trunc('hour', created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:00:00"Z"')
            ELSE to_char(date_trunc(trunc_unit, created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD')
          END AS d,
          SUM(amount_total_cents)::integer AS v
        FROM public.orders
        WHERE created_at >= p_start AND created_at < p_end
        GROUP BY 1
      ) s
    ),
    'orders', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d, 'value', v) ORDER BY d), '[]'::jsonb)
      FROM (
        SELECT
          CASE WHEN is_hour
            THEN to_char(date_trunc('hour', created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:00:00"Z"')
            ELSE to_char(date_trunc(trunc_unit, created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD')
          END AS d,
          COUNT(*)::integer AS v
        FROM public.orders
        WHERE created_at >= p_start AND created_at < p_end
        GROUP BY 1
      ) s
    ),
    'add_to_cart', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d, 'value', v) ORDER BY d), '[]'::jsonb)
      FROM (
        SELECT
          CASE WHEN is_hour
            THEN to_char(date_trunc('hour', created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:00:00"Z"')
            ELSE to_char(date_trunc(trunc_unit, created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD')
          END AS d,
          COUNT(*)::integer AS v
        FROM public.events
        WHERE event_type = 'add_to_cart' AND created_at >= p_start AND created_at < p_end
        GROUP BY 1
      ) s
    ),
    'checkout', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d, 'value', v) ORDER BY d), '[]'::jsonb)
      FROM (
        SELECT
          CASE WHEN is_hour
            THEN to_char(date_trunc('hour', created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:00:00"Z"')
            ELSE to_char(date_trunc(trunc_unit, created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD')
          END AS d,
          COUNT(*)::integer AS v
        FROM public.events
        WHERE event_type IN ('begin_checkout', 'checkout_started')
          AND created_at >= p_start AND created_at < p_end
        GROUP BY 1
      ) s
    ),
    'visitors', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d, 'value', v) ORDER BY d), '[]'::jsonb)
      FROM (
        SELECT
          CASE WHEN is_hour
            THEN to_char(date_trunc('hour', started_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:00:00"Z"')
            ELSE to_char(date_trunc(trunc_unit, started_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD')
          END AS d,
          COUNT(DISTINCT visitor_id)::integer AS v
        FROM public.sessions
        WHERE started_at >= p_start AND started_at < p_end
        GROUP BY 1
      ) s
    ),
    'sessions', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d, 'value', v) ORDER BY d), '[]'::jsonb)
      FROM (
        SELECT
          CASE WHEN is_hour
            THEN to_char(date_trunc('hour', started_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:00:00"Z"')
            ELSE to_char(date_trunc(trunc_unit, started_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD')
          END AS d,
          COUNT(*)::integer AS v
        FROM public.sessions
        WHERE started_at >= p_start AND started_at < p_end
        GROUP BY 1
      ) s
    ),
    'email_leads', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d, 'value', v) ORDER BY d), '[]'::jsonb)
      FROM (
        SELECT
          CASE WHEN is_hour
            THEN to_char(date_trunc('hour', created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:00:00"Z"')
            ELSE to_char(date_trunc(trunc_unit, created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD')
          END AS d,
          COUNT(*)::integer AS v
        FROM public.newsletter_subscribers
        WHERE created_at >= p_start AND created_at < p_end
        GROUP BY 1
      ) s
    ),
    'custom_made_leads', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d, 'value', v) ORDER BY d), '[]'::jsonb)
      FROM (
        SELECT
          CASE WHEN is_hour
            THEN to_char(date_trunc('hour', created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:00:00"Z"')
            ELSE to_char(date_trunc(trunc_unit, created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD')
          END AS d,
          COUNT(*)::integer AS v
        FROM public.custom_leads
        WHERE created_at >= p_start AND created_at < p_end
        GROUP BY 1
      ) s
    ),
    'abandoned', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d, 'value', v) ORDER BY d), '[]'::jsonb)
      FROM (
        SELECT
          CASE WHEN is_hour
            THEN to_char(date_trunc('hour', COALESCE(abandoned_at, last_activity_at, created_at)) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:00:00"Z"')
            ELSE to_char(date_trunc(trunc_unit, COALESCE(abandoned_at, last_activity_at, created_at)) AT TIME ZONE 'UTC', 'YYYY-MM-DD')
          END AS d,
          COUNT(*)::integer AS v
        FROM public.cart_sessions
        WHERE COALESCE(abandoned_at, last_activity_at, created_at) >= p_start
          AND COALESCE(abandoned_at, last_activity_at, created_at) < p_end
          AND (
            status = 'abandoned'
            OR recovery_status IN ('abandoned', 'recoverable', 'unrecovered')
            OR (purchased_at IS NULL AND abandoned_at IS NOT NULL)
          )
        GROUP BY 1
      ) s
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_analytics_trends(TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_analytics_trends(TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_analytics_trends(TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO service_role;
