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

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
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

  const url = new URL(context.request.url);
  const productSlug = String(url.searchParams.get('productSlug') || '').trim().slice(0, 80);
  const limit = Math.max(1, Math.min(parseInt(url.searchParams.get('limit') || '80', 10) || 80, 200));
  if (productSlug && !allowedProductSlugs.has(productSlug)) {
    return json({ error: 'Invalid product selected.' }, 400);
  }

  const headers = buildHeaders(env.SUPABASE_SERVICE_ROLE_KEY);
  const queryParts = [
    'select=id,product_slug,product_name,customer_name,rating,review_text,image_data_url,created_at',
    'status=eq.approved',
    'order=created_at.desc',
    'limit=' + limit
  ];
  if (productSlug) {
    queryParts.push('product_slug=eq.' + encodeURIComponent(productSlug));
  }

  try {
    const response = await fetch(env.SUPABASE_URL + '/rest/v1/product_reviews?' + queryParts.join('&'), {
      method: 'GET',
      headers: headers
    });
    const data = await response.json();
    if (!response.ok) {
      return json({ error: 'Unable to load reviews.' }, 500);
    }
    return json({
      source: 'supabase',
      data: (Array.isArray(data) ? data : []).map(mapReviewRow)
    });
  } catch (_) {
    return json({ error: 'Unable to load reviews.' }, 500);
  }
}

export async function onRequestPost(context) {
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

  const checked = sanitizeReviewInput(body);
  if (checked.error) {
    return json({ error: checked.error }, 400);
  }
  const payload = checked.value;
  const headers = buildHeaders(env.SUPABASE_SERVICE_ROLE_KEY);
  headers.prefer = 'return=representation';

  try {
    const response = await fetch(env.SUPABASE_URL + '/rest/v1/product_reviews', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        product_slug: payload.productSlug,
        product_name: payload.productName,
        customer_name: payload.name,
        rating: payload.rating,
        review_text: payload.comment,
        image_data_url: payload.imageDataUrl,
        status: 'approved',
        source: 'website'
      })
    });
    const data = await response.json();
    if (!response.ok) {
      return json({ error: 'Unable to submit review right now.' }, 500);
    }
    const row = Array.isArray(data) ? data[0] : data;
    return json({ ok: true, review: mapReviewRow(row) }, 200);
  } catch (_) {
    return json({ error: 'Unable to submit review right now.' }, 500);
  }
}
