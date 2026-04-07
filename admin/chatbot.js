/**
 * Admin Chatbot - view recorded chatbot conversations.
 */
window.renderAdminchatbot = function (container) {
  if (!container) return;

  container.innerHTML =
    '<h2 class="admin-page-title">AI Chatbot</h2>' +
    '<div class="admin-card">' +
    '  <div class="admin-customers-header">' +
    '    <h3 style="margin:0;">Chatbot Conversations</h3>' +
    '    <button id="chatbotLoadBtn" class="admin-btn-primary" style="width:auto;padding:0.55rem 0.9rem;margin:0;">Refresh</button>' +
    '  </div>' +
    '  <p id="chatbotMeta" style="margin:0 0 12px;color:#6b7280;font-size:13px;">Loading chatbot conversations...</p>' +
    '  <div class="admin-chatbot-layout">' +
    '    <div class="admin-chatbot-sessions">' +
    '      <div id="chatbotSessionsList" class="admin-chatbot-session-list"><p class="admin-cell-empty">No conversations loaded.</p></div>' +
    '    </div>' +
    '    <div class="admin-chatbot-thread">' +
    '      <div id="chatbotThreadHeader" class="admin-chatbot-thread-header">Select a conversation to view the full thread.</div>' +
    '      <div id="chatbotMessages" class="admin-chatbot-messages"><p class="admin-cell-empty">Messages will appear here.</p></div>' +
    '    </div>' +
    '  </div>' +
    '</div>';

  var loadBtn = document.getElementById('chatbotLoadBtn');
  var meta = document.getElementById('chatbotMeta');
  var sessionsList = document.getElementById('chatbotSessionsList');
  var threadHeader = document.getElementById('chatbotThreadHeader');
  var messagesEl = document.getElementById('chatbotMessages');
  var conversations = [];
  var selectedId = '';

  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDate(str) {
    if (!str) return '—';
    var d = new Date(str);
    if (isNaN(d.getTime())) return str;
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear() + ' ' +
      String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function setMeta(text, isErr) {
    if (!meta) return;
    meta.textContent = text;
    meta.style.color = isErr ? '#b91c1c' : '#6b7280';
  }

  function renderThread(sessionId) {
    selectedId = sessionId || '';
    var convo = conversations.filter(function (item) { return item.id === selectedId; })[0];
    if (!convo) {
      threadHeader.textContent = 'Select a conversation to view the full thread.';
      messagesEl.innerHTML = '<p class="admin-cell-empty">Messages will appear here.</p>';
      return;
    }

    threadHeader.innerHTML =
      '<div><strong>' + escapeHtml(convo.page_title || convo.page_path || 'Untitled page') + '</strong></div>' +
      '<div style="margin-top:4px;color:#6b7280;font-size:13px;">' +
      'Session: ' + escapeHtml(convo.id) + ' · Last message: ' + escapeHtml(formatDate(convo.last_message_at)) +
      '</div>';

    if (!convo.messages || !convo.messages.length) {
      messagesEl.innerHTML = '<p class="admin-cell-empty">No messages recorded for this session.</p>';
    } else {
      messagesEl.innerHTML = convo.messages.map(function (message) {
        return '<div class="admin-chatbot-bubble admin-chatbot-bubble-' + escapeHtml(message.role || 'assistant') + '">' +
          '<div class="admin-chatbot-bubble-meta">' + escapeHtml((message.role || '').toUpperCase()) + ' · ' + escapeHtml(formatDate(message.created_at)) + '</div>' +
          '<div>' + escapeHtml(message.message || '') + '</div>' +
          '</div>';
      }).join('');
    }

    sessionsList.querySelectorAll('.admin-chatbot-session').forEach(function (node) {
      node.classList.toggle('is-selected', node.getAttribute('data-session-id') === selectedId);
    });
  }

  function renderSessions() {
    if (!conversations.length) {
      sessionsList.innerHTML = '<p class="admin-cell-empty">No conversations found.</p>';
      renderThread('');
      return;
    }

    sessionsList.innerHTML = conversations.map(function (convo) {
      var preview = (convo.messages && convo.messages[convo.messages.length - 1] && convo.messages[convo.messages.length - 1].message) || '';
      return '<button type="button" class="admin-chatbot-session' + (convo.id === selectedId ? ' is-selected' : '') + '" data-session-id="' + escapeHtml(convo.id) + '">' +
        '<div class="admin-chatbot-session-title">' + escapeHtml(convo.page_title || convo.page_path || 'Untitled page') + '</div>' +
        '<div class="admin-chatbot-session-meta">' + escapeHtml(formatDate(convo.last_message_at)) + '</div>' +
        '<div class="admin-chatbot-session-preview">' + escapeHtml(preview.slice(0, 120) || 'No preview available.') + '</div>' +
        '</button>';
    }).join('');

    sessionsList.querySelectorAll('.admin-chatbot-session').forEach(function (button) {
      button.addEventListener('click', function () {
        renderThread(button.getAttribute('data-session-id'));
      });
    });

    renderThread(selectedId || conversations[0].id);
  }

  async function loadConversations() {
    loadBtn.disabled = true;
    setMeta('Loading chatbot conversations...', false);

    try {
      var res = await fetch('/api/chatbot-conversations?limit=100', {
        method: 'GET'
      });
      var json = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(json.error || 'Failed to load chatbot conversations.');
      conversations = Array.isArray(json.data) ? json.data : [];
      selectedId = conversations[0] ? conversations[0].id : '';
      renderSessions();
      setMeta('Loaded ' + conversations.length + ' conversations. Source: ' + (json.source || 'unknown') + '.', false);
    } catch (err) {
      conversations = [];
      renderSessions();
      setMeta(err && err.message ? err.message : 'Unable to load chatbot conversations.', true);
    } finally {
      loadBtn.disabled = false;
    }
  }

  loadBtn.addEventListener('click', loadConversations);
  loadConversations();
};
