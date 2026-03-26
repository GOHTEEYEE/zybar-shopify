(function () {
  'use strict';

  var loadBtn = document.getElementById('loadBtn');
  var passwordInput = document.getElementById('adminPassword');
  var bodyEl = document.getElementById('inquiriesBody');
  var msgEl = document.getElementById('inquiriesMsg');

  if (!loadBtn || !passwordInput || !bodyEl) return;

  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDate(iso) {
    if (!iso) return '-';
    var d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString();
  }

  function setMessage(message, isError) {
    if (!msgEl) return;
    msgEl.textContent = message || '';
    msgEl.style.color = isError ? '#b91c1c' : '#6b7280';
  }

  async function loadInquiries() {
    var pass = (passwordInput.value || '').trim();
    if (!pass) {
      setMessage('Please enter admin password.', true);
      return;
    }

    loadBtn.disabled = true;
    setMessage('Loading...', false);
    try {
      var res = await fetch('/api/contact-inquiries', {
        method: 'GET',
        headers: { 'x-admin-password': pass }
      });
      var payload = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(payload.error || 'Unauthorized');

      var rows = Array.isArray(payload.data) ? payload.data : [];
      if (!rows.length) {
        bodyEl.innerHTML = '<tr><td colspan="6" class="inquiries-empty">No inquiries yet.</td></tr>';
      } else {
        bodyEl.innerHTML = rows.map(function (row) {
          return '<tr>' +
            '<td>' + escapeHtml(formatDate(row.created_at)) + '</td>' +
            '<td>' + escapeHtml(row.name || '-') + '</td>' +
            '<td>' + escapeHtml(row.email || '-') + '</td>' +
            '<td>' + escapeHtml(row.phone || '-') + '</td>' +
            '<td>' + escapeHtml(row.car_model_interest || '-') + '</td>' +
            '<td>' + escapeHtml(row.message || '-') + '</td>' +
            '</tr>';
        }).join('');
      }
      setMessage('Loaded ' + rows.length + ' inquiries.', false);
    } catch (err) {
      bodyEl.innerHTML = '<tr><td colspan="6" class="inquiries-empty">Unable to load inquiries.</td></tr>';
      setMessage(err && err.message ? err.message : 'Unable to load inquiries.', true);
    } finally {
      loadBtn.disabled = false;
    }
  }

  loadBtn.addEventListener('click', loadInquiries);
  passwordInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') loadInquiries();
  });
})();
