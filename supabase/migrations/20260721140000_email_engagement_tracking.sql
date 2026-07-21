-- Email engagement tracking: opens & clicks from Resend webhooks.

-- 1) Per-send engagement columns on the action queue.
ALTER TABLE public.action_queue
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT,
  ADD COLUMN IF NOT EXISTS campaign_log_id UUID,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bounced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS complained_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS open_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS click_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS action_queue_provider_message_idx
  ON public.action_queue (provider_message_id);

CREATE INDEX IF NOT EXISTS action_queue_campaign_log_idx
  ON public.action_queue (campaign_log_id);

-- 2) Raw engagement events (one row per Resend webhook delivery).
CREATE TABLE IF NOT EXISTS public.email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_message_id TEXT,
  event_type TEXT NOT NULL,
  recipient TEXT,
  link_url TEXT,
  action_id UUID REFERENCES public.action_queue(id) ON DELETE SET NULL,
  campaign_log_id UUID,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_events_message_idx
  ON public.email_events (provider_message_id);

CREATE INDEX IF NOT EXISTS email_events_campaign_idx
  ON public.email_events (campaign_log_id, event_type);

CREATE INDEX IF NOT EXISTS email_events_created_idx
  ON public.email_events (created_at DESC);

ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No public access email_events" ON public.email_events;
CREATE POLICY "No public access email_events"
  ON public.email_events FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Service manage email_events" ON public.email_events;
CREATE POLICY "Service manage email_events"
  ON public.email_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT ALL ON public.email_events TO service_role;
