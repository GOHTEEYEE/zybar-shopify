-- ============================================
-- Admin codes table (like your screenshot: id, code, is_used, used_by_email)
-- Run this in Supabase SQL Editor if you don't have the table yet.
-- If you ALREADY have this table under another name (e.g. access_codes):
--   1. Skip CREATE TABLE and the RLS policy.
--   2. Run only the function below, and replace "admin_codes" with your table name in the SELECT/UPDATE.
-- ============================================

CREATE TABLE IF NOT EXISTS public.admin_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,
  is_used BOOLEAN NOT NULL DEFAULT false,
  used_by_email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Optional: allow anon to call the function only (no direct table access)
ALTER TABLE public.admin_codes ENABLE ROW LEVEL SECURITY;

-- No SELECT/INSERT/UPDATE for anon on the table; we use a SECURITY DEFINER function instead
CREATE POLICY "No direct anon access"
  ON public.admin_codes FOR ALL
  USING (false)
  WITH CHECK (false);

-- Function: validate code and mark as used with email (callable by anon).
-- Allows: (1) unused code → mark used and return true; (2) same code + same email (re-login) → return true.
CREATE OR REPLACE FUNCTION public.validate_and_use_admin_code(p_code TEXT, p_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row_id UUID;
  current_email TEXT;
BEGIN
  IF p_code IS NULL OR trim(p_code) = '' THEN
    RETURN false;
  END IF;
  -- Find row: unused, or already used by this same email (allow re-login)
  SELECT id, used_by_email INTO row_id, current_email
  FROM public.admin_codes
  WHERE trim(code) = trim(p_code)
  LIMIT 1;
  IF row_id IS NULL THEN
    RETURN false;  -- code not found
  END IF;
  IF current_email IS NOT NULL AND trim(lower(current_email)) = trim(lower(p_email)) THEN
    RETURN true;   -- same person re-logging in, allow
  END IF;
  IF current_email IS NOT NULL THEN
    RETURN false;   -- code already used by someone else
  END IF;
  -- Mark as used
  UPDATE public.admin_codes
  SET is_used = true, used_by_email = trim(p_email)
  WHERE id = row_id;
  RETURN true;
END;
$$;

-- Allow anon and authenticated to call the function
GRANT EXECUTE ON FUNCTION public.validate_and_use_admin_code(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.validate_and_use_admin_code(TEXT, TEXT) TO authenticated;

-- Example: insert a few codes (change or add more as you like)
-- INSERT INTO public.admin_codes (code) VALUES ('N8N-EXPERT-01'), ('ADMIN-2026'), ('ZYBAR-ADMIN') ON CONFLICT (code) DO NOTHING;
