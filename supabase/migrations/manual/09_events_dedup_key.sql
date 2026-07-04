-- Step 9

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS dedup_key TEXT;
