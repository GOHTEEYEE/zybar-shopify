-- Single-active Customer Lifecycle Automation.
-- lead_journeys remains the immutable/history-oriented instance table, while
-- newsletter_subscribers mirrors the customer's current lifecycle position.

ALTER TABLE public.journeys
  ADD COLUMN IF NOT EXISTS exit_trigger TEXT,
  ADD COLUMN IF NOT EXISTS next_journey_id UUID REFERENCES public.journeys(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS exit_behavior TEXT NOT NULL DEFAULT 'completed'
    CHECK (exit_behavior IN ('completed', 'cancelled')),
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE public.newsletter_subscribers
  ADD COLUMN IF NOT EXISTS current_journey_id UUID REFERENCES public.journeys(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS current_journey_instance_id UUID REFERENCES public.lead_journeys(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS current_step INTEGER,
  ADD COLUMN IF NOT EXISTS journey_status TEXT
    CHECK (journey_status IN ('active', 'completed', 'cancelled')),
  ADD COLUMN IF NOT EXISTS journey_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS journey_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.action_queue
  ADD COLUMN IF NOT EXISTS step_name_snapshot TEXT;

UPDATE public.journeys
SET status = CASE WHEN is_active THEN 'published' ELSE 'draft' END
WHERE status = 'draft'
  AND archived_at IS NULL;

-- Normalize the no-purchase trigger name to its actual lifecycle meaning.
UPDATE public.journeys
SET trigger_type = 'no_purchase_90_days',
    updated_at = NOW()
WHERE trigger_type = 'no_purchase';

-- Configure the default lifecycle chain.
UPDATE public.journeys
SET exit_trigger = 'add_to_cart',
    next_journey_id = (SELECT id FROM public.journeys WHERE journey_key = 'cart_journey'),
    exit_behavior = 'completed',
    updated_at = NOW()
WHERE journey_key = 'welcome_journey';

UPDATE public.journeys
SET exit_trigger = 'purchase',
    next_journey_id = (SELECT id FROM public.journeys WHERE journey_key = 'customer_journey'),
    exit_behavior = 'completed',
    updated_at = NOW()
WHERE journey_key = 'cart_journey';

UPDATE public.journeys
SET exit_trigger = 'no_purchase_90_days',
    next_journey_id = (SELECT id FROM public.journeys WHERE journey_key = 'win_back_journey'),
    exit_behavior = 'completed',
    updated_at = NOW()
WHERE journey_key = 'customer_journey';

UPDATE public.journeys
SET exit_trigger = NULL,
    next_journey_id = NULL,
    exit_behavior = 'completed',
    updated_at = NOW()
WHERE journey_key = 'win_back_journey';

-- A trigger maps to one published lifecycle journey. Duplicates are drafts.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY trigger_type
      ORDER BY
        CASE journey_key
          WHEN 'welcome_journey' THEN 1
          WHEN 'cart_journey' THEN 1
          WHEN 'customer_journey' THEN 1
          WHEN 'win_back_journey' THEN 1
          ELSE 2
        END,
        created_at,
        id
    ) AS rn
  FROM public.journeys
  WHERE is_active = true
)
UPDATE public.journeys j
SET is_active = false,
    status = 'draft',
    updated_at = NOW()
FROM ranked r
WHERE j.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS journeys_one_published_per_trigger_unique
  ON public.journeys (trigger_type)
  WHERE status = 'published';

-- Migrate old concurrent active instances: keep the furthest lifecycle stage.
WITH ranked AS (
  SELECT
    lj.id,
    ROW_NUMBER() OVER (
      PARTITION BY lj.lead_id
      ORDER BY
        CASE j.trigger_type
          WHEN 'no_purchase_90_days' THEN 4
          WHEN 'purchase' THEN 3
          WHEN 'add_to_cart' THEN 2
          WHEN 'signup' THEN 1
          ELSE 0
        END DESC,
        lj.updated_at DESC,
        lj.created_at DESC
    ) AS rn
  FROM public.lead_journeys lj
  JOIN public.journeys j ON j.id = lj.journey_id
  WHERE lj.status IN ('waiting', 'ready')
)
UPDATE public.lead_journeys lj
SET status = 'completed',
    completed_at = COALESCE(lj.completed_at, NOW()),
    updated_at = NOW()
FROM ranked r
WHERE lj.id = r.id
  AND r.rn > 1;

UPDATE public.action_queue aq
SET status = 'cancelled',
    error_message = COALESCE(
      aq.error_message,
      'Cancelled during migration to one active journey per customer'
    ),
    updated_at = NOW()
FROM public.lead_journeys lj
WHERE aq.lead_journey_id = lj.id
  AND lj.status IN ('completed', 'cancelled')
  AND aq.status = 'pending';

DROP INDEX IF EXISTS public.lead_journeys_active_unique;

CREATE UNIQUE INDEX IF NOT EXISTS lead_journeys_one_active_per_lead_unique
  ON public.lead_journeys (lead_id)
  WHERE status IN ('waiting', 'ready');

-- Journey definitions are archived, never deleted. Queue history survives
-- journey-step edits by retaining a step-name snapshot.
ALTER TABLE public.lead_journeys
  DROP CONSTRAINT IF EXISTS lead_journeys_journey_id_fkey,
  ADD CONSTRAINT lead_journeys_journey_id_fkey
    FOREIGN KEY (journey_id) REFERENCES public.journeys(id) ON DELETE RESTRICT;

ALTER TABLE public.action_queue
  ALTER COLUMN step_id DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS action_queue_step_id_fkey,
  ADD CONSTRAINT action_queue_step_id_fkey
    FOREIGN KEY (step_id) REFERENCES public.journey_steps(id) ON DELETE SET NULL,
  DROP CONSTRAINT IF EXISTS action_queue_journey_id_fkey,
  ADD CONSTRAINT action_queue_journey_id_fkey
    FOREIGN KEY (journey_id) REFERENCES public.journeys(id) ON DELETE RESTRICT;

UPDATE public.action_queue aq
SET step_name_snapshot = js.step_name
FROM public.journey_steps js
WHERE aq.step_id = js.id
  AND aq.step_name_snapshot IS NULL;

CREATE INDEX IF NOT EXISTS newsletter_subscribers_is_test_idx
  ON public.newsletter_subscribers (is_test)
  WHERE is_test = true;

-- Backfill the customer lifecycle mirror from the retained active instance,
-- otherwise from the most recently finished journey.
WITH ranked AS (
  SELECT
    lj.*,
    ROW_NUMBER() OVER (
      PARTITION BY lj.lead_id
      ORDER BY
        CASE WHEN lj.status IN ('waiting', 'ready') THEN 0 ELSE 1 END,
        lj.updated_at DESC,
        lj.created_at DESC
    ) AS rn
  FROM public.lead_journeys lj
)
UPDATE public.newsletter_subscribers ns
SET current_journey_id = r.journey_id,
    current_journey_instance_id = r.id,
    current_step = r.current_step,
    journey_status = CASE
      WHEN r.status IN ('waiting', 'ready') THEN 'active'
      ELSE r.status
    END,
    journey_started_at = r.created_at,
    journey_completed_at = r.completed_at
FROM ranked r
WHERE ns.id = r.lead_id
  AND r.rn = 1;

INSERT INTO public.action_queue (
  lead_id,
  journey_id,
  step_id,
  lead_journey_id,
  action_type,
  template_id,
  recipient,
  scheduled_at,
  status,
  step_name_snapshot,
  updated_at
)
SELECT
  lj.lead_id,
  lj.journey_id,
  js.id,
  lj.id,
  js.action_type,
  js.template_id,
  ns.email,
  lj.next_ready_at,
  'pending',
  js.step_name,
  NOW()
FROM public.lead_journeys lj
JOIN public.journey_steps js
  ON js.journey_id = lj.journey_id
 AND js.step_order = lj.current_step
JOIN public.newsletter_subscribers ns ON ns.id = lj.lead_id
WHERE lj.status IN ('waiting', 'ready')
  AND NOT EXISTS (
    SELECT 1
    FROM public.action_queue aq
    WHERE aq.lead_journey_id = lj.id
      AND aq.status IN ('pending', 'executing')
  );

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

-- Keep the lead mirror synchronized as its single journey advances.
CREATE OR REPLACE FUNCTION private.sync_customer_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IN ('waiting', 'ready') THEN
    UPDATE public.newsletter_subscribers
    SET current_journey_id = NEW.journey_id,
        current_journey_instance_id = NEW.id,
        current_step = NEW.current_step,
        journey_status = 'active',
        journey_started_at = NEW.created_at,
        journey_completed_at = NULL
    WHERE id = NEW.lead_id;
  ELSE
    UPDATE public.newsletter_subscribers
    SET current_step = NEW.current_step,
        journey_status = NEW.status,
        journey_completed_at = COALESCE(NEW.completed_at, NOW())
    WHERE id = NEW.lead_id
      AND current_journey_instance_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

GRANT USAGE ON SCHEMA private TO service_role;
GRANT EXECUTE ON FUNCTION private.sync_customer_lifecycle() TO service_role;

DROP TRIGGER IF EXISTS sync_customer_lifecycle_trigger ON public.lead_journeys;
CREATE TRIGGER sync_customer_lifecycle_trigger
AFTER INSERT OR UPDATE OF current_step, status, completed_at
ON public.lead_journeys
FOR EACH ROW
EXECUTE FUNCTION private.sync_customer_lifecycle();

-- Atomic lifecycle transition used by every signup/cart/purchase/no-purchase
-- integration. It closes the old journey, cancels its pending queue, and
-- starts the new journey under a per-lead transaction lock.
CREATE OR REPLACE FUNCTION public.transition_lead_journey(
  p_lead_id UUID,
  p_journey_id UUID,
  p_restart BOOLEAN DEFAULT false,
  p_allow_inactive BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_existing_id UUID;
  v_new_id UUID;
  v_step public.journey_steps%ROWTYPE;
  v_old RECORD;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_lead_id::TEXT, 0));

  IF NOT EXISTS (
    SELECT 1
    FROM public.newsletter_subscribers
    WHERE id = p_lead_id
  ) THEN
    RAISE EXCEPTION 'Lead not found: %', p_lead_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.journeys
    WHERE id = p_journey_id
      AND (status = 'published' OR p_allow_inactive = true)
      AND status <> 'archived'
  ) THEN
    RAISE EXCEPTION 'Active journey not found: %', p_journey_id;
  END IF;

  SELECT id
  INTO v_existing_id
  FROM public.lead_journeys
  WHERE lead_id = p_lead_id
    AND journey_id = p_journey_id
    AND status IN ('waiting', 'ready')
  LIMIT 1;

  IF v_existing_id IS NOT NULL AND p_restart = false THEN
    RETURN v_existing_id;
  END IF;

  SELECT *
  INTO v_step
  FROM public.journey_steps
  WHERE journey_id = p_journey_id
  ORDER BY step_order
  LIMIT 1;

  IF v_step.id IS NULL THEN
    RAISE EXCEPTION 'Journey has no steps: %', p_journey_id;
  END IF;

  FOR v_old IN
    SELECT lj.id, lj.journey_id, j.exit_behavior
    FROM public.lead_journeys lj
    JOIN public.journeys j ON j.id = lj.journey_id
    WHERE lj.lead_id = p_lead_id
      AND lj.status IN ('waiting', 'ready')
    FOR UPDATE OF lj
  LOOP
    UPDATE public.lead_journeys
    SET status = CASE
          WHEN v_old.exit_behavior = 'cancelled' THEN 'cancelled'
          ELSE 'completed'
        END,
        completed_at = v_now,
        updated_at = v_now
    WHERE id = v_old.id;

    UPDATE public.action_queue
    SET status = 'cancelled',
        error_message = COALESCE(
          error_message,
          'Cancelled because customer transitioned to another journey'
        ),
        updated_at = v_now
    WHERE lead_journey_id = v_old.id
      AND status = 'pending';
  END LOOP;

  INSERT INTO public.lead_journeys (
    lead_id,
    journey_id,
    current_step,
    entered_step_at,
    next_ready_at,
    status,
    updated_at
  )
  VALUES (
    p_lead_id,
    p_journey_id,
    v_step.step_order,
    v_now,
    v_now + CASE v_step.delay_unit
      WHEN 'weeks' THEN make_interval(weeks => v_step.delay_value)
      WHEN 'days' THEN make_interval(days => v_step.delay_value)
      WHEN 'hours' THEN make_interval(hours => v_step.delay_value)
      ELSE make_interval(mins => v_step.delay_value)
    END,
    'waiting',
    v_now
  )
  RETURNING id INTO v_new_id;

  INSERT INTO public.action_queue (
    lead_id,
    journey_id,
    step_id,
    lead_journey_id,
    action_type,
    template_id,
    recipient,
    scheduled_at,
    status,
    step_name_snapshot,
    updated_at
  )
  SELECT
    p_lead_id,
    p_journey_id,
    v_step.id,
    v_new_id,
    v_step.action_type,
    v_step.template_id,
    ns.email,
    v_now + CASE v_step.delay_unit
      WHEN 'weeks' THEN make_interval(weeks => v_step.delay_value)
      WHEN 'days' THEN make_interval(days => v_step.delay_value)
      WHEN 'hours' THEN make_interval(hours => v_step.delay_value)
      ELSE make_interval(mins => v_step.delay_value)
    END,
    'pending',
    v_step.step_name,
    v_now
  FROM public.newsletter_subscribers ns
  WHERE ns.id = p_lead_id;

  INSERT INTO public.marketing_history (
    event_type,
    source,
    lead_email,
    journey_id,
    reference_id,
    message,
    metadata
  )
  SELECT
    'journey_transition',
    'journey',
    ns.email,
    p_journey_id,
    v_new_id::TEXT,
    'Customer transitioned into ' || j.name,
    jsonb_build_object('lead_id', p_lead_id)
  FROM public.newsletter_subscribers ns
  JOIN public.journeys j ON j.id = p_journey_id
  WHERE ns.id = p_lead_id;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_lead_journey(UUID, UUID, BOOLEAN, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_lead_journey(UUID, UUID, BOOLEAN, BOOLEAN)
  TO service_role;

-- Finalize one successfully sent queue action, advance the active journey,
-- and create the next step's queue item in one transaction.
CREATE OR REPLACE FUNCTION public.complete_journey_action(p_action_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_action public.action_queue%ROWTYPE;
  v_instance public.lead_journeys%ROWTYPE;
  v_next_step public.journey_steps%ROWTYPE;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  SELECT *
  INTO v_action
  FROM public.action_queue
  WHERE id = p_action_id
  FOR UPDATE;

  IF v_action.id IS NULL OR v_action.status <> 'executing' THEN
    RAISE EXCEPTION 'Executing action not found: %', p_action_id;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_action.lead_id::TEXT, 0));

  SELECT lj.*
  INTO v_instance
  FROM public.lead_journeys lj
  JOIN public.newsletter_subscribers ns
    ON ns.current_journey_instance_id = lj.id
  WHERE lj.id = v_action.lead_journey_id
    AND lj.status IN ('waiting', 'ready')
    AND ns.id = v_action.lead_id
    AND ns.journey_status = 'active'
  FOR UPDATE OF lj;

  IF v_instance.id IS NULL THEN
    RAISE EXCEPTION 'Action no longer belongs to the active journey: %', p_action_id;
  END IF;

  SELECT *
  INTO v_next_step
  FROM public.journey_steps
  WHERE journey_id = v_instance.journey_id
    AND step_order > v_instance.current_step
  ORDER BY step_order
  LIMIT 1;

  UPDATE public.action_queue
  SET status = 'completed',
      executed_at = v_now,
      error_message = NULL,
      updated_at = v_now
  WHERE id = v_action.id;

  IF v_next_step.id IS NULL THEN
    UPDATE public.lead_journeys
    SET status = 'completed',
        completed_at = v_now,
        updated_at = v_now
    WHERE id = v_instance.id;
  ELSE
    UPDATE public.lead_journeys
    SET current_step = v_next_step.step_order,
        entered_step_at = v_now,
        next_ready_at = v_now + CASE v_next_step.delay_unit
          WHEN 'weeks' THEN make_interval(weeks => v_next_step.delay_value)
          WHEN 'days' THEN make_interval(days => v_next_step.delay_value)
          WHEN 'hours' THEN make_interval(hours => v_next_step.delay_value)
          ELSE make_interval(mins => v_next_step.delay_value)
        END,
        status = 'waiting',
        updated_at = v_now
    WHERE id = v_instance.id;

    INSERT INTO public.action_queue (
      lead_id,
      journey_id,
      step_id,
      lead_journey_id,
      action_type,
      template_id,
      recipient,
      scheduled_at,
      status,
      step_name_snapshot,
      updated_at
    )
    SELECT
      v_action.lead_id,
      v_instance.journey_id,
      v_next_step.id,
      v_instance.id,
      v_next_step.action_type,
      v_next_step.template_id,
      ns.email,
      v_now + CASE v_next_step.delay_unit
        WHEN 'weeks' THEN make_interval(weeks => v_next_step.delay_value)
        WHEN 'days' THEN make_interval(days => v_next_step.delay_value)
        WHEN 'hours' THEN make_interval(hours => v_next_step.delay_value)
        ELSE make_interval(mins => v_next_step.delay_value)
      END,
      'pending',
      v_next_step.step_name,
      v_now
    FROM public.newsletter_subscribers ns
    WHERE ns.id = v_action.lead_id;
  END IF;

  RETURN v_instance.id;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_journey_action(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_journey_action(UUID)
  TO service_role;

COMMENT ON COLUMN public.newsletter_subscribers.current_journey_id
  IS 'Current or most recently completed lifecycle journey. Only one active instance is allowed.';
COMMENT ON COLUMN public.newsletter_subscribers.current_journey_instance_id
  IS 'Internal pointer to the current lead_journeys history row.';
COMMENT ON COLUMN public.journeys.exit_trigger
  IS 'Lifecycle event expected to transition the customer out of this journey.';
COMMENT ON COLUMN public.journeys.next_journey_id
  IS 'Expected next lifecycle journey; transition still occurs only when its trigger happens.';

-- Retire legacy workflows only on installations where those optional tables
-- exist. The production project never received the legacy workflow migration.
DO $$
BEGIN
  IF to_regclass('public.workflow_definitions') IS NOT NULL THEN
    EXECUTE 'UPDATE public.workflow_definitions SET enabled = false, updated_at = NOW()';
  END IF;

  IF to_regclass('public.workflow_executions') IS NOT NULL THEN
    EXECUTE $sql$
      UPDATE public.workflow_executions
      SET status = 'cancelled',
          cancelled_at = COALESCE(cancelled_at, NOW()),
          error = COALESCE(error, 'Replaced by single-active Customer Lifecycle journeys'),
          updated_at = NOW()
      WHERE status IN ('pending', 'running')
    $sql$;
  END IF;
END;
$$;
