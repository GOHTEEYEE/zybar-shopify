/**
 * Admin Customer Journey — Journeys, Leads, Templates, Queue, Campaigns, History, Settings.
 * Journeys = multi-step nurturing. Campaigns = one-time broadcasts. Execution is always manual.
 */
window.renderAdminmarketing = function (container) {
  if (!container) return;

  var hashRaw = window.location.hash || '#marketing/journeys';
  var hash = hashRaw.slice(1).split('?')[0];
  var parts = hash.split('/');
  var section = parts[1] || 'journeys';
  if (section === 'email' || section === 'workflows') section = 'journeys';
  if (section === 'campaign') section = 'campaigns';

  var prefillAudience = '';
  if (section === 'campaigns' && parts[2]) {
    prefillAudience = decodeURIComponent(parts[2]).toLowerCase();
  }
  try {
    var query = hashRaw.indexOf('?') >= 0 ? hashRaw.split('?')[1] : '';
    var params = new URLSearchParams(query);
    if (params.get('audience')) prefillAudience = String(params.get('audience')).toLowerCase();
  } catch (e) {}

  var editJourneyId = section === 'journeys' && parts[2] === 'edit' && parts[3] ? parts[3] : '';

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
      { id: 'journeys', href: '#marketing/journeys', label: 'Journeys' },
      { id: 'leads', href: '#marketing/leads', label: 'Leads' },
      { id: 'templates', href: '#marketing/templates', label: 'Templates' },
      { id: 'queue', href: '#marketing/queue', label: 'Queue' },
      { id: 'campaigns', href: '#marketing/campaigns', label: 'Campaigns' },
      { id: 'history', href: '#marketing/history', label: 'History' },
      { id: 'settings', href: '#marketing/settings', label: 'Settings' }
    ];
    return (
      '<nav class="admin-analytics-tabs" aria-label="Customer Journey">' +
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

  function statusPill(status) {
    var s = String(status || '');
    var cls = 'admin-workflow-pill admin-workflow-pill-status';
    if (s === 'pending' || s === 'waiting') cls += ' admin-journey-pill-wait';
    if (s === 'ready' || s === 'executing') cls += ' admin-journey-pill-ready';
    if (s === 'completed') cls += ' admin-journey-pill-ok';
    if (s === 'failed' || s === 'cancelled') cls += ' admin-journey-pill-off';
    return '<span class="' + cls + '">' + esc(s) + '</span>';
  }

  function fetchJson(url, options) {
    return fetch(url, options || {}).then(function (res) {
      return res.json().then(function (body) {
        return { ok: res.ok, body: body };
      });
    });
  }

  /* ---------- Journeys ---------- */
  function renderJourneysSection() {
    if (editJourneyId) {
      renderJourneyBuilder(editJourneyId);
      return;
    }

    container.innerHTML =
      '<div class="admin-page-header">' +
      '<div class="admin-page-header-row">' +
      '<div><h2 class="admin-page-title">Journeys</h2>' +
      '<p class="admin-muted" style="margin:0.35rem 0 0">Multi-step customer nurturing. Email is one action type.</p></div>' +
      '<a class="admin-btn-primary" href="#marketing/journeys/edit/new">New Journey</a>' +
      '</div></div>' +
      shellTabs('journeys') +
      '<div id="adminJourneyHost"><div class="admin-loading">Loading journeys…</div></div>';

    fetchJson('/api/admin/journeys').then(function (result) {
      var host = document.getElementById('adminJourneyHost');
      if (!host) return;
      if (!result.ok) {
        host.innerHTML =
          '<p class="admin-error">' + esc((result.body && result.body.error) || 'Failed to load') + '</p>';
        return;
      }
      var journeys = (result.body && result.body.journeys) || [];
      if (!journeys.length) {
        host.innerHTML = '<div class="admin-card"><p class="admin-cell-empty">No journeys yet.</p></div>';
        return;
      }

      host.innerHTML =
        '<div class="admin-card"><div class="admin-table-wrap"><table class="admin-table">' +
        '<thead><tr><th>Journey</th><th>Trigger</th><th>Steps</th><th>Enrolled</th><th>Queue</th><th>Active</th><th></th></tr></thead><tbody>' +
        journeys
          .map(function (j) {
            var steps = j.steps || [];
            var stepSummary = steps
              .map(function (s) {
                return (
                  s.step_order +
                  '. ' +
                  s.step_name +
                  ' (' +
                  s.delay_value +
                  ' ' +
                  s.delay_unit +
                  ' · ' +
                  s.action_type +
                  ')'
                );
              })
              .join('<br/>');
            var es = j.enroll_stats || {};
            var qs = j.queue_stats || {};
            return (
              '<tr>' +
              '<td><strong>' +
              esc(j.name) +
              '</strong><div class="admin-muted">' +
              esc(j.description || j.journey_key) +
              '</div></td>' +
              '<td>' +
              esc(j.trigger_type) +
              '</td>' +
              '<td class="admin-journey-steps-cell">' +
              (stepSummary || '—') +
              '</td>' +
              '<td>W ' +
              (es.waiting || 0) +
              ' · R ' +
              (es.ready || 0) +
              ' · C ' +
              (es.completed || 0) +
              '</td>' +
              '<td>P ' +
              (qs.pending || 0) +
              ' · Done ' +
              (qs.completed || 0) +
              '</td>' +
              '<td>' +
              (j.is_active
                ? '<span class="admin-workflow-pill admin-workflow-pill-on">Active</span>'
                : '<span class="admin-workflow-pill admin-workflow-pill-off">Off</span>') +
              '</td>' +
              '<td><a class="admin-btn-secondary" href="#marketing/journeys/edit/' +
              esc(j.id) +
              '">Edit</a></td>' +
              '</tr>'
            );
          })
          .join('') +
        '</tbody></table></div></div>';
    }).catch(function () {
      var host = document.getElementById('adminJourneyHost');
      if (host) host.innerHTML = '<p class="admin-error">Failed to load journeys.</p>';
    });
  }

  function renderJourneyBuilder(journeyId) {
    var isNew = journeyId === 'new';
    container.innerHTML =
      '<div class="admin-page-header">' +
      '<h2 class="admin-page-title">' +
      (isNew ? 'New Journey' : 'Edit Journey') +
      '</h2>' +
      '<p class="admin-muted" style="margin:0.35rem 0 0"><a href="#marketing/journeys">← Back to Journeys</a></p>' +
      '</div>' +
      shellTabs('journeys') +
      '<div id="adminJourneyBuilder"><div class="admin-loading">Loading…</div></div>';

    var metaPromise = fetchJson('/api/admin/journeys');
    var detailPromise = isNew
      ? Promise.resolve({ ok: true, body: { journey: null } })
      : fetchJson('/api/admin/journeys/' + encodeURIComponent(journeyId));

    Promise.all([metaPromise, detailPromise]).then(function (results) {
      var host = document.getElementById('adminJourneyBuilder');
      if (!host) return;
      if (!results[0].ok) {
        host.innerHTML = '<p class="admin-error">Failed to load builder data.</p>';
        return;
      }
      var meta = results[0].body || {};
      var templates = meta.templates || [];
      var actionTypes = meta.action_types || ['email'];
      var delayUnits = meta.delay_units || ['minutes', 'hours', 'days', 'weeks'];
      var triggerTypes = meta.trigger_types || ['signup', 'add_to_cart', 'purchase', 'manual'];
      var journey = (results[1].body && results[1].body.journey) || null;
      if (!isNew && !journey) {
        host.innerHTML = '<p class="admin-error">Journey not found.</p>';
        return;
      }

      var state = {
        id: journey ? journey.id : null,
        name: journey ? journey.name : '',
        description: journey ? journey.description || '' : '',
        trigger_type: journey ? journey.trigger_type : 'signup',
        is_active: journey ? !!journey.is_active : true,
        steps: (journey && journey.steps ? journey.steps : []).map(function (s, i) {
          return {
            step_order: s.step_order || i + 1,
            step_name: s.step_name || '',
            delay_value: s.delay_value || 0,
            delay_unit: s.delay_unit || 'minutes',
            action_type: s.action_type || 'email',
            template_id: s.template_id || ''
          };
        })
      };
      if (!state.steps.length) {
        state.steps.push({
          step_order: 1,
          step_name: 'Welcome',
          delay_value: 5,
          delay_unit: 'minutes',
          action_type: 'email',
          template_id: 'welcome_email'
        });
      }

      function renumber() {
        state.steps.forEach(function (s, i) {
          s.step_order = i + 1;
        });
      }

      function moveStep(index, dir) {
        var next = index + dir;
        if (next < 0 || next >= state.steps.length) return;
        var tmp = state.steps[index];
        state.steps[index] = state.steps[next];
        state.steps[next] = tmp;
        renumber();
        paint();
      }

      function templateOptions(selected) {
        return templates
          .map(function (t) {
            return (
              '<option value="' +
              esc(t.key) +
              '"' +
              (t.key === selected ? ' selected' : '') +
              '>' +
              esc(t.name) +
              '</option>'
            );
          })
          .join('');
      }

      function paint() {
        host.innerHTML =
          '<div class="admin-card admin-journey-builder">' +
          '<div class="admin-form-row">' +
          '<div class="admin-form-group"><label>Name</label>' +
          '<input type="text" id="jbName" value="' +
          esc(state.name) +
          '" /></div>' +
          '<div class="admin-form-group"><label>Trigger</label>' +
          '<select id="jbTrigger">' +
          triggerTypes
            .map(function (t) {
              return (
                '<option value="' +
                esc(t) +
                '"' +
                (t === state.trigger_type ? ' selected' : '') +
                '>' +
                esc(t) +
                '</option>'
              );
            })
            .join('') +
          '</select></div>' +
          '<div class="admin-form-group"><label>Active</label>' +
          '<label class="admin-inline-check"><input type="checkbox" id="jbActive"' +
          (state.is_active ? ' checked' : '') +
          ' /> Active</label></div>' +
          '</div>' +
          '<div class="admin-form-group"><label>Description</label>' +
          '<textarea id="jbDesc" rows="2">' +
          esc(state.description) +
          '</textarea></div>' +
          '<h3 class="admin-journey-steps-title">Steps</h3>' +
          '<div id="jbSteps" class="admin-journey-steps-list">' +
          state.steps
            .map(function (s, index) {
              return (
                '<div class="admin-journey-step-row" data-index="' +
                index +
                '" draggable="true">' +
                '<div class="admin-journey-step-handle" title="Drag to reorder">⠿</div>' +
                '<div class="admin-form-group"><label>Order</label><input type="number" class="jb-order" value="' +
                esc(s.step_order) +
                '" min="1" readonly /></div>' +
                '<div class="admin-form-group"><label>Step name</label><input type="text" class="jb-name" value="' +
                esc(s.step_name) +
                '" /></div>' +
                '<div class="admin-form-group"><label>Delay</label><input type="number" class="jb-delay" value="' +
                esc(s.delay_value) +
                '" min="0" /></div>' +
                '<div class="admin-form-group"><label>Unit</label><select class="jb-unit">' +
                delayUnits
                  .map(function (u) {
                    return (
                      '<option value="' +
                      esc(u) +
                      '"' +
                      (u === s.delay_unit ? ' selected' : '') +
                      '>' +
                      esc(u) +
                      '</option>'
                    );
                  })
                  .join('') +
                '</select></div>' +
                '<div class="admin-form-group"><label>Action</label><select class="jb-action">' +
                actionTypes
                  .map(function (a) {
                    return (
                      '<option value="' +
                      esc(a) +
                      '"' +
                      (a === s.action_type ? ' selected' : '') +
                      '>' +
                      esc(a) +
                      '</option>'
                    );
                  })
                  .join('') +
                '</select></div>' +
                '<div class="admin-form-group"><label>Template</label><select class="jb-template">' +
                '<option value="">—</option>' +
                templateOptions(s.template_id) +
                '</select></div>' +
                '<div class="admin-journey-step-actions">' +
                '<button type="button" class="admin-btn-secondary jb-up" title="Move up">↑</button>' +
                '<button type="button" class="admin-btn-secondary jb-down" title="Move down">↓</button>' +
                '<button type="button" class="admin-btn-danger jb-remove" title="Remove">✕</button>' +
                '</div></div>'
              );
            })
            .join('') +
          '</div>' +
          '<div class="admin-journey-builder-actions">' +
          '<button type="button" class="admin-btn-secondary" id="jbAddStep">Add Step</button>' +
          '<button type="button" class="admin-btn-primary" id="jbSave">Save Journey</button>' +
          '</div>' +
          '<p id="jbStatus" class="admin-email-status" role="status"></p>' +
          '</div>';

        function readFormIntoState() {
          state.name = document.getElementById('jbName').value.trim();
          state.description = document.getElementById('jbDesc').value.trim();
          state.trigger_type = document.getElementById('jbTrigger').value;
          state.is_active = document.getElementById('jbActive').checked;
          host.querySelectorAll('.admin-journey-step-row').forEach(function (row) {
            var i = Number(row.getAttribute('data-index'));
            if (!state.steps[i]) return;
            state.steps[i].step_name = row.querySelector('.jb-name').value.trim();
            state.steps[i].delay_value = Number(row.querySelector('.jb-delay').value) || 0;
            state.steps[i].delay_unit = row.querySelector('.jb-unit').value;
            state.steps[i].action_type = row.querySelector('.jb-action').value;
            state.steps[i].template_id = row.querySelector('.jb-template').value || null;
          });
        }

        document.getElementById('jbAddStep').addEventListener('click', function () {
          readFormIntoState();
          state.steps.push({
            step_order: state.steps.length + 1,
            step_name: 'Step ' + (state.steps.length + 1),
            delay_value: 1,
            delay_unit: 'days',
            action_type: 'email',
            template_id: ''
          });
          paint();
        });

        host.querySelectorAll('.jb-up').forEach(function (btn) {
          btn.addEventListener('click', function () {
            readFormIntoState();
            moveStep(Number(btn.closest('.admin-journey-step-row').getAttribute('data-index')), -1);
          });
        });
        host.querySelectorAll('.jb-down').forEach(function (btn) {
          btn.addEventListener('click', function () {
            readFormIntoState();
            moveStep(Number(btn.closest('.admin-journey-step-row').getAttribute('data-index')), 1);
          });
        });
        host.querySelectorAll('.jb-remove').forEach(function (btn) {
          btn.addEventListener('click', function () {
            readFormIntoState();
            var i = Number(btn.closest('.admin-journey-step-row').getAttribute('data-index'));
            if (state.steps.length <= 1) return;
            state.steps.splice(i, 1);
            renumber();
            paint();
          });
        });

        var dragIndex = null;
        host.querySelectorAll('.admin-journey-step-row').forEach(function (row) {
          row.addEventListener('dragstart', function () {
            dragIndex = Number(row.getAttribute('data-index'));
            row.classList.add('is-dragging');
          });
          row.addEventListener('dragend', function () {
            row.classList.remove('is-dragging');
            dragIndex = null;
          });
          row.addEventListener('dragover', function (e) {
            e.preventDefault();
          });
          row.addEventListener('drop', function (e) {
            e.preventDefault();
            var dropIndex = Number(row.getAttribute('data-index'));
            if (dragIndex == null || dropIndex === dragIndex) return;
            readFormIntoState();
            var moved = state.steps.splice(dragIndex, 1)[0];
            state.steps.splice(dropIndex, 0, moved);
            renumber();
            paint();
          });
        });

        document.getElementById('jbSave').addEventListener('click', function () {
          readFormIntoState();
          renumber();
          var statusEl = document.getElementById('jbStatus');
          var btn = document.getElementById('jbSave');
          if (!state.name) {
            statusEl.textContent = 'Name is required.';
            statusEl.className = 'admin-email-status admin-email-status-err';
            return;
          }
          btn.disabled = true;
          btn.textContent = 'Saving…';
          var payload = {
            name: state.name,
            description: state.description,
            trigger_type: state.trigger_type,
            is_active: state.is_active,
            steps: state.steps
          };
          var req = state.id
            ? fetchJson('/api/admin/journeys/' + encodeURIComponent(state.id), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
              })
            : fetchJson('/api/admin/journeys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
              });

          req
            .then(function (result) {
              if (!result.ok) {
                statusEl.textContent = (result.body && result.body.error) || 'Save failed';
                statusEl.className = 'admin-email-status admin-email-status-err';
                return;
              }
              statusEl.textContent = 'Saved.';
              statusEl.className = 'admin-email-status admin-email-status-ok';
              var saved = result.body && result.body.journey;
              if (saved && saved.id && !state.id) {
                window.location.hash = '#marketing/journeys/edit/' + saved.id;
                return;
              }
              window.location.hash = '#marketing/journeys';
            })
            .catch(function () {
              statusEl.textContent = 'Save failed';
              statusEl.className = 'admin-email-status admin-email-status-err';
            })
            .finally(function () {
              btn.disabled = false;
              btn.textContent = 'Save Journey';
            });
        });
      }

      paint();
    });
  }

  /* ---------- Leads on journeys ---------- */
  function renderLeadsSection() {
    container.innerHTML =
      '<div class="admin-page-header">' +
      '<h2 class="admin-page-title">Journey Leads</h2>' +
      '<p class="admin-muted" style="margin:0.35rem 0 0">Leads enrolled in journeys with progress and remaining time.</p>' +
      '</div>' +
      shellTabs('leads') +
      '<div class="admin-card admin-journey-toolbar">' +
      '<label>Status <select id="jlStatus"><option value="">All</option>' +
      '<option value="waiting">Waiting</option><option value="ready">Ready</option>' +
      '<option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label>' +
      '<button type="button" class="admin-btn-secondary" id="jlRefresh">Refresh</button>' +
      '</div>' +
      '<div id="adminJourneyLeadsHost"><div class="admin-loading">Loading…</div></div>';

    function load() {
      var status = document.getElementById('jlStatus').value;
      var url = '/api/admin/journey-leads';
      if (status) url += '?status=' + encodeURIComponent(status);
      fetchJson(url).then(function (result) {
        var host = document.getElementById('adminJourneyLeadsHost');
        if (!host) return;
        if (!result.ok) {
          host.innerHTML =
            '<p class="admin-error">' + esc((result.body && result.body.error) || 'Failed') + '</p>';
          return;
        }
        var rows = (result.body && result.body.lead_journeys) || [];
        host.innerHTML =
          '<div class="admin-card"><div class="admin-table-wrap"><table class="admin-table">' +
          '<thead><tr><th>Lead</th><th>Journey</th><th>Step</th><th>Progress</th><th>Ready at</th><th>Remaining</th><th>Status</th><th></th></tr></thead><tbody>' +
          (rows
            .map(function (r) {
              return (
                '<tr data-lj="' +
                esc(r.id) +
                '">' +
                '<td>' +
                esc(r.lead_email || r.lead_id) +
                '</td>' +
                '<td>' +
                esc(r.journey_name || '—') +
                '</td>' +
                '<td>' +
                esc(r.current_step) +
                '. ' +
                esc(r.current_step_name || '') +
                '<div class="admin-muted">' +
                esc(r.current_action_type || '') +
                (r.current_template_id ? ' · ' + esc(r.current_template_id) : '') +
                '</div></td>' +
                '<td>' +
                esc(r.progress) +
                '%</td>' +
                '<td>' +
                esc(when(r.next_ready_at)) +
                '</td>' +
                '<td>' +
                esc(r.remaining_label) +
                '</td>' +
                '<td>' +
                statusPill(r.status) +
                '</td>' +
                '<td>' +
                (r.status === 'waiting' || r.status === 'ready'
                  ? '<button type="button" class="admin-btn-secondary jl-cancel">Cancel</button>'
                  : '') +
                '</td></tr>'
              );
            })
            .join('') ||
            '<tr><td colspan="8" class="admin-cell-empty">No journey enrollments.</td></tr>') +
          '</tbody></table></div></div>';

        host.querySelectorAll('.jl-cancel').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var id = btn.closest('[data-lj]').getAttribute('data-lj');
            if (!window.confirm('Cancel this lead journey?')) return;
            btn.disabled = true;
            fetchJson('/api/admin/journey-leads/' + encodeURIComponent(id) + '/cancel', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: '{}'
            }).then(function () {
              load();
            });
          });
        });
      });
    }

    document.getElementById('jlRefresh').addEventListener('click', load);
    document.getElementById('jlStatus').addEventListener('change', load);
    load();
  }

  /* ---------- Templates ---------- */
  function renderTemplatesSection() {
    container.innerHTML =
      '<div class="admin-page-header">' +
      '<h2 class="admin-page-title">Templates</h2>' +
      '<p class="admin-muted" style="margin:0.35rem 0 0">Reusable templates referenced by journey steps (Phase 1: email).</p>' +
      '</div>' +
      shellTabs('templates') +
      '<div id="adminTemplatesHost"><div class="admin-loading">Loading…</div></div>';

    fetchJson('/api/admin/journey-templates').then(function (result) {
      var host = document.getElementById('adminTemplatesHost');
      if (!host) return;
      if (!result.ok) {
        host.innerHTML = '<p class="admin-error">Failed to load templates.</p>';
        return;
      }
      var templates = (result.body && result.body.templates) || [];
      host.innerHTML =
        '<div class="admin-card"><div class="admin-table-wrap"><table class="admin-table">' +
        '<thead><tr><th>Key</th><th>Name</th><th>Description</th><th>Journeys</th></tr></thead><tbody>' +
        templates
          .map(function (t) {
            return (
              '<tr><td><code>' +
              esc(t.key) +
              '</code></td><td>' +
              esc(t.name) +
              '</td><td>' +
              esc(t.description || '') +
              '</td><td>' +
              esc((t.journeys || []).join(', ') || '—') +
              '</td></tr>'
            );
          })
          .join('') +
        '</tbody></table></div></div>';
    });
  }

  /* ---------- Queue ---------- */
  function renderQueueSection() {
    container.innerHTML =
      '<div class="admin-page-header">' +
      '<h2 class="admin-page-title">Journey Queue</h2>' +
      '<p class="admin-muted" style="margin:0.35rem 0 0">Promote ready steps into the queue, then manually execute pending actions.</p>' +
      '</div>' +
      shellTabs('queue') +
      '<div class="admin-card admin-journey-toolbar">' +
      '<button type="button" class="admin-btn-secondary" id="jqPromote">Promote Ready Steps</button>' +
      '<button type="button" class="admin-btn-primary" id="jqExecute">Execute Pending Actions</button>' +
      '<select id="jqStatus"><option value="pending">Pending</option><option value="">All</option>' +
      '<option value="executing">Executing</option><option value="completed">Completed</option>' +
      '<option value="failed">Failed</option><option value="cancelled">Cancelled</option></select>' +
      '<button type="button" class="admin-btn-secondary" id="jqRefresh">Refresh</button>' +
      '</div>' +
      '<p id="jqStatusMsg" class="admin-email-status" role="status"></p>' +
      '<div id="adminQueueHost"><div class="admin-loading">Loading…</div></div>';

    var statusMsg = document.getElementById('jqStatusMsg');

    function setMsg(text, ok) {
      statusMsg.textContent = text || '';
      statusMsg.className =
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
          host.innerHTML =
            '<p class="admin-error">' + esc((result.body && result.body.error) || 'Failed') + '</p>';
          return;
        }
        var rows = (result.body && result.body.queue) || [];
        host.innerHTML =
          '<div class="admin-card"><div class="admin-table-wrap"><table class="admin-table">' +
          '<thead><tr><th>Lead</th><th>Journey</th><th>Step</th><th>Action</th><th>Template</th><th>Scheduled</th><th>Status</th><th></th></tr></thead><tbody>' +
          (rows
            .map(function (r) {
              return (
                '<tr data-action="' +
                esc(r.id) +
                '">' +
                '<td>' +
                esc(r.lead_email || r.recipient || '—') +
                '</td>' +
                '<td>' +
                esc(r.journey_name || '—') +
                '</td>' +
                '<td>' +
                esc(r.step_order ? r.step_order + '. ' : '') +
                esc(r.step_name || '—') +
                '</td>' +
                '<td>' +
                esc(r.action_type) +
                '</td>' +
                '<td>' +
                esc(r.template_id || '—') +
                '</td>' +
                '<td>' +
                esc(when(r.scheduled_at)) +
                '</td>' +
                '<td>' +
                statusPill(r.status) +
                (r.error_message
                  ? '<div class="admin-muted">' + esc(r.error_message) + '</div>'
                  : '') +
                '</td>' +
                '<td>' +
                (r.status === 'pending'
                  ? '<button type="button" class="admin-btn-secondary jq-one">Execute</button>'
                  : '') +
                '</td></tr>'
              );
            })
            .join('') ||
            '<tr><td colspan="8" class="admin-cell-empty">Queue is empty. Promote ready steps first.</td></tr>') +
          '</tbody></table></div></div>';

        host.querySelectorAll('.jq-one').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var id = btn.closest('[data-action]').getAttribute('data-action');
            btn.disabled = true;
            fetchJson('/api/admin/journey-queue/execute', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action_id: id })
            }).then(function (result) {
              if (result.ok) {
                setMsg(
                  'Executed. Completed ' +
                    result.body.completed +
                    ', failed ' +
                    result.body.failed,
                  true
                );
              } else {
                setMsg((result.body && result.body.error) || 'Execute failed', false);
              }
              load();
            });
          });
        });
      });
    }

    document.getElementById('jqPromote').addEventListener('click', function () {
      var btn = document.getElementById('jqPromote');
      btn.disabled = true;
      btn.textContent = 'Scanning…';
      fetchJson('/api/admin/journey-queue/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 50 })
      })
        .then(function (result) {
          if (!result.ok) {
            setMsg((result.body && result.body.error) || 'Promote failed', false);
            return;
          }
          setMsg(
            'Promoted ' +
              result.body.promoted +
              ' of ' +
              result.body.scanned +
              ' due steps into the queue.',
            true
          );
          document.getElementById('jqStatus').value = 'pending';
          load();
        })
        .finally(function () {
          btn.disabled = false;
          btn.textContent = 'Promote Ready Steps';
        });
    });

    document.getElementById('jqExecute').addEventListener('click', function () {
      if (!window.confirm('Execute all pending actions now? Emails will be sent via Resend.')) return;
      var btn = document.getElementById('jqExecute');
      btn.disabled = true;
      btn.textContent = 'Executing…';
      fetchJson('/api/admin/journey-queue/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 25 })
      })
        .then(function (result) {
          if (!result.ok) {
            setMsg((result.body && result.body.error) || 'Execute failed', false);
            return;
          }
          setMsg(
            'Processed ' +
              result.body.processed +
              ' — completed ' +
              result.body.completed +
              ', failed ' +
              result.body.failed,
            true
          );
          load();
        })
        .finally(function () {
          btn.disabled = false;
          btn.textContent = 'Execute Pending Actions';
        });
    });

    document.getElementById('jqRefresh').addEventListener('click', load);
    document.getElementById('jqStatus').addEventListener('change', load);
    load();
  }

  /* ---------- Campaigns (unchanged concept — one-shot broadcasts) ---------- */
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
      for (var i = 0; i < state.audiences.length; i++) {
        if (state.audiences[i].key === key) return state.audiences[i].label;
      }
      return key;
    }

    function audienceCount(key) {
      for (var i = 0; i < state.audiences.length; i++) {
        if (state.audiences[i].key === key) return state.audiences[i].count;
      }
      return 0;
    }

    function renderHost() {
      var host = document.getElementById('adminCampaignHost');
      if (!host) return;
      var stepsHtml =
        '<ol class="admin-campaign-steps">' +
        [1, 2, 3, 4]
          .map(function (n) {
            return (
              '<li class="' +
              (state.step === n ? 'is-active' : state.step > n ? 'is-done' : '') +
              '">Step ' +
              n +
              '</li>'
            );
          })
          .join('') +
        '</ol>';

      var body = '';
      if (state.step === 1) {
        body =
          '<div class="admin-form-group"><label>Audience (Lead Status)</label><select id="campaignAudience">' +
          '<option value="">Select…</option>' +
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
                esc(a.count) +
                ')</option>'
              );
            })
            .join('') +
          '</select></div>';
      } else if (state.step === 2) {
        body =
          '<div class="admin-form-group"><label>Template</label><select id="campaignTemplate">' +
          '<option value="">Select…</option>' +
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
          '<p class="admin-muted">Audience: <strong>' +
          esc(audienceLabel(state.audience)) +
          '</strong> · Template: <strong>' +
          esc(state.template_key) +
          '</strong></p>' +
          (state.preview
            ? '<div class="admin-campaign-preview"><strong>' +
              esc(state.preview.subject) +
              '</strong><iframe class="admin-campaign-iframe" srcdoc="' +
              esc(state.preview.html) +
              '"></iframe></div>'
            : '<p class="admin-muted">Click Next to load preview.</p>');
      } else {
        body =
          '<p>Ready to send <strong>' +
          esc(state.template_key) +
          '</strong> to <strong>' +
          esc(audienceLabel(state.audience)) +
          '</strong> (' +
          audienceCount(state.audience) +
          ' leads).</p>' +
          '<p class="admin-muted">Campaigns are one-time broadcasts — separate from multi-step Journeys.</p>' +
          '<button type="button" class="admin-btn-primary" id="campaignSendNow">Send Now</button>';
      }

      host.innerHTML =
        '<div class="admin-card">' +
        stepsHtml +
        body +
        '<div class="admin-journey-builder-actions" style="margin-top:16px">' +
        (state.step > 1
          ? '<button type="button" class="admin-btn-secondary" id="campaignBack">Back</button>'
          : '') +
        (state.step < 4
          ? '<button type="button" class="admin-btn-primary" id="campaignNext">Next</button>'
          : '') +
        '</div><p id="adminCampaignStatus" class="admin-email-status"></p></div>';

      var back = document.getElementById('campaignBack');
      if (back) {
        back.addEventListener('click', function () {
          state.step -= 1;
          renderHost();
        });
      }
      var next = document.getElementById('campaignNext');
      if (next) {
        next.addEventListener('click', function () {
          if (state.step === 1) {
            state.audience = document.getElementById('campaignAudience').value;
            if (!state.audience) return alert('Select an audience');
            state.step = 2;
            renderHost();
            return;
          }
          if (state.step === 2) {
            state.template_key = document.getElementById('campaignTemplate').value;
            if (!state.template_key) return alert('Select a template');
            next.disabled = true;
            fetchJson('/api/admin/campaigns/preview', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ audience: state.audience, template_key: state.template_key })
            }).then(function (result) {
              next.disabled = false;
              if (!result.ok || !result.body || !result.body.success) {
                alert((result.body && result.body.error) || 'Preview failed');
                return;
              }
              state.preview = result.body;
              state.step = 3;
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
          if (
            !window.confirm(
              'Send "' + state.template_key + '" to ' + audienceLabel(state.audience) + '?'
            )
          ) {
            return;
          }
          sendBtn.disabled = true;
          sendBtn.textContent = 'Sending…';
          fetchJson('/api/admin/campaigns/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audience: state.audience, template_key: state.template_key })
          }).then(function (result) {
            var statusEl = document.getElementById('adminCampaignStatus');
            if (!result.ok || !result.body || !result.body.success) {
              if (statusEl) {
                statusEl.textContent = (result.body && result.body.error) || 'Send failed';
                statusEl.className = 'admin-email-status admin-email-status-err';
              }
              sendBtn.disabled = false;
              sendBtn.textContent = 'Send Now';
              return;
            }
            if (statusEl) {
              statusEl.textContent =
                'Sent ' +
                result.body.sent +
                ' (' +
                result.body.skipped +
                ' skipped, ' +
                result.body.failed +
                ' failed)';
              statusEl.className = 'admin-email-status admin-email-status-ok';
            }
            sendBtn.textContent = 'Sent';
          });
        });
      }
    }

    container.innerHTML =
      '<div class="admin-page-header">' +
      '<h2 class="admin-page-title">Campaigns</h2>' +
      '<p class="admin-muted" style="margin:0.35rem 0 0">One-time manual broadcasts. Separate from Journeys.</p>' +
      '</div>' +
      shellTabs('campaigns') +
      '<div id="adminCampaignHost"><div class="admin-loading">Loading…</div></div>';

    var bootstrapUrl = '/api/admin/campaigns';
    if (prefillAudience) bootstrapUrl += '?audience=' + encodeURIComponent(prefillAudience);
    fetchJson(bootstrapUrl).then(function (result) {
      var host = document.getElementById('adminCampaignHost');
      if (!host) return;
      if (!result.ok) {
        host.innerHTML =
          '<p class="admin-error">' + esc((result.body && result.body.error) || 'Failed') + '</p>';
        return;
      }
      state.audiences = result.body.audiences || [];
      state.templates = result.body.templates || [];
      if (result.body.preferred_audience) state.audience = result.body.preferred_audience;
      renderHost();
    });
  }

  /* ---------- History ---------- */
  function renderHistorySection() {
    container.innerHTML =
      '<div class="admin-page-header">' +
      '<h2 class="admin-page-title">History</h2>' +
      '<p class="admin-muted" style="margin:0.35rem 0 0">Executed and failed actions from the Journey Queue.</p>' +
      '</div>' +
      shellTabs('history') +
      '<div id="adminHistoryHost"><div class="admin-loading">Loading…</div></div>';

    fetchJson('/api/admin/journey-history?limit=100').then(function (result) {
      var host = document.getElementById('adminHistoryHost');
      if (!host) return;
      if (!result.ok) {
        host.innerHTML = '<p class="admin-error">Failed to load history.</p>';
        return;
      }
      var rows = ((result.body && result.body.history) || []).filter(function (r) {
        return r.status === 'completed' || r.status === 'failed' || r.status === 'cancelled';
      });
      host.innerHTML =
        '<div class="admin-card"><div class="admin-table-wrap"><table class="admin-table">' +
        '<thead><tr><th>When</th><th>Lead</th><th>Journey</th><th>Step</th><th>Action</th><th>Status</th><th>Error</th></tr></thead><tbody>' +
        (rows
          .map(function (r) {
            return (
              '<tr><td>' +
              esc(when(r.executed_at || r.created_at)) +
              '</td><td>' +
              esc(r.lead_email || '—') +
              '</td><td>' +
              esc(r.journey_name || '—') +
              '</td><td>' +
              esc(r.step_name || '—') +
              '</td><td>' +
              esc(r.action_type) +
              '</td><td>' +
              statusPill(r.status) +
              '</td><td>' +
              esc(r.error_message || '—') +
              '</td></tr>'
            );
          })
          .join('') ||
          '<tr><td colspan="7" class="admin-cell-empty">No executed actions yet.</td></tr>') +
        '</tbody></table></div></div>';
    });
  }

  /* ---------- Settings ---------- */
  function renderSettingsSection() {
    container.innerHTML =
      '<div class="admin-page-header">' +
      '<h2 class="admin-page-title">Journey Settings</h2>' +
      '<p class="admin-muted" style="margin:0.35rem 0 0">Engine configuration for Phase 1 (manual execution).</p>' +
      '</div>' +
      shellTabs('settings') +
      '<div id="adminJourneySettingsHost"><div class="admin-loading">Loading…</div></div>';

    fetchJson('/api/admin/journey-settings').then(function (result) {
      var host = document.getElementById('adminJourneySettingsHost');
      if (!host) return;
      if (!result.ok) {
        host.innerHTML = '<p class="admin-error">Failed to load settings.</p>';
        return;
      }
      var s = result.body || {};
      host.innerHTML =
        '<div class="admin-card">' +
        '<dl class="admin-dl">' +
        '<div><dt>Execution mode</dt><dd><strong>' +
        esc(s.execution_mode) +
        '</strong></dd></div>' +
        '<div><dt>Email provider</dt><dd>' +
        (s.email_configured ? 'Resend configured' : 'RESEND_API_KEY missing') +
        '</dd></div>' +
        '<div><dt>From</dt><dd>' +
        esc(s.from) +
        '</dd></div>' +
        '<div><dt>Reply-To</dt><dd>' +
        esc(s.reply_to) +
        '</dd></div>' +
        '<div><dt>Action types</dt><dd>' +
        esc((s.action_types || []).join(', ')) +
        '</dd></div>' +
        '<div><dt>Triggers</dt><dd>' +
        esc((s.trigger_types || []).join(', ')) +
        '</dd></div>' +
        '<div><dt>Delay units</dt><dd>' +
        esc((s.delay_units || []).join(', ')) +
        '</dd></div>' +
        '</dl>' +
        '<p class="admin-muted" style="margin-top:16px">' +
        esc(s.note || '') +
        '</p>' +
        '<p class="admin-muted">Test email: <a href="#settings">use Admin Settings</a> or Campaigns preview.</p>' +
        '</div>';
    });
  }

  if (section === 'journeys') return renderJourneysSection();
  if (section === 'leads') return renderLeadsSection();
  if (section === 'templates') return renderTemplatesSection();
  if (section === 'queue') return renderQueueSection();
  if (section === 'campaigns') return renderCampaignsSection();
  if (section === 'history') return renderHistorySection();
  if (section === 'settings') return renderSettingsSection();

  container.innerHTML =
    '<p class="admin-error">Unknown section.</p><p><a href="#marketing/journeys">← Journeys</a></p>';
};
