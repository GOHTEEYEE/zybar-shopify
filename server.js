/**
 * ZYBAR Stripe backend: Checkout Session API + Webhook.
 * Requires: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (for webhook).
 * Run: node server.js  (or npm run server)
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
require('dotenv').config();
if (fs.existsSync(path.join(__dirname, '.env.local'))) {
  require('dotenv').config({ path: path.join(__dirname, '.env.local'), override: true });
}
const express = require('express');
const Stripe = require('stripe');
const OpenAI = require('openai');
const { createClient } = require('@supabase/supabase-js');
const Pricing = require('./lib/pricing.js');
const AnalyticsFallback = require('./lib/analytics-fallback.js');
const MetaCapi = require('./lib/meta-capi.js');
const ChatbotKnowledge = require('./lib/chatbot-knowledge.js');
const CustomerActivity = require('./lib/customer-activity.js');
const MemberPricing = require('./lib/member-pricing.js');
const ProductTypes = require('./lib/product-types.js');
const CustomOrders = require('./lib/custom-orders.js');
const CustomLeads = require('./lib/custom-leads.js');
const CheckoutSnapshots = require('./lib/checkout-snapshots.js');
const DevtestDiscount = require('./lib/devtest-discount.js');
const LunevaAnalytics = require('./lib/luneva-analytics.js');
const LunevaInquiries = require('./lib/luneva-inquiries.js');
const SearchIndexBuilder = require('./lib/search-index-builder.js');

const app = express();
const PORT = process.env.PORT || 3000;
const isZybarMy = process.env.ZYBAR_MY === '1' || process.env.ZYBAR_MY === 'true';
const inquiriesStorePath = path.join(__dirname, 'data', 'contact-inquiries.json');
const stripePriceIdsPath = path.join(__dirname, 'data', 'stripe-price-ids.json');

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminSessionSecret = process.env.ADMIN_SESSION_SECRET || supabaseServiceKey;
const openAiApiKey = process.env.OPENAI_API_KEY;
const openAiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';

function encodeAdminTokenPart(value) {
  return Buffer.from(value).toString('base64url');
}

function signAdminSession(email) {
  if (!adminSessionSecret) throw new Error('Admin session signing is not configured.');
  const payload = encodeAdminTokenPart(
    JSON.stringify({
      email: String(email || '').trim().toLowerCase(),
      exp: Date.now() + 8 * 60 * 60 * 1000
    })
  );
  const signature = crypto
    .createHmac('sha256', adminSessionSecret)
    .update(payload)
    .digest('base64url');
  return payload + '.' + signature;
}

function verifyAdminSession(token) {
  if (!adminSessionSecret || !token) return null;
  const parts = String(token).split('.');
  if (parts.length !== 2) return null;
  const expected = crypto
    .createHmac('sha256', adminSessionSecret)
    .update(parts[0])
    .digest();
  let supplied;
  try {
    supplied = Buffer.from(parts[1], 'base64url');
  } catch (_) {
    return null;
  }
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (!payload.email || !payload.exp || Number(payload.exp) <= Date.now()) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

function requireAdminSession(req, res, next) {
  const authorization = String(req.headers.authorization || '');
  const token = authorization.indexOf('Bearer ') === 0 ? authorization.slice(7) : '';
  const session = verifyAdminSession(token);
  if (!session) return res.status(401).json({ error: 'Admin authentication required.' });
  req.adminSession = session;
  next();
}

if (!stripeSecretKey) {
  console.warn('Missing STRIPE_SECRET_KEY. Set it in .env to enable checkout.');
}
if (!openAiApiKey) {
  console.warn('Missing OPENAI_API_KEY. Set it in .env to enable the chatbot.');
}
if (!MetaCapi.configured()) {
  console.warn('Meta CAPI not configured — set META_CAPI_ACCESS_TOKEN (and optional META_PIXEL_ID) for server-side Purchase.');
}

// Custom Checkout (ui_mode: custom) + Express wallets need basil+.
// Package default is still 2025-02-24.acacia, which silently falls back to embedded.
const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: '2025-03-31.basil' })
  : null;
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

const LUNEVA_SHIPPING_USD = 8.99;

function buildDynamicStripeLineItems(lineItems, shippingMethod, pricingApi, options) {
  const api = pricingApi || Pricing.createApi(Pricing.getCachedCatalog());
  const opts = options && typeof options === 'object' ? options : {};
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
    // Only trust a client-sent amount when positive; otherwise price from the catalog.
    const unitUSD =
      typeof item.unitAmountUSD === 'number' && Number.isFinite(item.unitAmountUSD) && item.unitAmountUSD > 0
        ? api.roundMoney(item.unitAmountUSD)
        : api.calculateProductUnitPrice({ slug: slug, productSlug: slug, size: size, powerType: powerType });
    const baseName =
      typeof item.name === 'string' && item.name.trim()
        ? item.name.trim()
        : slug
          ? 'ZYBAR ' + slug.replace(/-/g, ' ')
          : 'ZYBAR LED Wall Art';
    const variantLabel = api.sizeToLabel(size) + ' · ' + api.powerTypeToLabel(powerType);
    const isCustom =
      item.productType === 'custom' || ProductTypes.isCustomSlug(slug);
    const customFee =
      isCustom && typeof item.customDesignFeeUSD === 'number'
        ? api.roundMoney(item.customDesignFeeUSD)
        : isCustom
          ? ProductTypes.getCustomDesignFeeUSD(api.getCatalog(), slug)
          : 0;
    const displayName =
      baseName +
      (isCustom ? ' · Custom' : '') +
      ' (' +
      variantLabel +
      ')';

    stripeItems.push({
      price_data: {
        currency: 'usd',
        unit_amount: api.toCents(unitUSD),
        product_data: {
          name: displayName,
          metadata: {
            slug: slug,
            size: size,
            powerType: powerType,
            productType: isCustom ? 'custom' : 'standard',
            customDesignFeeUsd: customFee > 0 ? String(customFee) : ''
          }
        }
      },
      quantity: Math.floor(qty)
    });
  });

  const shipUSD =
    typeof opts.shippingUsdOverride === 'number' && Number.isFinite(opts.shippingUsdOverride)
      ? api.roundMoney(opts.shippingUsdOverride)
      : api.getShippingCostUSD(shippingMethod);
  if (shipUSD > 0) {
    stripeItems.push({
      price_data: {
        currency: 'usd',
        unit_amount: api.toCents(shipUSD),
        product_data: {
          name: opts.shippingLabel || api.shippingMethodToLabel(shippingMethod)
        }
      },
      quantity: 1
    });
  }

  return stripeItems;
}

const chatbotProductCatalog = ChatbotKnowledge.DEFAULT_PRODUCTS;
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

async function buildChatbotSystemPrompt() {
  try {
    const catalog = await Pricing.loadCatalog(supabase);
    return ChatbotKnowledge.buildSystemPrompt({ catalog: catalog });
  } catch (err) {
    console.warn('Chatbot pricing load failed, using defaults:', err && err.message ? err.message : err);
    return ChatbotKnowledge.buildSystemPrompt({});
  }
}

function ensureInquiriesStore() {
  try {
    const dir = path.dirname(inquiriesStorePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(inquiriesStorePath)) fs.writeFileSync(inquiriesStorePath, '[]', 'utf8');
    return true;
  } catch (_) {
    return false;
  }
}

function readInquiriesStore() {
  if (!ensureInquiriesStore()) return [];
  try {
    const raw = fs.readFileSync(inquiriesStorePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function writeInquiriesStore(list) {
  if (!ensureInquiriesStore()) return false;
  try {
    fs.writeFileSync(inquiriesStorePath, JSON.stringify(list, null, 2), 'utf8');
    return true;
  } catch (_) {
    return false;
  }
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

    if (
      event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded'
    ) {
      const session = event.data.object;
      console.log(
        'Checkout completed:',
        event.type,
        session.id,
        session.customer_details && session.customer_details.email,
        session.metadata
      );
      const isPaid =
        session.payment_status === 'paid' ||
        session.payment_status === 'no_payment_required';

      let customer = extractOrderCustomerFields(session);
      if (supabase) {
        try {
          const persisted = await persistPaidCheckoutSession(session);
          if (persisted && persisted.customer) customer = persisted.customer;
        } catch (e) {
          console.error('Supabase orders persist exception:', e);
        }
      } else {
        console.warn('Supabase client not configured; skipping order persistence.');
      }

      // Meta Conversions API — server Purchase (deduped with browser via event_id).
      // Only when actually paid: delayed methods fire "completed" while unpaid,
      // then "async_payment_succeeded" once the money clears.
      if (isPaid) {
        try {
          let capiLineItems = [];
          if (supabase) {
            try {
              const resolved = await CheckoutSnapshots.resolveLineItemsForSession(supabase, session);
              capiLineItems = (resolved && resolved.lineItems) || [];
            } catch (_) {}
          }
          await MetaCapi.sendPurchaseFromCheckoutSession(session, {
            customer: customer,
            amount_cents: typeof session.amount_total === 'number' ? session.amount_total : 0,
            lineItems: capiLineItems,
            event_source_url:
              (process.env.STORE_URL || 'https://www.zybar.shop').replace(/\/$/, '') +
              '/purchase-confirmation.html?session_id=' +
              encodeURIComponent(session.id)
          });
        } catch (capiErr) {
          console.error('Meta CAPI error:', capiErr && capiErr.message ? capiErr.message : capiErr);
        }
      }
    }

    res.json({ received: true });
  }
);

// ----- Resend engagement webhook: raw body for Svix signature verification -----
app.post(
  '/api/webhooks/resend',
  express.raw({ type: '*/*' }),
  async (req, res) => {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) {
      console.error('RESEND_WEBHOOK_SECRET is not set');
      return res.status(500).json({ error: 'Webhook not configured' });
    }
    if (!supabase) {
      return res.status(503).json({ error: 'Engagement tracking unavailable' });
    }

    const ResendWebhook = require('./lib/resend-webhook.js');
    const rawBody = req.body; // Buffer from express.raw()
    if (!ResendWebhook.verifySignature(rawBody, req.headers, secret)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    let event;
    try {
      event = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody || ''));
    } catch (err) {
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }

    try {
      const result = await ResendWebhook.handleEvent(supabase, event);
      return res.json({ received: true, ok: result.ok });
    } catch (err) {
      console.error('POST /api/webhooks/resend error:', err);
      // Acknowledge so Resend does not hammer retries on a persistent bug.
      return res.json({ received: true, ok: false });
    }
  }
);

// ----- Unsubscribe: public, no auth, must work straight from an email client -----
const Unsubscribe = require('./lib/unsubscribe.js');

function escapeUnsubscribeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function unsubscribePage(title, message) {
  return (
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/>' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"/>' +
    '<meta name="robots" content="noindex"/>' +
    '<title>' +
    title +
    ' · ZYBAR</title></head>' +
    '<body style="margin:0;background:#0b0b0b;color:#fff;font-family:Helvetica,Arial,sans-serif;">' +
    '<div style="max-width:520px;margin:0 auto;padding:96px 24px;text-align:center;">' +
    '<div style="font-family:Georgia,serif;font-size:28px;letter-spacing:0.18em;">ZYBAR</div>' +
    '<h1 style="margin:40px 0 16px;font-size:22px;font-weight:600;">' +
    title +
    '</h1>' +
    '<p style="margin:0;font-size:15px;line-height:1.7;color:rgba(255,255,255,0.66);">' +
    message +
    '</p>' +
    '<a href="https://www.zybar.shop" style="display:inline-block;margin-top:40px;padding:14px 28px;border:1px solid rgba(255,255,255,0.22);border-radius:12px;color:#fff;text-decoration:none;font-size:14px;">Return to ZYBAR</a>' +
    '</div></body></html>'
  );
}

async function handleUnsubscribe(req, res) {
  const token = String((req.query && req.query.u) || '');
  const email = Unsubscribe.verifyToken(token, process.env);
  const isOneClick = req.method === 'POST';

  if (!email) {
    if (isOneClick) return res.status(400).json({ ok: false, error: 'Invalid unsubscribe token' });
    return res
      .status(400)
      .type('html')
      .send(
        unsubscribePage(
          'This link is not valid',
          'The unsubscribe link is incomplete or has expired. Email support@zybar.shop and we will remove you right away.'
        )
      );
  }

  if (!supabase) {
    if (isOneClick) return res.status(503).json({ ok: false, error: 'Unavailable' });
    return res
      .status(503)
      .type('html')
      .send(
        unsubscribePage(
          'Something went wrong',
          'We could not reach our records just now. Email support@zybar.shop and we will remove you manually.'
        )
      );
  }

  try {
    await Unsubscribe.unsubscribeLead(supabase, email);
  } catch (err) {
    console.error('unsubscribe:', err && err.message);
    if (isOneClick) return res.status(500).json({ ok: false, error: 'Unsubscribe failed' });
    return res
      .status(500)
      .type('html')
      .send(
        unsubscribePage(
          'Something went wrong',
          'We could not complete your request. Email support@zybar.shop and we will remove you manually.'
        )
      );
  }

  // RFC 8058 expects a plain success for the one-click POST, with no confirmation step.
  if (isOneClick) return res.json({ ok: true });
  return res
    .status(200)
    .type('html')
    .send(
      unsubscribePage(
        'You have been unsubscribed',
        'We removed <strong>' +
          escapeUnsubscribeHtml(email) +
          '</strong> from ZYBAR emails. You will not receive further marketing from us. Order and delivery updates are unaffected.'
      )
    );
}

app.get('/api/unsubscribe', handleUnsubscribe);
app.post('/api/unsubscribe', express.urlencoded({ extended: false }), handleUnsubscribe);

// ----- JSON body for other routes -----
app.use(express.json({ limit: '3mb' }));

/**
 * Daily cleanup of abandoned checkout_snapshots (Vercel Cron).
 * Auth: Authorization Bearer CRON_SECRET, or x-vercel-cron, or admin session.
 */
app.all('/api/cron/cleanup-checkout-snapshots', async (req, res) => {
  const cronSecret = String(process.env.CRON_SECRET || '').trim();
  const auth = String(req.headers.authorization || '');
  const bearer = auth.indexOf('Bearer ') === 0 ? auth.slice(7).trim() : '';
  const isVercelCron = String(req.headers['x-vercel-cron'] || '') === '1';
  const adminOk = !!verifyAdminSession(bearer);
  const secretOk = !!(cronSecret && bearer && bearer === cronSecret);
  if (!isVercelCron && !secretOk && !adminOk) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!supabase) return res.status(503).json({ error: 'Database unavailable' });
  try {
    const result = await CheckoutSnapshots.cleanupAbandoned(supabase, {
      retentionDays: Number(req.query.retentionDays) || 7
    });
    return res.json({ ok: true, result: result });
  } catch (err) {
    console.error('cleanup-checkout-snapshots:', err && err.message);
    return res.status(500).json({ error: err.message || 'Cleanup failed' });
  }
});

/**
 * Promote due journey steps and send pending emails (Vercel Cron every 5 min).
 * Auth: Authorization Bearer CRON_SECRET, or x-vercel-cron, or admin session.
 */
app.all('/api/cron/execute-journey-queue', async (req, res) => {
  const cronSecret = String(process.env.CRON_SECRET || '').trim();
  const auth = String(req.headers.authorization || '');
  const bearer = auth.indexOf('Bearer ') === 0 ? auth.slice(7).trim() : '';
  const isVercelCron = String(req.headers['x-vercel-cron'] || '') === '1';
  const adminOk = !!verifyAdminSession(bearer);
  const secretOk = !!(cronSecret && bearer && bearer === cronSecret);
  if (!isVercelCron && !secretOk && !adminOk) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!supabase) return res.status(503).json({ error: 'Journey engine is unavailable.' });
  try {
    const JourneyEngine = require('./lib/journey-engine.js');
    const q = req.query || {};
    const body = req.body || {};
    const result = await JourneyEngine.executeReadyActions(supabase, process.env, {
      limit: Number(body.limit || q.limit) || 25,
      promote_limit: Number(body.promote_limit || q.promote_limit) || 50,
      // Cap cron work per tick to stay within serverless time limits.
      max_rounds: Number(body.max_rounds || q.max_rounds) || 4
    });
    return res.json({ ok: true, result: result });
  } catch (err) {
    console.error('execute-journey-queue:', err && err.message);
    return res.status(500).json({ error: err.message || 'Journey queue execute failed' });
  }
});

app.post('/api/admin/auth/login', async (req, res) => {
  if (!supabase || !adminSessionSecret) {
    return res.status(503).json({ error: 'Admin authentication is unavailable.' });
  }
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  const code = String((req.body && req.body.code) || '').trim();
  if (!email || !code) return res.status(400).json({ error: 'Email and admin code are required.' });
  try {
    const validation = await supabase.rpc('validate_and_use_admin_code', {
      p_code: code,
      p_email: email
    });
    if (validation.error) throw validation.error;
    if (validation.data !== true) {
      return res.status(401).json({ error: 'Invalid or already used admin code.' });
    }
    return res.json({
      ok: true,
      email: email,
      token: signAdminSession(email),
      expires_in: 8 * 60 * 60
    });
  } catch (err) {
    console.error('POST /api/admin/auth/login error:', err);
    return res.status(500).json({ error: 'Could not validate admin code.' });
  }
});

app.post('/api/admin/auth/test-session', function (req, res) {
  if (!isZybarMy || !adminSessionSecret) return res.status(404).json({ error: 'Not found.' });
  return res.json({
    ok: true,
    email: 'test@zybar.my',
    token: signAdminSession('test@zybar.my'),
    expires_in: 8 * 60 * 60
  });
});

app.use(function protectAdminApis(req, res, next) {
  if (req.path.indexOf('/api/admin/') === 0 || req.path.indexOf('/api/admin-') === 0) {
    return requireAdminSession(req, res, next);
  }
  next();
});

app.get('/api/admin/auth/session', function (req, res) {
  return res.json({ ok: true, email: req.adminSession.email });
});

app.get('/api/admin/luneva/dashboard', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Analytics not configured' });
  const range = parseAnalyticsRange(req);
  try {
    const data = await LunevaAnalytics.getDashboard(supabase, range);
    return res.json(data);
  } catch (err) {
    console.error('GET /api/admin/luneva/dashboard error:', err);
    return res.status(500).json({ error: err.message || 'Failed to load LUNEVA dashboard' });
  }
});

app.get('/api/admin/luneva/orders', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Analytics not configured' });
  const range = parseAnalyticsRange(req);
  try {
    const orders = await LunevaAnalytics.fetchLunevaOrders(supabase, range);
    return res.json({ orders: orders, range: range });
  } catch (err) {
    console.error('GET /api/admin/luneva/orders error:', err);
    return res.status(500).json({ error: err.message || 'Failed to load LUNEVA orders' });
  }
});

app.get('/api/admin/luneva/customers', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Analytics not configured' });
  const range = parseAnalyticsRange(req);
  try {
    const customers = await LunevaAnalytics.getCustomers(supabase, range);
    return res.json({ customers: customers, range: range });
  } catch (err) {
    console.error('GET /api/admin/luneva/customers error:', err);
    return res.status(500).json({ error: err.message || 'Failed to load LUNEVA customers' });
  }
});

app.get('/api/admin/luneva/visitors', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Analytics not configured' });
  const range = parseAnalyticsRange(req);
  try {
    const data = await LunevaAnalytics.getVisitors(supabase, range, req.query || {});
    return res.json(data);
  } catch (err) {
    console.error('GET /api/admin/luneva/visitors error:', err);
    return res.status(500).json({ error: err.message || 'Failed to load LUNEVA visitors' });
  }
});

app.get('/api/admin/luneva/countries', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Analytics not configured' });
  const range = parseAnalyticsRange(req);
  try {
    const countries = await LunevaAnalytics.getCountryAnalytics(supabase, range);
    return res.json({ countries: countries, range: range });
  } catch (err) {
    console.error('GET /api/admin/luneva/countries error:', err);
    return res.status(500).json({ error: err.message || 'Failed to load LUNEVA countries' });
  }
});

app.get('/api/admin/luneva/traffic', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Analytics not configured' });
  const range = parseAnalyticsRange(req);
  try {
    const sources = await LunevaAnalytics.getTrafficAnalytics(supabase, range);
    return res.json({ sources: sources, range: range });
  } catch (err) {
    console.error('GET /api/admin/luneva/traffic error:', err);
    return res.status(500).json({ error: err.message || 'Failed to load LUNEVA traffic' });
  }
});

app.get('/api/admin/luneva/inquiries', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Analytics not configured' });
  const range = parseAnalyticsRange(req);
  try {
    const data = await LunevaInquiries.listInquiriesForAdmin(supabase, range);
    return res.json(data);
  } catch (err) {
    console.error('GET /api/admin/luneva/inquiries error:', err);
    return res.status(500).json({ error: err.message || 'Failed to load LUNEVA inquiries' });
  }
});

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

  const systemPrompt = await buildChatbotSystemPrompt();
  const promptMessages = [{ role: 'system', content: systemPrompt }];
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

  const row = {
    id: 'inq_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    name: name,
    email: email,
    phone: phone || null,
    car_model_interest: carModelInterest || null,
    message: message,
    created_at: new Date().toISOString()
  };

  // Local/dev file fallback only — never block serverless on disk writes
  try {
    const inquiries = readInquiriesStore();
    inquiries.unshift(row);
    writeInquiriesStore(inquiries);
  } catch (_) {}

  var supabaseSaved = false;
  if (!supabase) {
    return res.status(503).json({
      error: 'Inquiry service is temporarily unavailable. Please email us or try again later.'
    });
  }

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
      return res.status(500).json({ error: 'Unable to submit inquiry. Please try again.' });
    }
    supabaseSaved = true;
  } catch (e) {
    console.error('Supabase contact_inquiries insert exception:', e);
    return res.status(500).json({ error: 'Unable to submit inquiry. Please try again.' });
  }

  return res.json({ ok: true, id: row.id, supabaseSaved: supabaseSaved });
});

// ----- Public order tracking (email + tracking number must match) -----
app.post('/api/track-order', async (req, res) => {
  const body = req.body || {};
  const email = String(body.email || '')
    .trim()
    .toLowerCase();
  const trackingNumber = String(body.trackingNumber || body.tracking_number || '').trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!email || !trackingNumber || !emailRegex.test(email)) {
    return res.status(400).json({ error: 'Please provide a valid email and tracking number.' });
  }
  if (!supabase) {
    return res.status(503).json({ error: 'Order tracking is temporarily unavailable.' });
  }

  const incorrect = () =>
    res.status(404).json({ ok: false, error: 'Incorrect email or tracking number.' });

  try {
    const escaped = trackingNumber
      .replace(/\\/g, '\\\\')
      .replace(/%/g, '\\%')
      .replace(/_/g, '\\_');
    const { data, error } = await supabase
      .from('orders')
      .select(
        'id,customer_email,customer_name,product_slug,size,quantity,line_items,status,fulfillment_status,tracking_number,shipping_method,created_at'
      )
      .ilike('tracking_number', escaped)
      .limit(5);

    if (error) {
      console.error('track-order lookup error:', error);
      return incorrect();
    }

    const rows = Array.isArray(data) ? data : [];
    let match = null;
    for (let i = 0; i < rows.length; i++) {
      const rowEmail = String(rows[i].customer_email || '')
        .trim()
        .toLowerCase();
      const rowTrack = String(rows[i].tracking_number || '').trim();
      if (rowEmail === email && rowTrack.toLowerCase() === trackingNumber.toLowerCase()) {
        match = rows[i];
        break;
      }
    }
    if (!match) return incorrect();

    function productLabel(row) {
      if (Array.isArray(row.line_items) && row.line_items.length) {
        return row.line_items
          .map(function (li) {
            var name = li.name || li.productSlug || li.slug || 'Item';
            return name + (li.quantity ? ' ×' + li.quantity : '');
          })
          .join(', ');
      }
      var slug = String(row.product_slug || '')
        .replace(/-/g, ' ')
        .replace(/\b\w/g, function (c) {
          return c.toUpperCase();
        });
      if (!slug) return 'ZYBAR LED Wall Art';
      return slug + (row.size ? ' [' + row.size + ']' : '');
    }

    function itemList(row) {
      if (Array.isArray(row.line_items) && row.line_items.length) {
        return row.line_items.map(function (li) {
          var name = li.name || li.productSlug || li.slug || 'Item';
          var size = li.size ? ' · ' + li.size : '';
          var qty = li.quantity ? ' ×' + li.quantity : '';
          return name + size + qty;
        });
      }
      return [productLabel(row)];
    }

    return res.json({
      ok: true,
      order: {
        fulfillmentStatus: match.fulfillment_status || 'unfulfilled',
        trackingNumber: match.tracking_number,
        shippingMethod: match.shipping_method || null,
        paymentStatus: match.status || null,
        createdAt: match.created_at || null,
        productLabel: productLabel(match),
        items: itemList(match)
      }
    });
  } catch (e) {
    console.error('track-order exception:', e);
    return res.status(500).json({ error: 'Unable to check order right now.' });
  }
});

// ----- Admin test email (Resend) -----
app.post('/api/admin/email/send', async (req, res) => {
  try {
    const email = require('./lib/email.js');
    const result = await email.sendAdminEmail(req.body || {}, process.env);
    return res.status(result.status || 200).json(result.json || {});
  } catch (err) {
    console.error('POST /api/admin/email/send error:', err);
    return res.status(500).json({
      success: false,
      error: (err && err.message) || 'Failed to send email'
    });
  }
});

// ----- Workflow automation admin -----
app.get('/api/admin/workflows', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Workflow engine is unavailable.' });
  try {
    const WorkflowEngine = require('./lib/workflow-engine.js');
    const data = await WorkflowEngine.listWorkflowAdminData(supabase);
    return res.json(data);
  } catch (err) {
    console.error('GET /api/admin/workflows error:', err);
    return res.status(500).json({ error: 'Failed to load workflows.' });
  }
});

app.patch('/api/admin/workflows', async (req, res) => {
  return res.status(410).json({
    error: 'Legacy workflows are retired. Use Customer Journey lifecycle transitions.'
  });
});

// ----- Campaigns (status audience → template → send) -----
app.get('/api/admin/campaigns', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Campaigns are unavailable.' });
  try {
    const Campaigns = require('./lib/campaigns.js');
    const data = await Campaigns.getCampaignBootstrap(supabase, req.query && req.query.audience);
    return res.json(data);
  } catch (err) {
    console.error('GET /api/admin/campaigns error:', err);
    return res.status(500).json({ error: (err && err.message) || 'Failed to load campaigns.' });
  }
});

app.post('/api/admin/campaigns/preview', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Campaigns are unavailable.' });
  try {
    const Campaigns = require('./lib/campaigns.js');
    const result = await Campaigns.previewCampaign(supabase, req.body || {}, process.env);
    return res.status(result.status || 200).json(result.json || {});
  } catch (err) {
    console.error('POST /api/admin/campaigns/preview error:', err);
    return res.status(500).json({ success: false, error: (err && err.message) || 'Preview failed.' });
  }
});

app.post('/api/admin/campaigns/send', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Campaigns are unavailable.' });
  try {
    const Campaigns = require('./lib/campaigns.js');
    const result = await Campaigns.sendCampaign(supabase, req.body || {}, process.env);
    return res.status(result.status || 200).json(result.json || {});
  } catch (err) {
    console.error('POST /api/admin/campaigns/send error:', err);
    return res.status(500).json({ success: false, error: (err && err.message) || 'Campaign send failed.' });
  }
});

// ----- Persistent workflow runner (Vercel Cron) — legacy; Journey Engine is manual -----
app.get('/api/workflows/run', async (req, res) => {
  return res.status(410).json({
    ok: false,
    error: 'Legacy workflow runner is retired. Journey actions execute from the manual queue.'
  });
});

// ----- Customer Journey Engine (manual execution) -----
app.get('/api/admin/journeys', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Journey engine is unavailable.' });
  try {
    const JourneyEngine = require('./lib/journey-engine.js');
    const TemplateStore = require('./lib/email-template-store.js');
    const journeys = await JourneyEngine.listJourneysAdmin(supabase);
    let templates = [];
    try {
      templates = await TemplateStore.listTemplates(supabase, { status: 'active' });
    } catch (e) {
      const EmailTemplates = require('./lib/email-templates.js');
      templates = EmailTemplates.listTemplates().map(function (t) {
        return { template_key: t.key, name: t.name, description: t.description };
      });
    }
    return res.json({
      journeys: journeys,
      action_types: JourneyEngine.ACTION_TYPES,
      delay_units: JourneyEngine.DELAY_UNITS,
      trigger_types: JourneyEngine.TRIGGER_TYPES,
      templates: templates
    });
  } catch (err) {
    console.error('GET /api/admin/journeys error:', err);
    return res.status(500).json({ error: (err && err.message) || 'Failed to load journeys.' });
  }
});

app.get('/api/admin/journeys/:id', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Journey engine is unavailable.' });
  try {
    const JourneyEngine = require('./lib/journey-engine.js');
    const journey = await JourneyEngine.getJourneyDetail(supabase, req.params.id);
    if (!journey) return res.status(404).json({ error: 'Journey not found.' });
    return res.json({ journey: journey });
  } catch (err) {
    console.error('GET /api/admin/journeys/:id error:', err);
    return res.status(500).json({ error: (err && err.message) || 'Failed to load journey.' });
  }
});

app.post('/api/admin/journeys', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Journey engine is unavailable.' });
  try {
    const JourneyEngine = require('./lib/journey-engine.js');
    const body = req.body || {};
    const journey = await JourneyEngine.createJourney(supabase, body);
    if (Array.isArray(body.steps) && body.steps.length) {
      const steps = await JourneyEngine.replaceJourneySteps(supabase, journey.id, body.steps);
      return res.status(201).json({ ok: true, journey: Object.assign({}, journey, { steps: steps }) });
    }
    return res.status(201).json({ ok: true, journey: journey });
  } catch (err) {
    console.error('POST /api/admin/journeys error:', err);
    return res.status(500).json({ error: (err && err.message) || 'Failed to create journey.' });
  }
});

app.patch('/api/admin/journeys/:id', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Journey engine is unavailable.' });
  try {
    const JourneyEngine = require('./lib/journey-engine.js');
    const body = req.body || {};
    const journey = await JourneyEngine.updateJourney(supabase, req.params.id, body);
    if (!journey) return res.status(404).json({ error: 'Journey not found.' });
    let steps = null;
    if (Array.isArray(body.steps)) {
      steps = await JourneyEngine.replaceJourneySteps(supabase, journey.id, body.steps);
    }
    return res.json({
      ok: true,
      journey: steps ? Object.assign({}, journey, { steps: steps }) : journey
    });
  } catch (err) {
    console.error('PATCH /api/admin/journeys/:id error:', err);
    return res.status(500).json({ error: (err && err.message) || 'Failed to update journey.' });
  }
});

app.post('/api/admin/journeys/:id/duplicate', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Journey engine is unavailable.' });
  try {
    const JourneyEngine = require('./lib/journey-engine.js');
    const journey = await JourneyEngine.duplicateJourney(supabase, req.params.id);
    return res.status(201).json({ ok: true, journey: journey });
  } catch (err) {
    console.error('POST /api/admin/journeys/:id/duplicate error:', err);
    return res.status(500).json({ error: (err && err.message) || 'Failed to duplicate journey.' });
  }
});

app.post('/api/admin/journeys/:id/run', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Journey engine is unavailable.' });
  try {
    const rawEmails = req.body && req.body.emails;
    const emails = (Array.isArray(rawEmails) ? rawEmails : String(rawEmails || '').split(/[\n,;]+/))
      .map(function (email) {
        return String(email || '').trim();
      })
      .filter(Boolean);
    const JourneyEngine = require('./lib/journey-engine.js');
    const result = await JourneyEngine.runJourneyForTestEmails(
      supabase,
      req.params.id,
      emails,
      process.env
    );
    return res.json(Object.assign({ ok: result.failed === 0 }, result));
  } catch (err) {
    console.error('POST /api/admin/journeys/:id/run error:', err);
    return res.status(400).json({
      error: (err && err.message) || 'Failed to run workflow test.'
    });
  }
});

app.delete('/api/admin/journeys/:id', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Journey engine is unavailable.' });
  try {
    const JourneyEngine = require('./lib/journey-engine.js');
    const permanent =
      String((req.query && req.query.permanent) || '').toLowerCase() === '1' ||
      String((req.query && req.query.permanent) || '').toLowerCase() === 'true' ||
      !!(req.body && req.body.permanent);

    if (permanent) {
      const deleted = await JourneyEngine.deleteJourneyPermanently(supabase, req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Journey not found.' });
      return res.json({ ok: true, deleted: true, journey: deleted });
    }

    const journey = await JourneyEngine.archiveJourney(supabase, req.params.id);
    if (!journey) return res.status(404).json({ error: 'Journey not found or already archived.' });
    return res.json({ ok: true, journey: journey });
  } catch (err) {
    console.error('DELETE /api/admin/journeys/:id error:', err);
    const message = (err && err.message) || 'Failed to delete journey.';
    const status = /Cannot permanently delete/i.test(message) ? 400 : 500;
    return res.status(status).json({ error: message });
  }
});

app.get('/api/admin/journeys/:id/workspace', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Journey engine is unavailable.' });
  try {
    const JourneyEngine = require('./lib/journey-engine.js');
    const data = await JourneyEngine.getJourneyWorkspace(supabase, req.params.id);
    if (!data) return res.status(404).json({ error: 'Journey not found.' });
    return res.json(data);
  } catch (err) {
    console.error('GET /api/admin/journeys/:id/workspace error:', err);
    return res.status(500).json({ error: (err && err.message) || 'Failed to load journey workspace.' });
  }
});

app.get('/api/admin/journey-leads', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Journey engine is unavailable.' });
  try {
    const JourneyEngine = require('./lib/journey-engine.js');
    const leads = await JourneyEngine.listLeadJourneysAdmin(supabase, {
      status: req.query && req.query.status,
      journey_id: req.query && req.query.journey_id,
      limit: req.query && req.query.limit
    });
    return res.json({ lead_journeys: leads });
  } catch (err) {
    console.error('GET /api/admin/journey-leads error:', err);
    return res.status(500).json({ error: (err && err.message) || 'Failed to load journey leads.' });
  }
});

app.get('/api/admin/email-leads', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Journey engine is unavailable.' });
  try {
    const JourneyEngine = require('./lib/journey-engine.js');
    const data = await JourneyEngine.listEmailLeadsCrm(supabase, {
      status: req.query && req.query.status,
      limit: req.query && req.query.limit,
      include_test: req.query && req.query.include_test === '1'
    });
    return res.json(data);
  } catch (err) {
    console.error('GET /api/admin/email-leads error:', err);
    return res.status(500).json({ error: (err && err.message) || 'Failed to load email leads.' });
  }
});

// Convert a lead between test and real (test leads are excluded from campaigns).
app.post('/api/admin/email-leads/set-test', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Journey engine is unavailable.' });
  const leadId = String((req.body && req.body.lead_id) || '').trim();
  const isTest = !!(req.body && req.body.is_test);
  if (!leadId) return res.status(400).json({ error: 'lead_id is required.' });
  try {
    const result = await supabase
      .from('newsletter_subscribers')
      .update({ is_test: isTest })
      .eq('id', leadId)
      .select('id, email, is_test')
      .maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) return res.status(404).json({ error: 'Lead not found.' });
    return res.json({ success: true, lead: result.data });
  } catch (err) {
    console.error('POST /api/admin/email-leads/set-test error:', err);
    return res.status(500).json({ error: (err && err.message) || 'Failed to update lead.' });
  }
});

app.get('/api/admin/customer-lifecycle', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Journey engine is unavailable.' });
  try {
    const email = String((req.query && req.query.email) || '').trim();
    if (!email) return res.status(400).json({ error: 'email is required.' });
    const JourneyEngine = require('./lib/journey-engine.js');
    const lifecycle = await JourneyEngine.getCustomerLifecycleByEmail(supabase, email);
    return res.json({ lifecycle: lifecycle });
  } catch (err) {
    console.error('GET /api/admin/customer-lifecycle error:', err);
    return res.status(500).json({
      error: (err && err.message) || 'Failed to load customer lifecycle.'
    });
  }
});

app.post('/api/admin/journey-transition', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Journey engine is unavailable.' });
  try {
    const leadId = String((req.body && req.body.lead_id) || '').trim();
    const triggerType = String((req.body && req.body.trigger_type) || '').trim();
    if (!leadId || !triggerType) {
      return res.status(400).json({ error: 'lead_id and trigger_type are required.' });
    }
    const JourneyEngine = require('./lib/journey-engine.js');
    const leadResult = await supabase
      .from('newsletter_subscribers')
      .select('*')
      .eq('id', leadId)
      .maybeSingle();
    if (leadResult.error) throw leadResult.error;
    if (!leadResult.data) return res.status(404).json({ error: 'Lead not found.' });
    const transitioned = await JourneyEngine.enroll(
      supabase,
      leadResult.data,
      triggerType
    );
    return res.json({
      ok: true,
      transitioned: transitioned.length > 0,
      lead_journey: transitioned[0] || null
    });
  } catch (err) {
    console.error('POST /api/admin/journey-transition error:', err);
    return res.status(500).json({
      error: (err && err.message) || 'Failed to transition customer journey.'
    });
  }
});

app.post('/api/admin/journey-transition/no-purchase', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Journey engine is unavailable.' });
  try {
    const JourneyEngine = require('./lib/journey-engine.js');
    const result = await JourneyEngine.transitionNoPurchaseLeads(supabase, {
      days: (req.body && req.body.days) || 90,
      limit: (req.body && req.body.limit) || 100
    });
    return res.json(Object.assign({ ok: true }, result));
  } catch (err) {
    console.error('POST /api/admin/journey-transition/no-purchase error:', err);
    return res.status(500).json({
      error: (err && err.message) || 'Failed to transition no-purchase customers.'
    });
  }
});

app.post('/api/admin/journey-leads/:id/cancel', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Journey engine is unavailable.' });
  try {
    const JourneyEngine = require('./lib/journey-engine.js');
    const row = await JourneyEngine.cancelLeadJourney(supabase, req.params.id);
    if (!row) return res.status(404).json({ error: 'Active lead journey not found.' });
    return res.json({ ok: true, lead_journey: row });
  } catch (err) {
    console.error('POST /api/admin/journey-leads/:id/cancel error:', err);
    return res.status(500).json({ error: (err && err.message) || 'Failed to cancel lead journey.' });
  }
});

app.get('/api/admin/journey-queue', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Journey engine is unavailable.' });
  try {
    const JourneyEngine = require('./lib/journey-engine.js');
    const queue = await JourneyEngine.listActionQueueAdmin(supabase, {
      status: req.query && req.query.status,
      limit: req.query && req.query.limit
    });
    return res.json({ queue: queue });
  } catch (err) {
    console.error('GET /api/admin/journey-queue error:', err);
    return res.status(500).json({ error: (err && err.message) || 'Failed to load action queue.' });
  }
});

app.post('/api/admin/journey-queue/promote', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Journey engine is unavailable.' });
  try {
    const JourneyEngine = require('./lib/journey-engine.js');
    const result = await JourneyEngine.promoteReadySteps(
      supabase,
      (req.body && req.body.limit) || 50
    );
    return res.json(Object.assign({ ok: true }, result));
  } catch (err) {
    console.error('POST /api/admin/journey-queue/promote error:', err);
    return res.status(500).json({ error: (err && err.message) || 'Failed to promote ready steps.' });
  }
});

app.post('/api/admin/journey-queue/execute', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Journey engine is unavailable.' });
  try {
    const JourneyEngine = require('./lib/journey-engine.js');
    const body = req.body || {};
    // Single-button flow: promote due steps then drain pending sends
    const result = await JourneyEngine.executeReadyActions(supabase, process.env, {
      limit: body.limit || 25,
      promote_limit: body.promote_limit || 100,
      max_rounds: body.max_rounds || 20,
      action_id: body.action_id || null
    });
    return res.json(Object.assign({ ok: true }, result));
  } catch (err) {
    console.error('POST /api/admin/journey-queue/execute error:', err);
    return res.status(500).json({ error: (err && err.message) || 'Failed to execute ready actions.' });
  }
});

app.post('/api/admin/journey-queue/:id/retry', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Journey engine is unavailable.' });
  try {
    const JourneyEngine = require('./lib/journey-engine.js');
    const result = await JourneyEngine.retryFailedAction(
      supabase,
      req.params.id,
      process.env
    );
    return res.json(Object.assign({ ok: result.worker.completed === 1 }, result.worker));
  } catch (err) {
    console.error('POST /api/admin/journey-queue/:id/retry error:', err);
    return res.status(400).json({ error: (err && err.message) || 'Failed to retry action.' });
  }
});

app.get('/api/admin/journey-history', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Journey engine is unavailable.' });
  try {
    const JourneyEngine = require('./lib/journey-engine.js');
    const history = await JourneyEngine.listHistoryAdmin(supabase, {
      limit: req.query && req.query.limit,
      journey_id: req.query && req.query.journey_id
    });
    return res.json({ history: history });
  } catch (err) {
    console.error('GET /api/admin/journey-history error:', err);
    return res.status(500).json({ error: (err && err.message) || 'Failed to load journey history.' });
  }
});

app.get('/api/admin/journey-templates', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Templates unavailable.' });
  try {
    const TemplateStore = require('./lib/email-template-store.js');
    const templates = await TemplateStore.listTemplates(supabase, {
      include_archived: String(req.query && req.query.include_archived) === '1'
    });
    return res.json({ templates: templates });
  } catch (err) {
    console.error('GET /api/admin/journey-templates error:', err);
    return res.status(500).json({ error: 'Failed to load templates.' });
  }
});

app.post('/api/admin/journey-templates', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Templates unavailable.' });
  try {
    const TemplateStore = require('./lib/email-template-store.js');
    const template = await TemplateStore.createTemplate(supabase, req.body || {});
    return res.status(201).json({ ok: true, template: template });
  } catch (err) {
    console.error('POST /api/admin/journey-templates error:', err);
    return res.status(500).json({ error: (err && err.message) || 'Failed to create template.' });
  }
});

app.get('/api/admin/journey-templates/:id', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Templates unavailable.' });
  try {
    const TemplateStore = require('./lib/email-template-store.js');
    const template = await TemplateStore.getTemplateById(supabase, req.params.id);
    if (!template) return res.status(404).json({ error: 'Template not found.' });
    return res.json({ template: template });
  } catch (err) {
    console.error('GET /api/admin/journey-templates/:id error:', err);
    return res.status(500).json({ error: 'Failed to load template.' });
  }
});

app.patch('/api/admin/journey-templates/:id', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Templates unavailable.' });
  try {
    const TemplateStore = require('./lib/email-template-store.js');
    const template = await TemplateStore.updateTemplate(supabase, req.params.id, req.body || {});
    if (!template) return res.status(404).json({ error: 'Template not found.' });
    return res.json({ ok: true, template: template });
  } catch (err) {
    console.error('PATCH /api/admin/journey-templates/:id error:', err);
    return res.status(500).json({ error: (err && err.message) || 'Failed to update template.' });
  }
});

app.post('/api/admin/journey-templates/:id/duplicate', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Templates unavailable.' });
  try {
    const TemplateStore = require('./lib/email-template-store.js');
    const template = await TemplateStore.duplicateTemplate(supabase, req.params.id);
    return res.status(201).json({ ok: true, template: template });
  } catch (err) {
    console.error('POST /api/admin/journey-templates/:id/duplicate error:', err);
    return res.status(500).json({ error: (err && err.message) || 'Failed to duplicate template.' });
  }
});

app.post('/api/admin/journey-templates/:id/archive', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Templates unavailable.' });
  try {
    const TemplateStore = require('./lib/email-template-store.js');
    const template = await TemplateStore.archiveTemplate(supabase, req.params.id);
    if (!template) return res.status(404).json({ error: 'Template not found.' });
    return res.json({ ok: true, template: template });
  } catch (err) {
    console.error('POST /api/admin/journey-templates/:id/archive error:', err);
    return res.status(500).json({ error: (err && err.message) || 'Failed to archive template.' });
  }
});

app.post('/api/admin/journey-templates/:id/preview', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Templates unavailable.' });
  try {
    const TemplateStore = require('./lib/email-template-store.js');
    const tpl = await TemplateStore.getTemplateById(supabase, req.params.id);
    if (!tpl) return res.status(404).json({ error: 'Template not found.' });
    const rendered = await TemplateStore.previewTemplate(supabase, tpl.template_key, process.env);
    return res.json({ ok: true, preview: rendered });
  } catch (err) {
    console.error('POST /api/admin/journey-templates/:id/preview error:', err);
    return res.status(500).json({ error: (err && err.message) || 'Failed to preview template.' });
  }
});

app.get('/api/admin/journey-settings', async (req, res) => {
  try {
    const JourneyEngine = require('./lib/journey-engine.js');
    const Email = require('./lib/email.js');
    const config = Email.getEmailConfig(process.env);
    return res.json({
      action_types: JourneyEngine.ACTION_TYPES,
      delay_units: JourneyEngine.DELAY_UNITS,
      trigger_types: JourneyEngine.TRIGGER_TYPES,
      email_configured: !!config.apiKey,
      from: config.from,
      reply_to: config.replyTo,
      execution_mode: 'manual',
      note: 'Promote ready steps and execute scheduled sends from Marketing → Journeys or Overview.'
    });
  } catch (err) {
    console.error('GET /api/admin/journey-settings error:', err);
    return res.status(500).json({ error: 'Failed to load journey settings.' });
  }
});

// ----- Marketing Center (Overview / Audience / Analytics) -----
app.get('/api/admin/marketing/overview', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Marketing unavailable.' });
  try {
    const MarketingCenter = require('./lib/marketing-center.js');
    const data = await MarketingCenter.getOverview(supabase);
    return res.json(data);
  } catch (err) {
    console.error('GET /api/admin/marketing/overview error:', err);
    return res.status(500).json({ error: (err && err.message) || 'Failed to load overview.' });
  }
});

app.get('/api/admin/marketing/audience', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Marketing unavailable.' });
  try {
    const MarketingCenter = require('./lib/marketing-center.js');
    const data = await MarketingCenter.getAudience(supabase, {
      q: req.query && req.query.q,
      segment: req.query && req.query.segment,
      journey: req.query && (req.query.journey || req.query.journey_key),
      limit: req.query && req.query.limit,
      offset: req.query && req.query.offset,
      include_test: String((req.query && req.query.include_test) || '') === '1'
    });
    return res.json(data);
  } catch (err) {
    console.error('GET /api/admin/marketing/audience error:', err);
    return res.status(500).json({ error: (err && err.message) || 'Failed to load audience.' });
  }
});

app.get('/api/admin/marketing/audience/:id', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Marketing unavailable.' });
  try {
    const MarketingCenter = require('./lib/marketing-center.js');
    const data = await MarketingCenter.getAudienceProfile(supabase, req.params.id);
    if (!data) return res.status(404).json({ error: 'Subscriber not found.' });
    return res.json(data);
  } catch (err) {
    console.error('GET /api/admin/marketing/audience/:id error:', err);
    return res.status(500).json({ error: (err && err.message) || 'Failed to load profile.' });
  }
});

app.get('/api/admin/marketing/analytics', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Marketing unavailable.' });
  try {
    const MarketingCenter = require('./lib/marketing-center.js');
    const range = {
      start: req.query && req.query.start,
      end: req.query && req.query.end
    };
    const data = await MarketingCenter.getAnalytics(supabase, range);
    return res.json(data);
  } catch (err) {
    console.error('GET /api/admin/marketing/analytics error:', err);
    return res.status(500).json({ error: (err && err.message) || 'Failed to load analytics.' });
  }
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

app.post('/api/luneva/newsletter/subscribe', async (req, res) => {
  try {
    const lunevaNewsletter = require('./lib/luneva-newsletter.js');
    const result = await lunevaNewsletter.subscribeLunevaNewsletter(
      {
        supabase: supabase,
        body: req.body || {},
        req: req
      },
      process.env
    );
    return res.status(result.status || 200).json(result.json || {});
  } catch (err) {
    console.error('POST /api/luneva/newsletter/subscribe error:', err);
    return res.status(500).json({ error: 'Unable to join right now. Please try again.' });
  }
});

app.post('/api/luneva/contact', async (req, res) => {
  try {
    const result = await LunevaInquiries.submitInquiry(supabase, req.body || {}, req);
    return res.status(result.status || 200).json(result.json || {});
  } catch (err) {
    console.error('POST /api/luneva/contact error:', err);
    return res.status(500).json({ error: 'Unable to send your message. Please try again.' });
  }
});

app.post('/api/member-pricing/status', async (req, res) => {
  if (!supabase) return res.status(503).json({ active: false });
  try {
    const member = await MemberPricing.resolveMember(
      supabase,
      {
        credential: req.body && req.body.credential,
        visitorId: req.body && req.body.visitorId,
        sessionId: req.body && req.body.sessionId
      },
      process.env
    );
    return res.json(member);
  } catch (err) {
    console.error('POST /api/member-pricing/status error:', err);
    return res.status(500).json({ active: false });
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

function formatLunevaKitLabel(slug, size) {
  const s = String(slug || '');
  const rawSize = String(size || '').trim();
  if (s.indexOf('luneva-') !== 0) return formatSizeLabel(size);
  if (rawSize === '30x45') return 'Lighting effects';
  if (rawSize === '40x60') return 'Lighting + Mechanical butterfly';
  return rawSize || 'LUNEVA kit';
}

function formatProductImageUrl(slug) {
  const s = String(slug || '').trim();
  if (!s) return '';
  if (s.indexOf('luneva-') === 0) {
    return '/luneva/assets/' + s.replace(/^luneva-/, '') + '/hero.png';
  }
  return '/Image/' + s + '-1-on.webp';
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
  const collectedShipping =
    session &&
    session.collected_information &&
    session.collected_information.shipping_details
      ? session.collected_information.shipping_details
      : null;
  // Basil stores shipping under collected_information; legacy sessions used shipping_details.
  const shippingDetails = collectedShipping || (session && session.shipping_details) || null;
  const details = session && session.customer_details ? session.customer_details : null;
  const email =
    (details && details.email ? String(details.email).trim() : null) ||
    (session && session.customer_email ? String(session.customer_email).trim() : null) ||
    null;
  const phone =
    (details && details.phone ? String(details.phone).trim() : null) ||
    (shippingDetails && shippingDetails.phone
      ? String(shippingDetails.phone).trim()
      : null) ||
    null;
  // Shipping recipient name/address FIRST — customer_details holds the billing
  // details from the Payment Element, which for cards is often just
  // country + postal code. Shipping labels need the collected shipping address.
  const name =
    (shippingDetails && shippingDetails.name ? String(shippingDetails.name).trim() : null) ||
    (details && details.name ? String(details.name).trim() : null) ||
    null;
  const addrSource =
    (shippingDetails &&
      shippingDetails.address &&
      typeof shippingDetails.address === 'object' &&
      shippingDetails.address) ||
    (details && details.address && typeof details.address === 'object' && details.address) ||
    {};
  const line1 = addrSource.line1 || addrSource.line_1 || '';
  const line2 = addrSource.line2 || addrSource.line_2 || '';
  const streetParts = [line1, line2].map(function (s) {
    return String(s || '').trim();
  }).filter(Boolean);

  return {
    customer_name: name || null,
    customer_email: email || null,
    customer_phone: phone || null,
    shipping_address: streetParts.length ? streetParts.join(', ') : null,
    city: addrSource.city ? String(addrSource.city).trim() : null,
    state: addrSource.state ? String(addrSource.state).trim() : null,
    postcode:
      addrSource.postal_code || addrSource.postalCode
        ? String(addrSource.postal_code || addrSource.postalCode).trim()
        : null,
    country: addrSource.country ? String(addrSource.country).trim() : null
  };
}

/**
 * Persist a paid Checkout Session into orders (idempotent upsert).
 * Used by Stripe webhook and by /api/checkout-session as a webhook fallback.
 */
async function persistPaidCheckoutSession(session) {
  if (!supabase || !session || !session.id) {
    return { ok: false, skipped: true, reason: 'not_ready' };
  }
  const customer = extractOrderCustomerFields(session);
  const amount = typeof session.amount_total === 'number' ? session.amount_total : 0;
  const quantity =
    session.metadata && session.metadata.quantity
      ? parseInt(session.metadata.quantity, 10) || 1
      : 1;
  const shippingMethod =
    session.metadata && session.metadata.shippingMethod
      ? String(session.metadata.shippingMethod)
      : null;
  let lineItems = null;
  try {
    const resolved = await CheckoutSnapshots.resolveLineItemsForSession(supabase, session);
    if (resolved && Array.isArray(resolved.lineItems) && resolved.lineItems.length) {
      lineItems = resolved.lineItems;
    }
  } catch (snapErr) {
    console.warn('checkout snapshot resolve:', snapErr && snapErr.message);
    lineItems = null;
  }

  const baseOrder = {
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
    product_slug:
      session.metadata && session.metadata.productSlug
        ? session.metadata.productSlug
        : null,
    size: session.metadata && session.metadata.size ? session.metadata.size : null,
    quantity: quantity,
    status: session.payment_status || 'completed',
    test_mode: session.livemode === false,
    visitor_id:
      session.metadata && session.metadata.visitorId ? session.metadata.visitorId : null,
    analytics_session_id:
      session.metadata && session.metadata.analyticsSessionId
        ? session.metadata.analyticsSessionId
        : null,
    cart_id: session.metadata && session.metadata.cartId ? session.metadata.cartId : null
  };
  if (session.created) {
    baseOrder.created_at = new Date(session.created * 1000).toISOString();
  }

  const extendedOrder = Object.assign({}, baseOrder, {
    shipping_method: shippingMethod,
    fulfillment_status: 'unfulfilled',
    refund_status: 'none',
    line_items: lineItems
  });

  let { error } = await supabase
    .from('orders')
    .upsert(extendedOrder, { onConflict: 'stripe_session_id' });
  if (
    error &&
    /shipping_method|fulfillment_status|line_items|refund_status|payment_method/i.test(
      error.message || ''
    )
  ) {
    ({ error } = await supabase
      .from('orders')
      .upsert(baseOrder, { onConflict: 'stripe_session_id' }));
  }
  if (error) {
    console.error('Supabase upsert orders error:', error);
    return { ok: false, error: error };
  }

  try {
    const snapId =
      session.metadata && session.metadata.checkoutSnapshotId
        ? String(session.metadata.checkoutSnapshotId)
        : null;
    if (snapId) {
      await CheckoutSnapshots.markCompleted(supabase, snapId);
    } else if (session.id) {
      await CheckoutSnapshots.markCompletedForStripeSession(supabase, session.id);
    }
  } catch (markErr) {
    console.warn('checkout snapshot mark completed:', markErr && markErr.message);
  }

  let persistedOrder = null;
  try {
    const orderLookup = await supabase
      .from('orders')
      .select('id, stripe_session_id, customer_email, customer_name, line_items')
      .eq('stripe_session_id', session.id)
      .maybeSingle();
    if (!orderLookup.error && orderLookup.data) {
      persistedOrder = orderLookup.data;
      const createdCustom = await CustomOrders.syncFromPaidSession(supabase, session, persistedOrder);
      try {
        const uploadSessionId =
          session.metadata && session.metadata.uploadSessionId
            ? String(session.metadata.uploadSessionId)
            : '';
        const customerEmail =
          (customer && customer.email) ||
          (session.customer_details && session.customer_details.email) ||
          session.customer_email ||
          persistedOrder.customer_email ||
          '';
        await CustomLeads.markPurchased(supabase, {
          uploadSessionId: uploadSessionId,
          stripeSessionId: session.id,
          visitorId: session.metadata && session.metadata.visitorId,
          customerEmail: customerEmail,
          customerName:
            (customer && customer.name) ||
            (session.customer_details && session.customer_details.name) ||
            persistedOrder.customer_name ||
            '',
          orderId: persistedOrder.id,
          customOrderId: createdCustom && createdCustom[0] ? createdCustom[0].id : null
        });
      } catch (leadErr) {
        console.warn('custom lead purchase sync:', leadErr && leadErr.message);
      }
    }
  } catch (customErr) {
    console.warn('Custom order sync:', customErr && customErr.message);
  }

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

  try {
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
  } catch (_) {}

  try {
    await CustomerActivity.upsertProfileFromOrder(supabase, session, customer);
  } catch (_) {}

  try {
    const email =
      (customer && customer.email) ||
      (session.customer_details && session.customer_details.email) ||
      (session.customer_email) ||
      null;
    if (email) {
      let leadRes = await supabase
        .from('newsletter_subscribers')
        .select('*')
        .ilike('email', String(email).trim().toLowerCase())
        .maybeSingle();
      if (!leadRes.error && !leadRes.data) {
        leadRes = await supabase
          .from('newsletter_subscribers')
          .insert({
            email: String(email).trim().toLowerCase(),
            source: 'purchase',
            status: 'active',
            is_test: false
          })
          .select('*')
          .single();
      }
      if (!leadRes.error && leadRes.data) {
        const JourneyEngine = require('./lib/journey-engine.js');
        await JourneyEngine.enrollLeadOnPurchase(supabase, leadRes.data);
      }
    }
  } catch (journeyErr) {
    console.warn(
      'purchase journey enroll:',
      journeyErr && journeyErr.message ? journeyErr.message : journeyErr
    );
  }

  return { ok: true, customer: customer, amount_cents: amount };
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

    // Fallback: if Stripe webhook missed this order, sync it when the buyer opens confirmation
    try {
      await persistPaidCheckoutSession(session);
    } catch (persistErr) {
      console.warn(
        'checkout-session persist fallback:',
        persistErr && persistErr.message ? persistErr.message : persistErr
      );
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
        sizeLabel: formatLunevaKitLabel(slug, size) || formatSizeLabel(size),
        quantity: row.quantity || 1,
        imageUrl: formatProductImageUrl(slug),
        amountCents: amountCents,
        amountFormatted: formatMoneyFromCents(amountCents, currency)
      };
    });

    const shippingSource =
      (session.collected_information && session.collected_information.shipping_details) ||
      session.customer_details ||
      session.shipping_details ||
      null;
    const shipping = formatShippingAddress(
      Object.assign({}, shippingSource || {}, {
        phone:
          (session.customer_details && session.customer_details.phone) ||
          (shippingSource && shippingSource.phone) ||
          ''
      })
    );
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

// ----- Custom product uploads & order status -----
function sanitizeUploadName(name) {
  return String(name || 'photo.jpg')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120);
}

app.post('/api/custom-orders/upload-photo', express.json({ limit: '12mb' }), async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Uploads not configured' });
  try {
    const body = req.body || {};
    const dataUrl = String(body.dataUrl || body.dataBase64 || '');
    const fileName = sanitizeUploadName(body.fileName || 'vehicle-photo.jpg');
    const sessionId = String(body.sessionId || crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/g, '');
    if (!dataUrl || dataUrl.length < 32) {
      return res.status(400).json({ error: 'Image data is required.' });
    }
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    const contentType = match ? match[1] : String(body.contentType || 'image/jpeg');
    const base64 = match ? match[2] : dataUrl;
    const buffer = Buffer.from(base64, 'base64');
    if (!buffer.length || buffer.length > 10 * 1024 * 1024) {
      return res.status(400).json({ error: 'Image must be under 10MB.' });
    }
    const ext = /\.png$/i.test(fileName)
      ? 'png'
      : /\.webp$/i.test(fileName)
        ? 'webp'
        : 'jpg';
    const objectPath = sessionId + '/' + Date.now() + '-' + crypto.randomBytes(4).toString('hex') + '.' + ext;
    const upload = await supabase.storage
      .from('custom-order-photos')
      .upload(objectPath, buffer, { contentType: contentType, upsert: false });
    if (upload.error) throw upload.error;
    const pub = supabase.storage.from('custom-order-photos').getPublicUrl(objectPath);
    try {
      await CustomLeads.upsert(supabase, {
        uploadSessionId: sessionId,
        status: 'uploaded',
        photos: [{ id: objectPath, path: objectPath, url: pub.data.publicUrl, name: fileName }],
        pageUrl: req.headers.referer || null
      });
    } catch (leadErr) {
      console.warn('custom lead upload sync:', leadErr && leadErr.message);
    }
    return res.json({
      ok: true,
      id: objectPath,
      path: objectPath,
      url: pub.data.publicUrl,
      name: fileName
    });
  } catch (err) {
    console.error('POST /api/custom-orders/upload-photo error:', err);
    return res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

app.post('/api/custom-leads/sync', express.json({ limit: '256kb' }), async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Custom leads not configured' });
  try {
    const body = req.body || {};
    const row = await CustomLeads.upsert(supabase, {
      uploadSessionId: body.uploadSessionId || body.upload_session_id,
      visitorId: body.visitorId || body.visitor_id,
      sessionId: body.sessionId || body.session_id,
      cartId: body.cartId || body.cart_id,
      status: body.status,
      vehicleModel: body.vehicleModel || body.vehicle_model,
      lightingPreference: body.lightingPreference || body.lighting_preference,
      photos: body.photos || body.uploaded_photos,
      size: body.size,
      powerType: body.powerType || body.power_type,
      cartValueCents: body.cartValueCents || body.cart_value_cents,
      customerEmail: body.customerEmail || body.customer_email,
      customerName: body.customerName || body.customer_name,
      country: body.country || AnalyticsFallback.geoCountryFromRequest(req),
      deviceType: body.deviceType || body.device_type,
      browser: body.browser,
      trafficSource: body.trafficSource || body.traffic_source,
      referrer: body.referrer || req.headers.referer || null,
      pageUrl: body.pageUrl || body.page_url
    });
    return res.json({ ok: true, lead: row });
  } catch (err) {
    console.error('POST /api/custom-leads/sync error:', err);
    return res.status(400).json({ error: err.message || 'Failed to save custom lead' });
  }
});

app.get('/api/customer-activity/custom-leads', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Custom leads not configured' });
  try {
    const data = await CustomLeads.list(supabase, req.query || {});
    return res.json(data);
  } catch (err) {
    console.error('GET /api/customer-activity/custom-leads error:', err);
    return res.status(500).json({ error: err.message || 'Failed to load custom leads' });
  }
});

// Keep legacy admin path working for older admin tabs.
app.get('/api/admin/custom-leads', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Custom leads not configured' });
  try {
    const data = await CustomLeads.list(supabase, req.query || {});
    return res.json(data);
  } catch (err) {
    console.error('GET /api/admin/custom-leads error:', err);
    return res.status(500).json({ error: err.message || 'Failed to load custom leads' });
  }
});

app.get('/api/custom-orders/status', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Custom orders not configured' });
  try {
    const email = String(req.query.email || '').trim();
    const sessionId = String(req.query.session || req.query.session_id || '').trim();
    if (sessionId) {
      const rows = await CustomOrders.getByStripeSession(supabase, sessionId);
      return res.json({ orders: rows });
    }
    if (email) {
      const rows = await CustomOrders.getByEmail(supabase, email);
      return res.json({ orders: rows });
    }
    return res.status(400).json({ error: 'email or session is required' });
  } catch (err) {
    console.error('GET /api/custom-orders/status error:', err);
    return res.status(500).json({ error: err.message || 'Failed to load custom orders' });
  }
});

app.get('/api/admin/custom-orders', requireAdminSession, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Custom orders not configured' });
  try {
    const sessionId = String(req.query.stripe_session_id || req.query.session || '').trim();
    const orderId = String(req.query.order_id || '').trim();
    if (sessionId) {
      const rows = await CustomOrders.getByStripeSession(supabase, sessionId);
      return res.json({ orders: rows });
    }
    if (orderId) {
      const result = await supabase.from('custom_orders').select('*').eq('order_id', orderId);
      if (result.error) throw result.error;
      return res.json({ orders: result.data || [] });
    }
    return res.status(400).json({ error: 'stripe_session_id or order_id required' });
  } catch (err) {
    console.error('GET /api/admin/custom-orders error:', err);
    return res.status(500).json({ error: err.message || 'Failed to load custom orders' });
  }
});

app.patch('/api/admin/custom-orders/:id', requireAdminSession, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Custom orders not configured' });
  try {
    const id = String(req.params.id || '').trim();
    const body = req.body || {};
    const row = await CustomOrders.updateDesignStatus(supabase, id, {
      designStatus: body.designStatus || body.design_status,
      trackingNumber: body.trackingNumber || body.tracking_number,
      adminNotes: body.adminNotes || body.admin_notes,
      estimatedCompletionAt: body.estimatedCompletionAt || body.estimated_completion_at
    });
    return res.json({ ok: true, order: row });
  } catch (err) {
    console.error('PATCH /api/admin/custom-orders/:id error:', err);
    return res.status(500).json({ error: err.message || 'Update failed' });
  }
});

// ----- Store search index -----
app.get('/api/search-index', async (req, res) => {
  try {
    const index = await SearchIndexBuilder.buildSearchIndex(supabase);
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
    return res.json(index);
  } catch (err) {
    console.error('GET /api/search-index error:', err);
    return res.status(500).json({ error: err.message || 'Search index failed' });
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

// ----- Customer Activity (admin intelligence) -----
app.get('/api/customer-activity', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Not configured' });
  try {
    const data = await CustomerActivity.listActivities(supabase, req.query || {});
    return res.json(data);
  } catch (err) {
    console.error('customer-activity list:', err);
    return res.status(500).json({ error: err.message || 'Failed to load activity' });
  }
});

app.get('/api/customer-activity/detail', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Not configured' });
  const visitorId = typeof req.query.visitor_id === 'string' ? req.query.visitor_id.trim() : '';
  if (!visitorId) return res.status(400).json({ error: 'visitor_id required' });
  try {
    const data = await CustomerActivity.getActivityDetail(supabase, visitorId);
    if (!data) return res.status(404).json({ error: 'Not found' });
    return res.json(data);
  } catch (err) {
    console.error('customer-activity detail:', err);
    return res.status(500).json({ error: err.message || 'Failed to load detail' });
  }
});

app.get('/api/customer-activity/leads', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Not configured' });
  try {
    const LeadStatus = require('./lib/lead-status.js');
    const status = String((req.query && req.query.status) || '')
      .trim()
      .toLowerCase();
    if (status && !LeadStatus.isValidLeadStatus(status)) {
      return res.status(400).json({ error: 'Invalid lead status filter.' });
    }

    const allLeads = await LeadStatus.listActiveLeads(supabase);
    const classified = await LeadStatus.classifyLeadsBatch(supabase, allLeads);
    const counts = {};
    LeadStatus.LEAD_STATUS_KEYS.forEach(function (key) {
      counts[key] = 0;
    });
    Object.keys(classified).forEach(function (id) {
      const s = classified[id].status;
      if (counts[s] != null) counts[s] += 1;
    });
    const audiences = LeadStatus.LEAD_STATUSES.map(function (s) {
      return { key: s.key, label: s.label, count: counts[s.key] || 0 };
    });

    if (status) {
      const leads = allLeads
        .filter(function (lead) {
          return classified[lead.id] && classified[lead.id].status === status;
        })
        .map(function (lead) {
          const snap = classified[lead.id];
          return {
            id: lead.id,
            email: lead.email,
            country: lead.country || null,
            language: lead.language || null,
            discount_code: lead.discount_code || null,
            signup_at: lead.created_at,
            source: lead.source || null,
            visitor_id: lead.visitor_id || null,
            status: snap.status,
            last_activity_at: snap.last_activity_at,
            purchased: snap.status === 'customer',
            order_count: (snap.orders || []).length,
            revenue_cents: snap.revenue_cents || 0
          };
        });
      return res.json({ leads: leads, audiences: audiences, status: status });
    }

    const data = await CustomerActivity.listEmailLeads(supabase, req.query || {});
    return res.json({ leads: data, audiences: audiences });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load leads' });
  }
});

app.get('/api/customer-activity/abandoned', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Not configured' });
  try {
    const data = await CustomerActivity.listAbandoned(supabase, req.query || {});
    return res.json({ carts: data });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load abandoned carts' });
  }
});

app.get('/api/customer-activity/countries', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Not configured' });
  try {
    const data = await CustomerActivity.countryAnalytics(supabase, req.query || {});
    return res.json({ countries: data });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load countries' });
  }
});

app.get('/api/customer-activity/traffic', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Not configured' });
  try {
    const data = await CustomerActivity.trafficAnalytics(supabase, req.query || {});
    return res.json({ sources: data });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load traffic' });
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
    discountCode,
    customerEmail,
    email,
    customerName,
    memberCredential,
    unitAmountUSD,
    name,
    collection,
    visitorId,
    sessionId,
    cartId,
    uploadSessionId,
    fbp,
    fbc,
    clientUserAgent
  } = req.body || {};
  const isEmbedded = embedded === true || embedded === 'true';
  const isCustom = custom === true || custom === 'true';
  const checkoutEmail = String(customerEmail || email || '').trim();

  if (isEmbedded || isCustom) {
    if (!returnUrl && !successUrl) {
      return res.status(400).json({ error: 'returnUrl or successUrl is required for checkout' });
    }
  } else if (!successUrl || !cancelUrl) {
    return res.status(400).json({ error: 'successUrl and cancelUrl are required' });
  }

  let catalog;
  try {
    catalog = await Pricing.loadCatalog(supabase, { force: true });
  } catch (pricingErr) {
    console.error('Checkout pricing load failed:', pricingErr);
    return res.status(503).json({ error: 'Store pricing is temporarily unavailable' });
  }
  const pricingApi = Pricing.createApi(catalog);
  const isLunevaCheckout = collection && String(collection).toLowerCase() === 'luneva';
  const lunevaShippingOpts = isLunevaCheckout
    ? { shippingUsdOverride: LUNEVA_SHIPPING_USD, shippingLabel: 'Standard Shipping' }
    : {};

  let stripeLineItems = [];
  const resolvedShippingMethod = isLunevaCheckout
    ? 'standard'
    : pricingApi.normalizeShippingMethod(shippingMethod);

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
    const itemProductType = typeof item.productType === 'string' ? item.productType.trim() : '';
    if (!Number.isFinite(itemQty) || itemQty < 1) return null;
    const size = pricingApi.normalizeSize(itemSize);
    const powerType = pricingApi.normalizePowerType(itemPowerType || 'usb');
    const isCustom =
      itemProductType === 'custom' || ProductTypes.isCustomSlug(itemProductSlug);
    // Reject unknown products instead of pricing them at the catalog fallback.
    const knownProduct = !!(
      itemProductSlug &&
      catalog &&
      catalog.products &&
      catalog.products[itemProductSlug]
    );
    if (!isCustom && !knownProduct) return null;
    const unitAmountUSD = pricingApi.calculateProductUnitPrice({
      slug: itemProductSlug,
      productSlug: itemProductSlug,
      size: size,
      powerType: powerType
    });
    const customDesignFeeUSD = isCustom
      ? pricingApi.getCustomDesignFeeUSD
        ? pricingApi.getCustomDesignFeeUSD(itemProductSlug)
        : ProductTypes.getCustomDesignFeeUSD(catalog, itemProductSlug)
      : 0;
    const baseUnitPriceUSD =
      pricingApi.getProductBaseUnitPriceUSD &&
      typeof pricingApi.getProductBaseUnitPriceUSD === 'function'
        ? pricingApi.getProductBaseUnitPriceUSD({
            slug: itemProductSlug,
            productSlug: itemProductSlug,
            size: size,
            powerType: powerType
          })
        : Math.max(0, unitAmountUSD - customDesignFeeUSD);
    var customConfig = null;
    if (item.customConfig && typeof item.customConfig === 'object') {
      customConfig = ProductTypes.normalizeCustomConfig(item.customConfig);
    }
    return {
      quantity: Math.floor(itemQty),
      productSlug: itemProductSlug,
      slug: itemProductSlug,
      size: size,
      powerType: powerType,
      name: itemName,
      productType: isCustom ? 'custom' : 'standard',
      unitAmountUSD: unitAmountUSD,
      baseUnitPriceUSD: baseUnitPriceUSD,
      customDesignFeeUSD: customDesignFeeUSD,
      customConfig: customConfig
    };
  }

  if (Array.isArray(lineItems) && lineItems.length) {
    const normalizedLineItems = lineItems.map(normalizeCheckoutLineItem).filter(Boolean);

    // Require at least one real product line — otherwise the shipping line alone
    // would still mint a payable (shipping-only) session.
    if (!normalizedLineItems.length) {
      return res.status(400).json({ error: 'Invalid request: lineItems must contain valid quantity and variant data' });
    }

    stripeLineItems = buildDynamicStripeLineItems(
      normalizedLineItems,
      resolvedShippingMethod,
      pricingApi,
      lunevaShippingOpts
    );

    if (!stripeLineItems.length) {
      return res.status(400).json({ error: 'Invalid request: lineItems must contain valid quantity and variant data' });
    }
  } else {
    const itemQty = Number(quantity);
    if (!Number.isFinite(itemQty) || itemQty < 1) {
      return res.status(400).json({ error: 'Invalid request: quantity (number >= 1) required' });
    }
    const normalizedSingle = normalizeCheckoutLineItem({
      quantity: Math.floor(itemQty),
      productSlug: typeof productSlug === 'string' ? productSlug.trim() : '',
      size: typeof size === 'string' ? size.trim() : '',
      powerType: typeof powerType === 'string' ? powerType.trim() : 'usb',
      name: typeof name === 'string' ? name.trim() : '',
      unitAmountUSD: typeof unitAmountUSD === 'number' && Number.isFinite(unitAmountUSD) ? unitAmountUSD : undefined
    });
    if (!normalizedSingle) {
      return res.status(400).json({ error: 'Invalid request: unknown product or invalid quantity' });
    }
    stripeLineItems = buildDynamicStripeLineItems(
      [normalizedSingle],
      resolvedShippingMethod,
      pricingApi,
      lunevaShippingOpts
    );
  }

  // Product subtotal excludes the shipping line (no product metadata).
  // Order total includes every Stripe line item (products + shipping).
  const productSubtotalUSD = stripeLineItems.reduce(function (sum, li) {
    const isProduct =
      li && li.price_data && li.price_data.product_data && li.price_data.product_data.metadata;
    if (!isProduct) return sum;
    return sum + (li.price_data.unit_amount * li.quantity) / 100;
  }, 0);
  const orderTotalUSD = stripeLineItems.reduce(function (sum, li) {
    if (!li || !li.price_data) return sum;
    return sum + (li.price_data.unit_amount * li.quantity) / 100;
  }, 0);

  let appliedDiscountUSD = 0;
  let appliedDiscountCode = '';
  let appliedDiscountLabel = '';
  let appliedPercentOff = 0;
  let resolvedMember = { active: false };
  try {
    resolvedMember = await MemberPricing.resolveMember(
      supabase,
      {
        credential: memberCredential,
        visitorId: visitorId,
        sessionId: sessionId
      },
      process.env
    );
  } catch (memberErr) {
    console.warn('Checkout member pricing lookup:', memberErr && memberErr.message);
  }

  // Hidden internal test code (server-only). Not in the public catalog.
  // Requires a whitelisted checkout email; applies 99% to the full order total.
  const resolvedDevtest = DevtestDiscount.resolve(discountCode, checkoutEmail, process.env);
  if (resolvedDevtest) {
    appliedPercentOff = resolvedDevtest.percentOff;
    appliedDiscountUSD = DevtestDiscount.discountAmountUSD(
      orderTotalUSD,
      resolvedDevtest.percentOff
    );
    appliedDiscountCode = resolvedDevtest.code;
    appliedDiscountLabel = resolvedDevtest.label;
  } else {
    // The browser never authorizes member pricing. Only a verified member
    // identity can select a tier benefit; arbitrary client coupons are ignored.
    const effectiveDiscountCode = resolvedMember.active ? resolvedMember.discountCode : '';
    if (effectiveDiscountCode && typeof pricingApi.applyDiscountUSD === 'function') {
      const codeRaw = String(effectiveDiscountCode).trim();
      appliedDiscountUSD = pricingApi.applyDiscountUSD(codeRaw, productSubtotalUSD);
      if (appliedDiscountUSD > 0) {
        appliedDiscountCode = codeRaw.toUpperCase();
        const catalogEntry =
          catalog && catalog.discountCodes ? catalog.discountCodes[codeRaw.toLowerCase()] : null;
        appliedDiscountLabel =
          resolvedMember.active
            ? resolvedMember.tierLabel + ' Savings'
            : (catalogEntry && catalogEntry.label) || 'Discount';
      }
    }
  }

  const metadata = {};
  if (appliedDiscountCode) {
    metadata.discountCode = CheckoutSnapshots.truncateMeta(appliedDiscountCode, 64);
    metadata.discountUSD = appliedDiscountUSD.toFixed(2);
  }
  if (appliedPercentOff > 0) {
    metadata.discountPercent = String(appliedPercentOff);
  }
  if (resolvedDevtest && resolvedDevtest.email) {
    metadata.devtestEmail = CheckoutSnapshots.truncateMeta(resolvedDevtest.email, 120);
  }
  const buyerName = String(customerName || name || '').trim();
  if (buyerName) {
    metadata.customerName = CheckoutSnapshots.truncateMeta(buyerName, 120);
  }
  if (collection) {
    metadata.collection = CheckoutSnapshots.truncateMeta(String(collection), 40);
  }
  if (productSlug) metadata.productSlug = CheckoutSnapshots.truncateMeta(productSlug, 120);
  if (size) metadata.size = CheckoutSnapshots.truncateMeta(size, 32);
  if (powerType) metadata.powerType = CheckoutSnapshots.truncateMeta(powerType, 32);
  metadata.shippingMethod = CheckoutSnapshots.truncateMeta(resolvedShippingMethod, 32);

  // Full cart / customConfig live in checkout_snapshots — never in Stripe metadata
  // (Stripe enforces a 500-character max per metadata value).
  const variantDetails = CheckoutSnapshots.buildVariantDetails(
    Array.isArray(lineItems) && lineItems.length ? lineItems : []
  );
  if (
    !variantDetails.length &&
    Array.isArray(lineItems) &&
    lineItems.length === 1 &&
    lineItems[0] &&
    lineItems[0].powerType
  ) {
    metadata.powerType = CheckoutSnapshots.truncateMeta(lineItems[0].powerType, 32);
  }

  let checkoutSnapshotId = null;
  if (!supabase) {
    return res.status(503).json({
      error: 'Checkout is temporarily unavailable. Please try again shortly.'
    });
  }
  if (!variantDetails.length) {
    return res.status(400).json({ error: 'No valid cart items for checkout.' });
  }
  try {
    checkoutSnapshotId = await CheckoutSnapshots.createSnapshot(supabase, {
      cartId: cartId || null,
      visitorId: visitorId || null,
      sessionId: sessionId || null,
      uploadSessionId: uploadSessionId || null,
      shippingMethod: resolvedShippingMethod,
      discountCode: appliedDiscountCode || null,
      discountUSD: appliedDiscountUSD > 0 ? appliedDiscountUSD : null,
      lineItems: variantDetails
    });
  } catch (snapErr) {
    console.error('checkout snapshot create failed:', snapErr && snapErr.message);
    return res.status(500).json({
      error: 'Could not prepare checkout. Please refresh and try again.'
    });
  }
  if (!checkoutSnapshotId) {
    return res.status(500).json({
      error: 'Could not prepare checkout. Please refresh and try again.'
    });
  }
  metadata.checkoutSnapshotId = String(checkoutSnapshotId);

  const totalQty = stripeLineItems.reduce(function (sum, item) {
    return sum + (Number(item.quantity) || 0);
  }, 0);
  metadata.quantity = String(totalQty);
  metadata.cartItems = String(stripeLineItems.length);
  if (visitorId) metadata.visitorId = CheckoutSnapshots.truncateMeta(visitorId, 80);
  if (sessionId) metadata.analyticsSessionId = CheckoutSnapshots.truncateMeta(sessionId, 80);
  if (cartId) metadata.cartId = CheckoutSnapshots.truncateMeta(cartId, 80);
  if (uploadSessionId) {
    metadata.uploadSessionId = CheckoutSnapshots.truncateMeta(uploadSessionId, 80);
  }
  if (fbp) metadata.fbp = CheckoutSnapshots.truncateMeta(fbp, 200);
  if (fbc) metadata.fbc = CheckoutSnapshots.truncateMeta(fbc, 200);
  if (clientUserAgent) {
    metadata.clientUserAgent = CheckoutSnapshots.truncateMeta(clientUserAgent, 200);
  }
  const forwarded =
    (req.headers['x-forwarded-for'] && String(req.headers['x-forwarded-for']).split(',')[0].trim()) ||
    req.headers['cf-connecting-ip'] ||
    req.ip ||
    '';
  if (forwarded) metadata.clientIp = CheckoutSnapshots.truncateMeta(forwarded, 64);
  const storeUrl = String(process.env.STORE_URL || 'https://www.zybar.shop').replace(/\/$/, '');
  const confirmPath =
    collection && String(collection).toLowerCase() === 'luneva'
      ? '/luneva/purchase-confirmation/'
      : '/purchase-confirmation.html';
  metadata.eventSourceUrl = CheckoutSnapshots.truncateMeta(storeUrl + confirmPath, 200);

  try {
    CheckoutSnapshots.assertMetadataSafe(metadata);
  } catch (metaErr) {
    console.error(metaErr && metaErr.message);
    return res.status(500).json({
      error: 'Checkout metadata invalid. Please refresh and try again.'
    });
  }

  if (supabase && uploadSessionId) {
    try {
      const customLine =
        Array.isArray(lineItems) &&
        lineItems.find(function (item) {
          if (!item) return false;
          const slug = item.productSlug || item.slug || '';
          return ProductTypes.isCustomSlug(slug) || item.productType === 'custom';
        });
      const customConfig =
        customLine && customLine.customConfig && typeof customLine.customConfig === 'object'
          ? ProductTypes.normalizeCustomConfig(customLine.customConfig)
          : null;
      await CustomLeads.upsert(supabase, {
        uploadSessionId: String(uploadSessionId),
        visitorId: visitorId,
        sessionId: sessionId,
        cartId: cartId,
        status: 'checkout_started',
        vehicleModel: customConfig ? customConfig.vehicleModel : null,
        lightingPreference: customConfig ? customConfig.specialRequests : null,
        photos: customConfig ? customConfig.photos : [],
        size: customLine ? customLine.size : size,
        powerType: customLine ? customLine.powerType : powerType,
        stripeSessionId: null
      });
    } catch (leadErr) {
      console.warn('custom lead checkout sync:', leadErr && leadErr.message);
    }
  }

  function buildReturnUrl() {
    if (returnUrl) return String(returnUrl);
    const base = String(successUrl || '');
    if (base.indexOf('{CHECKOUT_SESSION_ID}') !== -1) return base;
    const join = base.indexOf('?') === -1 ? '?' : '&';
    return base + join + 'session_id={CHECKOUT_SESSION_ID}';
  }

  // Checkout Sessions (not PaymentIntents): omit payment_method_types so Stripe
  // enables methods from Dashboard (card, Link, Apple Pay, Google Pay, etc.).
  // Wallets appear in Payment Element / Express Checkout when domain + Dashboard
  // wallet settings are configured. Do NOT use automatic_payment_methods here —
  // that flag is PaymentIntent-only.
  //
  // branding_settings + custom_text are Embedded/Hosted only — including them
  // with ui_mode:custom makes Stripe reject the session and we fall back to
  // embedded (which hides Express Apple Pay / Google Pay on our page).
  const sessionBase = {
    mode: 'payment',
    line_items: stripeLineItems,
    metadata,
    // Required for Custom Checkout updatePhoneNumber / confirm({ phoneNumber })
    // so phone is stored on the completed session for orders + shipping labels.
    phone_number_collection: {
      enabled: true
    }
  };
  if (resolvedDevtest && resolvedDevtest.email) {
    // Prefill + lock intent to the authorized tester email for this coupon.
    sessionBase.customer_email = resolvedDevtest.email;
  } else if (checkoutEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(checkoutEmail)) {
    // Prefill email on Hosted / Embedded Checkout (LUNEVA + guest Automotive).
    sessionBase.customer_email = checkoutEmail;
  }

  // Hosted Checkout (LUNEVA) must collect shipping name + address for fulfillment.
  // Embedded/Custom Automotive checkout collects address in our own UI instead.
  function stripeShippingAllowedCountries() {
    // Stripe Checkout rejects these ISO codes for shipping_address_collection.
    // See Stripe docs / API enum (AS, CX, CC, CU, HM, IR, KP, MH, FM, NF, MP, PW, SY, UM, VI).
    const unsupported = {
      AS: 1, CX: 1, CC: 1, CU: 1, HM: 1, IR: 1, KP: 1, MH: 1,
      FM: 1, NF: 1, MP: 1, PW: 1, SY: 1, UM: 1, VI: 1,
      // Extra codes present in countries.json that Stripe also rejects
      VG: 1, TD: 1, SS: 1, XK: 1
    };
    try {
      const data = require('./data/countries.json');
      const codes = (data.countries || [])
        .map(function (c) { return c && String(c.code || '').toUpperCase(); })
        .filter(function (code) { return code.length === 2 && !unsupported[code]; });
      if (codes.length) return codes;
    } catch (e) {
      // fall through
    }
    return ['US', 'CA', 'GB', 'AU', 'NZ', 'MY', 'SG', 'DE', 'FR', 'JP', 'KR', 'HK', 'TW'];
  }

  const embeddedOnlySettings = {
    branding_settings: {
      background_color: '#111111',
      button_color: '#ffffff',
      border_style: 'rounded',
      font_family: 'inter'
    },
    custom_text: {
      submit: {
        message: 'Complete your secure order'
      }
    }
  };

  async function afterCheckoutSessionCreated(session) {
    if (!session || !session.id) return;
    if (!checkoutSnapshotId) {
      throw new Error('Missing checkoutSnapshotId after Stripe session create.');
    }
    await CheckoutSnapshots.attachStripeSession(supabase, checkoutSnapshotId, session.id);
    if (uploadSessionId) {
      await supabase
        .from('custom_leads')
        .update({ stripe_session_id: session.id, updated_at: new Date().toISOString() })
        .eq('upload_session_id', String(uploadSessionId));
    }
  }

  try {
    console.log('Checkout line item prices:', stripeLineItems.map(function (i) { return i.price; }));

    // Attach the validated discount as a real Stripe coupon so the charged
    // amount always matches the savings promised in the cart and checkout UI.
    if (appliedPercentOff > 0) {
      const coupon = await stripe.coupons.create({
        percent_off: appliedPercentOff,
        duration: 'once',
        name: String(appliedDiscountLabel || appliedDiscountCode).slice(0, 40)
      });
      sessionBase.discounts = [{ coupon: coupon.id }];
    } else if (appliedDiscountUSD > 0) {
      const coupon = await stripe.coupons.create({
        amount_off: Math.round(appliedDiscountUSD * 100),
        currency: 'usd',
        duration: 'once',
        name: String(appliedDiscountLabel).slice(0, 40)
      });
      sessionBase.discounts = [{ coupon: coupon.id }];
    }

    const discountPayload =
      appliedDiscountCode
        ? {
            code: appliedDiscountCode,
            label: appliedDiscountLabel || 'Discount',
            amountUSD: appliedDiscountUSD,
            percentOff: appliedPercentOff || null
          }
        : null;
    const customerEmailSet = !!(sessionBase.customer_email);

    if (isCustom || isEmbedded) {
      if (isCustom) {
        try {
          const session = await stripe.checkout.sessions.create(Object.assign({}, sessionBase, {
            ui_mode: 'custom',
            return_url: buildReturnUrl()
          }));
          await afterCheckoutSessionCreated(session);
          return res.json({
            clientSecret: session.client_secret,
            sessionId: session.id,
            checkoutMode: 'custom',
            appliedDiscount: discountPayload,
            customerEmailSet: customerEmailSet
          });
        } catch (customErr) {
          console.warn('Custom checkout unavailable, using embedded:', customErr.message || customErr);
        }
      }
      const session = await stripe.checkout.sessions.create(Object.assign({}, sessionBase, embeddedOnlySettings, {
        ui_mode: 'embedded',
        return_url: buildReturnUrl()
      }));
      await afterCheckoutSessionCreated(session);
      return res.json({
        clientSecret: session.client_secret,
        sessionId: session.id,
        checkoutMode: 'embedded',
        embedded: true,
        appliedDiscount: discountPayload,
        customerEmailSet: customerEmailSet
      });
    }

    const session = await stripe.checkout.sessions.create(Object.assign({}, sessionBase, embeddedOnlySettings, {
      success_url: successUrl,
      cancel_url: cancelUrl,
      billing_address_collection: 'required',
      shipping_address_collection: {
        allowed_countries: stripeShippingAllowedCountries()
      }
    }));
    await afterCheckoutSessionCreated(session);
    return res.json({
      url: session.url,
      sessionId: session.id,
      appliedDiscount: discountPayload,
      customerEmailSet: customerEmailSet
    });
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

      try {
        if (Array.isArray(cart.items) && cart.items.length && cart.visitor_id) {
          const leadRes = await supabase
            .from('newsletter_subscribers')
            .select('*')
            .eq('visitor_id', String(cart.visitor_id))
            .maybeSingle();
          if (!leadRes.error && leadRes.data) {
            const JourneyEngine = require('./lib/journey-engine.js');
            await JourneyEngine.enrollLeadOnAddToCart(supabase, leadRes.data);
          }
        }
      } catch (cartJourneyErr) {
        console.warn(
          'cart journey enroll:',
          cartJourneyErr && cartJourneyErr.message ? cartJourneyErr.message : cartJourneyErr
        );
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
  const rawStart = req.query.start ? String(req.query.start) : '';
  const rawEnd = req.query.end ? String(req.query.end) : '';

  // Full ISO instants from the admin UI carry the user's local midnight already;
  // use them verbatim (end is exclusive) instead of snapping to server-local days.
  if (rawStart.includes('T') && rawEnd.includes('T')) {
    const exactStart = new Date(rawStart);
    const exactEnd = new Date(rawEnd);
    if (!Number.isNaN(exactStart.getTime()) && !Number.isNaN(exactEnd.getTime())) {
      return { start: exactStart.toISOString(), end: exactEnd.toISOString() };
    }
  }

  const end = rawEnd ? new Date(rawEnd) : new Date();
  end.setHours(23, 59, 59, 999);
  const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
  const start = rawStart
    ? new Date(rawStart)
    : new Date(end.getTime() - (days - 1) * 86400000);
  start.setHours(0, 0, 0, 0);
  // Exclusive end = one ms past end-of-day (not +24h, which would double-count the next day).
  const endExcl = new Date(end.getTime() + 1);
  return { start: start.toISOString(), end: endExcl.toISOString() };
}

app.get('/api/analytics/dashboard', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Analytics not configured' });
  const range = parseAnalyticsRange(req);
  try {
    // Count-only KPIs — never hydrate full lead/cart lists here (that was ~11s).
    const [overview, emailLeads, abandonedCarts, customMadeLeads] = await Promise.all([
      AnalyticsFallback.rpcOrFallback(
        supabase,
        'get_shopify_analytics_overview',
        { p_start: range.start, p_end: range.end },
        function () {
          return AnalyticsFallback.overviewFallback(supabase, range);
        }
      ),
      CustomerActivity.countEmailLeads(supabase, {
        preset: 'custom',
        start: range.start,
        end: range.end
      }).catch(function () {
        return 0;
      }),
      CustomerActivity.countAbandoned(supabase, {
        preset: 'custom',
        start: range.start,
        end: range.end
      }).catch(function () {
        return 0;
      }),
      CustomLeads.count(supabase, {
        preset: 'custom',
        start: range.start,
        end: range.end
      }).catch(function () {
        return 0;
      })
    ]);
    return res.json({
      overview: overview || {},
      email_leads: Number(emailLeads) || 0,
      abandoned_carts: Number(abandonedCarts) || 0,
      custom_made_leads: Number(customMadeLeads) || 0,
      range: range
    });
  } catch (err) {
    console.error('Analytics dashboard error:', err);
    return res.status(500).json({ error: err.message || 'Failed to load dashboard' });
  }
});

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
    let data = await AnalyticsFallback.rpcOrFallback(
      supabase,
      'get_shopify_conversion_funnel',
      { p_start: range.start, p_end: range.end },
      function () { return AnalyticsFallback.funnelFallback(supabase, range); }
    );
    let steps = Array.isArray(data) ? data : (data && data.steps) || [];
    const hasPayment = steps.some(function (s) {
      return /payment/i.test(String(s && s.step || ''));
    });
    if (!hasPayment) {
      steps = await AnalyticsFallback.funnelFallback(supabase, range);
    }
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
  const rawGran = String(req.query.granularity || 'day').toLowerCase();
  const granularity =
    rawGran === 'hour' ||
    rawGran === 'week' ||
    rawGran === 'month' ||
    rawGran === 'year'
      ? rawGran
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

app.get('/api/analytics/metric/:key/summary', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Analytics not configured' });
  const MetricDetail = require('./lib/analytics-metric-detail.js');
  const key = String(req.params.key || '').toLowerCase();
  if (!MetricDetail.getMetricMeta(key)) {
    return res.status(404).json({ error: 'Unknown metric key.' });
  }
  const range = parseAnalyticsRange(req);
  const filters = MetricDetail.parseFilters(req.query || {});
  try {
    const summary = await MetricDetail.getMetricSummary(supabase, key, range, filters);
    return res.json({
      key: key,
      meta: MetricDetail.getMetricMeta(key),
      range: range,
      summary: summary
    });
  } catch (err) {
    console.error('Metric summary error:', err);
    return res.status(500).json({ error: (err && err.message) || 'Failed to load metric summary.' });
  }
});

app.get('/api/analytics/metric/:key/rows', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Analytics not configured' });
  const MetricDetail = require('./lib/analytics-metric-detail.js');
  const key = String(req.params.key || '').toLowerCase();
  if (!MetricDetail.getMetricMeta(key)) {
    return res.status(404).json({ error: 'Unknown metric key.' });
  }
  const range = parseAnalyticsRange(req);
  const filters = MetricDetail.parseFilters(req.query || {});
  try {
    const table = await MetricDetail.getMetricRows(supabase, key, range, filters);
    return res.json({
      key: key,
      meta: MetricDetail.getMetricMeta(key),
      range: range,
      filters: filters,
      table: table
    });
  } catch (err) {
    console.error('Metric rows error:', err);
    return res.status(500).json({ error: (err && err.message) || 'Failed to load metric rows.' });
  }
});

// Export app for serverless runtimes (e.g. Vercel).
module.exports = app;
module.exports.persistPaidCheckoutSession = persistPaidCheckoutSession;
module.exports.CheckoutSnapshots = CheckoutSnapshots;

// ----- Start -----
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    if (isZybarMy) console.log('ZYBAR.MY test mode — open http://localhost:' + PORT + ' (redirects to ?env=zybar.my)');
    if (!stripeSecretKey) console.warn('STRIPE_SECRET_KEY missing — checkout will return 503.');
  });
}
