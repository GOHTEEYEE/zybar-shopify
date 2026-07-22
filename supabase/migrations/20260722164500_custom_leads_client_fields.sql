-- Enrich custom leads with identifiable client fields

ALTER TABLE public.custom_leads
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS browser TEXT,
  ADD COLUMN IF NOT EXISTS traffic_source TEXT;

CREATE INDEX IF NOT EXISTS idx_custom_leads_country
  ON public.custom_leads (country);
