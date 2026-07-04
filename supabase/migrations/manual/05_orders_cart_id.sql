-- Step 5

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cart_id UUID;
