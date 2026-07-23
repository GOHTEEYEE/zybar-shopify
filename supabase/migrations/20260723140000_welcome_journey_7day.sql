-- ZYBAR Welcome Journey v2 — 7-day lifecycle (Day 0–7)
-- Replaces the short 4-step welcome nurture with the full brand journey.

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

  -- Archive legacy short-journey template keys remain available in code;
  -- steps now point at welcome_day0–welcome_day7.
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

  -- Seed email_templates catalog rows for journey builder / admin (html from code renderers).
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
