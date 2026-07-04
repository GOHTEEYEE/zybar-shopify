-- PART 2 of 4 — Run after Part 1. Indexes (may take longer if events table is large).

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_dedup_key
  ON public.events (dedup_key)
  WHERE dedup_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_events_type_created
  ON public.events (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_events_cart_id
  ON public.events (cart_id)
  WHERE cart_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cart_sessions_visitor
  ON public.cart_sessions (visitor_id);

CREATE INDEX IF NOT EXISTS idx_cart_sessions_status_activity
  ON public.cart_sessions (status, last_activity_at DESC);

CREATE INDEX IF NOT EXISTS idx_cart_sessions_created
  ON public.cart_sessions (created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_sessions_open_visitor
  ON public.cart_sessions (visitor_id)
  WHERE status IN ('active', 'checkout_started');

CREATE INDEX IF NOT EXISTS idx_cart_session_items_cart
  ON public.cart_session_items (cart_id);

CREATE INDEX IF NOT EXISTS idx_orders_visitor_id ON public.orders (visitor_id);
CREATE INDEX IF NOT EXISTS idx_orders_cart_id ON public.orders (cart_id);
