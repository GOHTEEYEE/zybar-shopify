-- Run this in Supabase SQL Editor once.
-- Allows the dashboard to show "live visitors" when admin logs in with code (anon key).
-- The dashboard uses anon key, so it cannot read sessions via RLS (admin-only).
-- This RPC returns only the count and runs with definer rights.

CREATE OR REPLACE FUNCTION public.get_live_visitor_count()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COUNT(*)::integer
  FROM public.sessions
  WHERE last_activity_at >= (NOW() - INTERVAL '5 minutes');
$$;

-- Allow anon to call it (dashboard uses anon key)
GRANT EXECUTE ON FUNCTION public.get_live_visitor_count() TO anon;
GRANT EXECUTE ON FUNCTION public.get_live_visitor_count() TO authenticated;
