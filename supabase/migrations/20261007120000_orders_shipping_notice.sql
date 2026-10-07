-- Carrier and shipping-notice stamps. The app still works if this migration
-- has not been applied: carrier and send history live in marketing_history.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tracking_carrier TEXT,
  ADD COLUMN IF NOT EXISTS shipping_notified_tracking TEXT,
  ADD COLUMN IF NOT EXISTS shipping_notified_at TIMESTAMPTZ;

COMMENT ON COLUMN public.orders.tracking_carrier IS 'dhl | fedex | ups | usps | yunexpress | 4px | other';
COMMENT ON COLUMN public.orders.shipping_notified_tracking IS 'Last tracking number included in a shipping or delivery email';
COMMENT ON COLUMN public.orders.shipping_notified_at IS 'When that tracking email was sent';
