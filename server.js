/**
 * ZYBAR Stripe backend: Checkout Session API + Webhook.
 * Requires: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (for webhook).
 * Run: node server.js  (or npm run server)
 */
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;
const isZybarMy = process.env.ZYBAR_MY === '1' || process.env.ZYBAR_MY === 'true';
const inquiriesPassword = process.env.ADMIN_INQUIRIES_PASSWORD || 'zybar-admin';
const inquiriesStorePath = path.join(__dirname, 'data', 'contact-inquiries.json');

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!stripeSecretKey) {
  console.warn('Missing STRIPE_SECRET_KEY. Set it in .env to enable checkout.');
}

const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;
const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } })
  : null;

function ensureInquiriesStore() {
  const dir = path.dirname(inquiriesStorePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(inquiriesStorePath)) fs.writeFileSync(inquiriesStorePath, '[]', 'utf8');
}

function readInquiriesStore() {
  ensureInquiriesStore();
  try {
    const raw = fs.readFileSync(inquiriesStorePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function writeInquiriesStore(list) {
  ensureInquiriesStore();
  fs.writeFileSync(inquiriesStorePath, JSON.stringify(list, null, 2), 'utf8');
}

// ----- ZYBAR.MY test env: redirect root to ?env=zybar.my when running on test port -----
if (isZybarMy) {
  app.get('/', function (req, res, next) {
    if (req.url === '/' && !req.query.env) {
      return res.redirect(302, '/?env=zybar.my');
    }
    next();
  });
}

// ----- Static files -----
app.use(express.static(path.join(__dirname)));

// ----- Webhook: raw body only (must be before express.json()) -----
app.post(
  '/api/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
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

      if (supabase) {
        try {
          const amount = typeof session.amount_total === 'number' ? session.amount_total : 0;
          const quantity = session.metadata && session.metadata.quantity ? parseInt(session.metadata.quantity, 10) || 1 : 1;
          const { error } = await supabase.from('orders').insert({
            stripe_session_id: session.id,
            stripe_payment_intent: session.payment_intent || null,
            customer_email: session.customer_details && session.customer_details.email ? session.customer_details.email : session.customer_email || null,
            currency: (session.currency || 'usd').toLowerCase(),
            amount_total_cents: amount,
            product_slug: session.metadata && session.metadata.productSlug ? session.metadata.productSlug : null,
            size: session.metadata && session.metadata.size ? session.metadata.size : null,
            quantity: quantity,
            status: session.payment_status || 'completed',
            test_mode: !!session.livemode === false
          });
          if (error) {
            console.error('Supabase insert orders error:', error);
          }
        } catch (e) {
          console.error('Supabase orders insert exception:', e);
        }
      } else {
        console.warn('Supabase client not configured; skipping order persistence.');
      }
    }

    res.json({ received: true });
  }
);

// ----- JSON body for other routes -----
app.use(express.json());

// ----- Contact form API -----
app.post('/api/contact', async (req, res) => {
  const body = req.body || {};
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const phone = String(body.phone || '').trim();
  const carModelInterest = String(body.carModelInterest || '').trim();
  const message = String(body.message || '').trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!name || !email || !message || !emailRegex.test(email)) {
    return res.status(400).json({ error: 'Please provide a valid name, email, and message.' });
  }

  const inquiries = readInquiriesStore();
  const row = {
    id: 'inq_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    name: name,
    email: email,
    phone: phone || null,
    car_model_interest: carModelInterest || null,
    message: message,
    created_at: new Date().toISOString()
  };
  inquiries.unshift(row);
  writeInquiriesStore(inquiries);

  var supabaseSaved = false;
  if (supabase) {
    try {
      const { error } = await supabase.from('contact_inquiries').insert({
        inquiry_id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        car_model_interest: row.car_model_interest,
        message: row.message,
        created_at: row.created_at
      });
      if (error) {
        console.error('Supabase insert contact_inquiries error:', error);
      } else {
        supabaseSaved = true;
      }
    } catch (e) {
      console.error('Supabase contact_inquiries insert exception:', e);
    }
  }
  return res.json({ ok: true, id: row.id, supabaseSaved: supabaseSaved });
});

app.get('/api/contact-inquiries', async (req, res) => {
  const provided = String(req.headers['x-admin-password'] || '');
  if (!provided || provided !== inquiriesPassword) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (supabase) {
    try {
      const result = await supabase
        .from('contact_inquiries')
        .select('inquiry_id,name,email,phone,car_model_interest,message,created_at')
        .order('created_at', { ascending: false })
        .limit(500);
      if (!result.error) {
        const data = (result.data || []).map(function (r) {
          return {
            id: r.inquiry_id || null,
            name: r.name || null,
            email: r.email || null,
            phone: r.phone || null,
            car_model_interest: r.car_model_interest || null,
            message: r.message || null,
            created_at: r.created_at || null
          };
        });
        return res.json({ data: data, source: 'supabase' });
      }
      console.error('Supabase fetch contact_inquiries error:', result.error);
    } catch (e) {
      console.error('Supabase contact_inquiries fetch exception:', e);
    }
  }
  const inquiries = readInquiriesStore();
  return res.json({ data: inquiries, source: 'local' });
});

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
  if (isZybarMy) console.log('ZYBAR.MY test mode — open http://localhost:' + PORT + ' (redirects to ?env=zybar.my)');
  if (!stripeSecretKey) console.warn('STRIPE_SECRET_KEY missing — checkout will return 503.');
});
