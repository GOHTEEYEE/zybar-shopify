/**
 * Admin Marketing — Marketing Automation Center.
 * Sections: Overview, Journeys, Audience, Campaigns, Templates, Analytics, Settings.
 * Legacy: Queue → Overview upcoming; Email Leads → Audience.
 */
window.renderAdminmarketing = function (container) {
  if (!container) return;

  var hashRaw = window.location.hash || '#marketing/overview';
  var hash = hashRaw.slice(1).split('?')[0];
  var parts = hash.split('/');
  var section = parts[1] || 'overview';

  // Legacy aliases
  if (section === 'email' || section === 'workflows') section = 'journeys';
  if (section === 'leads' || section === 'email-leads') section = 'audience';
  if (section === 'queue') section = 'overview';
  if (section === 'campaign') section = 'campaigns';
  if (section === 'history') section = 'analytics';

  var MC = window.AdminMarketingCenter;

  var queryParams = {};
  try {
    var query = hashRaw.indexOf('?') >= 0 ? hashRaw.split('?')[1] : '';
    var params = new URLSearchParams(query);
    params.forEach(function (v, k) {
      queryParams[k] = v;
    });
  } catch (e) {}

  var editJourneyId =
    section === 'journeys' && (parts[2] === 'edit' || parts[2] === 'open') && parts[3]
      ? parts[3]
      : section === 'journeys' && parts[2] && parts[2] !== 'edit' && parts[2] !== 'new' && parts[2] !== 'scheduled'
        ? parts[2]
        : '';
  if (section === 'journeys' && parts[2] === 'new') editJourneyId = 'new';

  var editTemplateId =
    section === 'templates' && parts[2] === 'edit' && parts[3]
      ? parts[3]
      : section === 'templates' && parts[2] === 'new'
        ? 'new'
        : '';

  var audienceProfileId =
    section === 'audience' && parts[2] && parts[2] !== 'edit' ? decodeURIComponent(parts[2]) : null;

  var prefillAudience = '';
  if (section === 'campaigns' && parts[2]) {
    prefillAudience = decodeURIComponent(parts[2]).toLowerCase();
  }
  if (queryParams.audience) prefillAudience = String(queryParams.audience).toLowerCase();
  if (queryParams.status) prefillAudience = String(queryParams.status).toLowerCase();

  // New Marketing Center pages
  if (MC) {
    if (section === 'overview') return MC.renderOverview(container);
    if (section === 'audience') {
      return MC.renderAudience(container, {
        segment: queryParams.segment || '',
        journey: queryParams.journey || queryParams.journey_key || '',
        q: queryParams.q || '',
        profileId: audienceProfileId
      });
    }
    if (section === 'analytics') return MC.renderAnalytics(container);
    if (section === 'settings') return MC.renderSettings(container);
  }

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

  function queueDisplayStatus(status, scheduledAt) {
    var s = String(status || '').toLowerCase();
    if (s === 'pending') {
      var at = scheduledAt ? new Date(scheduledAt).getTime() : 0;
      if (at && at <= Date.now()) return 'due';
      return 'waiting';
    }
    return s || '—';
  }

  function statusPill(status, scheduledAt) {
    var label = queueDisplayStatus(status, scheduledAt);
    var cls = 'admin-workflow-pill admin-workflow-pill-status';
    if (label === 'waiting' || label === 'scheduled' || label === 'draft') {
      cls += ' admin-journey-pill-wait';
    } else if (
      label === 'due' ||
      label === 'ready' ||
      label === 'executing' ||
      label === 'active' ||
      label === 'published'
    ) {
      cls += ' admin-journey-pill-due';
    } else if (label === 'completed' || label === 'cancelled' || label === 'partial') {
      cls += ' admin-journey-pill-cyan';
    } else {
      cls += ' admin-journey-pill-off';
    }
    return '<span class="' + cls + '">' + esc(label) + '</span>';
  }

  function engagePill(label, cls) {
    return '<span class="admin-engage-pill ' + cls + '">' + esc(label) + '</span>';
  }

  function rate(part, whole) {
    var p = Number(part) || 0;
    var w = Number(whole) || 0;
    if (w <= 0) return '';
    return ' (' + Math.round((p / w) * 100) + '%)';
  }

  /** Open/click engagement cell for History rows (campaign + journey email). */
  function engagementCell(row) {
    var m = (row && row.metadata) || {};
    if (row.event_type === 'campaign_send') {
      var sent = Number(m.sent_count) || 0;
      var opened = Number(m.opened_count) || 0;
      var clicked = Number(m.clicked_count) || 0;
      if (!sent) return '<span class="admin-muted">—</span>';
      return (
        engagePill('Opened ' + opened + rate(opened, sent), 'admin-engage-open') +
        ' ' +
        engagePill('Clicked ' + clicked + rate(clicked, sent), 'admin-engage-click')
      );
    }
    if (row.source === 'queue' && m.action_type === 'email' && row.status === 'completed') {
      var openParts = [];
      openParts.push(
        m.opened_at
          ? engagePill('Opened' + (m.open_count > 1 ? ' ×' + m.open_count : ''), 'admin-engage-open')
          : engagePill('Not opened', 'admin-engage-none')
      );
      if (m.clicked_at) {
        openParts.push(
          engagePill('Clicked' + (m.click_count > 1 ? ' ×' + m.click_count : ''), 'admin-engage-click')
        );
      }
      return openParts.join(' ');
    }
    return '<span class="admin-muted">—</span>';
  }

  function fetchJson(url, options) {
    return fetch(url, options || {}).then(function (res) {
      return res.json().then(function (body) {
        return { ok: res.ok, body: body };
      });
    });
  }

  function pageHeader(title, subtitle, actionsHtml) {
    var nav = MC && MC.subnav ? MC.subnav(section) : '';
    return (
      nav +
      '<div class="admin-page-header mkt-page-head">' +
      '<div class="admin-page-header-row">' +
      '<div><h2 class="admin-page-title">' +
      esc(title) +
      '</h2>' +
      (subtitle
        ? '<p class="admin-muted" style="margin:0.35rem 0 0">' + subtitle + '</p>'
        : '') +
      '</div>' +
      (actionsHtml || '') +
      '</div></div>'
    );
  }

  function openRunWorkflowModal(journey) {
    var existing = document.getElementById('adminRunWorkflowModal');
    if (existing) existing.remove();
    var modal = document.createElement('div');
    modal.id = 'adminRunWorkflowModal';
    modal.className = 'admin-run-workflow-backdrop';
    modal.innerHTML =
      '<section class="admin-run-workflow-modal" role="dialog" aria-modal="true" aria-labelledby="runWorkflowTitle">' +
      '<div class="admin-run-workflow-head"><div>' +
      '<p class="admin-run-workflow-kicker">Test Workflow</p>' +
      '<h3 id="runWorkflowTitle">Test ' +
      esc(journey.name || 'Workflow') +
      '</h3></div>' +
      '<button type="button" class="admin-run-workflow-close" aria-label="Close">×</button></div>' +
      '<p class="admin-muted">Enter one email per line. Existing leads move into this journey; new addresses become isolated test leads. Every email is generated and sent through the normal Action Queue.</p>' +
      '<label class="admin-run-workflow-label" for="runWorkflowEmails">Email addresses</label>' +
      '<textarea id="runWorkflowEmails" class="admin-run-workflow-emails" rows="7" placeholder="john@gmail.com&#10;mary@gmail.com&#10;amy@gmail.com"></textarea>' +
      '<div id="runWorkflowResults" class="admin-run-workflow-results" role="status"></div>' +
      '<div class="admin-run-workflow-actions">' +
      '<button type="button" class="admin-btn-secondary admin-run-workflow-cancel">Cancel</button>' +
      '<button type="button" class="admin-btn-primary admin-run-workflow-submit">Test Workflow</button>' +
      '</div></section>';
    document.body.appendChild(modal);

    var textarea = modal.querySelector('#runWorkflowEmails');
    var submit = modal.querySelector('.admin-run-workflow-submit');
    var results = modal.querySelector('#runWorkflowResults');

    function close() {
      modal.remove();
      document.removeEventListener('keydown', onKeydown);
    }
    function onKeydown(event) {
      if (event.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKeydown);
    modal.querySelector('.admin-run-workflow-close').addEventListener('click', close);
    modal.querySelector('.admin-run-workflow-cancel').addEventListener('click', close);
    modal.addEventListener('click', function (event) {
      if (event.target === modal) close();
    });
    submit.addEventListener('click', function () {
      var emails = textarea.value
        .split(/[\n,;]+/)
        .map(function (email) {
          return email.trim();
        })
        .filter(Boolean);
      if (!emails.length) {
        results.innerHTML = '<p class="admin-error">Enter at least one email address.</p>';
        textarea.focus();
        return;
      }
      submit.disabled = true;
      submit.textContent = 'Running…';
      results.innerHTML = '<div class="admin-loading">Starting workflow tests…</div>';
      fetchJson('/api/admin/journeys/' + encodeURIComponent(journey.id) + '/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: emails })
      })
        .then(function (response) {
          if (!response.ok) {
            results.innerHTML =
              '<p class="admin-error">' +
              esc((response.body && response.body.error) || 'Workflow test failed.') +
              '</p>';
            return;
          }
          var body = response.body || {};
          results.innerHTML =
            '<p class="admin-run-workflow-summary">Succeeded ' +
            esc(body.succeeded || 0) +
            ' of ' +
            esc(body.requested || emails.length) +
            '</p><ul class="admin-run-workflow-result-list">' +
            (body.results || [])
              .map(function (item) {
                return (
                  '<li><span>' +
                  esc(item.email) +
                  '</span>' +
                  statusPill(item.status || (item.ok ? 'completed' : 'failed')) +
                  (item.error ? '<small>' + esc(item.error) + '</small>' : '') +
                  '</li>'
                );
              })
              .join('') +
            '</ul>';
        })
        .catch(function () {
          results.innerHTML = '<p class="admin-error">Workflow test failed.</p>';
        })
        .finally(function () {
          submit.disabled = false;
          submit.textContent = 'Test Again';
        });
    });
    setTimeout(function () {
      textarea.focus();
    }, 0);
  }

  /* ========== Customer Journey cards ========== */
  function renderJourneysHome() {
    container.innerHTML =
      pageHeader(
        'Journeys',
        'Automated lifecycle flows. Scheduled sends live inside each journey — not a separate “queue of leads.”',
        '<div class="mkt-head-actions">' +
          '<button type="button" class="admin-btn-secondary" id="mktJourneyExec">Execute Due Sends</button>' +
          '<a class="admin-btn-primary" href="#marketing/journeys/new">New Journey</a></div>'
      ) +
      '<div class="admin-journey-toolbar admin-card">' +
      '<label><input type="checkbox" id="journeyShowArchived" /> Show archived</label>' +
      '</div>' +
      '<div id="adminJourneyCards"><div class="admin-loading">Loading journeys…</div></div>';

    var execBtn = document.getElementById('mktJourneyExec');
    if (execBtn) {
      execBtn.addEventListener('click', function () {
        if (
          !window.confirm(
            'Promote due steps and send ALL pending due emails via Resend? This may take a minute.'
          )
        )
          return;
        execBtn.disabled = true;
        execBtn.textContent = 'Sending all due…';
        fetchJson('/api/admin/journey-queue/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ limit: 25, promote_limit: 100, max_rounds: 20 })
        }).then(function (r) {
          execBtn.disabled = false;
          execBtn.textContent = 'Execute Due Sends';
          if (!r.ok) alert((r.body && r.body.error) || 'Execute failed');
          else {
            var b = r.body || {};
            alert(
              'Done. Completed ' +
                (b.completed || 0) +
                ', failed ' +
                (b.failed || 0) +
                ', cancelled ' +
                (b.cancelled || 0)
            );
            loadJourneys();
          }
        });
      });
    }

    function loadJourneys() {
      var showArchived = !!(
        document.getElementById('journeyShowArchived') &&
        document.getElementById('journeyShowArchived').checked
      );
      fetchJson('/api/admin/journeys').then(function (result) {
        var host = document.getElementById('adminJourneyCards');
        if (!host) return;
        if (!result.ok) {
          host.innerHTML =
            '<p class="admin-error">' + esc((result.body && result.body.error) || 'Failed') + '</p>';
          return;
        }
        var journeys = ((result.body && result.body.journeys) || []).filter(function (j) {
          var journeyStatus = j.status || (j.is_active ? 'published' : 'draft');
          if (showArchived) return true;
          return journeyStatus !== 'archived';
        });
        if (!journeys.length) {
          host.innerHTML =
            '<div class="admin-card"><p class="admin-cell-empty">' +
            (showArchived
              ? 'No journeys yet. Create your first journey.'
              : 'No active journeys. Turn on “Show archived” to see archived ones, or create a new journey.') +
            '</p></div>';
          return;
        }

        host.innerHTML =
          '<div class="admin-journey-card-grid">' +
          journeys
            .map(function (j) {
              var es = j.enroll_stats || {};
              var activeLeads = (es.waiting || 0) + (es.ready || 0);
              var steps = (j.steps || []).length;
              var journeyStatus = j.status || (j.is_active ? 'published' : 'draft');
              return (
                '<article class="admin-card admin-journey-card" data-id="' +
                esc(j.id) +
                '">' +
                '<div class="admin-journey-card-top">' +
                '<h3>' +
                esc(j.name) +
                '</h3>' +
                statusPill(journeyStatus) +
                '</div>' +
                '<dl class="admin-dl admin-journey-card-meta">' +
                '<div><dt>Trigger</dt><dd>' +
                esc(j.trigger_type) +
                '</dd></div>' +
                '<div><dt>Steps</dt><dd>' +
                esc(steps) +
                '</dd></div>' +
                '<div><dt>Waiting</dt><dd>' +
                esc(es.waiting || 0) +
                '</dd></div>' +
                '<div><dt>Completed</dt><dd>' +
                esc(es.completed || 0) +
                '</dd></div>' +
                '<div><dt>Cancelled</dt><dd>' +
                esc(es.cancelled || 0) +
                '</dd></div>' +
                '<div><dt>Scheduled sends</dt><dd>' +
                esc((j.queue_stats && j.queue_stats.pending) || 0) +
                '</dd></div>' +
                '</dl>' +
                '<p class="admin-muted admin-journey-card-desc">' +
                esc(j.description || '') +
                '</p>' +
                '<div class="admin-journey-card-actions">' +
                (journeyStatus !== 'archived'
                  ? '<button type="button" class="admin-btn-secondary jc-run">Test Workflow</button>'
                  : '') +
                '<a class="admin-btn-primary" href="#marketing/journeys/edit/' +
                esc(j.id) +
                '">Open</a>' +
                '<button type="button" class="admin-btn-secondary jc-dup">Duplicate</button>' +
                '<button type="button" class="admin-btn-secondary jc-toggle" data-status="' +
                esc(journeyStatus) +
                '">' +
                (journeyStatus === 'published'
                  ? 'Move to Draft'
                  : journeyStatus === 'archived'
                    ? 'Restore Draft'
                    : 'Publish') +
                '</button>' +
                (journeyStatus !== 'archived'
                  ? '<button type="button" class="admin-btn-danger jc-del">Archive</button>'
                  : '') +
                '<button type="button" class="admin-btn-danger jc-purge">Delete</button>' +
                '</div></article>'
              );
            })
            .join('') +
          '</div>';

        host.querySelectorAll('.jc-run').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var id = btn.closest('[data-id]').getAttribute('data-id');
            var journey = journeys.filter(function (item) {
              return item.id === id;
            })[0];
            if (journey) openRunWorkflowModal(journey);
          });
        });

        host.querySelectorAll('.jc-dup').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var id = btn.closest('[data-id]').getAttribute('data-id');
            btn.disabled = true;
            fetchJson('/api/admin/journeys/' + encodeURIComponent(id) + '/duplicate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: '{}'
            }).then(function (r) {
              if (r.ok && r.body.journey) {
                window.location.hash = '#marketing/journeys/edit/' + r.body.journey.id;
              } else {
                alert((r.body && r.body.error) || 'Duplicate failed');
                btn.disabled = false;
              }
            });
          });
        });

        host.querySelectorAll('.jc-toggle').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var id = btn.closest('[data-id]').getAttribute('data-id');
            var current = btn.getAttribute('data-status');
            var next = current === 'published' ? 'draft' : 'published';
            if (current === 'archived') next = 'draft';
            btn.disabled = true;
            fetchJson('/api/admin/journeys/' + encodeURIComponent(id), {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: next })
            }).then(function () {
              loadJourneys();
            });
          });
        });

        host.querySelectorAll('.jc-del').forEach(function (btn) {
          btn.addEventListener('click', function () {
            if (
              !window.confirm(
                'Archive this journey? Existing history and active customer progress will be preserved.'
              )
            ) {
              return;
            }
            var id = btn.closest('[data-id]').getAttribute('data-id');
            btn.disabled = true;
            fetchJson('/api/admin/journeys/' + encodeURIComponent(id), { method: 'DELETE' }).then(
              function (r) {
                if (!r.ok) alert((r.body && r.body.error) || 'Archive failed');
                loadJourneys();
              }
            );
          });
        });

        host.querySelectorAll('.jc-purge').forEach(function (btn) {
          btn.addEventListener('click', function () {
            if (
              !window.confirm(
                'Permanently delete this journey?\n\nThis also removes its enrollments and queued actions. Marketing send history is kept (journey link cleared). Core Welcome / Cart / Purchase / Win Back journeys cannot be deleted.'
              )
            ) {
              return;
            }
            var id = btn.closest('[data-id]').getAttribute('data-id');
            btn.disabled = true;
            fetchJson('/api/admin/journeys/' + encodeURIComponent(id) + '?permanent=1', {
              method: 'DELETE'
            }).then(function (r) {
              if (!r.ok) {
                alert((r.body && r.body.error) || 'Delete failed');
                btn.disabled = false;
                return;
              }
              loadJourneys();
            });
          });
        });
      });
    }

    var showArchivedEl = document.getElementById('journeyShowArchived');
    if (showArchivedEl) {
      showArchivedEl.addEventListener('change', loadJourneys);
    }
    loadJourneys();
  }

  /* ========== Journey Editor ========== */
  function renderJourneyEditor(journeyId) {
    var isNew = journeyId === 'new';
    container.innerHTML =
      '<div id="adminJourneyEditor"><div class="admin-loading">Loading journey builder…</div></div>';

    var metaP = fetchJson('/api/admin/journeys');
    var workP = isNew
      ? Promise.resolve({ ok: true, body: null })
      : fetchJson('/api/admin/journeys/' + encodeURIComponent(journeyId) + '/workspace');

    Promise.all([metaP, workP]).then(function (results) {
      var host = document.getElementById('adminJourneyEditor');
      if (!host) return;
      if (!results[0].ok) {
        host.innerHTML = '<p class="admin-error">Failed to load journey builder.</p>';
        return;
      }
      var meta = results[0].body || {};
      var workspace = results[1].body;
      if (!isNew && (!results[1].ok || !workspace)) {
        host.innerHTML = '<p class="admin-error">Journey not found.</p>';
        return;
      }

      if (!window.JourneyBuilder || !window.JourneyBuilder.mount) {
        host.innerHTML =
          '<p class="admin-error">Journey Builder failed to load. Refresh the page.</p>';
        return;
      }

      var journey = workspace && workspace.journey ? workspace.journey : null;
      var templates = (workspace && workspace.templates) || meta.templates || [];
      templates = templates.map(function (t) {
        return { key: t.template_key || t.key, name: t.name, id: t.id || null };
      });

      window.JourneyBuilder.mount(host, {
        journey: journey,
        templates: templates,
        trigger_types:
          (workspace && workspace.trigger_types) ||
          meta.trigger_types || [
            'signup',
            'add_to_cart',
            'purchase',
            'no_purchase_90_days',
            'manual'
          ],
        journey_options:
          (workspace && workspace.journey_options) || meta.journeys || [],
        delay_units:
          (workspace && workspace.delay_units) ||
          meta.delay_units || ['minutes', 'hours', 'days', 'weeks'],
        active_leads: (workspace && workspace.active_leads) || [],
        analytics: (workspace && workspace.analytics) || null,
        history: (workspace && workspace.history) || [],
        onRun: function (currentJourney) {
          openRunWorkflowModal(currentJourney);
        },
        onReload: function () {
          renderJourneyEditor(journeyId);
        },
        onSaved: function (saved) {
          if (saved && saved.id) renderJourneyEditor(saved.id);
        }
      });
    });
  }

  /* ========== Email Templates ========== */
  function renderTemplatesHome() {
    container.innerHTML =
      pageHeader(
        'Templates',
        'Email creative used by journeys and campaigns.',
        '<a class="admin-btn-primary" href="#marketing/templates/edit/new">Create Template</a>'
      ) +
      '<div class="admin-journey-toolbar admin-card"><label><input type="checkbox" id="tplArchived" /> Show archived</label>' +
      '<button type="button" class="admin-btn-secondary" id="tplRefresh">Refresh</button></div>' +
      '<div id="adminTplHost"><div class="admin-loading">Loading…</div></div>';

    function load() {
      var include = document.getElementById('tplArchived').checked ? '1' : '0';
      fetchJson('/api/admin/journey-templates?include_archived=' + include).then(function (result) {
        var host = document.getElementById('adminTplHost');
        if (!host) return;
        if (!result.ok) {
          host.innerHTML = '<p class="admin-error">Failed to load templates.</p>';
          return;
        }
        var rows = result.body.templates || [];
        host.innerHTML =
          '<div class="admin-card"><div class="admin-table-wrap"><table class="admin-table">' +
          '<thead><tr><th>Name</th><th>Key</th><th>Subject</th><th>Status</th><th></th></tr></thead><tbody>' +
          (rows
            .map(function (t) {
              return (
                '<tr data-id="' +
                esc(t.id || '') +
                '"><td><strong>' +
                esc(t.name) +
                '</strong><div class="admin-muted">' +
                esc(t.description || '') +
                '</div></td><td><code>' +
                esc(t.template_key) +
                '</code></td><td>' +
                esc(t.subject || '—') +
                '</td><td>' +
                statusPill(t.status || 'active') +
                '</td><td class="admin-journey-card-actions">' +
                (t.id
                  ? '<a class="admin-btn-secondary" href="#marketing/templates/edit/' +
                    esc(t.id) +
                    '">Edit</a>' +
                    '<button type="button" class="admin-btn-secondary tpl-preview">Preview</button>' +
                    '<button type="button" class="admin-btn-secondary tpl-dup">Duplicate</button>' +
                    (t.status !== 'archived'
                      ? '<button type="button" class="admin-btn-danger tpl-arch">Archive</button>'
                      : '')
                  : '<span class="admin-muted">Code catalog</span>') +
                '</td></tr>'
              );
            })
            .join('') ||
            '<tr><td colspan="5" class="admin-cell-empty">No templates.</td></tr>') +
          '</tbody></table></div></div>';

        host.querySelectorAll('.tpl-dup').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var id = btn.closest('[data-id]').getAttribute('data-id');
            fetchJson('/api/admin/journey-templates/' + encodeURIComponent(id) + '/duplicate', {
              method: 'POST',
              body: '{}',
              headers: { 'Content-Type': 'application/json' }
            }).then(function (r) {
              if (r.ok && r.body.template) {
                window.location.hash = '#marketing/templates/edit/' + r.body.template.id;
              } else alert((r.body && r.body.error) || 'Duplicate failed');
            });
          });
        });
        host.querySelectorAll('.tpl-arch').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var id = btn.closest('[data-id]').getAttribute('data-id');
            fetchJson('/api/admin/journey-templates/' + encodeURIComponent(id) + '/archive', {
              method: 'POST',
              body: '{}',
              headers: { 'Content-Type': 'application/json' }
            }).then(load);
          });
        });
        host.querySelectorAll('.tpl-preview').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var id = btn.closest('[data-id]').getAttribute('data-id');
            fetchJson('/api/admin/journey-templates/' + encodeURIComponent(id) + '/preview', {
              method: 'POST',
              body: '{}',
              headers: { 'Content-Type': 'application/json' }
            }).then(function (r) {
              if (!r.ok) return alert((r.body && r.body.error) || 'Preview failed');
              var w = window.open('', '_blank');
              if (w) {
                w.document.write(
                  '<title>' +
                    esc(r.body.preview.subject) +
                    '</title>' +
                    r.body.preview.html
                );
              }
            });
          });
        });
      });
    }

    document.getElementById('tplRefresh').addEventListener('click', load);
    document.getElementById('tplArchived').addEventListener('change', load);
    load();
  }

  function renderTemplateEditor(id) {
    var isNew = id === 'new';
    container.innerHTML =
      pageHeader(
        isNew ? 'Create Template' : 'Edit Template',
        '<a href="#marketing/templates">← Email Templates</a>'
      ) +
      '<div id="adminTplEditor"><div class="admin-loading">Loading…</div></div>';

    var loadP = isNew
      ? Promise.resolve({
          ok: true,
          body: {
            template: {
              name: '',
              template_key: '',
              description: '',
              subject: '',
              html_body: '<p>Hello from ZYBAR</p>',
              status: 'active'
            }
          }
        })
      : fetchJson('/api/admin/journey-templates/' + encodeURIComponent(id));

    loadP.then(function (result) {
      var host = document.getElementById('adminTplEditor');
      if (!host) return;
      if (!result.ok || !result.body.template) {
        host.innerHTML = '<p class="admin-error">Template not found.</p>';
        return;
      }
      var t = result.body.template;
      host.innerHTML =
        '<div class="admin-card">' +
        '<div class="admin-form-row">' +
        '<div class="admin-form-group"><label>Name</label><input id="teName" value="' +
        esc(t.name) +
        '" /></div>' +
        '<div class="admin-form-group"><label>Key</label><input id="teKey" value="' +
        esc(t.template_key || '') +
        '"' +
        (isNew ? '' : ' readonly') +
        ' /></div></div>' +
        '<div class="admin-form-group"><label>Description</label><input id="teDesc" value="' +
        esc(t.description || '') +
        '" /></div>' +
        '<div class="admin-form-group"><label>Subject</label><input id="teSubject" value="' +
        esc(t.subject || '') +
        '" /></div>' +
        '<div class="admin-form-group"><label>HTML Body</label><textarea id="teHtml" rows="14">' +
        esc(t.html_body || '') +
        '</textarea>' +
        '<p class="admin-muted">Variables: {{discount_code}}, {{store_name}}, {{store_url}}, {{customer_name}}</p></div>' +
        '<div class="admin-journey-builder-actions">' +
        '<button type="button" class="admin-btn-primary" id="teSave">Save</button>' +
        (!isNew
          ? '<button type="button" class="admin-btn-secondary" id="tePreview">Preview</button>'
          : '') +
        '</div><p id="teStatus" class="admin-email-status"></p></div>';

      document.getElementById('teSave').addEventListener('click', function () {
        var payload = {
          name: document.getElementById('teName').value.trim(),
          template_key: document.getElementById('teKey').value.trim(),
          description: document.getElementById('teDesc').value.trim(),
          subject: document.getElementById('teSubject').value.trim(),
          html_body: document.getElementById('teHtml').value
        };
        var req = isNew
          ? fetchJson('/api/admin/journey-templates', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            })
          : fetchJson('/api/admin/journey-templates/' + encodeURIComponent(id), {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
        req.then(function (r) {
          var el = document.getElementById('teStatus');
          if (!r.ok) {
            el.textContent = (r.body && r.body.error) || 'Save failed';
            el.className = 'admin-email-status admin-email-status-err';
            return;
          }
          el.textContent = 'Saved.';
          el.className = 'admin-email-status admin-email-status-ok';
          if (r.body.template && r.body.template.id) {
            window.location.hash = '#marketing/templates/edit/' + r.body.template.id;
          }
        });
      });

      var prevBtn = document.getElementById('tePreview');
      if (prevBtn) {
        prevBtn.addEventListener('click', function () {
          fetchJson('/api/admin/journey-templates/' + encodeURIComponent(id) + '/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}'
          }).then(function (r) {
            if (!r.ok) return alert('Preview failed');
            var w = window.open('', '_blank');
            if (w) w.document.write(r.body.preview.html);
          });
        });
      }
    });
  }

  /* ========== Email Leads CRM ========== */
  function renderEmailLeads() {
    var leadStatus = '';
    var showTest = false;
    try {
      var q = hashRaw.indexOf('?') >= 0 ? hashRaw.split('?')[1] : '';
      var qp = new URLSearchParams(q);
      leadStatus = String(qp.get('status') || '').toLowerCase();
      showTest = qp.get('test') === '1';
    } catch (e) {}

    container.innerHTML =
      pageHeader(
        'Email Leads',
        'CRM view of leads with journey progress. Filter by funnel status.'
      ) +
      '<div id="adminEmailLeadsBar" class="admin-leads-status-bar"><div class="admin-loading">Loading…</div></div>' +
      '<div id="adminEmailLeadsHost"><div class="admin-loading">Loading leads…</div></div>';

    function leadsHash(withTest) {
      var base = '#marketing/email-leads';
      var params = [];
      if (leadStatus) params.push('status=' + encodeURIComponent(leadStatus));
      if (withTest) params.push('test=1');
      return params.length ? base + '?' + params.join('&') : base;
    }

    var url = '/api/admin/email-leads';
    var urlParams = [];
    if (leadStatus) urlParams.push('status=' + encodeURIComponent(leadStatus));
    if (showTest) urlParams.push('include_test=1');
    if (urlParams.length) url += '?' + urlParams.join('&');

    fetchJson(url).then(function (result) {
      var bar = document.getElementById('adminEmailLeadsBar');
      var host = document.getElementById('adminEmailLeadsHost');
      if (!result.ok) {
        if (host) host.innerHTML = '<p class="admin-error">Failed to load leads.</p>';
        return;
      }
      var audiences = result.body.audiences || [];
      var tabs = [{ key: '', label: 'All', count: result.body.total || 0 }].concat(
        audiences.map(function (a) {
          return { key: a.key, label: a.label || a.key, count: a.count };
        })
      );
      if (bar) {
        bar.innerHTML =
          '<div class="admin-leads-status-tabs">' +
          tabs
            .map(function (t) {
              var params = [];
              if (t.key) params.push('status=' + encodeURIComponent(t.key));
              if (showTest) params.push('test=1');
              var href = '#marketing/email-leads' + (params.length ? '?' + params.join('&') : '');
              return (
                '<a class="admin-leads-status-tab' +
                ((leadStatus || '') === (t.key || '') ? ' is-active' : '') +
                '" href="' +
                href +
                '">' +
                esc(t.label) +
                ' <span>' +
                esc(t.count) +
                '</span></a>'
              );
            })
            .join('') +
          '</div>' +
          '<label class="admin-leads-test-toggle"><input type="checkbox" id="leadsShowTest"' +
          (showTest ? ' checked' : '') +
          ' /> Show test leads</label>' +
          (leadStatus
            ? '<a class="admin-btn-primary" href="#marketing/campaigns/' +
              encodeURIComponent(leadStatus) +
              '">Send Campaign</a>'
            : '');
        var testToggle = document.getElementById('leadsShowTest');
        if (testToggle) {
          testToggle.addEventListener('change', function () {
            window.location.hash = leadsHash(testToggle.checked).slice(1);
          });
        }
      }

      var leads = result.body.leads || [];
      if (host) {
        host.innerHTML =
          '<div class="admin-card"><div class="admin-table-wrap"><table class="admin-table">' +
          '<thead><tr><th>Email</th><th>Status</th><th>Journey</th><th>Current Step</th><th>Next Ready</th><th>Last Activity</th><th>Actions</th></tr></thead><tbody>' +
          (leads
            .map(function (l) {
              return (
                '<tr><td>' +
                esc(l.email) +
                (l.is_test ? ' <span class="admin-test-badge">TEST</span>' : '') +
                '</td><td>' +
                statusPill(l.status) +
                '</td><td>' +
                esc(l.journey_name || '—') +
                (l.journey_status
                  ? '<div class="admin-muted">' + esc(l.journey_status) + '</div>'
                  : '') +
                '</td><td>' +
                (l.current_step
                  ? esc(l.current_step) + '. ' + esc(l.current_step_name || '')
                  : '—') +
                (l.next_action
                  ? '<div class="admin-muted">' + esc(l.next_action) + '</div>'
                  : '') +
                '</td><td>' +
                esc(l.next_ready_at ? when(l.next_ready_at) : '—') +
                (l.remaining_label
                  ? '<div class="admin-muted">' + esc(l.remaining_label) + '</div>'
                  : '') +
                '</td><td>' +
                esc(when(l.last_activity_at)) +
                '</td><td>' +
                (l.is_test
                  ? '<button type="button" class="admin-btn-secondary admin-lead-test-btn" data-lead-id="' +
                    esc(l.id) +
                    '" data-make-test="0">Convert to Real Lead</button>'
                  : '<button type="button" class="admin-lead-test-link" data-lead-id="' +
                    esc(l.id) +
                    '" data-make-test="1">Mark as Test</button>') +
                '</td></tr>'
              );
            })
            .join('') ||
            '<tr><td colspan="7" class="admin-cell-empty">No leads.</td></tr>') +
          '</tbody></table></div></div>';

        host.addEventListener('click', function (event) {
          var btn = event.target && event.target.closest('[data-lead-id][data-make-test]');
          if (!btn) return;
          var makeTest = btn.getAttribute('data-make-test') === '1';
          if (
            makeTest &&
            !window.confirm('Mark this lead as a test? It will be excluded from all campaigns and journeys.')
          ) {
            return;
          }
          btn.disabled = true;
          btn.textContent = 'Saving\u2026';
          fetchJson('/api/admin/email-leads/set-test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lead_id: btn.getAttribute('data-lead-id'), is_test: makeTest })
          }).then(function (r) {
            if (!r.ok || !r.body.success) {
              btn.disabled = false;
              btn.textContent = makeTest ? 'Mark as Test' : 'Convert to Real Lead';
              alert((r.body && r.body.error) || 'Failed to update lead.');
              return;
            }
            renderEmailLeads();
          });
        });
      }
    });
  }

  /* ========== Queue ========== */
  function renderQueue() {
    container.innerHTML =
      pageHeader(
        'Queue',
        'Ready actions awaiting manual execution. Uses sendEmail() for email actions.',
        '<button type="button" class="admin-btn-primary" id="jqExecute">Execute Ready Actions</button>'
      ) +
      '<div class="admin-card admin-journey-toolbar">' +
      '<select id="jqStatus"><option value="pending">Pending</option><option value="">All</option>' +
      '<option value="completed">Completed</option><option value="failed">Failed</option>' +
      '<option value="cancelled">Cancelled</option></select>' +
      '<button type="button" class="admin-btn-secondary" id="jqRefresh">Refresh</button></div>' +
      '<p id="jqMsg" class="admin-email-status" role="status"></p>' +
      '<div id="adminQueueHost"><div class="admin-loading">Loading…</div></div>';

    function setMsg(text, ok) {
      var el = document.getElementById('jqMsg');
      el.textContent = text || '';
      el.className =
        'admin-email-status ' + (ok ? 'admin-email-status-ok' : text ? 'admin-email-status-err' : '');
    }

    function load() {
      var status = document.getElementById('jqStatus').value;
      var url = '/api/admin/journey-queue';
      if (status) url += '?status=' + encodeURIComponent(status);
      fetchJson(url).then(function (result) {
        var host = document.getElementById('adminQueueHost');
        if (!host) return;
        if (!result.ok) {
          host.innerHTML = '<p class="admin-error">Failed to load queue.</p>';
          return;
        }
        var rows = result.body.queue || [];
        host.innerHTML =
          '<div class="admin-card"><div class="admin-table-wrap"><table class="admin-table">' +
          '<thead><tr><th>Lead</th><th>Journey</th><th>Step</th><th>Action</th><th>Scheduled</th><th>Status</th><th></th></tr></thead><tbody>' +
          (rows
            .map(function (r) {
              return (
                '<tr data-action-id="' +
                esc(r.id) +
                '"><td>' +
                esc(r.lead_email || r.recipient || '—') +
                '</td><td>' +
                esc(r.journey_name || '—') +
                '</td><td>' +
                esc((r.step_order ? r.step_order + '. ' : '') + (r.step_name || '—')) +
                '</td><td>' +
                esc(r.action_type) +
                (r.template_id ? ' · ' + esc(r.template_id) : '') +
                '</td><td>' +
                esc(when(r.scheduled_at)) +
                '</td><td>' +
                statusPill(r.status, r.scheduled_at) +
                (r.error_message
                  ? '<div class="admin-muted">' + esc(r.error_message) + '</div>'
                  : '') +
                '</td><td>' +
                (r.status === 'failed'
                  ? '<button type="button" class="admin-btn-secondary jq-retry">Retry</button>'
                  : '') +
                '</td></tr>'
              );
            })
            .join('') ||
            '<tr><td colspan="7" class="admin-cell-empty">Queue empty. Due steps are promoted when you Execute Ready Actions.</td></tr>') +
          '</tbody></table></div></div>';
        host.querySelectorAll('.jq-retry').forEach(function (button) {
          button.addEventListener('click', function () {
            var row = button.closest('[data-action-id]');
            var actionId = row && row.getAttribute('data-action-id');
            if (!actionId || !window.confirm('Retry this failed email through the Queue Worker?')) return;
            button.disabled = true;
            button.textContent = 'Retrying…';
            fetchJson('/api/admin/journey-queue/' + encodeURIComponent(actionId) + '/retry', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: '{}'
            }).then(function (retryResult) {
              if (!retryResult.ok || !retryResult.body.ok) {
                setMsg((retryResult.body && retryResult.body.error) || 'Retry failed.', false);
              } else {
                setMsg('Retry completed successfully.', true);
              }
              load();
            });
          });
        });
      });
    }

    document.getElementById('jqExecute').addEventListener('click', function () {
      if (
        !window.confirm(
          'Promote due steps and send ALL pending due emails via Resend? This may take a minute.'
        )
      )
        return;
      var btn = document.getElementById('jqExecute');
      btn.disabled = true;
      btn.textContent = 'Sending all due…';
      fetchJson('/api/admin/journey-queue/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 25, promote_limit: 100, max_rounds: 20 })
      })
        .then(function (r) {
          if (!r.ok) {
            setMsg((r.body && r.body.error) || 'Failed', false);
            return;
          }
          setMsg(
            'Promoted ' +
              (r.body.promoted || 0) +
              ' · Completed ' +
              (r.body.completed || 0) +
              ' · Cancelled stale ' +
              (r.body.cancelled || 0) +
              ' · Failed ' +
              (r.body.failed || 0) +
              ' · Rounds ' +
              (r.body.rounds || 1),
            true
          );
          load();
        })
        .finally(function () {
          btn.disabled = false;
          btn.textContent = 'Execute Ready Actions';
        });
    });

    document.getElementById('jqRefresh').addEventListener('click', load);
    document.getElementById('jqStatus').addEventListener('change', load);
    load();
  }

  /* ========== Campaigns ========== */
  function renderCampaigns() {
    var state = {
      step: 1,
      audience: prefillAudience || '',
      template_key: '',
      audiences: [],
      templates: [],
      preview: null
    };

    function audienceLabel(key) {
      for (var i = 0; i < state.audiences.length; i++) {
        if (state.audiences[i].key === key) return state.audiences[i].label;
      }
      return key;
    }

    function paint() {
      var host = document.getElementById('adminCampaignHost');
      if (!host) return;
      var body = '';
      if (state.step === 1) {
        body =
          '<div class="admin-form-group"><label>1. Audience</label><select id="cAud"><option value="">Select…</option>' +
          state.audiences
            .map(function (a) {
              return (
                '<option value="' +
                esc(a.key) +
                '"' +
                (a.key === state.audience ? ' selected' : '') +
                '>' +
                esc(a.label) +
                ' (' +
                a.count +
                ')</option>'
              );
            })
            .join('') +
          '</select></div>';
      } else if (state.step === 2) {
        body =
          '<div class="admin-form-group"><label>2. Template</label><select id="cTpl"><option value="">Select…</option>' +
          state.templates
            .map(function (t) {
              return (
                '<option value="' +
                esc(t.key) +
                '"' +
                (t.key === state.template_key ? ' selected' : '') +
                '>' +
                esc(t.name) +
                '</option>'
              );
            })
            .join('') +
          '</select></div>';
      } else if (state.step === 3) {
        body =
          '<p class="admin-muted">3. Preview — ' +
          esc(audienceLabel(state.audience)) +
          ' · ' +
          esc(state.template_key) +
          '</p>' +
          (state.preview
            ? '<strong>' +
              esc(state.preview.subject) +
              '</strong><iframe class="admin-campaign-iframe" srcdoc="' +
              esc(state.preview.html) +
              '"></iframe>'
            : '');
      } else {
        body =
          '<p>4. Send Now — one-time broadcast. Does not change journey progress.</p>' +
          '<button type="button" class="admin-btn-primary" id="cSend">Send Now</button>';
      }
      host.innerHTML =
        '<div class="admin-card">' +
        body +
        '<div class="admin-journey-builder-actions" style="margin-top:16px">' +
        (state.step > 1
          ? '<button type="button" class="admin-btn-secondary" id="cBack">Back</button>'
          : '') +
        (state.step < 4
          ? '<button type="button" class="admin-btn-primary" id="cNext">Next</button>'
          : '') +
        '</div><p id="cStatus" class="admin-email-status"></p></div>';

      var back = document.getElementById('cBack');
      if (back)
        back.addEventListener('click', function () {
          state.step -= 1;
          paint();
        });
      var next = document.getElementById('cNext');
      if (next) {
        next.addEventListener('click', function () {
          if (state.step === 1) {
            state.audience = document.getElementById('cAud').value;
            if (!state.audience) return alert('Select audience');
            state.step = 2;
            paint();
            return;
          }
          if (state.step === 2) {
            state.template_key = document.getElementById('cTpl').value;
            if (!state.template_key) return alert('Select template');
            next.disabled = true;
            fetchJson('/api/admin/campaigns/preview', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                audience: state.audience,
                template_key: state.template_key
              })
            }).then(function (r) {
              next.disabled = false;
              if (!r.ok || !r.body.success) return alert((r.body && r.body.error) || 'Preview failed');
              state.preview = r.body.preview || { subject: r.body.subject, html: r.body.html };
              state.step = 3;
              paint();
            });
            return;
          }
          state.step = 4;
          paint();
        });
      }
      var send = document.getElementById('cSend');
      if (send) {
        send.addEventListener('click', function () {
          if (!window.confirm('Send campaign now?')) return;

          var startedAt = Date.now();
          var el = document.getElementById('cStatus');
          var back2 = document.getElementById('cBack');
          if (back2) back2.disabled = true;
          send.disabled = true;
          send.textContent = 'Sending\u2026';
          el.textContent =
            'Sending your campaign\u2026 emails go out one by one, so this can take a minute for larger audiences. Keep this tab open.';
          el.className = 'admin-email-status';

          function showResult(sent, skipped, failed, note) {
            send.textContent = 'Sent';
            el.innerHTML =
              esc('Sent ' + sent + ' (skipped ' + skipped + ', failed ' + failed + ')') +
              (note ? ' \u2014 ' + esc(note) : '') +
              ' \u00B7 <a href="#marketing/history">View in History</a>';
            el.className =
              'admin-email-status ' +
              (failed > 0 ? 'admin-email-status-err' : 'admin-email-status-ok');
          }

          function showError(message) {
            el.textContent = message;
            el.className = 'admin-email-status admin-email-status-err';
            send.disabled = false;
            send.textContent = 'Send Now';
            if (back2) back2.disabled = false;
          }

          // If the request drops (Vercel timeout, network blip), the server
          // keeps sending and writes a campaign log at the end. Poll History
          // until that log appears so the admin always gets a real answer.
          function confirmFromHistory(attempt) {
            if (attempt > 24) {
              return showError(
                'Connection dropped and no result was logged yet. Check the History page in a minute before re-sending, so you do not email everyone twice.'
              );
            }
            el.textContent =
              'Connection dropped while sending \u2014 checking the server for the result\u2026 (' +
              'the campaign usually still completes)';
            el.className = 'admin-email-status';
            setTimeout(function () {
              fetchJson('/api/admin/journey-history?limit=20')
                .then(function (r) {
                  var events = (r.ok && r.body && r.body.history) || [];
                  for (var i = 0; i < events.length; i++) {
                    var ev = events[i];
                    var meta = ev.metadata || {};
                    if (
                      ev.event_type === 'campaign_send' &&
                      meta.audience === state.audience &&
                      meta.template_key === state.template_key &&
                      new Date(ev.at).getTime() >= startedAt - 60000
                    ) {
                      return showResult(
                        Number(meta.sent_count) || 0,
                        Number(meta.skipped_count) || 0,
                        Number(meta.failed_count) || 0,
                        'confirmed from server log'
                      );
                    }
                  }
                  confirmFromHistory(attempt + 1);
                })
                .catch(function () {
                  confirmFromHistory(attempt + 1);
                });
            }, 5000);
          }

          fetchJson('/api/admin/campaigns/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audience: state.audience,
              template_key: state.template_key
            })
          })
            .then(function (r) {
              if (!r.ok || !r.body.success) {
                return showError((r.body && r.body.error) || 'Send failed');
              }
              showResult(r.body.sent, r.body.skipped, r.body.failed, '');
            })
            .catch(function () {
              confirmFromHistory(1);
            });
        });
      }
    }

    container.innerHTML =
      pageHeader(
        'Campaigns',
        'One-shot broadcast emails. Journeys are always-on; campaigns are manual sends.'
      ) + '<div id="adminCampaignHost"><div class="admin-loading">Loading…</div></div>';

    var bootstrap = '/api/admin/campaigns';
    if (prefillAudience) bootstrap += '?audience=' + encodeURIComponent(prefillAudience);
    fetchJson(bootstrap).then(function (r) {
      if (!r.ok) {
        document.getElementById('adminCampaignHost').innerHTML =
          '<p class="admin-error">Failed to load campaigns.</p>';
        return;
      }
      state.audiences = r.body.audiences || [];
      state.templates = r.body.templates || [];
      if (r.body.preferred_audience) state.audience = r.body.preferred_audience;
      paint();
    });
  }

  /* ========== History ========== */
  function renderHistory() {
    container.innerHTML =
      pageHeader(
        'History',
        'Unified log of journey queue executions, campaigns, and errors.'
      ) + '<div id="adminHistHost"><div class="admin-loading">Loading…</div></div>';

    fetchJson('/api/admin/journey-history?limit=150').then(function (r) {
      var host = document.getElementById('adminHistHost');
      if (!host) return;
      if (!r.ok) {
        host.innerHTML = '<p class="admin-error">Failed to load history.</p>';
        return;
      }
      var rows = r.body.history || [];
      host.innerHTML =
        '<div class="admin-card"><div class="admin-table-wrap"><table class="admin-table">' +
        '<thead><tr><th>When</th><th>Source</th><th>Lead</th><th>Journey</th><th>Message</th><th>Engagement</th><th>Status</th></tr></thead><tbody>' +
        (rows
          .map(function (row) {
            return (
              '<tr><td>' +
              esc(when(row.at)) +
              '</td><td>' +
              esc(row.source) +
              '</td><td>' +
              esc(row.lead_email || '—') +
              '</td><td>' +
              esc(row.journey_name || '—') +
              '</td><td>' +
              esc(row.message) +
              '</td><td>' +
              engagementCell(row) +
              '</td><td>' +
              statusPill(row.status) +
              '</td></tr>'
            );
          })
          .join('') ||
          '<tr><td colspan="7" class="admin-cell-empty">No history yet.</td></tr>') +
        '</tbody></table></div></div>';
    });
  }

  /* ========== Route ========== */
  if (section === 'journeys') {
    if (editJourneyId) return renderJourneyEditor(editJourneyId);
    return renderJourneysHome();
  }
  if (section === 'templates') {
    if (editTemplateId) return renderTemplateEditor(editTemplateId);
    return renderTemplatesHome();
  }
  if (section === 'campaigns') return renderCampaigns();
  // Legacy pages still available if linked directly
  if (section === 'email-leads') return renderEmailLeads();
  if (section === 'queue') return renderQueue();
  if (section === 'history') return renderHistory();

  if (MC) return MC.renderOverview(container);
  container.innerHTML =
    '<p class="admin-error">Unknown section.</p><p><a href="#marketing/overview">← Marketing Overview</a></p>';
};
