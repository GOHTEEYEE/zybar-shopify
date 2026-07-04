-- Step 6 — events table may be large; run alone. If this times out, skip for now (tracking still works).

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
