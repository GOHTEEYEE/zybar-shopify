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

  const rows = Array.isArray(body && body.reviews) ? body.reviews.slice(0, 500) : [];
  if (!rows.length) return json({ error: 'No reviews were provided for import.' }, 400);

  const sanitized = [];
  let imagesDropped = 0;
  for (const row of rows) {
    const checked = sanitizeImportedReview(row);
    if (checked.error) return json({ error: checked.error }, 400);
    sanitized.push(checked.value);
    if (checked.imageDropped) imagesDropped += 1;
  }

  const headers = buildHeaders(env.SUPABASE_SERVICE_ROLE_KEY);
  try {
    const existingRes = await fetch(
      env.SUPABASE_URL + '/rest/v1/product_reviews?select=product_slug,product_name,customer_name,rating,review_text,created_at&limit=5000',
      { method: 'GET', headers: headers }
    );
    const existingData = await existingRes.json();
    if (!existingRes.ok) return json({ error: 'Unable to import reviews right now.' }, 500);

    const existingFingerprints = new Set((Array.isArray(existingData) ? existingData : []).map(buildReviewFingerprint));
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
      const insertHeaders = buildHeaders(env.SUPABASE_SERVICE_ROLE_KEY);
      const insertRes = await fetch(env.SUPABASE_URL + '/rest/v1/product_reviews', {
        method: 'POST',
        headers: insertHeaders,
        body: JSON.stringify(inserts)
      });
      if (!insertRes.ok) return json({ error: 'Unable to import reviews right now.' }, 500);
    }

    return json({
      ok: true,
      imported: inserts.length,
      skipped: skipped,
      total: sanitized.length,
      images_cleared: imagesDropped
    });
  } catch (_) {
    return json({ error: 'Unable to import reviews right now.' }, 500);
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
