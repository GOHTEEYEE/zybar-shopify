/**
 * Admin Marketing — test email only.
 */
window.renderAdminmarketing = function (container) {
  if (!container) return;

  var hash = (window.location.hash || '#marketing/email').slice(1);
  var section = hash.split('/')[1] || 'email';

  if (section !== 'email') {
    container.innerHTML =
      '<p class="admin-error">Unknown marketing section.</p>' +
      '<p><a href="#marketing/email">← Email</a></p>';
    return;
  }

  container.innerHTML =
    '<div class="admin-page-header">' +
    '<h2 class="admin-page-title">Email</h2>' +
    '<p class="admin-muted" style="margin:0.35rem 0 0">Send a one-off test email via Resend.</p>' +
    '</div>' +
    '<div class="admin-card admin-email-card">' +
    '<form id="adminEmailTestForm" class="admin-email-form">' +
    '<div class="admin-form-group">' +
    '<label for="adminEmailTo">Recipient Email</label>' +
    '<input type="email" id="adminEmailTo" name="to" placeholder="you@example.com" required autocomplete="email" />' +
    '</div>' +
    '<div class="admin-form-group">' +
    '<label for="adminEmailSubject">Subject</label>' +
    '<input type="text" id="adminEmailSubject" name="subject" placeholder="ZYBAR Test Email" required />' +
    '</div>' +
    '<div class="admin-form-group">' +
    '<label for="adminEmailHtml">HTML Message</label>' +
    '<textarea id="adminEmailHtml" name="html" rows="12" placeholder="<p>Hello from ZYBAR</p>" required></textarea>' +
    '</div>' +
    '<button type="submit" class="admin-btn-primary" id="adminEmailSendBtn">Send Test Email</button>' +
    '<p id="adminEmailStatus" class="admin-email-status" role="status" aria-live="polite"></p>' +
    '</form>' +
    '</div>';

  var form = document.getElementById('adminEmailTestForm');
  var statusEl = document.getElementById('adminEmailStatus');
  var sendBtn = document.getElementById('adminEmailSendBtn');

  function setStatus(message, isSuccess) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className =
      'admin-email-status ' + (isSuccess ? 'admin-email-status-ok' : 'admin-email-status-err');
  }

  if (!form) return;

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var to = document.getElementById('adminEmailTo').value.trim();
    var subject = document.getElementById('adminEmailSubject').value.trim();
    var html = document.getElementById('adminEmailHtml').value.trim();

    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.textContent = 'Sending…';
    }
    setStatus('', false);

    fetch('/api/admin/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: to, subject: subject, html: html })
    })
      .then(function (res) {
        return res.json().then(function (body) {
          return { ok: res.ok, body: body };
        });
      })
      .then(function (result) {
        if (result.ok && result.body && result.body.success) {
          setStatus('✅ Email sent successfully', true);
        } else {
          var err =
            (result.body && result.body.error) || 'Failed to send email';
          setStatus('❌ Failed to send email — ' + err, false);
        }
      })
      .catch(function () {
        setStatus('❌ Failed to send email', false);
      })
      .finally(function () {
        if (sendBtn) {
          sendBtn.disabled = false;
          sendBtn.textContent = 'Send Test Email';
        }
      });
  });
};
