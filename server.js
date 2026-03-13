/**
 * ZYBAR Stripe backend: Checkout Session API + Webhook.
 * Requires: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (for webhook).
 * Run: node server.js  (or npm run server)
 */
require('dotenv').config();
const path = require('path');
const express = require('express');
const Stripe = require('stripe');

const app = express();
const PORT = process.env.PORT || 3000;

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

if (!stripeSecretKey) {
  console.warn('Missing STRIPE_SECRET_KEY. Set it in .env to enable checkout.');
}

const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

// ----- Static files -----
app.use(express.static(path.join(__dirname)));

// ----- Webhook: raw body only (must be before express.json()) -----
app.post(
  '/api/webhook',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    if (!webhookSecret) {
      console.error('STRIPE_WEBHOOK_SECRET is not set');
      return res.status(500).json({ error: 'Webhook not configured' });
    }
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      return res.status(400).json({ error: 'Missing Stripe-Signature' });
    }
    const payload = req.body; // Buffer from express.raw()
    let event;
    try {
      event = Stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      console.log('Checkout completed:', session.id, session.customer_email, session.metadata);
      // TODO: Fulfill order (e.g. save to DB, send confirmation, update inventory).
    }

    res.json({ received: true });
  }
);

// ----- JSON body for other routes -----
app.use(express.json());

// ----- Create Checkout Session -----
app.post('/api/create-checkout-session', async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe is not configured' });
  }
  const { priceId, quantity, successUrl, cancelUrl, productSlug, size } = req.body || {};
  if (!priceId || typeof quantity !== 'number' || quantity < 1) {
    return res.status(400).json({ error: 'Invalid request: priceId and quantity (number >= 1) required' });
  }
  if (!successUrl || !cancelUrl) {
    return res.status(400).json({ error: 'successUrl and cancelUrl are required' });
  }

  const metadata = {};
  if (productSlug) metadata.productSlug = String(productSlug);
  if (size) metadata.size = String(size);
  metadata.quantity = String(quantity);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: priceId, quantity }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata,
    });
    return res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('Checkout session creation failed:', err);
    return res.status(500).json({ error: err.message || 'Failed to create checkout session' });
  }
});

// ----- Start -----
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  if (!stripeSecretKey) console.warn('STRIPE_SECRET_KEY missing — checkout will return 503.');
});
