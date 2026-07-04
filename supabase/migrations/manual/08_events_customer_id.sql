-- Step 8

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS customer_id TEXT;
