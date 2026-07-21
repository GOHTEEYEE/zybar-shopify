-- Cover the remaining lifecycle pointer foreign keys.

CREATE INDEX IF NOT EXISTS journeys_next_journey_id_idx
  ON public.journeys (next_journey_id)
  WHERE next_journey_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS newsletter_subscribers_current_journey_instance_id_idx
  ON public.newsletter_subscribers (current_journey_instance_id)
  WHERE current_journey_instance_id IS NOT NULL;
