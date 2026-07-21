-- Route campaign and journey emails through the same Action Queue worker.

ALTER TABLE public.action_queue
  ALTER COLUMN journey_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'journey'
    CHECK (source_type IN ('journey', 'campaign')),
  ADD COLUMN IF NOT EXISTS source_reference TEXT;

CREATE INDEX IF NOT EXISTS action_queue_source_reference_idx
  ON public.action_queue (source_type, source_reference)
  WHERE source_reference IS NOT NULL;
