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

function sanitizeBody(body) {
  var payload = body || {};
  var name = String(payload.name || '').trim().slice(0, 120);
  var email = String(payload.email || '').trim().toLowerCase().slice(0, 190);
  var phone = String(payload.phone || '').trim().slice(0, 40);
  var carModelInterest = String(payload.carModelInterest || '').trim().slice(0, 160);
  var message = String(payload.message || '').trim().slice(0, 4000);
  var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!name || !email || !message || !emailRegex.test(email)) {
    return { error: 'Please provide a valid name, email, and message.' };
  }

  return {
    value: {
      inquiry_id: 'inq_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      name: name,
      email: email,
      phone: phone || null,
      car_model_interest: carModelInterest || null,
      message: message,
      created_at: new Date().toISOString()
    }
  };
}

export async function onRequestPost(context) {
  var env = context.env || {};
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Supabase is not configured for inquiries yet.' }, 503);
  }

  var body;
  try {
    body = await context.request.json();
  } catch (_) {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  var checked = sanitizeBody(body);
  if (checked.error) return json({ error: checked.error }, 400);

  var headers = buildHeaders(env.SUPABASE_SERVICE_ROLE_KEY);
  headers.prefer = 'return=minimal';

  try {
    var response = await fetch(env.SUPABASE_URL + '/rest/v1/contact_inquiries', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(checked.value)
    });
    if (!response.ok) return json({ error: 'Unable to submit inquiry.' }, 500);
    return json({ ok: true, id: checked.value.inquiry_id, supabaseSaved: true }, 200);
  } catch (_) {
    return json({ error: 'Unable to submit inquiry.' }, 500);
  }
}

