-- Workflow automation engine for persistent email workflows

CREATE TABLE IF NOT EXISTS public.workflow_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  delay_minutes INTEGER NOT NULL DEFAULT 0 CHECK (delay_minutes >= 0),
  condition_type TEXT NOT NULL,
  condition_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  action_type TEXT NOT NULL,
  action_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.workflow_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.workflow_definitions(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.newsletter_subscribers(id) ON DELETE SET NULL,
  visitor_id TEXT,
  lead_email TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'cancelled', 'failed')),
  scheduled_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts >= 1),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.workflow_execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES public.workflow_executions(id) ON DELETE CASCADE,
  level TEXT NOT NULL DEFAULT 'info'
    CHECK (level IN ('info', 'warn', 'error')),
  message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS workflow_executions_pending_unique
  ON public.workflow_executions (workflow_id, lead_id)
  WHERE status IN ('pending', 'running');

CREATE INDEX IF NOT EXISTS workflow_executions_status_scheduled_idx
  ON public.workflow_executions (status, scheduled_at, next_retry_at);

CREATE INDEX IF NOT EXISTS workflow_executions_workflow_idx
  ON public.workflow_executions (workflow_id, created_at DESC);

CREATE INDEX IF NOT EXISTS workflow_executions_lead_idx
  ON public.workflow_executions (lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS workflow_execution_logs_execution_idx
  ON public.workflow_execution_logs (execution_id, created_at DESC);

ALTER TABLE public.workflow_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_execution_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No public access workflow_definitions" ON public.workflow_definitions;
CREATE POLICY "No public access workflow_definitions"
  ON public.workflow_definitions
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "Service manage workflow_definitions" ON public.workflow_definitions;
CREATE POLICY "Service manage workflow_definitions"
  ON public.workflow_definitions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "No public access workflow_executions" ON public.workflow_executions;
CREATE POLICY "No public access workflow_executions"
  ON public.workflow_executions
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "Service manage workflow_executions" ON public.workflow_executions;
CREATE POLICY "Service manage workflow_executions"
  ON public.workflow_executions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "No public access workflow_execution_logs" ON public.workflow_execution_logs;
CREATE POLICY "No public access workflow_execution_logs"
  ON public.workflow_execution_logs
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "Service manage workflow_execution_logs" ON public.workflow_execution_logs;
CREATE POLICY "Service manage workflow_execution_logs"
  ON public.workflow_execution_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.claim_due_workflow_executions(p_limit INTEGER DEFAULT 10)
RETURNS SETOF public.workflow_executions
LANGUAGE sql
AS $$
  WITH due AS (
    SELECT we.id
    FROM public.workflow_executions AS we
    JOIN public.workflow_definitions AS wd
      ON wd.id = we.workflow_id
    WHERE wd.enabled = true
      AND (
        (we.status = 'pending' AND we.scheduled_at <= NOW())
        OR (
          we.status = 'failed'
          AND we.next_retry_at IS NOT NULL
          AND we.next_retry_at <= NOW()
          AND we.attempt_count < we.max_attempts
        )
      )
    ORDER BY COALESCE(we.next_retry_at, we.scheduled_at) ASC, we.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(COALESCE(p_limit, 10), 1)
  ),
  claimed AS (
    UPDATE public.workflow_executions AS we
    SET status = 'running',
        started_at = NOW(),
        error = NULL,
        updated_at = NOW()
    WHERE we.id IN (SELECT id FROM due)
    RETURNING we.*
  )
  SELECT * FROM claimed;
$$;

REVOKE ALL ON FUNCTION public.claim_due_workflow_executions(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_due_workflow_executions(INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.claim_due_workflow_executions(INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_workflow_executions(INTEGER) TO service_role;

INSERT INTO public.workflow_definitions (
  workflow_key,
  name,
  trigger_type,
  delay_minutes,
  condition_type,
  condition_config,
  action_type,
  action_config,
  enabled
)
VALUES (
  'welcome_email',
  'Welcome Email',
  'email_signup',
  5,
  'lead_status_equals',
  '{"status":"subscriber"}'::jsonb,
  'send_template_email',
  '{"template_key":"welcome_email"}'::jsonb,
  true
)
ON CONFLICT (workflow_key) DO UPDATE
SET name = EXCLUDED.name,
    trigger_type = EXCLUDED.trigger_type,
    delay_minutes = EXCLUDED.delay_minutes,
    condition_type = EXCLUDED.condition_type,
    condition_config = EXCLUDED.condition_config,
    action_type = EXCLUDED.action_type,
    action_config = EXCLUDED.action_config,
    updated_at = NOW();
