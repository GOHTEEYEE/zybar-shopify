-- ============================================
-- ZYBAR Analytics & Admin - Supabase Schema
-- Run this in Supabase SQL Editor
-- ============================================

-- Enable UUID extension if not already
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- --------------------------------------------
-- 1. Profiles (for admin role, linked to auth.users)
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for profiles: users can read own profile; service role can manage
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Admins can read all profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- Trigger to create profile on signup (optional)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'user')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Helper: set or create admin profile (run in SQL Editor when INSERT fails due to RLS)
CREATE OR REPLACE FUNCTION public.set_admin_profile(p_id UUID, p_email TEXT DEFAULT NULL)
RETURNS void AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (p_id, COALESCE(p_email, (SELECT email FROM auth.users WHERE id = p_id)), 'admin')
  ON CONFLICT (id) DO UPDATE SET role = 'admin', email = COALESCE(EXCLUDED.email, public.profiles.email);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- --------------------------------------------
-- 2. Sessions (visitor sessions, 30min inactivity)
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS public.sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visitor_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  referrer TEXT,
  user_agent TEXT,
  device_type TEXT,
  country TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Allow anonymous insert/update for tracking; only admin read via RLS below
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous insert sessions"
  ON public.sessions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow anonymous update own session by visitor_id"
  ON public.sessions FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins can read sessions"
  ON public.sessions FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE INDEX IF NOT EXISTS idx_sessions_visitor_id ON public.sessions(visitor_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON public.sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_sessions_last_activity ON public.sessions(last_activity_at);

-- --------------------------------------------
-- 3. Events (all event types: page_view, product_view, add_to_cart, etc.)
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type TEXT NOT NULL,
  page_url TEXT,
  product_id TEXT,
  visitor_id TEXT NOT NULL,
  session_id TEXT,
  referrer TEXT,
  user_agent TEXT,
  device_type TEXT,
  country TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_events_type ON public.events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON public.events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_visitor_id ON public.events(visitor_id);
CREATE INDEX IF NOT EXISTS idx_events_session_id ON public.events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_product_id ON public.events(product_id);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous insert events"
  ON public.events FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can read events"
  ON public.events FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- --------------------------------------------
-- 4. Page views (denormalized for fast analytics queries)
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS public.page_views (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id TEXT,
  visitor_id TEXT NOT NULL,
  page_url TEXT NOT NULL,
  referrer TEXT,
  user_agent TEXT,
  device_type TEXT,
  country TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_page_views_created_at ON public.page_views(created_at);
CREATE INDEX IF NOT EXISTS idx_page_views_page_url ON public.page_views(page_url);
CREATE INDEX IF NOT EXISTS idx_page_views_visitor_id ON public.page_views(visitor_id);

ALTER TABLE public.page_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous insert page_views"
  ON public.page_views FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can read page_views"
  ON public.page_views FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- --------------------------------------------
-- 5. Products (catalog for analytics; sync with your static products)
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS public.products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed with your current product slugs (optional)
INSERT INTO public.products (id, name, slug) VALUES
  ('audi-r8-white', 'Audi R8 - White', 'audi-r8-white'),
  ('audi-r8-yellow', 'Audi R8 - Yellow', 'audi-r8-yellow'),
  ('audi-r8-gt3', 'Audi R8 GT3', 'audi-r8-gt3'),
  ('audi-rs6', 'Audi RS6', 'audi-rs6'),
  ('b-dodge-hellcat-02', 'B Dodge Hellcat 02', 'b-dodge-hellcat-02'),
  ('b-dodge-hellcat-03', 'B Dodge Hellcat 03', 'b-dodge-hellcat-03'),
  ('b-ferrari-f40', 'B Ferrari F40', 'b-ferrari-f40'),
  ('b-maserati-mc20', 'B Maserati MC20', 'b-maserati-mc20')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read products"
  ON public.products FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage products"
  ON public.products FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- --------------------------------------------
-- Helper view: daily stats (for dashboard)
-- --------------------------------------------
CREATE OR REPLACE VIEW public.daily_stats AS
SELECT
  date_trunc('day', created_at)::date AS day,
  COUNT(*) AS page_views,
  COUNT(DISTINCT visitor_id) AS unique_visitors
FROM public.page_views
GROUP BY date_trunc('day', created_at)::date
ORDER BY day DESC;

-- Grant usage (run as superuser if needed)
-- GRANT SELECT ON public.daily_stats TO authenticated;
-- GRANT SELECT ON public.daily_stats TO anon;
