/**
 * LUNEVA contact / inquiry form — public submit + admin list.
 */

const TOPICS = [
  'order_shipping',
  'product',
  'gift',
  'assembly',
  'other'
];

const KITS = [
  'dreamy-garden',
  'cyan-blue',
  'glowing-garden',
  'starlit-garden'
];

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function makeInquiryId() {
  return 'lvinq_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

function sanitizeTopic(topic) {
  const value = String(topic || '').trim().toLowerCase();
  return TOPICS.indexOf(value) >= 0 ? value : value ? 'other' : null;
}

function sanitizeKit(kit) {
  const value = String(kit || '').trim().toLowerCase();
  if (!value || value === 'general' || value === 'not_sure') return null;
  return KITS.indexOf(value) >= 0 ? value : null;
}

async function submitInquiry(supabase, body, req) {
  const name = String(body.name || '').trim();
  const email = normalizeEmail(body.email);
  const phone = String(body.phone || '').trim();
  const message = String(body.message || '').trim();
  const topic = sanitizeTopic(body.topic);
  const kitInterest = sanitizeKit(body.kitInterest || body.kit_interest);
  const orderNumber = String(body.orderNumber || body.order_number || '').trim();
  const pageUrl = String(body.pageUrl || body.page_url || '').trim();
  const visitorId = String(body.visitorId || body.visitor_id || '').trim();

  if (!name || !email || !message) {
    return { status: 400, json: { error: 'Please provide your name, email, and message.' } };
  }
  if (!isValidEmail(email)) {
    return { status: 400, json: { error: 'Please enter a valid email address.' } };
  }
  if (message.length > 5000) {
    return { status: 400, json: { error: 'Message is too long. Please shorten it.' } };
  }

  const row = {
    inquiry_id: makeInquiryId(),
    name: name.slice(0, 120),
    email: email.slice(0, 200),
    phone: phone ? phone.slice(0, 40) : null,
    topic: topic,
    kit_interest: kitInterest,
    order_number: orderNumber ? orderNumber.slice(0, 80) : null,
    message: message,
    page_url: pageUrl ? pageUrl.slice(0, 500) : null,
    visitor_id: visitorId ? visitorId.slice(0, 80) : null,
    status: 'new',
    created_at: new Date().toISOString()
  };

  if (!supabase) {
    return { status: 503, json: { error: 'Service is temporarily unavailable. Please try again later.' } };
  }

  const { error } = await supabase.from('luneva_inquiries').insert(row);
  if (error) {
    console.error('luneva_inquiries insert error:', error);
    return { status: 500, json: { error: 'Unable to send your message. Please try again.' } };
  }

  return {
    status: 200,
    json: {
      ok: true,
      message: 'Thanks — we received your message and will reply by email soon.'
    }
  };
}

async function listInquiriesForAdmin(supabase, range) {
  if (!supabase) {
    throw new Error('Analytics not configured');
  }

  let query = supabase
    .from('luneva_inquiries')
    .select(
      'inquiry_id,name,email,phone,topic,kit_interest,order_number,message,page_url,visitor_id,status,created_at'
    )
    .order('created_at', { ascending: false })
    .limit(500);

  if (range && range.start) {
    query = query.gte('created_at', range.start);
  }
  if (range && range.end) {
    query = query.lt('created_at', range.end);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  return {
    inquiries: (data || []).map(function (row) {
      return {
        id: row.inquiry_id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        topic: row.topic,
        kit_interest: row.kit_interest,
        order_number: row.order_number,
        message: row.message,
        page_url: row.page_url,
        visitor_id: row.visitor_id,
        status: row.status,
        created_at: row.created_at
      };
    })
  };
}

function topicLabel(topic) {
  const map = {
    order_shipping: 'Order & shipping',
    product: 'Product question',
    gift: 'Gift help',
    assembly: 'Assembly / DIY',
    other: 'Other'
  };
  return map[String(topic || '').toLowerCase()] || topic || '—';
}

function kitLabel(kit) {
  if (!kit) return '—';
  return String(kit)
    .replace(/-/g, ' ')
    .replace(/\b\w/g, function (c) {
      return c.toUpperCase();
    });
}

module.exports = {
  TOPICS,
  KITS,
  submitInquiry,
  listInquiriesForAdmin,
  topicLabel,
  kitLabel
};
