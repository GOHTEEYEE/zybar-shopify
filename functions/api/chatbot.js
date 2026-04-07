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

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

async function logChatbotConversation(env, sessionId, pageContext, userAgent, userMessage, assistantReply) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !sessionId) return;

  const safePagePath = pageContext && typeof pageContext.path === 'string' ? pageContext.path.trim().slice(0, 200) : null;
  const safePageTitle = pageContext && typeof pageContext.title === 'string' ? pageContext.title.trim().slice(0, 200) : null;
  const headers = {
    'content-type': 'application/json',
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
    prefer: 'return=minimal,resolution=merge-duplicates'
  };

  try {
    await fetch(env.SUPABASE_URL + '/rest/v1/chatbot_sessions', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify([{
        id: sessionId,
        page_path: safePagePath,
        page_title: safePageTitle,
        user_agent: userAgent ? String(userAgent).slice(0, 500) : null,
        last_message_at: new Date().toISOString()
      }])
    });

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
      await fetch(env.SUPABASE_URL + '/rest/v1/chatbot_messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
          prefer: 'return=minimal'
        },
        body: JSON.stringify(rows)
      });
    }
  } catch (_) {}
}

export async function onRequestPost(context) {
  const env = context.env || {};
  const apiKey = env.OPENAI_API_KEY;
  const model = env.OPENAI_MODEL || 'gpt-4o-mini';

  if (!apiKey) {
    return json({ error: 'Chatbot is not configured yet.' }, 503);
  }

  let body;
  try {
    body = await context.request.json();
  } catch (_) {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const pageContext = body && body.pageContext ? body.pageContext : {};
  const sessionId = body && typeof body.sessionId === 'string' ? body.sessionId.trim().slice(0, 120) : '';
  const rawMessages = body && Array.isArray(body.messages) ? body.messages : [];
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
    return json({ error: 'A message is required.' }, 400);
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
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: model,
        temperature: 0.6,
        max_tokens: 350,
        messages: promptMessages
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return json({ error: 'The chatbot could not respond right now.' }, 500);
    }

    const reply = data &&
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      typeof data.choices[0].message.content === 'string'
      ? data.choices[0].message.content.trim()
      : '';

    if (!reply) {
      return json({ error: 'No reply returned from the chatbot.' }, 502);
    }

    await logChatbotConversation(
      env,
      sessionId,
      pageContext,
      context.request.headers.get('user-agent') || '',
      latestUserMessage ? latestUserMessage.content : '',
      reply
    );

    return json({ reply: reply });
  } catch (_) {
    return json({ error: 'The chatbot could not respond right now.' }, 500);
  }
}
