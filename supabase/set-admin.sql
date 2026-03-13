-- Run this entire file in Supabase SQL Editor to set a profile role.
-- Replace UUID/email and choose role: 'admin' or 'user'.

-- 1. Create helper (bypasses RLS so it always works)
CREATE OR REPLACE FUNCTION public.set_profile_role(
  p_id UUID,
  p_role TEXT,
  p_email TEXT DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  IF p_role NOT IN ('admin', 'user') THEN
    RAISE EXCEPTION 'Invalid role: %. Allowed roles are admin and user.', p_role;
  END IF;

  INSERT INTO public.profiles (id, email, role)
  VALUES (p_id, COALESCE(p_email, (SELECT email FROM auth.users WHERE id = p_id)), p_role)
  ON CONFLICT (id) DO UPDATE
    SET role = p_role,
        email = COALESCE(EXCLUDED.email, public.profiles.email),
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Set role for your user (edit the next line with your UID/email and role)
SELECT public.set_profile_role(
  '67f8cf34-885c-4d73-aa9a-7611761d6688'::uuid,
  'admin',
  'teeyeegoh@gmail.com'
);
