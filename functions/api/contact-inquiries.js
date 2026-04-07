function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

function buildHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    authorization: 'Bearer ' + serviceRoleKey,
    'content-type': 'application/json'
  };
}

function mapInquiryRow(row) {
  return {
    id: row && (row.inquiry_id || row.id || null),
    name: row && (row.name || null),
    email: row && (row.email || null),
    phone: row && (row.phone || null),
    car_model_interest: row && (row.car_model_interest || null),
    message: row && (row.message || null),
    created_at: row && (row.created_at || null)
  };
}

export async function onRequestGet(context) {
  var env = context.env || {};
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Supabase is not configured for inquiries yet.' }, 503);
  }

  var limit = 500;
  try {
    var reqUrl = new URL(context.request.url);
    limit = Math.max(1, Math.min(parseInt(reqUrl.searchParams.get('limit') || '500', 10) || 500, 500));
  } catch (_) {}

  var headers = buildHeaders(env.SUPABASE_SERVICE_ROLE_KEY);
  try {
    var response = await fetch(
      env.SUPABASE_URL +
        '/rest/v1/contact_inquiries?select=inquiry_id,name,email,phone,car_model_interest,message,created_at&order=created_at.desc&limit=' +
        limit,
      { method: 'GET', headers: headers }
    );
    var rows = await response.json();
    if (!response.ok) return json({ error: 'Unable to load inquiries.' }, 500);
    return json({
      source: 'supabase',
      data: (Array.isArray(rows) ? rows : []).map(mapInquiryRow)
    });
  } catch (_) {
    return json({ error: 'Unable to load inquiries.' }, 500);
  }
}

