-- Product management extensions for admin upload form.
-- Run this in Supabase SQL editor once.
-- Note: columns keep *_rm names for backward compatibility in codebase,
-- but values can store USD prices.

-- 1) Add richer product fields.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS price_rm NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS price_30x45_rm NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS price_40x60_rm NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS inventory INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

-- Optional status constraint for consistent values.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_status_check'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_status_check CHECK (status IN ('active', 'deactive'));
  END IF;
END $$;

-- 2) (Optional but useful) allow anon insert/update/delete in this project
-- because admin currently uses anon client + code login (no Supabase Auth).
-- If you later add proper Supabase auth, replace these with role-based policies.
DROP POLICY IF EXISTS "Allow anon manage products" ON public.products;
CREATE POLICY "Allow anon manage products"
  ON public.products
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 3) Create storage bucket for product images (public).
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- 4) Storage policies for uploading/reading product images.
DROP POLICY IF EXISTS "Public can read product images" ON storage.objects;
CREATE POLICY "Public can read product images"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Anon can upload product images" ON storage.objects;
CREATE POLICY "Anon can upload product images"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Anon can update product images" ON storage.objects;
CREATE POLICY "Anon can update product images"
  ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'product-images')
  WITH CHECK (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Anon can delete product images" ON storage.objects;
CREATE POLICY "Anon can delete product images"
  ON storage.objects
  FOR DELETE
  USING (bucket_id = 'product-images');
