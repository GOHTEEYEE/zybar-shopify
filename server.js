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
const Pricing = require('./lib/pricing.js');
const AnalyticsFallback = require('./lib/analytics-fallback.js');

const app = express();
const PORT = process.env.PORT || 3000;
const isZybarMy = process.env.ZYBAR_MY === '1' || process.env.ZYBAR_MY === 'true';
const inquiriesStorePath = path.join(__dirname, 'data', 'contact-inquiries.json');
const stripePriceIdsPath = path.join(__dirname, 'data', 'stripe-price-ids.json');

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
const REVIEW_SUBMIT_COOLDOWN_MS = 30 * 1000;
const lastReviewSubmitByKey = new Map();

/**
 * Recover from stale/inactive Stripe Price IDs sent by old frontend bundles or cached carts.
 * If a price is inactive, try to find an active replacement on the same product
 * with matching size metadata (preferred), amount, and currency.
 */
async function resolveActivePriceId(priceId) {
  const candidate = String(priceId || '').trim();
  if (!candidate || !stripe) return candidate;
  try {
    const price = await stripe.prices.retrieve(candidate);
    if (price && price.active) return candidate;
    if (!price || !price.product) return candidate;

    const productId = typeof price.product === 'string' ? price.product : price.product.id;
    const size = price.metadata && price.metadata.size ? String(price.metadata.size) : '';
    const amount = typeof price.unit_amount === 'number' ? price.unit_amount : null;
    const currency = String(price.currency || '').toLowerCase();

    const list = await stripe.prices.list({
      product: productId,
      active: true,
      limit: 100
    });
    const activePrices = Array.isArray(list.data) ? list.data : [];
    if (!activePrices.length) return candidate;

    // 1) Best match: same size + amount + currency.
    let match = activePrices.find(function (p) {
      const pSize = p.metadata && p.metadata.size ? String(p.metadata.size) : '';
      return pSize === size && p.unit_amount === amount && String(p.currency || '').toLowerCase() === currency;
    });
    // 2) Fallback: same size + currency.
    if (!match && size) {
      match = activePrices.find(function (p) {
        const pSize = p.metadata && p.metadata.size ? String(p.metadata.size) : '';
        return pSize === size && String(p.currency || '').toLowerCase() === currency;
      });
    }
    // 3) Last fallback: same amount + currency.
    if (!match && amount !== null) {
      match = activePrices.find(function (p) {
        return p.unit_amount === amount && String(p.currency || '').toLowerCase() === currency;
      });
    }
    // 4) Final fallback: first active price on product.
    if (!match) match = activePrices[0];

    if (match && match.id && match.id !== candidate) {
      console.warn('Replaced inactive Stripe price ID:', candidate, '->', match.id);
      return match.id;
    }
    return candidate;
  } catch (error) {
    console.error('Failed to resolve active Stripe price ID:', candidate, error && error.message ? error.message : error);
    return candidate;
  }
}

function getConfiguredPriceId(productSlug, size) {
  const slug = String(productSlug || '').trim();
  const selectedSize = String(size || '').trim();
  if (!slug || !selectedSize) return '';
  try {
    if (!fs.existsSync(stripePriceIdsPath)) return '';
    const raw = fs.readFileSync(stripePriceIdsPath, 'utf8');
    const parsed = JSON.parse(raw);
    const prices = parsed && parsed.prices ? parsed.prices : null;
    if (!prices || !prices[slug]) return '';
    const id = prices[slug][selectedSize];
    return typeof id === 'string' ? id.trim() : '';
  } catch (error) {
    console.error('Failed to read configured Stripe price map:', error && error.message ? error.message : error);
    return '';
  }
}

function buildDynamicStripeLineItems(lineItems, shippingMethod, pricingApi) {
  const api = pricingApi || Pricing.createApi(Pricing.getCachedCatalog());
  const rows = Array.isArray(lineItems) ? lineItems : [];
  const stripeItems = [];

  rows.forEach(function (item) {
    if (!item || typeof item !== 'object') return;
    const qty = Number(item.quantity);
    if (!Number.isFinite(qty) || qty < 1) return;

    const size = api.normalizeSize(item.size);
    const powerType = api.normalizePowerType(item.powerType);
    const slug =
      typeof item.productSlug === 'string' && item.productSlug.trim()
        ? item.productSlug.trim()
        : typeof item.slug === 'string'
          ? item.slug.trim()
          : '';
    const unitUSD =
      typeof item.unitAmountUSD === 'number' && Number.isFinite(item.unitAmountUSD)
        ? api.roundMoney(item.unitAmountUSD)
        : api.calculateProductUnitPrice({ slug: slug, productSlug: slug, size: size, powerType: powerType });
    const baseName =
      typeof item.name === 'string' && item.name.trim()
        ? item.name.trim()
        : slug
          ? 'ZYBAR ' + slug.replace(/-/g, ' ')
          : 'ZYBAR LED Wall Art';
    const variantLabel = api.sizeToLabel(size) + ' · ' + api.powerTypeToLabel(powerType);

    stripeItems.push({
      price_data: {
        currency: 'usd',
        unit_amount: api.toCents(unitUSD),
        product_data: {
          name: baseName + ' (' + variantLabel + ')',
          metadata: {
            slug: slug,
            size: size,
            powerType: powerType
          }
        }
      },
      quantity: Math.floor(qty)
    });
  });

  const shipUSD = api.getShippingCostUSD(shippingMethod);
  if (shipUSD > 0) {
    stripeItems.push({
      price_data: {
        currency: 'usd',
        unit_amount: api.toCents(shipUSD),
        product_data: {
          name: api.shippingMethodToLabel(shippingMethod)
        }
      },
      quantity: 1
    });
  }

  return stripeItems;
}

const chatbotProductCatalog = [
  { name: 'Audi R8 - White', slug: 'audi-r8-white', price: '$76.00', sizes: '30 x 45 cm, 40 x 60 cm' },
  { name: 'Audi R8 - Yellow', slug: 'audi-r8-yellow', price: '$76.00', sizes: '30 x 45 cm, 40 x 60 cm' },
  { name: 'Audi R8 GT3', slug: 'audi-r8-gt3', price: '$76.00', sizes: '30 x 45 cm, 40 x 60 cm' },
  { name: 'Audi RS6', slug: 'audi-rs6', price: '$76.00', sizes: '30 x 45 cm, 40 x 60 cm' },
  { name: 'B Dodge Hellcat 02', slug: 'b-dodge-hellcat-02', price: '$76.00', sizes: '30 x 45 cm, 40 x 60 cm' },
  { name: 'B Dodge Hellcat 03', slug: 'b-dodge-hellcat-03', price: '$76.00', sizes: '30 x 45 cm, 40 x 60 cm' },
  { name: 'B Ferrari F40', slug: 'b-ferrari-f40', price: '$76.00', sizes: '30 x 45 cm, 40 x 60 cm' },
  { name: 'B Maserati MC20', slug: 'b-maserati-mc20', price: '$76.00', sizes: '30 x 45 cm, 40 x 60 cm' }
];
const allowedProductSlugs = new Set(chatbotProductCatalog.map(function (item) { return item.slug; }));

/** data URLs from review uploads (jpeg includes legacy image/pjpeg). */
const REVIEW_IMAGE_DATA_URL_RE = /^data:image\/(png|jpe?g|pjpeg|webp|gif);base64,/i;
const REVIEW_IMAGE_MAX_DATA_URL_LENGTH = 1800000;
/** Slightly higher cap for admin localhost→cloud import only (still under express 3mb JSON). */
const REVIEW_IMPORT_IMAGE_MAX_DATA_URL_LENGTH = 2600000;

function normalizeReviewImageDataUrl(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, '');
}

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
  const imageDataUrl = normalizeReviewImageDataUrl(
    typeof payload.imageDataUrl === 'string' ? payload.imageDataUrl : ''
  );
  const imageOk = !imageDataUrl || (
    REVIEW_IMAGE_DATA_URL_RE.test(imageDataUrl) &&
    imageDataUrl.length <= REVIEW_IMAGE_MAX_DATA_URL_LENGTH
  );
  const suspiciousMarkup = /<[^>]*>|javascript:|onerror\s*=|onload\s*=/i;

  if (!allowedProductSlugs.has(productSlug)) return { error: 'Invalid product selected.' };
  if (!productName || productName.length < 2) return { error: 'Product name is required.' };
  if (!name || name.length < 2) return { error: 'Customer name is required.' };
  if (!comment || comment.length < 8) return { error: 'Review is too short.' };
  if (rating < 1 || rating > 5) return { error: 'Rating must be between 1 and 5.' };
  if (!imageOk) return { error: 'Invalid image format or image is too large.' };
  if (suspiciousMarkup.test(name) || suspiciousMarkup.test(comment) || suspiciousMarkup.test(productName)) {
    return { error: 'Invalid characters detected in review content.' };
  }

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
  const imageDataUrl = normalizeReviewImageDataUrl(
    typeof payload.image_data_url === 'string' ? payload.image_data_url : ''
  );
  const createdAtInput = typeof payload.created_at === 'string' ? payload.created_at.trim() : '';
  const createdAtDate = createdAtInput ? new Date(createdAtInput + (createdAtInput.indexOf('T') === -1 ? 'T00:00:00.000Z' : '')) : null;
  const createdAt = createdAtDate && !Number.isNaN(createdAtDate.getTime()) ? createdAtDate.toISOString() : null;
  const imageOk = !imageDataUrl || (
    REVIEW_IMAGE_DATA_URL_RE.test(imageDataUrl) &&
    imageDataUrl.length <= REVIEW_IMPORT_IMAGE_MAX_DATA_URL_LENGTH
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
app.get('/favicon.ico', function (req, res) {
  res.type('png');
  res.sendFile(path.join(__dirname, 'Poster', '7483b279-8b37-4e6c-aed8-6a75ca86d093.png'));
});

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
      const customer = extractOrderCustomerFields(session);
      console.log(
        'Checkout completed:',
        session.id,
        customer.customer_email,
        customer.customer_name,
        session.metadata
      );

      if (supabase) {
        try {
          const amount = typeof session.amount_total === 'number' ? session.amount_total : 0;
          const quantity = session.metadata && session.metadata.quantity ? parseInt(session.metadata.quantity, 10) || 1 : 1;
          const { error } = await supabase.from('orders').insert({
            stripe_session_id: session.id,
            stripe_payment_intent: session.payment_intent || null,
            customer_name: customer.customer_name,
            customer_email: customer.customer_email,
            customer_phone: customer.customer_phone,
            shipping_address: customer.shipping_address,
            city: customer.city,
            state: customer.state,
            postcode: customer.postcode,
            country: customer.country,
            currency: (session.currency || 'usd').toLowerCase(),
            amount_total_cents: amount,
            product_slug: session.metadata && session.metadata.productSlug ? session.metadata.productSlug : null,
            size: session.metadata && session.metadata.size ? session.metadata.size : null,
            quantity: quantity,
            status: session.payment_status || 'completed',
            test_mode: !!session.livemode === false,
            visitor_id: session.metadata && session.metadata.visitorId ? session.metadata.visitorId : null,
            analytics_session_id:
              session.metadata && session.metadata.analyticsSessionId
                ? session.metadata.analyticsSessionId
                : null,
            cart_id:
              session.metadata && session.metadata.cartId ? session.metadata.cartId : null
          });
          if (error) {
            console.error('Supabase insert orders error:', error);
          } else {
            const cartIdMeta = session.metadata && session.metadata.cartId;
            if (cartIdMeta) {
              await supabase
                .from('cart_sessions')
                .update({
                  status: 'purchased',
                  purchased_at: new Date().toISOString(),
                  stripe_session_id: session.id,
                  recovery_status: 'purchased_later'
                })
                .eq('id', cartIdMeta);
            }
            await supabase.from('events').insert({
              event_type: 'payment_success',
              visitor_id: (session.metadata && session.metadata.visitorId) || 'server',
              session_id: (session.metadata && session.metadata.analyticsSessionId) || null,
              cart_id: cartIdMeta || null,
              metadata: {
                stripe_session_id: session.id,
                amount_cents: amount
              },
              dedup_key: 'payment_success:' + session.id,
              created_at: new Date().toISOString()
            });
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

function parseReviewIdsQuery(raw) {
  const ids = [];
  String(raw || '')
    .split(',')
    .forEach(function (part) {
      const id = parseInt(String(part).trim(), 10);
      if (id > 0 && ids.indexOf(id) === -1) ids.push(id);
    });
  return ids.slice(0, 24);
}

app.get('/api/reviews', async (req, res) => {
  const productSlug = String(req.query.productSlug || '').trim().slice(0, 80);
  const reviewIds = parseReviewIdsQuery(req.query.reviewIds);
  const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 80, 200));
  const includeImages = String(req.query.includeImages || '').trim() !== '0';
  if (productSlug && !allowedProductSlugs.has(productSlug)) {
    return res.status(400).json({ error: 'Invalid product selected.' });
  }
  if (!supabase) {
    return res.status(503).json({ error: 'Supabase is not configured for reviews yet.' });
  }

  try {
    const reviewColumns = reviewIds.length && includeImages
      ? 'id,image_data_url'
      : includeImages
        ? 'id,product_slug,product_name,customer_name,rating,review_text,image_data_url,created_at'
        : 'id,product_slug,product_name,customer_name,rating,review_text,created_at';
    let query = supabase
      .from('product_reviews')
      .select(reviewColumns)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(reviewIds.length || limit);
    if (productSlug) {
      query = query.eq('product_slug', productSlug);
    }
    if (reviewIds.length) {
      query = query.in('id', reviewIds);
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
  const reviewSubmitKey = [
    req.ip || req.headers['x-forwarded-for'] || 'unknown',
    payload.productSlug,
    payload.name.toLowerCase()
  ].join('::');
  const now = Date.now();
  const lastAt = lastReviewSubmitByKey.get(reviewSubmitKey) || 0;
  if (now - lastAt < REVIEW_SUBMIT_COOLDOWN_MS) {
    return res.status(429).json({ error: 'Please wait a moment before submitting another review.' });
  }
  lastReviewSubmitByKey.set(reviewSubmitKey, now);

  try {
    // Soft dedupe for repeated spam submissions.
    const duplicateCheck = await supabase
      .from('product_reviews')
      .select('id')
      .eq('product_slug', payload.productSlug)
      .eq('customer_name', payload.name)
      .eq('review_text', payload.comment)
      .limit(1);
    if (!duplicateCheck.error && Array.isArray(duplicateCheck.data) && duplicateCheck.data.length) {
      return res.status(409).json({ error: 'Duplicate review detected. This review already exists.' });
    }

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

// ----- Premium garage newsletter / email capture -----
app.post('/api/newsletter/subscribe', async (req, res) => {
  try {
    const newsletter = require('./lib/newsletter.js');
    const result = await newsletter.subscribeNewsletter(
      {
        supabase: supabase,
        body: req.body || {},
        req: req
      },
      process.env
    );
    return res.status(result.status || 200).json(result.json || {});
  } catch (err) {
    console.error('POST /api/newsletter/subscribe error:', err);
    return res.status(500).json({ error: 'Unable to join right now. Please try again.' });
  }
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

function formatSizeLabel(size) {
  const raw = String(size || '').trim();
  if (!raw) return '';
  const normalized = raw.replace(/\s*x\s*/gi, ' x ');
  if (/\bcm\b/i.test(normalized)) return normalized;
  return normalized + ' cm';
}

function formatMoneyFromCents(cents, currency) {
  const cur = String(currency || 'usd').toUpperCase();
  const amount = (Number(cents) || 0) / 100;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).format(amount);
  } catch (_) {
    return cur + ' ' + amount.toFixed(2);
  }
}

function formatOrderNumber(sessionId) {
  const id = String(sessionId || '');
  const suffix = id.replace(/^cs_(test|live)_/i, '').slice(-6).toUpperCase();
  return 'ZY-' + (suffix || 'ORDER');
}

function formatShippingAddress(details) {
  if (!details || typeof details !== 'object') {
    return { name: '', address: '', phone: '' };
  }
  const addr = details.address && typeof details.address === 'object' ? details.address : {};
  const lines = [];
  const line1 = addr.line1 || addr.line_1;
  const line2 = addr.line2 || addr.line_2;
  if (line1) lines.push(String(line1));
  if (line2) lines.push(String(line2));
  const cityParts = [
    addr.city,
    addr.state,
    addr.postal_code || addr.postalCode,
    addr.country
  ].filter(Boolean);
  if (cityParts.length) lines.push(cityParts.join(', '));
  return {
    name: details.name ? String(details.name) : '',
    address: lines.join(', '),
    phone: details.phone ? String(details.phone) : ''
  };
}

/** Normalized customer + shipping fields for Supabase orders (Stripe Checkout Session). */
function extractOrderCustomerFields(session) {
  const details =
    session && (session.customer_details || session.shipping_details)
      ? session.customer_details || session.shipping_details
      : null;
  const email =
    details && details.email
      ? String(details.email).trim()
      : session && session.customer_email
        ? String(session.customer_email).trim()
        : null;
  const phone = details && details.phone ? String(details.phone).trim() : null;
  const name = details && details.name ? String(details.name).trim() : null;
  const addr =
    details && details.address && typeof details.address === 'object' ? details.address : {};
  const line1 = addr.line1 || addr.line_1 || '';
  const line2 = addr.line2 || addr.line_2 || '';
  const streetParts = [line1, line2].map(function (s) {
    return String(s || '').trim();
  }).filter(Boolean);

  return {
    customer_name: name || null,
    customer_email: email || null,
    customer_phone: phone || null,
    shipping_address: streetParts.length ? streetParts.join(', ') : null,
    city: addr.city ? String(addr.city).trim() : null,
    state: addr.state ? String(addr.state).trim() : null,
    postcode:
      addr.postal_code || addr.postalCode
        ? String(addr.postal_code || addr.postalCode).trim()
        : null,
    country: addr.country ? String(addr.country).trim() : null
  };
}

async function getPaymentMethodLabel(paymentIntentId) {
  if (!paymentIntentId || !stripe) return null;
  try {
    const pi = await stripe.paymentIntents.retrieve(String(paymentIntentId), {
      expand: ['payment_method']
    });
    const pm = pi.payment_method;
    if (pm && typeof pm === 'object' && pm.card && pm.card.last4) {
      const brand = pm.card.brand
        ? String(pm.card.brand).charAt(0).toUpperCase() + String(pm.card.brand).slice(1)
        : 'Card';
      return brand + ' ending in ' + pm.card.last4;
    }
  } catch (err) {
    console.warn('Could not load payment method for session:', err.message || err);
  }
  return null;
}

// ----- Retrieve completed Checkout Session (for confirmation page) -----
app.get('/api/checkout-session', async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe is not configured' });
  }
  const sessionId = typeof req.query.session_id === 'string' ? req.query.session_id.trim() : '';
  if (!sessionId || !sessionId.startsWith('cs_')) {
    return res.status(400).json({ error: 'Invalid session_id' });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const paid =
      session.payment_status === 'paid' ||
      session.payment_status === 'no_payment_required' ||
      session.status === 'complete';
    if (!paid) {
      return res.status(402).json({
        error: 'Order not completed yet',
        status: session.status,
        paymentStatus: session.payment_status
      });
    }

    const lineItemsRes = await stripe.checkout.sessions.listLineItems(sessionId, {
      limit: 100,
      expand: ['data.price.product']
    });

    const currency = (session.currency || 'usd').toLowerCase();
    const items = (lineItemsRes.data || []).map(function (row) {
      const price = row.price && typeof row.price === 'object' ? row.price : null;
      const product =
        price && price.product && typeof price.product === 'object' ? price.product : null;
      const slug =
        (product && product.metadata && product.metadata.slug) ||
        (session.metadata && session.metadata.productSlug) ||
        '';
      const size =
        (price && price.metadata && price.metadata.size) ||
        (session.metadata && session.metadata.size) ||
        '';
      const name = product && product.name ? product.name : row.description || 'Product';
      const amountCents = typeof row.amount_total === 'number' ? row.amount_total : 0;
      return {
        name: name,
        slug: slug,
        size: size,
        sizeLabel: formatSizeLabel(size),
        quantity: row.quantity || 1,
        imageUrl: slug ? '/Image/' + slug + '-1-on.webp' : '',
        amountCents: amountCents,
        amountFormatted: formatMoneyFromCents(amountCents, currency)
      };
    });

    const shipping = formatShippingAddress(session.customer_details || session.shipping_details);
    const shippingCents =
      session.total_details &&
      typeof session.total_details.amount_shipping === 'number'
        ? session.total_details.amount_shipping
        : 0;
    const subtotalCents =
      typeof session.amount_subtotal === 'number' ? session.amount_subtotal : session.amount_total || 0;
    const totalCents = typeof session.amount_total === 'number' ? session.amount_total : 0;

    const paymentLabel = await getPaymentMethodLabel(
      typeof session.payment_intent === 'string' ? session.payment_intent : null
    );

    return res.json({
      orderNumber: formatOrderNumber(session.id),
      email: session.customer_details && session.customer_details.email
        ? session.customer_details.email
        : session.customer_email || '',
      shipping: shipping,
      paymentMethod: paymentLabel || 'Card payment',
      items: items,
      subtotalCents: subtotalCents,
      subtotalFormatted: formatMoneyFromCents(subtotalCents, currency),
      shippingCents: shippingCents,
      shippingFormatted:
        shippingCents > 0 ? formatMoneyFromCents(shippingCents, currency) : 'FREE',
      totalCents: totalCents,
      totalFormatted: formatMoneyFromCents(totalCents, currency),
      currency: currency
    });
  } catch (err) {
    console.error('Checkout session retrieve failed:', err);
    return res.status(500).json({ error: err.message || 'Failed to load order' });
  }
});

// ----- Store pricing (Supabase single source of truth) -----
app.get('/api/pricing', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Pricing not configured' });
  }
  try {
    if (req.query.refresh === '1') {
      Pricing.invalidateCatalogCache();
    }
    const catalog = await Pricing.loadCatalog(supabase, { force: req.query.refresh === '1' });
    res.set('Cache-Control', 'public, max-age=15, stale-while-revalidate=30');
    return res.json(catalog);
  } catch (err) {
    console.error('GET /api/pricing error:', err);
    return res.status(500).json({ error: err.message || 'Failed to load pricing' });
  }
});

// ----- Create Checkout Session -----
app.post('/api/create-checkout-session', async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe is not configured' });
  }
  const {
    priceId,
    quantity,
    lineItems,
    successUrl,
    cancelUrl,
    returnUrl,
    productSlug,
    size,
    powerType,
    embedded,
    custom,
    shippingMethod,
    unitAmountUSD,
    name,
    visitorId,
    sessionId,
    cartId
  } = req.body || {};
  const isEmbedded = embedded === true || embedded === 'true';
  const isCustom = custom === true || custom === 'true';

  if (isEmbedded || isCustom) {
    if (!returnUrl && !successUrl) {
      return res.status(400).json({ error: 'returnUrl or successUrl is required for checkout' });
    }
  } else if (!successUrl || !cancelUrl) {
    return res.status(400).json({ error: 'successUrl and cancelUrl are required' });
  }

  let catalog;
  try {
    catalog = await Pricing.loadCatalog(supabase);
  } catch (pricingErr) {
    console.error('Checkout pricing load failed:', pricingErr);
    return res.status(503).json({ error: 'Store pricing is temporarily unavailable' });
  }
  const pricingApi = Pricing.createApi(catalog);

  let stripeLineItems = [];
  const resolvedShippingMethod = pricingApi.normalizeShippingMethod(shippingMethod);

  function normalizeCheckoutLineItem(item) {
    if (!item || typeof item !== 'object') return null;
    const itemQty = Number(item.quantity);
    const itemProductSlug =
      typeof item.productSlug === 'string' && item.productSlug.trim()
        ? item.productSlug.trim()
        : typeof item.slug === 'string'
          ? item.slug.trim()
          : '';
    const itemSize = typeof item.size === 'string' ? item.size.trim() : '';
    const itemPowerType = typeof item.powerType === 'string' ? item.powerType.trim() : '';
    const itemName = typeof item.name === 'string' ? item.name.trim() : '';
    if (!Number.isFinite(itemQty) || itemQty < 1) return null;
    const size = pricingApi.normalizeSize(itemSize);
    const powerType = pricingApi.normalizePowerType(itemPowerType || 'usb');
    const unitAmountUSD = pricingApi.calculateProductUnitPrice({
      slug: itemProductSlug,
      productSlug: itemProductSlug,
      size: size,
      powerType: powerType
    });
    return {
      quantity: Math.floor(itemQty),
      productSlug: itemProductSlug,
      size: size,
      powerType: powerType,
      name: itemName,
      unitAmountUSD: unitAmountUSD
    };
  }

  if (Array.isArray(lineItems) && lineItems.length) {
    const normalizedLineItems = lineItems.map(normalizeCheckoutLineItem).filter(Boolean);

    stripeLineItems = buildDynamicStripeLineItems(normalizedLineItems, resolvedShippingMethod, pricingApi);

    if (!stripeLineItems.length) {
      return res.status(400).json({ error: 'Invalid request: lineItems must contain valid quantity and variant data' });
    }
  } else {
    const itemQty = Number(quantity);
    if (!Number.isFinite(itemQty) || itemQty < 1) {
      return res.status(400).json({ error: 'Invalid request: quantity (number >= 1) required' });
    }
    stripeLineItems = buildDynamicStripeLineItems(
      [
        normalizeCheckoutLineItem({
          quantity: Math.floor(itemQty),
          productSlug: typeof productSlug === 'string' ? productSlug.trim() : '',
          size: typeof size === 'string' ? size.trim() : '',
          powerType: typeof powerType === 'string' ? powerType.trim() : 'usb',
          name: typeof name === 'string' ? name.trim() : '',
          unitAmountUSD: typeof unitAmountUSD === 'number' && Number.isFinite(unitAmountUSD) ? unitAmountUSD : undefined
        })
      ].filter(Boolean),
      resolvedShippingMethod,
      pricingApi
    );
  }

  const metadata = {};
  if (productSlug) metadata.productSlug = String(productSlug);
  if (size) metadata.size = String(size);
  if (powerType) metadata.powerType = String(powerType);
  metadata.shippingMethod = resolvedShippingMethod;
  if (Array.isArray(lineItems) && lineItems.length > 1) {
    const variantDetails = lineItems
      .map(function (item) {
        if (!item || typeof item !== 'object') return null;
        const slug = typeof item.productSlug === 'string' ? item.productSlug.trim() : '';
        const itemSize = typeof item.size === 'string' ? item.size.trim() : '';
        const itemPower = typeof item.powerType === 'string' ? item.powerType.trim() : 'usb';
        if (!slug && !itemSize) return null;
        return { productSlug: slug, size: itemSize, powerType: itemPower || 'usb' };
      })
      .filter(Boolean);
    if (variantDetails.length) metadata.variantDetails = JSON.stringify(variantDetails);
  } else if (Array.isArray(lineItems) && lineItems.length === 1 && lineItems[0] && lineItems[0].powerType) {
    metadata.powerType = String(lineItems[0].powerType);
  }
  const totalQty = stripeLineItems.reduce(function (sum, item) {
    return sum + (Number(item.quantity) || 0);
  }, 0);
  metadata.quantity = String(totalQty);
  metadata.cartItems = String(stripeLineItems.length);
  if (visitorId) metadata.visitorId = String(visitorId);
  if (sessionId) metadata.analyticsSessionId = String(sessionId);
  if (cartId) metadata.cartId = String(cartId);

  function buildReturnUrl() {
    if (returnUrl) return String(returnUrl);
    const base = String(successUrl || '');
    if (base.indexOf('{CHECKOUT_SESSION_ID}') !== -1) return base;
    const join = base.indexOf('?') === -1 ? '?' : '&';
    return base + join + 'session_id={CHECKOUT_SESSION_ID}';
  }

  const sessionBase = {
    mode: 'payment',
    line_items: stripeLineItems,
    metadata,
    branding_settings: {
      background_color: '#111111',
      button_color: '#d9ff00',
      border_style: 'rounded',
      font_family: 'inter'
    },
    custom_text: {
      submit: {
        message: 'Complete your secure order'
      }
    }
  };

  try {
    console.log('Checkout line item prices:', stripeLineItems.map(function (i) { return i.price; }));

    if (isCustom || isEmbedded) {
      if (isCustom) {
        try {
          const session = await stripe.checkout.sessions.create(Object.assign({}, sessionBase, {
            ui_mode: 'custom',
            return_url: buildReturnUrl()
          }));
          return res.json({
            clientSecret: session.client_secret,
            sessionId: session.id,
            checkoutMode: 'custom'
          });
        } catch (customErr) {
          console.warn('Custom checkout unavailable, using embedded:', customErr.message || customErr);
        }
      }
      const session = await stripe.checkout.sessions.create(Object.assign({}, sessionBase, {
        ui_mode: 'embedded',
        return_url: buildReturnUrl()
      }));
      return res.json({
        clientSecret: session.client_secret,
        sessionId: session.id,
        checkoutMode: 'embedded',
        embedded: true
      });
    }

    const session = await stripe.checkout.sessions.create(Object.assign({}, sessionBase, {
      success_url: successUrl,
      cancel_url: cancelUrl
    }));
    return res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('Checkout session creation failed:', err);
    return res.status(500).json({ error: err.message || 'Failed to create checkout session' });
  }
});

// ----- Analytics tracking (Shopify-style events + cart sessions) -----
function applyGeoToEvent(ev, req) {
  if (!ev.country) {
    const geo = AnalyticsFallback.geoCountryFromRequest(req);
    if (geo) ev.country = geo;
  }
  return ev;
}

app.post('/api/analytics/identify', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Analytics not configured' });
  const body = req.body || {};
  const visitorId = String(body.visitor_id || '').trim();
  if (!visitorId) return res.status(400).json({ error: 'visitor_id required' });

  const geo = body.country || AnalyticsFallback.geoCountryFromRequest(req);
  const now = new Date().toISOString();
  try {
    const { data: existing } = await supabase
      .from('analytics_visitors')
      .select('visitor_id')
      .eq('visitor_id', visitorId)
      .maybeSingle();

    if (existing && existing.visitor_id) {
      await supabase.from('analytics_visitors').update({
        last_seen_at: now,
        country: geo || undefined,
        device_type: body.device_type || undefined,
        browser: body.browser || undefined
      }).eq('visitor_id', visitorId);
    } else {
      await supabase.from('analytics_visitors').insert({
        visitor_id: visitorId,
        first_seen_at: body.first_seen_at || now,
        last_seen_at: now,
        first_traffic_source: body.traffic_source || null,
        first_referrer: body.referrer || null,
        country: geo || null,
        device_type: body.device_type || null,
        browser: body.browser || null,
        session_count: 1
      });
    }
    return res.json({ ok: true, is_new: !(existing && existing.visitor_id) });
  } catch (err) {
    console.error('Analytics identify error:', err);
    return res.status(500).json({ error: err.message || 'Identify failed' });
  }
});

app.post('/api/analytics/track', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Analytics not configured' });
  }
  const body = req.body || {};
  const type = body.type;

  try {
    if (type === 'session_start' && body.session) {
      const s = body.session;
      const geo = s.country || AnalyticsFallback.geoCountryFromRequest(req);
      const now = new Date().toISOString();
      const { error } = await supabase.from('sessions').upsert({
        id: s.id,
        visitor_id: s.visitor_id,
        started_at: now,
        last_activity_at: now,
        referrer: s.referrer || null,
        user_agent: s.user_agent || null,
        device_type: s.device_type || null,
        browser: s.browser || null,
        traffic_source: s.traffic_source || null,
        utm_source: s.utm_source || null,
        utm_medium: s.utm_medium || null,
        utm_campaign: s.utm_campaign || null,
        landing_page: s.landing_page || null,
        country: geo || null,
        is_new_visitor: !!s.is_new_visitor
      }, { onConflict: 'id' });
      if (error) throw error;
      return res.json({ ok: true });
    }

    if (type === 'session_ping') {
      const sessionId = body.session_id;
      if (sessionId) {
        await supabase.from('sessions').update({
          last_activity_at: new Date().toISOString()
        }).eq('id', sessionId);
      }
      return res.json({ ok: true });
    }

    if (type === 'event' && body.event) {
      const ev = applyGeoToEvent(body.event, req);
      const result = await AnalyticsFallback.insertEventSafe(supabase, ev);
      if (!result.ok) throw new Error(result.error || 'Insert failed');
      return res.json({ ok: true, deduped: !!result.deduped });
    }

    if (type === 'cart_sync' && body.cart) {
      const cart = body.cart;
      const now = new Date().toISOString();
      const cartRow = {
        id: cart.id,
        visitor_id: cart.visitor_id,
        session_id: cart.session_id || null,
        customer_id: cart.customer_id || null,
        status: cart.status || 'active',
        currency: cart.currency || 'USD',
        cart_value_cents: cart.cart_value_cents || 0,
        item_count: cart.item_count || 0,
        country: cart.country || null,
        device_type: cart.device_type || null,
        referrer: cart.referrer || null,
        last_shipping_method: cart.last_shipping_method || null,
        last_payment_method: cart.last_payment_method || null,
        last_activity_at: now
      };

      const { data: existing } = await supabase
        .from('cart_sessions')
        .select('id, status')
        .eq('visitor_id', cart.visitor_id)
        .in('status', ['active', 'checkout_started'])
        .maybeSingle();

      let cartId = cart.id;
      if (existing && existing.id && existing.id !== cart.id) {
        cartId = existing.id;
      }

      const { error: upsertErr } = await supabase.from('cart_sessions').upsert(
        Object.assign({}, cartRow, { id: cartId }),
        { onConflict: 'id' }
      );
      if (upsertErr) throw upsertErr;

      if (Array.isArray(cart.items)) {
        await supabase.from('cart_session_items').delete().eq('cart_id', cartId);
        if (cart.items.length) {
          const rows = cart.items.map(function (item) {
            return {
              cart_id: cartId,
              product_id: item.product_id || '',
              product_name: item.product_name || null,
              variant: item.variant || null,
              size: item.size || null,
              led_color: item.led_color || null,
              power_type: item.power_type || null,
              quantity: item.quantity || 1,
              unit_price_cents: item.unit_price_cents || 0,
              currency: cart.currency || 'USD',
              updated_at: now
            };
          });
          const { error: itemsErr } = await supabase.from('cart_session_items').insert(rows);
          if (itemsErr) throw itemsErr;
        }
      }
      return res.json({ ok: true, cart_id: cartId });
    }

    if (type === 'purchase') {
      const cartId = body.cart_id;
      if (cartId) {
        await supabase
          .from('cart_sessions')
          .update({
            status: 'purchased',
            purchased_at: new Date().toISOString(),
            stripe_session_id: body.stripe_session_id || null,
            recovery_status: 'recovered'
          })
          .eq('id', cartId);
      }
      return res.json({ ok: true });
    }

    return res.status(400).json({ error: 'Invalid analytics payload' });
  } catch (err) {
    console.error('Analytics track error:', err);
    return res.status(500).json({ error: err.message || 'Track failed' });
  }
});

function parseAnalyticsRange(req) {
  const end = req.query.end ? new Date(req.query.end) : new Date();
  end.setHours(23, 59, 59, 999);
  const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
  const start = req.query.start
    ? new Date(req.query.start)
    : new Date(end.getTime() - (days - 1) * 86400000);
  start.setHours(0, 0, 0, 0);
  const endExcl = new Date(end.getTime() + 86400000);
  return { start: start.toISOString(), end: endExcl.toISOString() };
}

app.get('/api/analytics/overview', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Analytics not configured' });
  const range = parseAnalyticsRange(req);
  try {
    const data = await AnalyticsFallback.rpcOrFallback(
      supabase,
      'get_shopify_analytics_overview',
      { p_start: range.start, p_end: range.end },
      function () { return AnalyticsFallback.overviewFallback(supabase, range); }
    );
    return res.json(data || {});
  } catch (err) {
    console.error('Analytics overview error:', err);
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/analytics/funnel', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Analytics not configured' });
  const range = parseAnalyticsRange(req);
  try {
    const data = await AnalyticsFallback.rpcOrFallback(
      supabase,
      'get_shopify_conversion_funnel',
      { p_start: range.start, p_end: range.end },
      function () { return AnalyticsFallback.funnelFallback(supabase, range); }
    );
    const steps = Array.isArray(data) ? data : (data && data.steps) || [];
    return res.json({ steps: steps });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/analytics/carts', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Analytics not configured' });
  const range = parseAnalyticsRange(req);
  try {
    const { data, error } = await supabase.rpc('get_cart_analytics_summary', {
      p_start: range.start,
      p_end: range.end
    });
    if (error && AnalyticsFallback.isMissingRpc(error)) {
      const overview = await AnalyticsFallback.overviewFallback(supabase, range);
      return res.json({
        total_add_to_cart: overview.add_to_cart,
        unique_cart_sessions: overview.unique_cart_sessions,
        avg_cart_value_cents: 0,
        avg_items_per_cart: 0,
        top_products: [],
        top_sizes: [],
        top_power_types: [],
        top_led_colors: []
      });
    }
    if (error) throw error;
    return res.json(data || {});
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/analytics/abandoned', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Analytics not configured' });
  const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  try {
    const { data, error } = await supabase.rpc('get_abandoned_carts', {
      p_limit: limit,
      p_offset: offset
    });
    if (error) throw error;
    return res.json({ carts: data || [] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/analytics/trends', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Analytics not configured' });
  const range = parseAnalyticsRange(req);
  const granularity = req.query.granularity === 'week' || req.query.granularity === 'month'
    ? req.query.granularity
    : 'day';
  try {
    const data = await AnalyticsFallback.rpcOrFallback(
      supabase,
      'get_analytics_trends',
      { p_start: range.start, p_end: range.end, p_granularity: granularity },
      function () { return AnalyticsFallback.trendsFallback(supabase, range, granularity); }
    );
    return res.json(data || {});
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/analytics/distributions', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Analytics not configured' });
  const range = parseAnalyticsRange(req);
  try {
    const data = await AnalyticsFallback.rpcOrFallback(
      supabase,
      'get_shopify_device_analytics',
      { p_start: range.start, p_end: range.end },
      function () { return AnalyticsFallback.distributionsFallback(supabase, range); }
    );
    return res.json(data || {});
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/analytics/products', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Analytics not configured' });
  const range = parseAnalyticsRange(req);
  try {
    const data = await AnalyticsFallback.rpcOrFallback(
      supabase,
      'get_shopify_top_products',
      { p_start: range.start, p_end: range.end },
      function () { return AnalyticsFallback.productsFallback(supabase, range); }
    );
    return res.json(data || {});
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/analytics/traffic', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Analytics not configured' });
  const range = parseAnalyticsRange(req);
  try {
    const sources = await AnalyticsFallback.rpcOrFallback(
      supabase,
      'get_shopify_traffic_sources',
      { p_start: range.start, p_end: range.end },
      async function () {
        const dist = await AnalyticsFallback.distributionsFallback(supabase, range);
        return (dist.traffic_sources || []).map(function (s) {
          return { label: s.label, sessions: s.value, visitors: s.value };
        });
      }
    );
    let campaigns = [];
    try {
      const { data } = await supabase.rpc('get_shopify_utm_campaigns', {
        p_start: range.start,
        p_end: range.end
      });
      campaigns = data || [];
    } catch (_) {}
    return res.json({ sources: sources || [], campaigns: campaigns });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/analytics/geo-traffic', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Analytics not configured' });
  const range = parseAnalyticsRange(req);
  try {
    const data = await AnalyticsFallback.rpcOrFallback(
      supabase,
      'get_shopify_geo_traffic',
      { p_start: range.start, p_end: range.end },
      function () { return AnalyticsFallback.geoTrafficFallback(supabase, range); }
    );
    return res.json(data || { summary: {}, rows: [], by_country: [] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/analytics/realtime', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Analytics not configured' });
  try {
    const data = await AnalyticsFallback.rpcOrFallback(
      supabase,
      'get_shopify_realtime',
      {},
      function () { return AnalyticsFallback.realtimeFallback(supabase); }
    );
    return res.json(data || {});
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Export app for serverless runtimes (e.g. Vercel).
module.exports = app;

// ----- Start -----
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    if (isZybarMy) console.log('ZYBAR.MY test mode — open http://localhost:' + PORT + ' (redirects to ?env=zybar.my)');
    if (!stripeSecretKey) console.warn('STRIPE_SECRET_KEY missing — checkout will return 503.');
  });
}
