-- Upgrade cart_journey + customer_journey to 8-step (Day 0–7) email sequences.
-- Remounts waiting enrollments onto matching new step_order.

DO $$
DECLARE
  cart_id UUID;
  customer_id UUID;
BEGIN
  SELECT id INTO cart_id FROM public.journeys WHERE journey_key = 'cart_journey';
  SELECT id INTO customer_id FROM public.journeys WHERE journey_key = 'customer_journey';

  IF cart_id IS NOT NULL THEN
    UPDATE public.journeys
    SET
      name = 'ZYBAR Cart Recovery Journey',
      description = '7-day abandoned cart recovery: reminder, atmosphere, help, proof, craft, savings, custom, invitation.',
      updated_at = NOW()
    WHERE id = cart_id;

    UPDATE public.action_queue
    SET status = 'cancelled',
        error_message = 'Cancelled during cart journey v2 step upgrade',
        updated_at = NOW()
    WHERE journey_id = cart_id AND status = 'pending';

    DELETE FROM public.journey_steps WHERE journey_id = cart_id;

    INSERT INTO public.journey_steps
      (journey_id, step_order, step_name, delay_value, delay_unit, action_type, template_id)
    VALUES
      (cart_id, 1, 'Your Cart Is Waiting', 30, 'minutes', 'email', 'cart_day0'),
      (cart_id, 2, 'Imagine It On Your Wall', 1, 'days', 'email', 'cart_day1'),
      (cart_id, 3, 'Need A Hand?', 1, 'days', 'email', 'cart_day2'),
      (cart_id, 4, 'What Collectors Say', 1, 'days', 'email', 'cart_day3'),
      (cart_id, 5, 'Why The Craft Matters', 1, 'days', 'email', 'cart_day4'),
      (cart_id, 6, 'Your Savings Still Apply', 1, 'days', 'email', 'cart_day5'),
      (cart_id, 7, 'Make It Yours', 1, 'days', 'email', 'cart_day6'),
      (cart_id, 8, 'Last Soft Invitation', 1, 'days', 'email', 'cart_day7');

    UPDATE public.lead_journeys
    SET current_step = LEAST(current_step, 8), updated_at = NOW()
    WHERE journey_id = cart_id AND status IN ('waiting', 'ready');

    INSERT INTO public.action_queue (
      lead_id, journey_id, step_id, lead_journey_id, action_type, template_id,
      recipient, scheduled_at, status, step_name_snapshot, updated_at
    )
    SELECT
      lj.lead_id, cart_id, js.id, lj.id, js.action_type, js.template_id,
      ns.email, GREATEST(lj.next_ready_at, NOW()), 'pending', js.step_name, NOW()
    FROM public.lead_journeys lj
    JOIN public.newsletter_subscribers ns ON ns.id = lj.lead_id
    JOIN public.journey_steps js ON js.journey_id = cart_id AND js.step_order = lj.current_step
    WHERE lj.journey_id = cart_id AND lj.status IN ('waiting', 'ready');

    UPDATE public.newsletter_subscribers ns
    SET current_step = lj.current_step
    FROM public.lead_journeys lj
    WHERE lj.lead_id = ns.id
      AND lj.journey_id = cart_id
      AND lj.status IN ('waiting', 'ready')
      AND ns.current_journey_instance_id = lj.id;
  END IF;

  IF customer_id IS NOT NULL THEN
    UPDATE public.journeys
    SET
      name = 'ZYBAR Purchase Journey',
      description = '7-day post-purchase care: thank you, anticipation, living with light, install, share, review, next chapter, belonging.',
      updated_at = NOW()
    WHERE id = customer_id;

    UPDATE public.action_queue
    SET status = 'cancelled',
        error_message = 'Cancelled during purchase journey v2 step upgrade',
        updated_at = NOW()
    WHERE journey_id = customer_id AND status = 'pending';

    DELETE FROM public.journey_steps WHERE journey_id = customer_id;

    INSERT INTO public.journey_steps
      (journey_id, step_order, step_name, delay_value, delay_unit, action_type, template_id)
    VALUES
      (customer_id, 1, 'Thank You', 0, 'minutes', 'email', 'purchase_day0'),
      (customer_id, 2, 'Your Piece Is Being Prepared', 1, 'days', 'email', 'purchase_day1'),
      (customer_id, 3, 'How To Live With Light', 1, 'days', 'email', 'purchase_day2'),
      (customer_id, 4, 'Install With Ease', 1, 'days', 'email', 'purchase_day3'),
      (customer_id, 5, 'Share Your Setup', 1, 'days', 'email', 'purchase_day4'),
      (customer_id, 6, 'Leave A Collector Review', 1, 'days', 'email', 'purchase_day5'),
      (customer_id, 7, 'Your Next Chapter', 1, 'days', 'email', 'purchase_day6'),
      (customer_id, 8, 'Welcome To The Garage', 1, 'days', 'email', 'purchase_day7');

    UPDATE public.lead_journeys
    SET current_step = LEAST(current_step, 8), updated_at = NOW()
    WHERE journey_id = customer_id AND status IN ('waiting', 'ready');

    INSERT INTO public.action_queue (
      lead_id, journey_id, step_id, lead_journey_id, action_type, template_id,
      recipient, scheduled_at, status, step_name_snapshot, updated_at
    )
    SELECT
      lj.lead_id, customer_id, js.id, lj.id, js.action_type, js.template_id,
      ns.email, GREATEST(lj.next_ready_at, NOW()), 'pending', js.step_name, NOW()
    FROM public.lead_journeys lj
    JOIN public.newsletter_subscribers ns ON ns.id = lj.lead_id
    JOIN public.journey_steps js ON js.journey_id = customer_id AND js.step_order = lj.current_step
    WHERE lj.journey_id = customer_id AND lj.status IN ('waiting', 'ready');

    UPDATE public.newsletter_subscribers ns
    SET current_step = lj.current_step
    FROM public.lead_journeys lj
    WHERE lj.lead_id = ns.id
      AND lj.journey_id = customer_id
      AND lj.status IN ('waiting', 'ready')
      AND ns.current_journey_instance_id = lj.id;
  END IF;

  INSERT INTO public.email_templates (template_key, name, description, subject, html_body, status)
  VALUES
    ('cart_day0', 'Cart Day 0', 'Soft cart reminder.', 'Your cart is waiting', '', 'active'),
    ('cart_day1', 'Cart Day 1', 'Imagine it on your wall.', 'Imagine it on your wall', '', 'active'),
    ('cart_day2', 'Cart Day 2', 'Need a hand finishing.', 'Need a hand finishing?', '', 'active'),
    ('cart_day3', 'Cart Day 3', 'Collector social proof.', 'What collectors say', '', 'active'),
    ('cart_day4', 'Cart Day 4', 'Craft value.', 'Why the craft matters', '', 'active'),
    ('cart_day5', 'Cart Day 5', 'Member savings reminder.', 'Your savings still apply', '', 'active'),
    ('cart_day6', 'Cart Day 6', 'Make it yours.', 'Make it yours', '', 'active'),
    ('cart_day7', 'Cart Day 7', 'Quiet last invitation.', 'A quiet last invitation', '', 'active'),
    ('purchase_day0', 'Purchase Day 0', 'Thank you.', 'Thank you for your order', '', 'active'),
    ('purchase_day1', 'Purchase Day 1', 'Piece being prepared.', 'Your piece is being prepared', '', 'active'),
    ('purchase_day2', 'Purchase Day 2', 'Live with light.', 'How to live with light', '', 'active'),
    ('purchase_day3', 'Purchase Day 3', 'Install guidance.', 'Install with ease', '', 'active'),
    ('purchase_day4', 'Purchase Day 4', 'Share setup.', 'Share your setup', '', 'active'),
    ('purchase_day5', 'Purchase Day 5', 'Review request.', 'How does it look on your wall?', '', 'active'),
    ('purchase_day6', 'Purchase Day 6', 'Next chapter.', 'Your next chapter', '', 'active'),
    ('purchase_day7', 'Purchase Day 7', 'Welcome to the garage.', 'Welcome to the garage', '', 'active')
  ON CONFLICT (template_key) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    subject = EXCLUDED.subject,
    updated_at = NOW();
END $$;
