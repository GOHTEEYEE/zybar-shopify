/**
 * Admin Inquiries - view contact form submissions.
 * Uses backend /api/contact-inquiries (Supabase first, local fallback).
 */
window.renderAdmininquiries = function (container) {
  if (!container) return;

  container.innerHTML =
    '<h2 class="admin-page-title">Inquiries</h2>' +
    '<div class="admin-card">' +
    '  <div class="admin-customers-header">' +
    '    <h3 style="margin:0;">Contact Requests</h3>' +
    '    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
    '      <input type="password" id="inquiriesAdminPass" class="admin-search-input" placeholder="Admin inquiries password" style="max-width:260px;" />' +
    '      <button id="inquiriesLoadBtn" class="admin-btn-primary" style="width:auto;padding:0.55rem 0.9rem;margin:0;">Load</button>' +
    '    </div>' +
    '  </div>' +
    '  <p id="inquiriesMeta" style="margin:0 0 10px;color:#6b7280;font-size:13px;">Enter password to load submissions.</p>' +
    '  <div class="admin-table-wrap">' +
    '    <table class="admin-table admin-table-customers">' +
    '      <thead><tr>' +
    '        <th>Created</th>' +
    '        <th>Name</th>' +
    '        <th>Email</th>' +
    '        <th>Phone</th>' +
    '        <th>Car Model Interest</th>' +
    '        <th>Message</th>' +
    '      </tr></thead>' +
    '      <tbody id="inquiriesTableBody"><tr><td colspan="6" class="admin-cell-empty">No data loaded.</td></tr></tbody>' +
    '    </table>' +
    '  </div>' +
    '</div>';

  var passInput = document.getElementById('inquiriesAdminPass');
  var loadBtn = document.getElementById('inquiriesLoadBtn');
  var tbody = document.getElementById('inquiriesTableBody');
  var meta = document.getElementById('inquiriesMeta');

  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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

  async function loadInquiries() {
    var pass = (passInput && passInput.value || '').trim();
    if (!pass) {
      setMeta('Please enter admin inquiries password.', true);
      return;
    }
    loadBtn.disabled = true;
    setMeta('Loading inquiries...', false);
    try {
      var res = await fetch('/api/contact-inquiries', {
        method: 'GET',
        headers: { 'x-admin-password': pass }
      });
      var json = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(json.error || 'Failed to load inquiries.');
      var data = Array.isArray(json.data) ? json.data : [];
      if (!data.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="admin-cell-empty">No inquiries yet.</td></tr>';
      } else {
        tbody.innerHTML = data.map(function (r) {
          return '<tr>' +
            '<td>' + escapeHtml(formatDate(r.created_at)) + '</td>' +
            '<td class="admin-cell-name">' + escapeHtml(r.name || '-') + '</td>' +
            '<td>' + escapeHtml(r.email || '-') + '</td>' +
            '<td>' + escapeHtml(r.phone || '-') + '</td>' +
            '<td>' + escapeHtml(r.car_model_interest || '-') + '</td>' +
            '<td style="max-width:260px;white-space:normal;">' + escapeHtml(r.message || '-') + '</td>' +
            '</tr>';
        }).join('');
      }
      setMeta('Loaded ' + data.length + ' inquiries. Source: ' + (json.source || 'unknown') + '.', false);
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="6" class="admin-cell-empty">Unable to load inquiries.</td></tr>';
      setMeta(err && err.message ? err.message : 'Unable to load inquiries.', true);
    } finally {
      loadBtn.disabled = false;
    }
  }

  if (loadBtn) loadBtn.addEventListener('click', loadInquiries);
  if (passInput) {
    passInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') loadInquiries();
    });
  }
};
