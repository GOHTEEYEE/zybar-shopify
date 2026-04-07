function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

export async function onRequestGet(context) {
  const env = context.env || {};
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Supabase is not configured.' }, 503);
  }

  const limitParam = Number(new URL(context.request.url).searchParams.get('limit') || 100);
  const limit = Math.max(1, Math.min(limitParam || 100, 200));
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
    'content-type': 'application/json'
  };

  try {
    const sessionsRes = await fetch(
      env.SUPABASE_URL + '/rest/v1/chatbot_sessions?select=id,page_path,page_title,user_agent,started_at,last_message_at&order=last_message_at.desc&limit=' + limit,
      { headers: headers }
    );
    const sessions = await sessionsRes.json();
    if (!sessionsRes.ok) {
      return json({ error: 'Unable to load chatbot conversations.' }, 500);
    }

    if (!Array.isArray(sessions) || !sessions.length) {
      return json({ source: 'supabase', data: [] });
    }

    const ids = sessions.map(function (row) { return row.id; }).filter(Boolean);
    const quoted = ids.map(function (id) { return '"' + String(id).replace(/"/g, '\\"') + '"'; }).join(',');
    const messagesRes = await fetch(
      env.SUPABASE_URL + '/rest/v1/chatbot_messages?select=id,session_id,role,message,page_path,page_title,created_at&session_id=in.(' + encodeURIComponent(quoted) + ')&order=created_at.asc',
      { headers: headers }
    );
    const messages = await messagesRes.json();
    if (!messagesRes.ok) {
      return json({ error: 'Unable to load chatbot messages.' }, 500);
    }

    const grouped = {};
    (messages || []).forEach(function (row) {
      if (!grouped[row.session_id]) grouped[row.session_id] = [];
      grouped[row.session_id].push(row);
    });

    return json({
      source: 'supabase',
      data: sessions.map(function (session) {
        return {
          id: session.id,
          page_path: session.page_path || null,
          page_title: session.page_title || null,
          user_agent: session.user_agent || null,
          started_at: session.started_at || null,
          last_message_at: session.last_message_at || null,
          messages: grouped[session.id] || []
        };
      })
    });
  } catch (_) {
    return json({ error: 'Unable to load chatbot conversations.' }, 500);
  }
}
