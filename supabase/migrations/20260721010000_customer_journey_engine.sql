-- Customer Journey Engine
-- Generic multi-step journeys with manual action execution.
-- Email is one action_type among many; do not hardcode email into the schema.

CREATE TABLE IF NOT EXISTS public.journeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.journey_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id UUID NOT NULL REFERENCES public.journeys(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL CHECK (step_order >= 1),
  step_name TEXT NOT NULL,
  delay_value INTEGER NOT NULL DEFAULT 0 CHECK (delay_value >= 0),
  delay_unit TEXT NOT NULL DEFAULT 'minutes'
    CHECK (delay_unit IN ('minutes', 'hours', 'days', 'weeks')),
  action_type TEXT NOT NULL
    CHECK (action_type IN ('email', 'whatsapp', 'sms', 'crm_task', 'webhook', 'ai_action')),
  template_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (journey_id, step_order)
);

CREATE TABLE IF NOT EXISTS public.lead_journeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.newsletter_subscribers(id) ON DELETE CASCADE,
  journey_id UUID NOT NULL REFERENCES public.journeys(id) ON DELETE CASCADE,
  current_step INTEGER NOT NULL DEFAULT 1 CHECK (current_step >= 1),
  entered_step_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  next_ready_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'ready', 'completed', 'cancelled')),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS lead_journeys_active_unique
  ON public.lead_journeys (lead_id, journey_id)
  WHERE status IN ('waiting', 'ready');

CREATE INDEX IF NOT EXISTS lead_journeys_ready_scan_idx
  ON public.lead_journeys (status, next_ready_at);

CREATE INDEX IF NOT EXISTS lead_journeys_lead_idx
  ON public.lead_journeys (lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS lead_journeys_journey_idx
  ON public.lead_journeys (journey_id, status);

CREATE TABLE IF NOT EXISTS public.action_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.newsletter_subscribers(id) ON DELETE CASCADE,
  journey_id UUID NOT NULL REFERENCES public.journeys(id) ON DELETE CASCADE,
  step_id UUID NOT NULL REFERENCES public.journey_steps(id) ON DELETE CASCADE,
  lead_journey_id UUID REFERENCES public.lead_journeys(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL
    CHECK (action_type IN ('email', 'whatsapp', 'sms', 'crm_task', 'webhook', 'ai_action')),
  template_id TEXT,
  recipient TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'executing', 'completed', 'failed', 'cancelled')),
  executed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS action_queue_pending_step_unique
  ON public.action_queue (lead_id, step_id)
  WHERE status IN ('pending', 'executing');

CREATE INDEX IF NOT EXISTS action_queue_status_scheduled_idx
  ON public.action_queue (status, scheduled_at);

CREATE INDEX IF NOT EXISTS action_queue_journey_idx
  ON public.action_queue (journey_id, created_at DESC);

CREATE INDEX IF NOT EXISTS journey_steps_journey_order_idx
  ON public.journey_steps (journey_id, step_order);

-- RLS: service role only (same pattern as workflows)
ALTER TABLE public.journeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journey_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_journeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No public access journeys" ON public.journeys;
CREATE POLICY "No public access journeys"
  ON public.journeys FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Service manage journeys" ON public.journeys;
CREATE POLICY "Service manage journeys"
  ON public.journeys FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "No public access journey_steps" ON public.journey_steps;
CREATE POLICY "No public access journey_steps"
  ON public.journey_steps FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Service manage journey_steps" ON public.journey_steps;
CREATE POLICY "Service manage journey_steps"
  ON public.journey_steps FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "No public access lead_journeys" ON public.lead_journeys;
CREATE POLICY "No public access lead_journeys"
  ON public.lead_journeys FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Service manage lead_journeys" ON public.lead_journeys;
CREATE POLICY "Service manage lead_journeys"
  ON public.lead_journeys FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "No public access action_queue" ON public.action_queue;
CREATE POLICY "No public access action_queue"
  ON public.action_queue FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Service manage action_queue" ON public.action_queue;
CREATE POLICY "Service manage action_queue"
  ON public.action_queue FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT ALL ON public.journeys TO service_role;
GRANT ALL ON public.journey_steps TO service_role;
GRANT ALL ON public.lead_journeys TO service_role;
GRANT ALL ON public.action_queue TO service_role;

-- Seed Phase 1 journeys + steps
DO $$
DECLARE
  welcome_id UUID;
  cart_id UUID;
  customer_id UUID;
BEGIN
  INSERT INTO public.journeys (journey_key, name, description, trigger_type, is_active)
  VALUES (
    'welcome_journey',
    'Welcome Journey',
    'Nurture new email signups with brand story, bestsellers, and a discount.',
    'signup',
    true
  )
  ON CONFLICT (journey_key) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    trigger_type = EXCLUDED.trigger_type,
    updated_at = NOW()
  RETURNING id INTO welcome_id;

  SELECT id INTO welcome_id FROM public.journeys WHERE journey_key = 'welcome_journey';

  DELETE FROM public.journey_steps WHERE journey_id = welcome_id;
  INSERT INTO public.journey_steps
    (journey_id, step_order, step_name, delay_value, delay_unit, action_type, template_id)
  VALUES
    (welcome_id, 1, 'Welcome', 5, 'minutes', 'email', 'welcome_email'),
    (welcome_id, 2, 'Brand Story', 2, 'days', 'email', 'brand_story'),
    (welcome_id, 3, 'Best Seller', 5, 'days', 'email', 'best_seller'),
    (welcome_id, 4, 'Discount', 7, 'days', 'email', 'discount_offer');

  INSERT INTO public.journeys (journey_key, name, description, trigger_type, is_active)
  VALUES (
    'cart_journey',
    'Cart Journey',
    'Recover abandoned carts with reminders, help, and a discount.',
    'add_to_cart',
    true
  )
  ON CONFLICT (journey_key) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    trigger_type = EXCLUDED.trigger_type,
    updated_at = NOW()
  RETURNING id INTO cart_id;

  SELECT id INTO cart_id FROM public.journeys WHERE journey_key = 'cart_journey';

  DELETE FROM public.journey_steps WHERE journey_id = cart_id;
  INSERT INTO public.journey_steps
    (journey_id, step_order, step_name, delay_value, delay_unit, action_type, template_id)
  VALUES
    (cart_id, 1, 'Cart Reminder', 30, 'minutes', 'email', 'cart_reminder'),
    (cart_id, 2, 'Need Help', 1, 'days', 'email', 'need_help'),
    (cart_id, 3, 'Discount', 3, 'days', 'email', 'discount_offer');

  INSERT INTO public.journeys (journey_key, name, description, trigger_type, is_active)
  VALUES (
    'customer_journey',
    'Customer Journey',
    'Post-purchase thank you, review request, and new collection follow-up.',
    'purchase',
    true
  )
  ON CONFLICT (journey_key) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    trigger_type = EXCLUDED.trigger_type,
    updated_at = NOW()
  RETURNING id INTO customer_id;

  SELECT id INTO customer_id FROM public.journeys WHERE journey_key = 'customer_journey';

  DELETE FROM public.journey_steps WHERE journey_id = customer_id;
  INSERT INTO public.journey_steps
    (journey_id, step_order, step_name, delay_value, delay_unit, action_type, template_id)
  VALUES
    (customer_id, 1, 'Thank You', 0, 'minutes', 'email', 'thank_you'),
    (customer_id, 2, 'Review Request', 7, 'days', 'email', 'review_request'),
    (customer_id, 3, 'New Collection', 30, 'days', 'email', 'new_collection');
END $$;
