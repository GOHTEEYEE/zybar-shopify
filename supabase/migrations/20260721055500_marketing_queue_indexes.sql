-- Cover lifecycle and queue foreign-key access paths used by workers/admin.

CREATE INDEX IF NOT EXISTS action_queue_lead_journey_id_idx
  ON public.action_queue (lead_journey_id)
  WHERE lead_journey_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS action_queue_journey_id_idx
  ON public.action_queue (journey_id)
  WHERE journey_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS action_queue_step_id_idx
  ON public.action_queue (step_id)
  WHERE step_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS lead_journeys_journey_id_idx
  ON public.lead_journeys (journey_id);

CREATE INDEX IF NOT EXISTS newsletter_subscribers_current_journey_id_idx
  ON public.newsletter_subscribers (current_journey_id)
  WHERE current_journey_id IS NOT NULL;
