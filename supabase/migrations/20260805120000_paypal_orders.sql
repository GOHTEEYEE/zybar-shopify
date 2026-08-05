-- PayPal orders alongside Stripe (synthetic stripe_session_id = paypal:{orderId} also used).

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS paypal_order_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_provider TEXT NOT NULL DEFAULT 'stripe';

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_paypal_order_id
  ON public.orders (paypal_order_id)
  WHERE paypal_order_id IS NOT NULL;

COMMENT ON COLUMN public.orders.paypal_order_id IS 'PayPal Orders API id when payment_provider=paypal';
COMMENT ON COLUMN public.orders.payment_provider IS 'stripe | paypal';
