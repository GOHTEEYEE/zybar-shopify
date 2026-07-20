/**
 * Admin Marketing — test email, campaigns, workflow automation.
 */
window.renderAdminmarketing = function (container) {
  if (!container) return;

  var hashRaw = window.location.hash || '#marketing/email';
  var hash = hashRaw.slice(1).split('?')[0];
  var parts = hash.split('/');
  var section = parts[1] || 'email';
  var prefillAudience = '';
  if (section === 'campaigns' && parts[2]) {
    prefillAudience = decodeURIComponent(parts[2]).toLowerCase();
  }
  try {
    var query = hashRaw.indexOf('?') >= 0 ? hashRaw.split('?')[1] : '';
    var params = new URLSearchParams(query);
    if (params.get('audience')) prefillAudience = String(params.get('audience')).toLowerCase();
  } catch (e) {}

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
      { id: 'campaigns', href: '#marketing/campaigns', label: 'Campaigns' },
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

  function renderCampaignsSection() {
    var state = {
      step: 1,
      audience: prefillAudience || '',
      template_key: '',
      audiences: [],
      templates: [],
      preview: null,
      sendResult: null
    };

    function audienceLabel(key) {
      var found = state.audiences.find(function (a) {
        return a.key === key;
      });
      return found ? found.label : key;
    }

    function audienceCount(key) {
      var found = state.audiences.find(function (a) {
        return a.key === key;
      });
      return found ? found.count : 0;
    }

    function stepsHtml() {
      var steps = [
        { n: 1, label: 'Audience' },
        { n: 2, label: 'Template' },
        { n: 3, label: 'Preview' },
        { n: 4, label: 'Send' }
      ];
      return (
        '<ol class="admin-campaign-steps">' +
        steps
          .map(function (s) {
            return (
              '<li class="admin-campaign-step' +
              (state.step === s.n ? ' is-active' : '') +
              (state.step > s.n ? ' is-done' : '') +
              '"><span>' +
              s.n +
              '</span>' +
              esc(s.label) +
              '</li>'
            );
          })
          .join('') +
        '</ol>'
      );
    }

    function renderHost() {
      var host = document.getElementById('adminCampaignHost');
      if (!host) return;

      var body = '';
      if (state.step === 1) {
        body =
          '<p class="admin-muted">Select a Lead Status audience. Recipient counts are computed from the latest journey status.</p>' +
          '<div class="admin-campaign-audiences">' +
          state.audiences
            .map(function (a) {
              return (
                '<button type="button" class="admin-campaign-audience' +
                (state.audience === a.key ? ' is-selected' : '') +
                '" data-audience="' +
                esc(a.key) +
                '">' +
                '<strong>' +
                esc(a.label) +
                '</strong>' +
                '<span>(' +
                esc(a.count) +
                ')</span>' +
                '</button>'
              );
            })
            .join('') +
          '</div>' +
          '<div class="admin-campaign-actions">' +
          '<button type="button" class="admin-btn-primary" id="campaignNext" ' +
          (state.audience ? '' : 'disabled') +
          '>Continue</button>' +
          '</div>';
      } else if (state.step === 2) {
        body =
          '<p class="admin-muted">Audience: <strong>' +
          esc(audienceLabel(state.audience)) +
          ' (' +
          esc(audienceCount(state.audience)) +
          ')</strong></p>' +
          '<div class="admin-campaign-templates">' +
          state.templates
            .map(function (t) {
              return (
                '<button type="button" class="admin-campaign-template' +
                (state.template_key === t.key ? ' is-selected' : '') +
                '" data-template="' +
                esc(t.key) +
                '">' +
                '<strong>' +
                esc(t.name) +
                '</strong>' +
                '<span>' +
                esc(t.description || '') +
                '</span>' +
                '</button>'
              );
            })
            .join('') +
          '</div>' +
          '<div class="admin-campaign-actions">' +
          '<button type="button" class="admin-btn-secondary" id="campaignBack">Back</button>' +
          '<button type="button" class="admin-btn-primary" id="campaignNext" ' +
          (state.template_key ? '' : 'disabled') +
          '>Continue to Preview</button>' +
          '</div>';
      } else if (state.step === 3) {
        var preview = state.preview || {};
        body =
          '<div class="admin-campaign-summary">' +
          '<div><span class="admin-muted">Audience</span><strong>' +
          esc(preview.audience_label || audienceLabel(state.audience)) +
          ' (' +
          esc(preview.recipient_count != null ? preview.recipient_count : audienceCount(state.audience)) +
          ')</strong></div>' +
          '<div><span class="admin-muted">Template</span><strong>' +
          esc((preview.template && preview.template.name) || state.template_key) +
          '</strong></div>' +
          '<div><span class="admin-muted">Sample recipient</span><strong>' +
          esc((preview.preview && preview.preview.sample_email) || '—') +
          '</strong></div>' +
          '</div>' +
          '<div class="admin-card admin-campaign-preview-card">' +
          '<div class="admin-muted" style="margin-bottom:0.5rem">Subject</div>' +
          '<div class="admin-campaign-preview-subject">' +
          esc((preview.preview && preview.preview.subject) || '—') +
          '</div>' +
          '<div class="admin-muted" style="margin:1rem 0 0.5rem">HTML preview</div>' +
          '<iframe class="admin-campaign-preview-frame" title="Email preview" sandbox="" srcdoc="' +
          esc((preview.preview && preview.preview.html) || '<p>No preview</p>') +
          '"></iframe>' +
          '</div>' +
          '<div class="admin-campaign-actions">' +
          '<button type="button" class="admin-btn-secondary" id="campaignBack">Back</button>' +
          '<button type="button" class="admin-btn-primary" id="campaignNext">Continue to Send</button>' +
          '</div>';
      } else {
        var result = state.sendResult;
        body =
          '<div class="admin-campaign-summary">' +
          '<div><span class="admin-muted">Audience</span><strong>' +
          esc(audienceLabel(state.audience)) +
          ' (' +
          esc(audienceCount(state.audience)) +
          ')</strong></div>' +
          '<div><span class="admin-muted">Template</span><strong>' +
          esc(state.template_key) +
          '</strong></div>' +
          '</div>' +
          '<p class="admin-muted">Status is re-checked for every lead immediately before send. Leads that no longer match this audience are skipped.</p>' +
          (result
            ? '<div class="admin-card"><p class="admin-email-status admin-email-status-ok">Sent ' +
              esc(result.sent) +
              ' · Skipped ' +
              esc(result.skipped) +
              ' · Failed ' +
              esc(result.failed) +
              '</p></div>'
            : '') +
          '<div class="admin-campaign-actions">' +
          '<button type="button" class="admin-btn-secondary" id="campaignBack">Back</button>' +
          '<button type="button" class="admin-btn-primary" id="campaignSendNow">' +
          (result ? 'Send Again' : 'Send Now') +
          '</button>' +
          '</div>' +
          '<p id="adminCampaignStatus" class="admin-email-status" role="status" aria-live="polite"></p>';
      }

      host.innerHTML = stepsHtml() + '<div class="admin-card admin-campaign-card">' + body + '</div>';
      bindHost();
    }

    function bindHost() {
      var host = document.getElementById('adminCampaignHost');
      if (!host) return;

      host.querySelectorAll('[data-audience]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          state.audience = btn.getAttribute('data-audience') || '';
          state.preview = null;
          state.sendResult = null;
          renderHost();
        });
      });

      host.querySelectorAll('[data-template]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          state.template_key = btn.getAttribute('data-template') || '';
          state.preview = null;
          state.sendResult = null;
          renderHost();
        });
      });

      var back = document.getElementById('campaignBack');
      if (back) {
        back.addEventListener('click', function () {
          state.step = Math.max(1, state.step - 1);
          renderHost();
        });
      }

      var next = document.getElementById('campaignNext');
      if (next) {
        next.addEventListener('click', function () {
          if (state.step === 1 && state.audience) {
            state.step = 2;
            renderHost();
            return;
          }
          if (state.step === 2 && state.template_key) {
            next.disabled = true;
            next.textContent = 'Loading preview…';
            fetch('/api/admin/campaigns/preview', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ audience: state.audience, template_key: state.template_key })
            })
              .then(function (res) {
                return res.json().then(function (body) {
                  return { ok: res.ok, body: body };
                });
              })
              .then(function (result) {
                if (!result.ok || !result.body || !result.body.success) {
                  alert((result.body && result.body.error) || 'Failed to preview campaign');
                  renderHost();
                  return;
                }
                state.preview = result.body;
                if (result.body.recipient_count != null) {
                  state.audiences = state.audiences.map(function (a) {
                    if (a.key === state.audience) {
                      return Object.assign({}, a, { count: result.body.recipient_count });
                    }
                    return a;
                  });
                }
                state.step = 3;
                renderHost();
              })
              .catch(function () {
                alert('Failed to preview campaign');
                renderHost();
              });
            return;
          }
          if (state.step === 3) {
            state.step = 4;
            renderHost();
          }
        });
      }

      var sendBtn = document.getElementById('campaignSendNow');
      if (sendBtn) {
        sendBtn.addEventListener('click', function () {
          var statusEl = document.getElementById('adminCampaignStatus');
          var count = audienceCount(state.audience);
          if (
            !window.confirm(
              'Send "' +
                state.template_key +
                '" to ' +
                audienceLabel(state.audience) +
                ' (' +
                count +
                ' leads)? Status will be re-checked before each send.'
            )
          ) {
            return;
          }
          sendBtn.disabled = true;
          sendBtn.textContent = 'Sending…';
          if (statusEl) {
            statusEl.textContent = '';
            statusEl.className = 'admin-email-status';
          }
          fetch('/api/admin/campaigns/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audience: state.audience, template_key: state.template_key })
          })
            .then(function (res) {
              return res.json().then(function (body) {
                return { ok: res.ok, body: body };
              });
            })
            .then(function (result) {
              if (!result.ok || !result.body || !result.body.success) {
                if (statusEl) {
                  statusEl.textContent =
                    '❌ ' + ((result.body && result.body.error) || 'Campaign send failed');
                  statusEl.className = 'admin-email-status admin-email-status-err';
                }
                sendBtn.disabled = false;
                sendBtn.textContent = 'Send Now';
                return;
              }
              state.sendResult = result.body;
              renderHost();
              var after = document.getElementById('adminCampaignStatus');
              if (after) {
                after.textContent =
                  '✅ Sent ' +
                  result.body.sent +
                  ' emails (' +
                  result.body.skipped +
                  ' skipped, ' +
                  result.body.failed +
                  ' failed)';
                after.className = 'admin-email-status admin-email-status-ok';
              }
            })
            .catch(function () {
              if (statusEl) {
                statusEl.textContent = '❌ Campaign send failed';
                statusEl.className = 'admin-email-status admin-email-status-err';
              }
              sendBtn.disabled = false;
              sendBtn.textContent = 'Send Now';
            });
        });
      }
    }

    container.innerHTML =
      '<div class="admin-page-header">' +
      '<h2 class="admin-page-title">Campaigns</h2>' +
      '<p class="admin-muted" style="margin:0.35rem 0 0">Send a template to a Lead Status audience.</p>' +
      '</div>' +
      shellTabs('campaigns') +
      '<div id="adminCampaignHost"><div class="admin-loading">Loading audiences…</div></div>';

    var bootstrapUrl = '/api/admin/campaigns';
    if (prefillAudience) bootstrapUrl += '?audience=' + encodeURIComponent(prefillAudience);

    fetch(bootstrapUrl)
      .then(function (res) {
        return res.json().then(function (body) {
          return { ok: res.ok, body: body };
        });
      })
      .then(function (result) {
        var host = document.getElementById('adminCampaignHost');
        if (!host) return;
        if (!result.ok) {
          host.innerHTML =
            '<p class="admin-error">' +
            esc((result.body && result.body.error) || 'Failed to load campaigns') +
            '</p>';
          return;
        }
        state.audiences = (result.body && result.body.audiences) || [];
        state.templates = (result.body && result.body.templates) || [];
        if (result.body && result.body.preferred_audience) {
          state.audience = result.body.preferred_audience;
        }
        renderHost();
      })
      .catch(function () {
        var host = document.getElementById('adminCampaignHost');
        if (host) host.innerHTML = '<p class="admin-error">Failed to load campaigns.</p>';
      });
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
          host.innerHTML =
            '<p class="admin-error">' +
            esc((result.body && result.body.error) || 'Failed to load workflows') +
            '</p>';
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
                esc(
                  'Pending ' +
                    ((wf.stats && wf.stats.pending) || 0) +
                    ' · Running ' +
                    ((wf.stats && wf.stats.running) || 0) +
                    ' · Completed ' +
                    ((wf.stats && wf.stats.completed) || 0)
                ) +
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
              var history =
                logs
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
                '<div><dt>Scheduled</dt><dd>' +
                esc(when(execution.scheduled_at)) +
                '</dd></div>' +
                '<div><dt>Started</dt><dd>' +
                esc(when(execution.started_at)) +
                '</dd></div>' +
                '<div><dt>Completed</dt><dd>' +
                esc(when(execution.completed_at)) +
                '</dd></div>' +
                '<div><dt>Cancelled</dt><dd>' +
                esc(when(execution.cancelled_at)) +
                '</dd></div>' +
                '<div><dt>Error</dt><dd>' +
                esc(execution.error || '—') +
                '</dd></div>' +
                '</dl>' +
                '<div class="admin-workflow-log-list">' +
                history +
                '</div>' +
                '</div>'
              );
            })
            .join('') ||
          '<div class="admin-card"><p class="admin-cell-empty">No workflow executions yet.</p></div>';

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
  if (section === 'campaigns' || section === 'campaign') {
    renderCampaignsSection();
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
