-- Step 3 — One column only (orders table is small; should be fast).

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS visitor_id TEXT;
