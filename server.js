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
const OpenAI = require('openai');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;
const isZybarMy = process.env.ZYBAR_MY === '1' || process.env.ZYBAR_MY === 'true';
const inquiriesStorePath = path.join(__dirname, 'data', 'contact-inquiries.json');

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openAiApiKey = process.env.OPENAI_API_KEY;
const openAiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';

if (!stripeSecretKey) {
  console.warn('Missing STRIPE_SECRET_KEY. Set it in .env to enable checkout.');
}
if (!openAiApiKey) {
  console.warn('Missing OPENAI_API_KEY. Set it in .env to enable the chatbot.');
}

const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;
const openai = openAiApiKey ? new OpenAI({ apiKey: openAiApiKey }) : null;
const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } })
  : null;

const chatbotProductCatalog = [
  { name: 'Audi R8 - White', slug: 'audi-r8-white', price: '$110.00', sizes: '30 x 45 cm, 40 x 60 cm' },
  { name: 'Audi R8 - Yellow', slug: 'audi-r8-yellow', price: '$110.00', sizes: '30 x 45 cm, 40 x 60 cm' },
  { name: 'Audi R8 GT3', slug: 'audi-r8-gt3', price: '$110.00', sizes: '30 x 45 cm, 40 x 60 cm' },
  { name: 'Audi RS6', slug: 'audi-rs6', price: '$110.00', sizes: '30 x 45 cm, 40 x 60 cm' },
  { name: 'B Dodge Hellcat 02', slug: 'b-dodge-hellcat-02', price: '$110.00', sizes: '30 x 45 cm, 40 x 60 cm' },
  { name: 'B Dodge Hellcat 03', slug: 'b-dodge-hellcat-03', price: '$110.00', sizes: '30 x 45 cm, 40 x 60 cm' },
  { name: 'B Ferrari F40', slug: 'b-ferrari-f40', price: '$110.00', sizes: '30 x 45 cm, 40 x 60 cm' },
  { name: 'B Maserati MC20', slug: 'b-maserati-mc20', price: '$110.00', sizes: '30 x 45 cm, 40 x 60 cm' }
];
const allowedProductSlugs = new Set(chatbotProductCatalog.map(function (item) { return item.slug; }));

const chatbotSystemPrompt = [
  'You are the ZYBAR website assistant for LED automotive wall art.',
  'Help with product recommendations and customer support.',
  'Be concise, friendly, and practical.',
  'If the user wants a recommendation, ask 1-2 short questions if needed, then recommend 1-3 products from the catalog.',
  'If the user asks support questions, answer using the store information below only.',
  'Do not invent policies, prices, shipping times, or unavailable products.',
  'If you are unsure, say so and suggest using the contact page at /contact.html.',
  'When useful, mention the catalog page at /collections/all/.',
  'Store facts:',
  '- Brand: ZYBAR',
  '- Products: LED automotive wall art / automotive light painting',
  '- Standard product sizes: 30 x 45 cm and 40 x 60 cm',
  '- Power options: USB powered (worldwide) and 3 AA batteries',
  '- Features: remote control, multiple lighting modes, memory function, premium acrylic panel, matte backing, easy wall mount, no drilling required',
  '- Shipping: worldwide shipping is available',
  '- Returns: 30-day easy returns',
  '- Customization: customers can send a photo and discuss a custom art request',
  'Catalog:',
  chatbotProductCatalog.map(function (product) {
    return '- ' + product.name + ' (' + product.slug + '): ' + product.price + ', sizes ' + product.sizes;
  }).join('\n')
].join('\n');

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

function sanitizeReviewInput(body) {
  const payload = body || {};
  const productSlug = String(payload.productSlug || '').trim().slice(0, 80);
  const productName = String(payload.productName || '').trim().slice(0, 120);
  const name = String(payload.name || '').trim().slice(0, 60);
  const comment = String(payload.comment || '').trim().slice(0, 2000);
  const rating = Math.max(1, Math.min(5, parseInt(payload.rating, 10) || 0));
  const imageDataUrl = typeof payload.imageDataUrl === 'string' ? payload.imageDataUrl.trim() : '';
  const imageOk = !imageDataUrl || (
    /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(imageDataUrl) &&
    imageDataUrl.length <= 1800000
  );

  if (!allowedProductSlugs.has(productSlug)) return { error: 'Invalid product selected.' };
  if (!productName || productName.length < 2) return { error: 'Product name is required.' };
  if (!name || name.length < 2) return { error: 'Customer name is required.' };
  if (!comment || comment.length < 8) return { error: 'Review is too short.' };
  if (rating < 1 || rating > 5) return { error: 'Rating must be between 1 and 5.' };
  if (!imageOk) return { error: 'Invalid image format or image is too large.' };

  return {
    value: {
      productSlug: productSlug,
      productName: productName,
      name: name,
      comment: comment,
      rating: rating,
      imageDataUrl: imageDataUrl || null
    }
  };
}

function mapReviewRow(row) {
  if (!row) return null;
  return {
    id: row.id || null,
    product_slug: row.product_slug || null,
    product_name: row.product_name || null,
    customer_name: row.customer_name || null,
    rating: row.rating || null,
    review_text: row.review_text || null,
    image_data_url: row.image_data_url || null,
    created_at: row.created_at || null
  };
}

function buildReviewFingerprint(review) {
  if (!review) return '';
  return [
    String(review.product_slug || '').trim().toLowerCase(),
    String(review.product_name || '').trim().toLowerCase(),
    String(review.customer_name || '').trim().toLowerCase(),
    String(review.rating || '').trim(),
    String(review.review_text || '').trim().toLowerCase(),
    String(review.created_at || '').trim()
  ].join('||');
}

function sanitizeImportedReview(body) {
  const payload = body || {};
  const productSlug = String(payload.product_slug || '').trim().slice(0, 80);
  const productName = String(payload.product_name || '').trim().slice(0, 120);
  const customerName = String(payload.customer_name || '').trim().slice(0, 60);
  const reviewText = String(payload.review_text || '').trim().slice(0, 2000);
  const rating = Math.max(1, Math.min(5, parseInt(payload.rating, 10) || 0));
  const imageDataUrl = typeof payload.image_data_url === 'string' ? payload.image_data_url.trim() : '';
  const createdAtInput = typeof payload.created_at === 'string' ? payload.created_at.trim() : '';
  const createdAtDate = createdAtInput ? new Date(createdAtInput + (createdAtInput.indexOf('T') === -1 ? 'T00:00:00.000Z' : '')) : null;
  const createdAt = createdAtDate && !Number.isNaN(createdAtDate.getTime()) ? createdAtDate.toISOString() : null;
  const imageOk = !imageDataUrl || (
    /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(imageDataUrl) &&
    imageDataUrl.length <= 1800000
  );
  const imageDropped = !!(imageDataUrl && !imageOk);
  const imageFinal = imageOk ? (imageDataUrl || null) : null;

  if (!allowedProductSlugs.has(productSlug)) return { error: 'Invalid product selected.' };
  if (!productName || productName.length < 2) return { error: 'Product name is required.' };
  if (!customerName || customerName.length < 2) return { error: 'Customer name is required.' };
  if (!reviewText || reviewText.length < 8) return { error: 'Review is too short.' };
  if (rating < 1 || rating > 5) return { error: 'Rating must be between 1 and 5.' };
  if (!createdAt) return { error: 'Valid review date is required.' };

  return {
    value: {
      product_slug: productSlug,
      product_name: productName,
      customer_name: customerName,
      rating: rating,
      review_text: reviewText,
      image_data_url: imageFinal,
      created_at: createdAt
    },
    imageDropped: imageDropped
  };
}

async function logChatbotConversation(sessionId, pageContext, userAgent, userMessage, assistantReply) {
  if (!supabase || !sessionId) return;

  const safePagePath = pageContext && typeof pageContext.path === 'string' ? pageContext.path.trim().slice(0, 200) : null;
  const safePageTitle = pageContext && typeof pageContext.title === 'string' ? pageContext.title.trim().slice(0, 200) : null;

  try {
    const { error: sessionError } = await supabase
      .from('chatbot_sessions')
      .upsert({
        id: sessionId,
        page_path: safePagePath,
        page_title: safePageTitle,
        user_agent: userAgent ? String(userAgent).slice(0, 500) : null,
        last_message_at: new Date().toISOString()
      }, { onConflict: 'id' });

    if (sessionError) {
      console.error('Supabase chatbot_sessions upsert error:', sessionError);
    }

    const rows = [];
    if (userMessage) {
      rows.push({
        session_id: sessionId,
        role: 'user',
        message: userMessage,
        page_path: safePagePath,
        page_title: safePageTitle
      });
    }
    if (assistantReply) {
      rows.push({
        session_id: sessionId,
        role: 'assistant',
        message: assistantReply,
        page_path: safePagePath,
        page_title: safePageTitle
      });
    }

    if (rows.length) {
      const { error: messagesError } = await supabase.from('chatbot_messages').insert(rows);
      if (messagesError) {
        console.error('Supabase chatbot_messages insert error:', messagesError);
      }
    }
  } catch (error) {
    console.error('Supabase chatbot logging exception:', error);
  }
}

async function fetchChatbotConversations(limit) {
  if (!supabase) {
    return { data: [], source: 'unconfigured' };
  }

  const maxRows = Math.max(1, Math.min(Number(limit) || 100, 200));
  const sessionsResult = await supabase
    .from('chatbot_sessions')
    .select('id,page_path,page_title,user_agent,started_at,last_message_at')
    .order('last_message_at', { ascending: false })
    .limit(maxRows);

  if (sessionsResult.error) {
    throw sessionsResult.error;
  }

  const sessions = Array.isArray(sessionsResult.data) ? sessionsResult.data : [];
  if (!sessions.length) {
    return { data: [], source: 'supabase' };
  }

  const sessionIds = sessions.map(function (row) { return row.id; });
  const messagesResult = await supabase
    .from('chatbot_messages')
    .select('id,session_id,role,message,page_path,page_title,created_at')
    .in('session_id', sessionIds)
    .order('created_at', { ascending: true });

  if (messagesResult.error) {
    throw messagesResult.error;
  }

  const messageMap = {};
  (messagesResult.data || []).forEach(function (row) {
    if (!messageMap[row.session_id]) messageMap[row.session_id] = [];
    messageMap[row.session_id].push(row);
  });

  return {
    source: 'supabase',
    data: sessions.map(function (session) {
      return {
        id: session.id,
        page_path: session.page_path || null,
        page_title: session.page_title || null,
        user_agent: session.user_agent || null,
        started_at: session.started_at || null,
        last_message_at: session.last_message_at || null,
        messages: messageMap[session.id] || []
      };
    })
  };
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
app.use(express.json({ limit: '3mb' }));

app.get('/api/admin-reviews', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Supabase is not configured for reviews yet.' });
  }

  try {
    const result = await supabase
      .from('product_reviews')
      .select('id,product_slug,product_name,customer_name,rating,review_text,image_data_url,status,source,created_at')
      .order('created_at', { ascending: false })
      .limit(500);
    if (result.error) {
      console.error('Supabase fetch admin product_reviews error:', result.error);
      return res.status(500).json({ error: 'Unable to load admin reviews.' });
    }
    return res.json({ data: result.data || [] });
  } catch (e) {
    console.error('Supabase admin product_reviews fetch exception:', e);
    return res.status(500).json({ error: 'Unable to load admin reviews.' });
  }
});

app.post('/api/admin-reviews/import', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Supabase is not configured for reviews yet.' });
  }

  const rows = Array.isArray(req.body && req.body.reviews) ? req.body.reviews.slice(0, 500) : [];
  if (!rows.length) {
    return res.status(400).json({ error: 'No reviews were provided for import.' });
  }

  const sanitized = [];
  let imagesDropped = 0;
  for (const row of rows) {
    const checked = sanitizeImportedReview(row);
    if (checked.error) return res.status(400).json({ error: checked.error });
    sanitized.push(checked.value);
    if (checked.imageDropped) imagesDropped += 1;
  }

  try {
    const existingResult = await supabase
      .from('product_reviews')
      .select('product_slug,product_name,customer_name,rating,review_text,created_at')
      .limit(5000);
    if (existingResult.error) {
      console.error('Supabase fetch existing product_reviews error:', existingResult.error);
      return res.status(500).json({ error: 'Unable to import reviews right now.' });
    }

    const existingFingerprints = new Set((existingResult.data || []).map(buildReviewFingerprint));
    const inserts = [];
    let skipped = 0;

    sanitized.forEach(function (row) {
      const fingerprint = buildReviewFingerprint(row);
      if (existingFingerprints.has(fingerprint)) {
        skipped += 1;
        return;
      }
      existingFingerprints.add(fingerprint);
      inserts.push({
        product_slug: row.product_slug,
        product_name: row.product_name,
        customer_name: row.customer_name,
        rating: row.rating,
        review_text: row.review_text,
        image_data_url: row.image_data_url,
        created_at: row.created_at,
        status: 'approved',
        source: 'local-import'
      });
    });

    if (inserts.length) {
      const insertResult = await supabase.from('product_reviews').insert(inserts);
      if (insertResult.error) {
        console.error('Supabase import product_reviews error:', insertResult.error);
        return res.status(500).json({ error: 'Unable to import reviews right now.' });
      }
    }

    return res.json({
      ok: true,
      imported: inserts.length,
      skipped: skipped,
      total: sanitized.length,
      images_cleared: imagesDropped
    });
  } catch (e) {
    console.error('Supabase import product_reviews exception:', e);
    return res.status(500).json({ error: 'Unable to import reviews right now.' });
  }
});

app.patch('/api/admin-reviews', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Supabase is not configured for reviews yet.' });
  }

  const id = parseInt(req.body && req.body.id, 10);
  const customerName = String(req.body && req.body.customer_name || '').trim().slice(0, 60);
  const productName = String(req.body && req.body.product_name || '').trim().slice(0, 120);
  const productSlug = String(req.body && req.body.product_slug || '').trim().slice(0, 80);
  const rating = Math.max(1, Math.min(5, parseInt(req.body && req.body.rating, 10) || 0));
  const status = String(req.body && req.body.status || '').trim().toLowerCase();
  const reviewText = String(req.body && req.body.review_text || '').trim().slice(0, 2000);
  const imageDataUrl = typeof (req.body && req.body.image_data_url) === 'string' ? req.body.image_data_url.trim() : '';
  const createdAtInput = typeof (req.body && req.body.created_at) === 'string' ? req.body.created_at.trim() : '';
  const createdAtDate = createdAtInput ? new Date(createdAtInput + (createdAtInput.indexOf('T') === -1 ? 'T00:00:00.000Z' : '')) : null;
  const createdAt = createdAtDate && !Number.isNaN(createdAtDate.getTime()) ? createdAtDate.toISOString() : null;

  if (!id) return res.status(400).json({ error: 'Review ID is required.' });
  if (!customerName || !productName || !productSlug || !reviewText) {
    return res.status(400).json({ error: 'Customer name, product name, product slug, and review text are required.' });
  }
  if (!allowedProductSlugs.has(productSlug)) {
    return res.status(400).json({ error: 'Invalid product slug.' });
  }
  if (status !== 'approved' && status !== 'pending' && status !== 'rejected') {
    return res.status(400).json({ error: 'Invalid review status.' });
  }
  if (createdAtInput && !createdAt) {
    return res.status(400).json({ error: 'Invalid upload date.' });
  }

  const updatePayload = {
    customer_name: customerName,
    product_name: productName,
    product_slug: productSlug,
    rating: rating,
    status: status,
    review_text: reviewText,
    image_data_url: imageDataUrl || null
  };
  if (createdAt) updatePayload.created_at = createdAt;

  try {
    const result = await supabase
      .from('product_reviews')
      .update(updatePayload)
      .eq('id', id)
      .select('id,product_slug,product_name,customer_name,rating,review_text,image_data_url,status,source,created_at')
      .single();
    if (result.error) {
      console.error('Supabase update admin product_reviews error:', result.error);
      return res.status(500).json({ error: 'Unable to update review.' });
    }
    return res.json({ ok: true, review: result.data });
  } catch (e) {
    console.error('Supabase admin product_reviews update exception:', e);
    return res.status(500).json({ error: 'Unable to update review.' });
  }
});

app.delete('/api/admin-reviews', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Supabase is not configured for reviews yet.' });
  }

  const id = parseInt(req.query.id || (req.body && req.body.id), 10);
  if (!id) return res.status(400).json({ error: 'Review ID is required.' });

  try {
    const result = await supabase
      .from('product_reviews')
      .delete()
      .eq('id', id);
    if (result.error) {
      console.error('Supabase delete admin product_reviews error:', result.error);
      return res.status(500).json({ error: 'Unable to delete review.' });
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error('Supabase admin product_reviews delete exception:', e);
    return res.status(500).json({ error: 'Unable to delete review.' });
  }
});

app.get('/api/reviews', async (req, res) => {
  const productSlug = String(req.query.productSlug || '').trim().slice(0, 80);
  const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 80, 200));
  if (productSlug && !allowedProductSlugs.has(productSlug)) {
    return res.status(400).json({ error: 'Invalid product selected.' });
  }
  if (!supabase) {
    return res.status(503).json({ error: 'Supabase is not configured for reviews yet.' });
  }

  try {
    let query = supabase
      .from('product_reviews')
      .select('id,product_slug,product_name,customer_name,rating,review_text,image_data_url,created_at')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (productSlug) {
      query = query.eq('product_slug', productSlug);
    }
    const result = await query;
    if (result.error) {
      console.error('Supabase fetch product_reviews error:', result.error);
      return res.status(500).json({ error: 'Unable to load reviews.' });
    }
    return res.json({
      source: 'supabase',
      data: (result.data || []).map(mapReviewRow)
    });
  } catch (e) {
    console.error('Supabase product_reviews fetch exception:', e);
    return res.status(500).json({ error: 'Unable to load reviews.' });
  }
});

app.post('/api/reviews', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Supabase is not configured for reviews yet.' });
  }

  const checked = sanitizeReviewInput(req.body);
  if (checked.error) {
    return res.status(400).json({ error: checked.error });
  }
  const payload = checked.value;

  try {
    const result = await supabase
      .from('product_reviews')
      .insert({
        product_slug: payload.productSlug,
        product_name: payload.productName,
        customer_name: payload.name,
        rating: payload.rating,
        review_text: payload.comment,
        image_data_url: payload.imageDataUrl,
        status: 'approved',
        source: 'website'
      })
      .select('id,product_slug,product_name,customer_name,rating,review_text,image_data_url,created_at')
      .single();

    if (result.error) {
      console.error('Supabase insert product_reviews error:', result.error);
      return res.status(500).json({ error: 'Unable to submit review right now.' });
    }

    return res.json({ ok: true, review: mapReviewRow(result.data) });
  } catch (e) {
    console.error('Supabase product_reviews insert exception:', e);
    return res.status(500).json({ error: 'Unable to submit review right now.' });
  }
});

app.post('/api/chatbot', async (req, res) => {
  if (!openai) {
    return res.status(503).json({ error: 'Chatbot is not configured yet.' });
  }

  const body = req.body || {};
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim().slice(0, 120) : '';
  const pageContext = body.pageContext || {};
  const rawMessages = Array.isArray(body.messages) ? body.messages : [];
  const messages = rawMessages
    .filter(function (message) {
      return message && (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string';
    })
    .map(function (message) {
      return {
        role: message.role,
        content: message.content.trim().slice(0, 1200)
      };
    })
    .filter(function (message) {
      return !!message.content;
    })
    .slice(-12);

  if (!messages.length) {
    return res.status(400).json({ error: 'A message is required.' });
  }

  const latestUserMessage = messages.filter(function (message) {
    return message.role === 'user';
  }).slice(-1)[0];

  const contextParts = [];
  if (typeof pageContext.title === 'string' && pageContext.title.trim()) {
    contextParts.push('Page title: ' + pageContext.title.trim().slice(0, 200));
  }
  if (typeof pageContext.path === 'string' && pageContext.path.trim()) {
    contextParts.push('Page path: ' + pageContext.path.trim().slice(0, 200));
  }
  if (typeof pageContext.heading === 'string' && pageContext.heading.trim()) {
    contextParts.push('Visible heading: ' + pageContext.heading.trim().slice(0, 200));
  }

  const promptMessages = [{ role: 'system', content: chatbotSystemPrompt }];
  if (contextParts.length) {
    promptMessages.push({
      role: 'system',
      content: 'Current page context:\n' + contextParts.join('\n')
    });
  }
  Array.prototype.push.apply(promptMessages, messages);

  try {
    const completion = await openai.chat.completions.create({
      model: openAiModel,
      temperature: 0.6,
      max_tokens: 350,
      messages: promptMessages
    });

    const reply = completion &&
      completion.choices &&
      completion.choices[0] &&
      completion.choices[0].message &&
      typeof completion.choices[0].message.content === 'string'
      ? completion.choices[0].message.content.trim()
      : '';

    if (!reply) {
      return res.status(502).json({ error: 'No reply returned from the chatbot.' });
    }

    await logChatbotConversation(
      sessionId,
      pageContext,
      req.headers['user-agent'] || '',
      latestUserMessage ? latestUserMessage.content : '',
      reply
    );

    return res.json({ reply: reply });
  } catch (error) {
    console.error('Chatbot request failed:', error && error.message ? error.message : error);
    return res.status(500).json({ error: 'The chatbot could not respond right now.' });
  }
});

app.get('/api/chatbot-conversations', async (req, res) => {
  try {
    const result = await fetchChatbotConversations(req.query.limit);
    return res.json(result);
  } catch (error) {
    console.error('Fetch chatbot conversations failed:', error);
    return res.status(500).json({ error: 'Unable to load chatbot conversations.' });
  }
});

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
