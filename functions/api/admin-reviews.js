function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

const allowedProductSlugs = new Set([
  'audi-r8-white',
  'audi-r8-yellow',
  'audi-r8-gt3',
  'audi-rs6',
  'b-dodge-hellcat-02',
  'b-dodge-hellcat-03',
  'b-ferrari-f40',
  'b-maserati-mc20'
]);

function buildHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    authorization: 'Bearer ' + serviceRoleKey,
    'content-type': 'application/json'
  };
}

export async function onRequestGet(context) {
  const env = context.env || {};
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Supabase is not configured for reviews yet.' }, 503);
  }

  const headers = buildHeaders(env.SUPABASE_SERVICE_ROLE_KEY);
  try {
    const response = await fetch(
      env.SUPABASE_URL + '/rest/v1/product_reviews?select=id,product_slug,product_name,customer_name,rating,review_text,image_data_url,status,source,created_at&order=created_at.desc&limit=500',
      { method: 'GET', headers: headers }
    );
    const data = await response.json();
    if (!response.ok) return json({ error: 'Unable to load admin reviews.' }, 500);
    return json({ data: Array.isArray(data) ? data : [] });
  } catch (_) {
    return json({ error: 'Unable to load admin reviews.' }, 500);
  }
}

export async function onRequestPatch(context) {
  const env = context.env || {};
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Supabase is not configured for reviews yet.' }, 503);
  }

  let body;
  try {
    body = await context.request.json();
  } catch (_) {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const id = parseInt(body && body.id, 10);
  const customerName = String(body && body.customer_name || '').trim().slice(0, 60);
  const productName = String(body && body.product_name || '').trim().slice(0, 120);
  const productSlug = String(body && body.product_slug || '').trim().slice(0, 80);
  const rating = Math.max(1, Math.min(5, parseInt(body && body.rating, 10) || 0));
  const status = String(body && body.status || '').trim().toLowerCase();
  const reviewText = String(body && body.review_text || '').trim().slice(0, 2000);
  const imageDataUrl = typeof (body && body.image_data_url) === 'string' ? body.image_data_url.trim() : '';
  const createdAtInput = typeof (body && body.created_at) === 'string' ? body.created_at.trim() : '';
  const createdAtDate = createdAtInput ? new Date(createdAtInput + (createdAtInput.indexOf('T') === -1 ? 'T00:00:00.000Z' : '')) : null;
  const createdAt = createdAtDate && !Number.isNaN(createdAtDate.getTime()) ? createdAtDate.toISOString() : null;

  if (!id) return json({ error: 'Review ID is required.' }, 400);
  if (!customerName || !productName || !productSlug || !reviewText) {
    return json({ error: 'Customer name, product name, product slug, and review text are required.' }, 400);
  }
  if (!allowedProductSlugs.has(productSlug)) return json({ error: 'Invalid product slug.' }, 400);
  if (status !== 'approved' && status !== 'pending' && status !== 'rejected') return json({ error: 'Invalid review status.' }, 400);
  if (createdAtInput && !createdAt) return json({ error: 'Invalid upload date.' }, 400);

  const headers = buildHeaders(env.SUPABASE_SERVICE_ROLE_KEY);
  headers.prefer = 'return=representation';
  const updateBody = {
    customer_name: customerName,
    product_name: productName,
    product_slug: productSlug,
    rating: rating,
    status: status,
    review_text: reviewText,
    image_data_url: imageDataUrl || null
  };
  if (createdAt) updateBody.created_at = createdAt;
  try {
    const response = await fetch(env.SUPABASE_URL + '/rest/v1/product_reviews?id=eq.' + id, {
      method: 'PATCH',
      headers: headers,
      body: JSON.stringify(updateBody)
    });
    const data = await response.json();
    if (!response.ok) return json({ error: 'Unable to update review.' }, 500);
    return json({ ok: true, review: Array.isArray(data) ? data[0] : data });
  } catch (_) {
    return json({ error: 'Unable to update review.' }, 500);
  }
}

export async function onRequestDelete(context) {
  const env = context.env || {};
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Supabase is not configured for reviews yet.' }, 503);
  }

  const id = parseInt(new URL(context.request.url).searchParams.get('id') || '0', 10);
  if (!id) return json({ error: 'Review ID is required.' }, 400);

  const headers = buildHeaders(env.SUPABASE_SERVICE_ROLE_KEY);
  try {
    const response = await fetch(env.SUPABASE_URL + '/rest/v1/product_reviews?id=eq.' + id, {
      method: 'DELETE',
      headers: headers
    });
    if (!response.ok) return json({ error: 'Unable to delete review.' }, 500);
    return json({ ok: true });
  } catch (_) {
    return json({ error: 'Unable to delete review.' }, 500);
  }
}
