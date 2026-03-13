-- ============================================
-- Rebuild Profiles (safe/idempotent)
-- Run this in Supabase SQL Editor if public.profiles was deleted
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1) Recreate profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2) RLS + policies
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;

CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can read all profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- 3) Keep updated_at current
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4) Auto-create profile on new auth.users signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'user')
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
        updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5) Backfill profiles for existing auth users
INSERT INTO public.profiles (id, email, full_name, role)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'),
  'user'
FROM auth.users u
ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
      updated_at = NOW();

-- 6) Helper to set/create profile role (admin/user only)
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
  VALUES (
    p_id,
    COALESCE(p_email, (SELECT email FROM auth.users WHERE id = p_id)),
    p_role
  )
  ON CONFLICT (id) DO UPDATE
    SET role = p_role,
        email = COALESCE(EXCLUDED.email, public.profiles.email),
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Backward-compatible helper: keeps old usage working
CREATE OR REPLACE FUNCTION public.set_admin_profile(p_id UUID, p_email TEXT DEFAULT NULL)
RETURNS void AS $$
BEGIN
  PERFORM public.set_profile_role(p_id, 'admin', p_email);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Examples (edit before running):
-- SELECT public.set_profile_role('67f8cf34-885c-4d73-aa9a-7611761d6688'::uuid, 'admin', 'teeyeegoh@gmail.com');
-- SELECT public.set_profile_role('67f8cf34-885c-4d73-aa9a-7611761d6688'::uuid, 'user', 'teeyeegoh@gmail.com');

