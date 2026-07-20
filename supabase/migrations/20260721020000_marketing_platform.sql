-- Marketing platform: email templates store, campaign logs, win-back journey

CREATE TABLE IF NOT EXISTS public.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_templates_status_idx
  ON public.email_templates (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.campaign_send_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audience TEXT NOT NULL,
  template_key TEXT NOT NULL,
  sent_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('completed', 'failed', 'partial')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS campaign_send_logs_created_idx
  ON public.campaign_send_logs (created_at DESC);

CREATE TABLE IF NOT EXISTS public.marketing_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  source TEXT NOT NULL,
  lead_email TEXT,
  journey_id UUID REFERENCES public.journeys(id) ON DELETE SET NULL,
  reference_id TEXT,
  message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS marketing_history_created_idx
  ON public.marketing_history (created_at DESC);

CREATE INDEX IF NOT EXISTS marketing_history_source_idx
  ON public.marketing_history (source, created_at DESC);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_send_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No public access email_templates" ON public.email_templates;
CREATE POLICY "No public access email_templates"
  ON public.email_templates FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Service manage email_templates" ON public.email_templates;
CREATE POLICY "Service manage email_templates"
  ON public.email_templates FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "No public access campaign_send_logs" ON public.campaign_send_logs;
CREATE POLICY "No public access campaign_send_logs"
  ON public.campaign_send_logs FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Service manage campaign_send_logs" ON public.campaign_send_logs;
CREATE POLICY "Service manage campaign_send_logs"
  ON public.campaign_send_logs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "No public access marketing_history" ON public.marketing_history;
CREATE POLICY "No public access marketing_history"
  ON public.marketing_history FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Service manage marketing_history" ON public.marketing_history;
CREATE POLICY "Service manage marketing_history"
  ON public.marketing_history FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT ALL ON public.email_templates TO service_role;
GRANT ALL ON public.campaign_send_logs TO service_role;
GRANT ALL ON public.marketing_history TO service_role;

-- Seed email templates from Phase 1 catalog (editable in admin)
INSERT INTO public.email_templates (template_key, name, description, subject, html_body, status)
VALUES
  (
    'welcome_email',
    'Welcome Email',
    'Luxury welcome email with discount code.',
    'Welcome to ZYBAR Garage',
    '<p>Welcome to ZYBAR. Use code {{discount_code}} for 15% off.</p><p><a href="{{store_url}}/collections/all/">Shop the Collection</a></p>',
    'active'
  ),
  (
    'brand_story',
    'Brand Story',
    'Introduce ZYBAR brand and car culture.',
    'The story behind ZYBAR LED art',
    '<p>Every ZYBAR piece is crafted for collectors who live the garage life.</p><p><a href="{{store_url}}/collections/all/">Explore the Garage</a></p>',
    'active'
  ),
  (
    'best_seller',
    'Best Seller',
    'Highlight top-selling LED posters.',
    'ZYBAR bestsellers our collectors love',
    '<p>Porsche GT3 RS, Lamborghini SVJ, Ferrari F8 — icons that sell out fast.</p><p><a href="{{store_url}}/collections/all/">Shop Bestsellers</a></p>',
    'active'
  ),
  (
    'discount_offer',
    'Discount Offer',
    'Remind leads of their discount code.',
    'Your ZYBAR discount is waiting',
    '<p>Use {{discount_code}} at checkout for 15% off.</p><p><a href="{{store_url}}/collections/all/">Redeem Discount</a></p>',
    'active'
  ),
  (
    'cart_reminder',
    'Cart Reminder',
    'Nudge cart abandoners to complete checkout.',
    'Your cart is waiting at ZYBAR',
    '<p>Your LED poster is still in your cart.</p><p><a href="{{store_url}}/cart/">Return to Cart</a></p>',
    'active'
  ),
  (
    'need_help',
    'Need Help',
    'Offer support at checkout.',
    'Need help finishing your ZYBAR order?',
    '<p>Stuck at checkout? Reply to this email and we will help.</p><p><a href="{{store_url}}/cart/">Return to Cart</a></p>',
    'active'
  ),
  (
    'thank_you',
    'Thank You',
    'Immediate post-purchase thank you.',
    'Thank you for your ZYBAR order',
    '<p>Thank you for your order. Your LED piece is being prepared.</p><p><a href="{{store_url}}/collections/all/">View Collections</a></p>',
    'active'
  ),
  (
    'review_request',
    'Review Request',
    'Ask for a review after delivery window.',
    'How is your ZYBAR LED piece?',
    '<p>Share how your LED poster looks on your wall.</p><p><a href="{{store_url}}/#reviews">Leave a Review</a></p>',
    'active'
  ),
  (
    'new_collection',
    'New Collection',
    'Re-engage customers with new arrivals.',
    'New arrivals in the ZYBAR garage',
    '<p>Fresh LED icons just dropped. Explore the new collection.</p><p><a href="{{store_url}}/collections/all/">Shop New Arrivals</a></p>',
    'active'
  ),
  (
    'win_back',
    'Win Back',
    'Re-engage dormant leads who have not purchased.',
    'We miss you in the ZYBAR garage',
    '<p>It has been a while. Come back and use {{discount_code}} on your next LED piece.</p><p><a href="{{store_url}}/collections/all/">Shop Again</a></p>',
    'active'
  )
ON CONFLICT (template_key) DO NOTHING;

-- Win Back Journey
DO $$
DECLARE
  winback_id UUID;
BEGIN
  INSERT INTO public.journeys (journey_key, name, description, trigger_type, is_active)
  VALUES (
    'win_back_journey',
    'Win Back Journey',
    'Re-engage leads with no purchase for an extended period.',
    'no_purchase',
    true
  )
  ON CONFLICT (journey_key) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    trigger_type = EXCLUDED.trigger_type,
    updated_at = NOW();

  SELECT id INTO winback_id FROM public.journeys WHERE journey_key = 'win_back_journey';

  DELETE FROM public.journey_steps WHERE journey_id = winback_id;
  INSERT INTO public.journey_steps
    (journey_id, step_order, step_name, delay_value, delay_unit, action_type, template_id)
  VALUES
    (winback_id, 1, 'Win Back Offer', 0, 'days', 'email', 'win_back'),
    (winback_id, 2, 'Need Help Follow-up', 3, 'days', 'email', 'need_help'),
    (winback_id, 3, 'Final Discount', 7, 'days', 'email', 'discount_offer');
END $$;

-- Rename cart journey display name for product language
UPDATE public.journeys
SET name = 'Cart Recovery Journey',
    description = 'Recover abandoned carts with reminders, help, and a discount.',
    updated_at = NOW()
WHERE journey_key = 'cart_journey';
