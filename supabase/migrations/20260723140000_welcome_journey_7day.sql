-- ZYBAR Welcome Journey v2 — 8 email steps (Day 0–7)
-- Replaces the short 4-step welcome nurture with the full brand journey.
-- Safely remounts waiting enrollments onto the new step queue.

DO $$
DECLARE
  welcome_id UUID;
BEGIN
  SELECT id INTO welcome_id FROM public.journeys WHERE journey_key = 'welcome_journey';

  IF welcome_id IS NULL THEN
    INSERT INTO public.journeys (journey_key, name, description, trigger_type, is_active)
    VALUES (
      'welcome_journey',
      'ZYBAR Welcome Journey',
      '7-day welcome sequence: brand, light, craft, style, collectors, custom, why ZYBAR, invitation.',
      'signup',
      true
    )
    RETURNING id INTO welcome_id;
  ELSE
    UPDATE public.journeys
    SET
      name = 'ZYBAR Welcome Journey',
      description = '7-day welcome sequence: brand, light, craft, style, collectors, custom, why ZYBAR, invitation.',
      updated_at = NOW()
    WHERE id = welcome_id;
  END IF;

  -- Cancel pending queue rows that still point at old step IDs.
  UPDATE public.action_queue
  SET
    status = 'cancelled',
    error_message = 'Cancelled during welcome journey v2 step upgrade',
    updated_at = NOW()
  WHERE journey_id = welcome_id
    AND status = 'pending';

  DELETE FROM public.journey_steps WHERE journey_id = welcome_id;

  INSERT INTO public.journey_steps
    (journey_id, step_order, step_name, delay_value, delay_unit, action_type, template_id)
  VALUES
    (welcome_id, 1, 'Welcome to ZYBAR', 5, 'minutes', 'email', 'welcome_day0'),
    (welcome_id, 2, 'The Art of Living With Light', 1, 'days', 'email', 'welcome_day1'),
    (welcome_id, 3, 'Behind Every Piece', 1, 'days', 'email', 'welcome_day2'),
    (welcome_id, 4, 'Find Your Style', 1, 'days', 'email', 'welcome_day3'),
    (welcome_id, 5, 'Collector Stories', 1, 'days', 'email', 'welcome_day4'),
    (welcome_id, 6, 'Turn Your Own Car Into Light', 1, 'days', 'email', 'welcome_day5'),
    (welcome_id, 7, 'Why ZYBAR?', 1, 'days', 'email', 'welcome_day6'),
    (welcome_id, 8, 'Your Invitation', 1, 'days', 'email', 'welcome_day7');

  -- Cap current_step for anyone past the old 4-step journey onto the new last step.
  UPDATE public.lead_journeys
  SET
    current_step = LEAST(current_step, 8),
    updated_at = NOW()
  WHERE journey_id = welcome_id
    AND status IN ('waiting', 'ready');

  -- Remount pending sends for waiting enrollments onto matching new step_order.
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
    welcome_id,
    js.id,
    lj.id,
    js.action_type,
    js.template_id,
    ns.email,
    GREATEST(lj.next_ready_at, NOW()),
    'pending',
    js.step_name,
    NOW()
  FROM public.lead_journeys lj
  JOIN public.newsletter_subscribers ns ON ns.id = lj.lead_id
  JOIN public.journey_steps js
    ON js.journey_id = welcome_id
   AND js.step_order = lj.current_step
  WHERE lj.journey_id = welcome_id
    AND lj.status IN ('waiting', 'ready');

  -- Keep subscriber lifecycle pointer in sync when present.
  UPDATE public.newsletter_subscribers ns
  SET current_step = lj.current_step
  FROM public.lead_journeys lj
  WHERE lj.lead_id = ns.id
    AND lj.journey_id = welcome_id
    AND lj.status IN ('waiting', 'ready')
    AND ns.current_journey_instance_id = lj.id;

  INSERT INTO public.email_templates (template_key, name, description, subject, html_body, status)
  VALUES
    ('welcome_day0', 'Welcome Day 0', 'Introduce brand, founder why, atmosphere, collector welcome.', 'Welcome to ZYBAR', '', 'active'),
    ('welcome_day1', 'Welcome Day 1', 'Lifestyle light setups — garage, bedroom, living spaces.', 'The art of living with light', '', 'active'),
    ('welcome_day2', 'Welcome Day 2', 'Craft and selective illumination.', 'Behind every piece', '', 'active'),
    ('welcome_day3', 'Welcome Day 3', 'German / JDM / Muscle / Supercars / Custom identity.', 'Find your style', '', 'active'),
    ('welcome_day4', 'Welcome Day 4', 'Collector installs and testimonials.', 'Collector stories', '', 'active'),
    ('welcome_day5', 'Welcome Day 5', 'Custom product emotional journey.', 'Turn your own car into light', '', 'active'),
    ('welcome_day6', 'Welcome Day 6', 'Why ZYBAR — craft, light, atmosphere, emotion.', 'Why ZYBAR?', '', 'active'),
    ('welcome_day7', 'Welcome Day 7', 'Final invitation and welcome offer close.', 'Your invitation', '', 'active')
  ON CONFLICT (template_key) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    subject = EXCLUDED.subject,
    updated_at = NOW();
END $$;
