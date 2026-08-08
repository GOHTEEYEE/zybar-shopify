-- LUNEVA email journeys (welcome + cart + short post-purchase)
-- Brand-scopes the one-published-per-trigger unique index so ZYBAR and LUNEVA
-- can both publish signup / add_to_cart / purchase journeys.

ALTER TABLE public.journeys
  ADD COLUMN IF NOT EXISTS brand TEXT NOT NULL DEFAULT 'zybar'
    CHECK (brand IN ('zybar', 'luneva'));

UPDATE public.journeys
SET brand = 'zybar'
WHERE brand IS NULL
   OR brand = ''
   OR journey_key NOT LIKE 'luneva_%';

DROP INDEX IF EXISTS public.journeys_one_published_per_trigger_unique;

CREATE UNIQUE INDEX IF NOT EXISTS journeys_one_published_per_trigger_brand_unique
  ON public.journeys (trigger_type, brand)
  WHERE status = 'published';

DO $$
DECLARE
  welcome_id UUID;
  cart_id UUID;
  customer_id UUID;
BEGIN
  -- Welcome
  SELECT id INTO welcome_id FROM public.journeys WHERE journey_key = 'luneva_welcome_journey';
  IF welcome_id IS NULL THEN
    INSERT INTO public.journeys (
      journey_key, name, description, trigger_type, brand, status, is_active,
      exit_trigger, exit_behavior
    )
    VALUES (
      'luneva_welcome_journey',
      'LUNEVA Welcome Journey',
      '7-day welcome for LUNEVA butterfly kits: gift, motion, collection, craft, invitation.',
      'signup',
      'luneva',
      'published',
      true,
      'add_to_cart',
      'completed'
    )
    RETURNING id INTO welcome_id;
  ELSE
    UPDATE public.journeys
    SET
      name = 'LUNEVA Welcome Journey',
      description = '7-day welcome for LUNEVA butterfly kits: gift, motion, collection, craft, invitation.',
      trigger_type = 'signup',
      brand = 'luneva',
      status = 'published',
      is_active = true,
      exit_trigger = 'add_to_cart',
      exit_behavior = 'completed',
      updated_at = NOW()
    WHERE id = welcome_id;
  END IF;

  -- Cart
  SELECT id INTO cart_id FROM public.journeys WHERE journey_key = 'luneva_cart_journey';
  IF cart_id IS NULL THEN
    INSERT INTO public.journeys (
      journey_key, name, description, trigger_type, brand, status, is_active,
      exit_trigger, exit_behavior
    )
    VALUES (
      'luneva_cart_journey',
      'LUNEVA Cart Recovery Journey',
      '7-day abandoned cart recovery for LUNEVA butterfly kits.',
      'add_to_cart',
      'luneva',
      'published',
      true,
      'purchase',
      'completed'
    )
    RETURNING id INTO cart_id;
  ELSE
    UPDATE public.journeys
    SET
      name = 'LUNEVA Cart Recovery Journey',
      description = '7-day abandoned cart recovery for LUNEVA butterfly kits.',
      trigger_type = 'add_to_cart',
      brand = 'luneva',
      status = 'published',
      is_active = true,
      exit_trigger = 'purchase',
      exit_behavior = 'completed',
      updated_at = NOW()
    WHERE id = cart_id;
  END IF;

  -- Post-purchase (exits cart)
  SELECT id INTO customer_id FROM public.journeys WHERE journey_key = 'luneva_customer_journey';
  IF customer_id IS NULL THEN
    INSERT INTO public.journeys (
      journey_key, name, description, trigger_type, brand, status, is_active,
      exit_trigger, exit_behavior
    )
    VALUES (
      'luneva_customer_journey',
      'LUNEVA Customer Journey',
      'Post-purchase thank-you and review invite for LUNEVA kits.',
      'purchase',
      'luneva',
      'published',
      true,
      NULL,
      'completed'
    )
    RETURNING id INTO customer_id;
  ELSE
    UPDATE public.journeys
    SET
      name = 'LUNEVA Customer Journey',
      description = 'Post-purchase thank-you and review invite for LUNEVA kits.',
      trigger_type = 'purchase',
      brand = 'luneva',
      status = 'published',
      is_active = true,
      exit_trigger = NULL,
      exit_behavior = 'completed',
      updated_at = NOW()
    WHERE id = customer_id;
  END IF;

  -- Wire next_journey pointers
  UPDATE public.journeys
  SET next_journey_id = cart_id, updated_at = NOW()
  WHERE id = welcome_id;

  UPDATE public.journeys
  SET next_journey_id = customer_id, updated_at = NOW()
  WHERE id = cart_id;

  UPDATE public.journeys
  SET next_journey_id = NULL, updated_at = NOW()
  WHERE id = customer_id;

  -- Remount welcome steps
  UPDATE public.action_queue
  SET status = 'cancelled',
      error_message = 'Cancelled during LUNEVA welcome journey seed',
      updated_at = NOW()
  WHERE journey_id = welcome_id AND status = 'pending';

  DELETE FROM public.journey_steps WHERE journey_id = welcome_id;

  INSERT INTO public.journey_steps
    (journey_id, step_order, step_name, delay_value, delay_unit, action_type, template_id)
  VALUES
    (welcome_id, 1, 'Welcome to LUNEVA', 5, 'minutes', 'email', 'luneva_welcome_day0'),
    (welcome_id, 2, 'Beauty in Motion', 1, 'days', 'email', 'luneva_welcome_day1'),
    (welcome_id, 3, 'Made for Gifting', 1, 'days', 'email', 'luneva_welcome_day2'),
    (welcome_id, 4, 'Meet the Collection', 1, 'days', 'email', 'luneva_welcome_day3'),
    (welcome_id, 5, 'What Makers Say', 1, 'days', 'email', 'luneva_welcome_day4'),
    (welcome_id, 6, 'Assemble in an Evening', 1, 'days', 'email', 'luneva_welcome_day5'),
    (welcome_id, 7, 'Why LUNEVA', 1, 'days', 'email', 'luneva_welcome_day6'),
    (welcome_id, 8, 'Your Invitation', 1, 'days', 'email', 'luneva_welcome_day7');

  -- Remount cart steps
  UPDATE public.action_queue
  SET status = 'cancelled',
      error_message = 'Cancelled during LUNEVA cart journey seed',
      updated_at = NOW()
  WHERE journey_id = cart_id AND status = 'pending';

  DELETE FROM public.journey_steps WHERE journey_id = cart_id;

  INSERT INTO public.journey_steps
    (journey_id, step_order, step_name, delay_value, delay_unit, action_type, template_id)
  VALUES
    (cart_id, 1, 'Your Kit Is Waiting', 30, 'minutes', 'email', 'luneva_cart_day0'),
    (cart_id, 2, 'Picture the Glow', 1, 'days', 'email', 'luneva_cart_day1'),
    (cart_id, 3, 'Need A Hand?', 1, 'days', 'email', 'luneva_cart_day2'),
    (cart_id, 4, 'Gift Stories', 1, 'days', 'email', 'luneva_cart_day3'),
    (cart_id, 5, 'Why The Craft Matters', 1, 'days', 'email', 'luneva_cart_day4'),
    (cart_id, 6, 'Your Savings Still Apply', 1, 'days', 'email', 'luneva_cart_day5'),
    (cart_id, 7, 'Finish Your Gift', 1, 'days', 'email', 'luneva_cart_day6'),
    (cart_id, 8, 'Last Soft Invitation', 1, 'days', 'email', 'luneva_cart_day7');

  -- Remount purchase steps
  UPDATE public.action_queue
  SET status = 'cancelled',
      error_message = 'Cancelled during LUNEVA customer journey seed',
      updated_at = NOW()
  WHERE journey_id = customer_id AND status = 'pending';

  DELETE FROM public.journey_steps WHERE journey_id = customer_id;

  INSERT INTO public.journey_steps
    (journey_id, step_order, step_name, delay_value, delay_unit, action_type, template_id)
  VALUES
    (customer_id, 1, 'Thank You', 5, 'minutes', 'email', 'luneva_purchase_day0'),
    (customer_id, 2, 'Share Your Glow', 5, 'days', 'email', 'luneva_purchase_day1');
END $$;
