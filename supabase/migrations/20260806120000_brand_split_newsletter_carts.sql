-- Brand column for newsletter + carts so ZYBAR / LUNEVA data never share one row.

ALTER TABLE public.newsletter_subscribers
  ADD COLUMN IF NOT EXISTS brand text;

UPDATE public.newsletter_subscribers
SET brand = CASE
  WHEN lower(coalesce(source, '')) LIKE '%luneva%' THEN 'luneva'
  WHEN upper(coalesce(discount_code, '')) = 'LUNEVA5' THEN 'luneva'
  ELSE 'zybar'
END
WHERE brand IS NULL OR brand = '';

ALTER TABLE public.newsletter_subscribers
  ALTER COLUMN brand SET DEFAULT 'zybar';

UPDATE public.newsletter_subscribers
SET brand = 'zybar'
WHERE brand IS NULL OR brand = '';

ALTER TABLE public.newsletter_subscribers
  ALTER COLUMN brand SET NOT NULL;

DROP INDEX IF EXISTS public.newsletter_subscribers_email_unique;

CREATE UNIQUE INDEX IF NOT EXISTS newsletter_subscribers_email_brand_unique
  ON public.newsletter_subscribers (lower(email), brand);

CREATE INDEX IF NOT EXISTS newsletter_subscribers_brand_created_at_idx
  ON public.newsletter_subscribers (brand, created_at DESC);

ALTER TABLE public.cart_sessions
  ADD COLUMN IF NOT EXISTS brand text;

UPDATE public.cart_sessions cs
SET brand = 'luneva'
WHERE (cs.brand IS NULL OR cs.brand = '')
  AND EXISTS (
    SELECT 1
    FROM public.cart_session_items csi
    WHERE csi.cart_id = cs.id
      AND coalesce(csi.product_id, '') ILIKE 'luneva-%'
  );

UPDATE public.cart_sessions
SET brand = 'zybar'
WHERE brand IS NULL OR brand = '';

ALTER TABLE public.cart_sessions
  ALTER COLUMN brand SET DEFAULT 'zybar';
