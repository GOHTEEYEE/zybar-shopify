/**
 * Admin Marketing — test email + workflow automation.
 */
window.renderAdminmarketing = function (container) {
  if (!container) return;

  var hash = (window.location.hash || '#marketing/email').slice(1);
  var section = hash.split('/')[1] || 'email';

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function when(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleString();
  }

  function shellTabs(active) {
    var tabs = [
      { id: 'email', href: '#marketing/email', label: 'Email' },
      { id: 'workflows', href: '#marketing/workflows', label: 'Workflows' }
    ];
    return (
      '<nav class="admin-analytics-tabs" aria-label="Marketing">' +
      tabs
        .map(function (tab) {
          return (
            '<a class="admin-analytics-tab' +
            (tab.id === active ? ' is-active' : '') +
            '" href="' +
            tab.href +
            '">' +
            tab.label +
            '</a>'
          );
        })
        .join('') +
      '</nav>'
    );
  }

  function bindEmailForm() {
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
            var err = (result.body && result.body.error) || 'Failed to send email';
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
  }

  function renderEmailSection() {
    container.innerHTML =
      '<div class="admin-page-header">' +
      '<h2 class="admin-page-title">Email</h2>' +
      '<p class="admin-muted" style="margin:0.35rem 0 0">Send a one-off test email via Resend.</p>' +
      '</div>' +
      shellTabs('email') +
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
    bindEmailForm();
  }

  function renderWorkflowsSection() {
    container.innerHTML =
      '<div class="admin-page-header">' +
      '<h2 class="admin-page-title">Workflows</h2>' +
      '<p class="admin-muted" style="margin:0.35rem 0 0">Persistent workflow automation with durable execution history.</p>' +
      '</div>' +
      shellTabs('workflows') +
      '<div id="adminWorkflowHost"><div class="admin-loading">Loading workflows…</div></div>';

    fetch('/api/admin/workflows')
      .then(function (res) {
        return res.json().then(function (body) {
          return { ok: res.ok, body: body };
        });
      })
      .then(function (result) {
        var host = document.getElementById('adminWorkflowHost');
        if (!host) return;
        if (!result.ok) {
          host.innerHTML = '<p class="admin-error">' + esc((result.body && result.body.error) || 'Failed to load workflows') + '</p>';
          return;
        }

        var workflows = (result.body && result.body.workflows) || [];
        var executions = (result.body && result.body.executions) || [];

        var workflowRows =
          workflows
            .map(function (wf) {
              return (
                '<tr data-workflow-key="' +
                esc(wf.workflow_key) +
                '">' +
                '<td><strong>' +
                esc(wf.name) +
                '</strong></td>' +
                '<td>' +
                esc(wf.trigger_type) +
                '</td>' +
                '<td>' +
                esc(String(wf.delay_minutes || 0) + ' minutes') +
                '</td>' +
                '<td>' +
                esc((wf.condition_config && wf.condition_config.status) || wf.condition_type) +
                '</td>' +
                '<td>' +
                esc((wf.action_config && wf.action_config.template_key) || wf.action_type) +
                '</td>' +
                '<td>' +
                esc('Pending ' + (wf.stats && wf.stats.pending || 0) + ' · Running ' + (wf.stats && wf.stats.running || 0) + ' · Completed ' + (wf.stats && wf.stats.completed || 0)) +
                '</td>' +
                '<td>' +
                (wf.enabled
                  ? '<span class="admin-workflow-pill admin-workflow-pill-on">Enabled</span>'
                  : '<span class="admin-workflow-pill admin-workflow-pill-off">Disabled</span>') +
                '</td>' +
                '<td><button type="button" class="admin-btn-secondary admin-workflow-toggle" data-enabled="' +
                (wf.enabled ? '1' : '0') +
                '">' +
                (wf.enabled ? 'Disable' : 'Enable') +
                '</button></td>' +
                '</tr>'
              );
            })
            .join('') ||
          '<tr><td colspan="8" class="admin-cell-empty">No workflows configured.</td></tr>';

        var executionRows =
          executions
            .map(function (execution) {
              var logs = execution.logs || [];
              var history = logs
                .map(function (log) {
                  return (
                    '<div class="admin-workflow-log-entry">' +
                    '<span class="admin-workflow-log-time">' +
                    esc(when(log.created_at)) +
                    '</span>' +
                    '<span class="admin-workflow-log-message">' +
                    esc(log.message) +
                    '</span>' +
                    '</div>'
                  );
                })
                .join('') || '<div class="admin-cell-empty">No log history</div>';
              return (
                '<div class="admin-card admin-workflow-history-card">' +
                '<div class="admin-workflow-history-head">' +
                '<div><strong>' +
                esc((execution.workflow_definitions && execution.workflow_definitions.name) || 'Workflow') +
                '</strong><div class="admin-muted">Lead: ' +
                esc(execution.lead_email || '—') +
                '</div></div>' +
                '<div class="admin-workflow-pill admin-workflow-pill-status">' +
                esc(execution.status) +
                '</div>' +
                '</div>' +
                '<dl class="admin-dl admin-workflow-dl">' +
                '<div><dt>Scheduled</dt><dd>' + esc(when(execution.scheduled_at)) + '</dd></div>' +
                '<div><dt>Started</dt><dd>' + esc(when(execution.started_at)) + '</dd></div>' +
                '<div><dt>Completed</dt><dd>' + esc(when(execution.completed_at)) + '</dd></div>' +
                '<div><dt>Cancelled</dt><dd>' + esc(when(execution.cancelled_at)) + '</dd></div>' +
                '<div><dt>Error</dt><dd>' + esc(execution.error || '—') + '</dd></div>' +
                '</dl>' +
                '<div class="admin-workflow-log-list">' + history + '</div>' +
                '</div>'
              );
            })
            .join('') || '<div class="admin-card"><p class="admin-cell-empty">No workflow executions yet.</p></div>';

        host.innerHTML =
          '<div class="admin-card"><div class="admin-table-wrap"><table class="admin-table">' +
          '<thead><tr><th>Workflow Name</th><th>Trigger</th><th>Delay</th><th>Condition</th><th>Action</th><th>Status</th><th>Enabled</th><th></th></tr></thead>' +
          '<tbody>' +
          workflowRows +
          '</tbody></table></div></div>' +
          '<div class="admin-page-header" style="margin-top:20px;"><h3 class="admin-page-title" style="font-size:1.1rem;">Execution History</h3></div>' +
          '<div class="admin-workflow-history">' +
          executionRows +
          '</div>';

        host.querySelectorAll('.admin-workflow-toggle').forEach(function (button) {
          button.addEventListener('click', function () {
            var row = button.closest('[data-workflow-key]');
            if (!row) return;
            var workflowKey = row.getAttribute('data-workflow-key');
            var nextEnabled = button.getAttribute('data-enabled') !== '1';
            button.disabled = true;
            fetch('/api/admin/workflows', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ workflow_key: workflowKey, enabled: nextEnabled })
            })
              .then(function (res) {
                return res.json().then(function (body) {
                  return { ok: res.ok, body: body };
                });
              })
              .then(function (patchResult) {
                if (!patchResult.ok) {
                  alert((patchResult.body && patchResult.body.error) || 'Failed to update workflow');
                  return;
                }
                renderWorkflowsSection();
              })
              .catch(function () {
                alert('Failed to update workflow');
              })
              .finally(function () {
                button.disabled = false;
              });
          });
        });
      })
      .catch(function () {
        var host = document.getElementById('adminWorkflowHost');
        if (host) host.innerHTML = '<p class="admin-error">Failed to load workflows.</p>';
      });
  }

  if (section === 'email') {
    renderEmailSection();
    return;
  }
  if (section === 'workflows') {
    renderWorkflowsSection();
    return;
  }

  container.innerHTML =
    '<p class="admin-error">Unknown marketing section.</p>' +
    '<p><a href="#marketing/email">← Email</a></p>';
};
