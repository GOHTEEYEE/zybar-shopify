-- PART 3 of 4 — Run after Part 2. RLS policies.

ALTER TABLE public.cart_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_session_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anonymous insert cart_sessions" ON public.cart_sessions;
CREATE POLICY "Allow anonymous insert cart_sessions"
  ON public.cart_sessions FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anonymous update cart_sessions" ON public.cart_sessions;
CREATE POLICY "Allow anonymous update cart_sessions"
  ON public.cart_sessions FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anonymous select own cart by id" ON public.cart_sessions;
CREATE POLICY "Allow anonymous select own cart by id"
  ON public.cart_sessions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow anonymous insert cart_session_items" ON public.cart_session_items;
CREATE POLICY "Allow anonymous insert cart_session_items"
  ON public.cart_session_items FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anonymous update cart_session_items" ON public.cart_session_items;
CREATE POLICY "Allow anonymous update cart_session_items"
  ON public.cart_session_items FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anonymous delete cart_session_items" ON public.cart_session_items;
CREATE POLICY "Allow anonymous delete cart_session_items"
  ON public.cart_session_items FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow anonymous select cart_session_items" ON public.cart_session_items;
CREATE POLICY "Allow anonymous select cart_session_items"
  ON public.cart_session_items FOR SELECT USING (true);
