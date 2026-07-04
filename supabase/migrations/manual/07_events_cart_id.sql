-- Step 7

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS cart_id UUID;
