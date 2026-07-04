-- Step 4

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS analytics_session_id TEXT;
