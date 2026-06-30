(function () {
  'use strict';

  function isHomePage() {
    var path = window.location.pathname || '/';
    var normalized = path.replace(/\/+$/, '') || '/';
    return normalized === '/' || normalized === '/index.html';
  }

  if (window.location.pathname.indexOf('/admin/') === 0) return;
  if (!isHomePage()) return;
  if (document.getElementById('zybar-chatbot-root')) return;

  var styles = `
    .zybar-chatbot-root {
      position: fixed;
      right: 1.35rem;
      bottom: 3.75rem;
      z-index: 60;
      font-family: "Inter", sans-serif;
    }
    .zybar-chatbot-toggle {
      min-width: 168px;
      height: 72px;
      padding: 0 1.35rem;
      border: 0;
      border-radius: 28px;
      background: #000;
      color: #fff;
      box-shadow: 0 18px 34px rgba(0, 0, 0, 0.32);
      cursor: pointer;
      font-size: 0.95rem;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.7rem;
      letter-spacing: -0.01em;
    }
    .zybar-chatbot-toggle:hover,
    .zybar-chatbot-toggle:focus-visible {
      background: #111;
      outline: none;
    }
    .zybar-chatbot-toggle-icon {
      width: 34px;
      height: 34px;
      border-radius: 999px;
      background: #fff;
      color: #000;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
    }
    .zybar-chatbot-toggle-icon svg {
      width: 20px;
      height: 20px;
      display: block;
    }
    .zybar-chatbot-toggle-label {
      font-size: 1.2rem;
      line-height: 1;
    }
    .zybar-chatbot-panel {
      position: absolute;
      right: 0;
      bottom: 86px;
      width: min(380px, calc(100vw - 2rem));
      height: min(620px, calc(100vh - 9rem));
      background: #121218;
      color: #f3f3f4;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 18px;
      box-shadow: 0 24px 60px rgba(0,0,0,0.45);
      overflow: hidden;
      display: none;
      flex-direction: column;
    }
    .zybar-chatbot-root.is-open .zybar-chatbot-panel {
      display: flex;
    }
    .zybar-chatbot-header {
      padding: 1rem 1rem 0.85rem;
      background: linear-gradient(135deg, rgba(79,124,255,0.18), rgba(168,85,247,0.12));
      border-bottom: 1px solid rgba(255,255,255,0.08);
    }
    .zybar-chatbot-title {
      margin: 0;
      font-size: 1rem;
      font-weight: 700;
    }
    .zybar-chatbot-subtitle {
      margin: 0.35rem 0 0;
      color: #b2b4bd;
      font-size: 0.84rem;
      line-height: 1.5;
    }
    .zybar-chatbot-messages {
      flex: 1;
      overflow-y: auto;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      background: #0f0f13;
    }
    .zybar-chatbot-bubble {
      max-width: 88%;
      padding: 0.8rem 0.9rem;
      border-radius: 14px;
      line-height: 1.55;
      white-space: pre-wrap;
      font-size: 0.92rem;
    }
    .zybar-chatbot-bubble.assistant {
      align-self: flex-start;
      background: #1b1c24;
      border: 1px solid rgba(255,255,255,0.06);
    }
    .zybar-chatbot-bubble.user {
      align-self: flex-end;
      background: linear-gradient(135deg, #4f7cff 0%, #7c3aed 100%);
      color: #fff;
    }
    .zybar-chatbot-prompts {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      padding: 0 1rem 1rem;
      background: #0f0f13;
    }
    .zybar-chatbot-prompt {
      border: 1px solid rgba(255,255,255,0.1);
      background: rgba(255,255,255,0.04);
      color: #f3f3f4;
      border-radius: 999px;
      padding: 0.45rem 0.75rem;
      font-size: 0.82rem;
      cursor: pointer;
    }
    .zybar-chatbot-form {
      border-top: 1px solid rgba(255,255,255,0.08);
      padding: 0.85rem;
      background: #121218;
      display: flex;
      gap: 0.6rem;
    }
    .zybar-chatbot-input {
      flex: 1;
      min-height: 46px;
      max-height: 120px;
      resize: vertical;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.08);
      background: #0c0d12;
      color: #f3f3f4;
      padding: 0.8rem 0.9rem;
      font: inherit;
    }
    .zybar-chatbot-send {
      min-width: 54px;
      border: 0;
      border-radius: 12px;
      background: #fff;
      color: #111;
      font-weight: 700;
      cursor: pointer;
      padding: 0 1rem;
    }
    .zybar-chatbot-send:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .zybar-chatbot-status {
      padding: 0 1rem 0.9rem;
      background: #121218;
      color: #b2b4bd;
      font-size: 0.78rem;
      min-height: 1rem;
    }
    @media (max-width: 640px) {
      .zybar-chatbot-root {
        right: 0.75rem;
        bottom: 2.75rem;
      }
      .zybar-chatbot-panel {
        right: 0;
        width: min(100vw - 1.5rem, 380px);
      }
      .zybar-chatbot-toggle {
        margin-left: auto;
        min-width: 154px;
        height: 66px;
        padding: 0 1.15rem;
      }
      .zybar-chatbot-toggle-label {
        font-size: 1.08rem;
      }
    }
  `;

  var styleEl = document.createElement('style');
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);

  var root = document.createElement('div');
  root.id = 'zybar-chatbot-root';
  root.className = 'zybar-chatbot-root';
  root.innerHTML = [
    '<div class="zybar-chatbot-panel" aria-live="polite">',
    '  <div class="zybar-chatbot-header">',
    '    <p class="zybar-chatbot-title">Ask ZYBAR AI</p>',
    '    <p class="zybar-chatbot-subtitle">Get product recommendations, shipping answers, and help choosing the right wall art.</p>',
    '  </div>',
    '  <div class="zybar-chatbot-messages" id="zybarChatMessages"></div>',
    '  <div class="zybar-chatbot-prompts">',
    '    <button type="button" class="zybar-chatbot-prompt">Recommend a piece for my room</button>',
    '    <button type="button" class="zybar-chatbot-prompt">What sizes do you offer?</button>',
    '    <button type="button" class="zybar-chatbot-prompt">Do you ship worldwide?</button>',
    '  </div>',
    '  <form class="zybar-chatbot-form" id="zybarChatForm">',
    '    <textarea class="zybar-chatbot-input" id="zybarChatInput" placeholder="Ask about products, shipping, or custom orders..."></textarea>',
    '    <button class="zybar-chatbot-send" id="zybarChatSend" type="submit">Send</button>',
    '  </form>',
    '  <div class="zybar-chatbot-status" id="zybarChatStatus"></div>',
    '</div>',
    '<button type="button" class="zybar-chatbot-toggle" id="zybarChatToggle" aria-label="Open chat">' +
    '  <span class="zybar-chatbot-toggle-icon" aria-hidden="true">' +
    '    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '      <path d="M12 4C7.03 4 3 7.36 3 11.5C3 13.57 4.01 15.45 5.66 16.81C5.51 18.18 4.89 19.43 4.1 20.39C4.01 20.49 4.12 20.64 4.24 20.59C6.2 19.88 7.7 19 8.59 18.38C9.66 18.74 10.81 19 12 19C16.97 19 21 15.64 21 11.5C21 7.36 16.97 4 12 4Z" fill="currentColor"/>' +
    '      <circle cx="8.5" cy="11.5" r="1.15" fill="white"/>' +
    '      <circle cx="12" cy="11.5" r="1.15" fill="white"/>' +
    '      <circle cx="15.5" cy="11.5" r="1.15" fill="white"/>' +
    '    </svg>' +
    '  </span>' +
    '  <span class="zybar-chatbot-toggle-label">Chat</span>' +
    '</button>'
  ].join('');
  document.body.appendChild(root);

  var toggle = document.getElementById('zybarChatToggle');
  var form = document.getElementById('zybarChatForm');
  var input = document.getElementById('zybarChatInput');
  var send = document.getElementById('zybarChatSend');
  var messagesEl = document.getElementById('zybarChatMessages');
  var statusEl = document.getElementById('zybarChatStatus');
  var prompts = root.querySelectorAll('.zybar-chatbot-prompt');
  var history = [];
  var sessionStorageKey = 'zybar.chat.sessionId';

  function getSessionId() {
    var existing;
    try {
      existing = window.localStorage.getItem(sessionStorageKey);
      if (existing) return existing;
    } catch (_) {}

    var generated = 'chat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    try {
      window.localStorage.setItem(sessionStorageKey, generated);
    } catch (_) {}
    return generated;
  }

  var sessionId = getSessionId();

  function appendMessage(role, content) {
    history.push({ role: role, content: content });
    var bubble = document.createElement('div');
    bubble.className = 'zybar-chatbot-bubble ' + role;
    bubble.textContent = content;
    messagesEl.appendChild(bubble);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function setStatus(text) {
    statusEl.textContent = text || '';
  }

  function openChat() {
    root.classList.add('is-open');
    setTimeout(function () {
      input.focus();
    }, 30);
  }

  function getPageContext() {
    var heading = document.querySelector('h1');
    return {
      title: document.title || '',
      path: window.location.pathname || '/',
      heading: heading ? heading.textContent.trim() : ''
    };
  }

  async function sendMessage(text) {
    var content = String(text || '').trim();
    if (!content) return;

    appendMessage('user', content);
    input.value = '';
    input.style.height = '';
    setStatus('ZYBAR AI is thinking...');
    send.disabled = true;

    try {
      var response = await fetch('/api/chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionId,
          pageContext: getPageContext(),
          messages: history.slice(-10)
        })
      });

      var contentType = (response.headers && response.headers.get && response.headers.get('content-type')) || '';
      var isJson = contentType.toLowerCase().indexOf('application/json') !== -1;
      if (!isJson) {
        throw new Error(
          'Chatbot API is not reachable (expected JSON). ' +
          'If this is deployed on Cloudflare Pages, ensure Pages Functions are enabled and that /api/chatbot is mapped to functions/api/chatbot.js.'
        );
      }

      var data = await response.json();
      if (!response.ok) {
        var errParts = [];
        if (data && data.error) errParts.push(data.error);
        if (data && data.hint) errParts.push(data.hint);
        if (data && data.openai_detail) errParts.push(data.openai_detail);
        throw new Error(errParts.length ? errParts.join(' — ') : 'Chatbot request failed.');
      }

      appendMessage('assistant', data.reply);
      setStatus('');
    } catch (error) {
      appendMessage('assistant', 'Sorry, I could not respond right now. Please try again, or use the contact page if you need immediate help.');
      setStatus(error && error.message ? error.message : 'Chatbot unavailable.');
    } finally {
      send.disabled = false;
    }
  }

  toggle.addEventListener('click', function () {
    if (root.classList.contains('is-open')) {
      root.classList.remove('is-open');
    } else {
      openChat();
    }
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    void sendMessage(input.value).catch(function () {});
  });

  input.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  input.addEventListener('input', function () {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  });

  prompts.forEach(function (button) {
    button.addEventListener('click', function () {
      openChat();
      void sendMessage(button.textContent).catch(function () {});
    });
  });

  appendMessage('assistant', 'Hi, I am the ZYBAR AI assistant. I can recommend pieces, answer shipping questions, and help with custom orders.');
})();
