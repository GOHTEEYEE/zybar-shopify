/**
 * Admin Marketing — Customer Journey platform.
 * Sidebar sections: Customer Journey, Email Templates, Email Leads, Campaigns, Queue, History.
 * No Test Email page. Campaigns are independent one-shot broadcasts.
 */
window.renderAdminmarketing = function (container) {
  if (!container) return;

  var hashRaw = window.location.hash || '#marketing/journeys';
  var hash = hashRaw.slice(1).split('?')[0];
  var parts = hash.split('/');
  var section = parts[1] || 'journeys';

  // Legacy aliases — never show Test Email
  if (section === 'email' || section === 'workflows' || section === 'settings') section = 'journeys';
  if (section === 'leads') section = 'email-leads';
  if (section === 'campaign') section = 'campaigns';

  var editJourneyId =
    section === 'journeys' && (parts[2] === 'edit' || parts[2] === 'open') && parts[3]
      ? parts[3]
      : section === 'journeys' && parts[2] && parts[2] !== 'edit' && parts[2] !== 'new'
        ? parts[2]
        : '';
  if (section === 'journeys' && parts[2] === 'new') editJourneyId = 'new';

  var editTemplateId =
    section === 'templates' && parts[2] === 'edit' && parts[3]
      ? parts[3]
      : section === 'templates' && parts[2] === 'new'
        ? 'new'
        : '';

  var prefillAudience = '';
  if (section === 'campaigns' && parts[2]) {
    prefillAudience = decodeURIComponent(parts[2]).toLowerCase();
  }
  try {
    var query = hashRaw.indexOf('?') >= 0 ? hashRaw.split('?')[1] : '';
    var params = new URLSearchParams(query);
    if (params.get('audience')) prefillAudience = String(params.get('audience')).toLowerCase();
    if (params.get('status')) prefillAudience = String(params.get('status')).toLowerCase();
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

  function statusPill(status) {
    var s = String(status || '');
    var cls = 'admin-workflow-pill admin-workflow-pill-status';
    if (s === 'pending' || s === 'waiting') cls += ' admin-journey-pill-wait';
    if (s === 'ready' || s === 'executing' || s === 'active') cls += ' admin-journey-pill-ready';
    if (s === 'completed' || s === 'partial') cls += ' admin-journey-pill-ok';
    if (s === 'failed' || s === 'cancelled' || s === 'archived' || s === 'off') cls += ' admin-journey-pill-off';
    return '<span class="' + cls + '">' + esc(s) + '</span>';
  }

  function fetchJson(url, options) {
    return fetch(url, options || {}).then(function (res) {
      return res.json().then(function (body) {
        return { ok: res.ok, body: body };
      });
    });
  }

  function pageHeader(title, subtitle, actionsHtml) {
    return (
      '<div class="admin-page-header">' +
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

  /* ========== Customer Journey cards ========== */
  function renderJourneysHome() {
    container.innerHTML =
      pageHeader(
        'Customer Journey',
        'Multi-step nurturing. Email is one action type among many.',
        '<a class="admin-btn-primary" href="#marketing/journeys/new">New Journey</a>'
      ) +
      '<div id="adminJourneyCards"><div class="admin-loading">Loading journeys…</div></div>';

    fetchJson('/api/admin/journeys').then(function (result) {
      var host = document.getElementById('adminJourneyCards');
      if (!host) return;
      if (!result.ok) {
        host.innerHTML =
          '<p class="admin-error">' + esc((result.body && result.body.error) || 'Failed') + '</p>';
        return;
      }
      var journeys = (result.body && result.body.journeys) || [];
      if (!journeys.length) {
        host.innerHTML =
          '<div class="admin-card"><p class="admin-cell-empty">No journeys yet. Create your first journey.</p></div>';
        return;
      }

      host.innerHTML =
        '<div class="admin-journey-card-grid">' +
        journeys
          .map(function (j) {
            var es = j.enroll_stats || {};
            var activeLeads = (es.waiting || 0) + (es.ready || 0);
            var steps = (j.steps || []).length;
            return (
              '<article class="admin-card admin-journey-card" data-id="' +
              esc(j.id) +
              '">' +
              '<div class="admin-journey-card-top">' +
              '<h3>' +
              esc(j.name) +
              '</h3>' +
              statusPill(j.is_active ? 'active' : 'off') +
              '</div>' +
              '<dl class="admin-dl admin-journey-card-meta">' +
              '<div><dt>Trigger</dt><dd>' +
              esc(j.trigger_type) +
              '</dd></div>' +
              '<div><dt>Steps</dt><dd>' +
              esc(steps) +
              '</dd></div>' +
              '<div><dt>Active Leads</dt><dd>' +
              esc(activeLeads) +
              '</dd></div>' +
              '</dl>' +
              '<p class="admin-muted admin-journey-card-desc">' +
              esc(j.description || '') +
              '</p>' +
              '<div class="admin-journey-card-actions">' +
              '<a class="admin-btn-primary" href="#marketing/journeys/edit/' +
              esc(j.id) +
              '">Open</a>' +
              '<button type="button" class="admin-btn-secondary jc-dup">Duplicate</button>' +
              '<button type="button" class="admin-btn-secondary jc-toggle" data-active="' +
              (j.is_active ? '1' : '0') +
              '">' +
              (j.is_active ? 'Disable' : 'Enable') +
              '</button>' +
              '<button type="button" class="admin-btn-danger jc-del">Delete</button>' +
              '</div></article>'
            );
          })
          .join('') +
        '</div>';

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
          var next = btn.getAttribute('data-active') !== '1';
          btn.disabled = true;
          fetchJson('/api/admin/journeys/' + encodeURIComponent(id), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_active: next })
          }).then(function () {
            renderJourneysHome();
          });
        });
      });

      host.querySelectorAll('.jc-del').forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (!window.confirm('Delete this journey? Active enrollments will be cancelled.')) return;
          var id = btn.closest('[data-id]').getAttribute('data-id');
          btn.disabled = true;
          fetchJson('/api/admin/journeys/' + encodeURIComponent(id), { method: 'DELETE' }).then(
            function (r) {
              if (!r.ok) alert((r.body && r.body.error) || 'Delete failed');
              renderJourneysHome();
            }
          );
        });
      });
    });
  }

  /* ========== Journey Editor ========== */
  function renderJourneyEditor(journeyId) {
    var isNew = journeyId === 'new';
    container.innerHTML =
      pageHeader(
        isNew ? 'New Journey' : 'Journey Editor',
        '<a href="#marketing/journeys">← Customer Journey</a>'
      ) +
      '<div id="adminJourneyEditor"><div class="admin-loading">Loading…</div></div>';

    var metaP = fetchJson('/api/admin/journeys');
    var workP = isNew
      ? Promise.resolve({ ok: true, body: null })
      : fetchJson('/api/admin/journeys/' + encodeURIComponent(journeyId) + '/workspace');

    Promise.all([metaP, workP]).then(function (results) {
      var host = document.getElementById('adminJourneyEditor');
      if (!host) return;
      if (!results[0].ok) {
        host.innerHTML = '<p class="admin-error">Failed to load.</p>';
        return;
      }
      var meta = results[0].body || {};
      var workspace = results[1].body;
      if (!isNew && (!results[1].ok || !workspace)) {
        host.innerHTML = '<p class="admin-error">Journey not found.</p>';
        return;
      }

      var journey = workspace && workspace.journey ? workspace.journey : null;
      var templates = (workspace && workspace.templates) || meta.templates || [];
      var actionTypes = (workspace && workspace.action_types) || meta.action_types || ['email'];
      var delayUnits = (workspace && workspace.delay_units) || meta.delay_units || ['minutes', 'hours', 'days', 'weeks'];
      var triggerTypes =
        (workspace && workspace.trigger_types) ||
        meta.trigger_types || ['signup', 'add_to_cart', 'purchase', 'no_purchase', 'manual'];
      var activeLeads = (workspace && workspace.active_leads) || [];

      // Normalize templates list (DB vs code catalog)
      templates = templates.map(function (t) {
        return {
          key: t.template_key || t.key,
          name: t.name
        };
      });

      var state = {
        id: journey ? journey.id : null,
        name: journey ? journey.name : '',
        description: journey ? journey.description || '' : '',
        trigger_type: journey ? journey.trigger_type : 'signup',
        is_active: journey ? !!journey.is_active : true,
        steps: ((journey && journey.steps) || []).map(function (s, i) {
          return {
            step_order: s.step_order || i + 1,
            step_name: s.step_name || '',
            delay_value: s.delay_value || 0,
            delay_unit: s.delay_unit || 'minutes',
            action_type: s.action_type || 'email',
            template_id: s.template_id || '',
            status: 'configured'
          };
        })
      };
      if (!state.steps.length) {
        state.steps.push({
          step_order: 1,
          step_name: 'Step 1',
          delay_value: 0,
          delay_unit: 'minutes',
          action_type: 'email',
          template_id: templates[0] ? templates[0].key : '',
          status: 'configured'
        });
      }

      function renumber() {
        state.steps.forEach(function (s, i) {
          s.step_order = i + 1;
        });
      }

      function templateOptions(selected) {
        return (
          '<option value="">—</option>' +
          templates
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
            .join('')
        );
      }

      function paint() {
        host.innerHTML =
          '<div class="admin-card admin-journey-builder">' +
          '<h3 class="admin-journey-steps-title" style="margin-top:0">Journey Information</h3>' +
          '<div class="admin-form-row">' +
          '<div class="admin-form-group"><label>Name</label><input id="jbName" type="text" value="' +
          esc(state.name) +
          '" /></div>' +
          '<div class="admin-form-group"><label>Trigger</label><select id="jbTrigger">' +
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
          ' /> Enabled</label></div></div>' +
          '<div class="admin-form-group"><label>Description</label><textarea id="jbDesc" rows="2">' +
          esc(state.description) +
          '</textarea></div>' +
          '<h3 class="admin-journey-steps-title">Ordered Steps</h3>' +
          '<div id="jbSteps" class="admin-journey-steps-list">' +
          state.steps
            .map(function (s, index) {
              return (
                '<div class="admin-journey-step-row" data-index="' +
                index +
                '" draggable="true">' +
                '<div class="admin-journey-step-handle" title="Drag to reorder">⠿</div>' +
                '<div class="admin-form-group"><label>Order</label><input class="jb-order" type="number" value="' +
                esc(s.step_order) +
                '" readonly /></div>' +
                '<div class="admin-form-group"><label>Step name</label><input class="jb-name" type="text" value="' +
                esc(s.step_name) +
                '" /></div>' +
                '<div class="admin-form-group"><label>Delay</label><input class="jb-delay" type="number" min="0" value="' +
                esc(s.delay_value) +
                '" /></div>' +
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
                templateOptions(s.template_id) +
                '</select></div>' +
                '<div class="admin-form-group"><label>Status</label><div style="padding-top:8px">' +
                statusPill(s.status || 'configured') +
                '</div></div>' +
                '<div class="admin-journey-step-actions">' +
                '<button type="button" class="admin-btn-secondary jb-dup-step" title="Duplicate">⧉</button>' +
                '<button type="button" class="admin-btn-secondary jb-up">↑</button>' +
                '<button type="button" class="admin-btn-secondary jb-down">↓</button>' +
                '<button type="button" class="admin-btn-danger jb-remove">✕</button>' +
                '</div></div>'
              );
            })
            .join('') +
          '</div>' +
          '<div class="admin-journey-builder-actions">' +
          '<button type="button" class="admin-btn-secondary" id="jbAddStep">Add Step</button>' +
          '<button type="button" class="admin-btn-primary" id="jbSave">Save Journey</button>' +
          '</div>' +
          '<p id="jbStatus" class="admin-email-status" role="status"></p></div>' +
          '<div class="admin-page-header" style="margin-top:1.5rem"><h3 class="admin-page-title" style="font-size:1.1rem">Active Leads</h3>' +
          '<p class="admin-muted">Leads currently inside this journey.</p></div>' +
          '<div class="admin-card"><div class="admin-table-wrap"><table class="admin-table">' +
          '<thead><tr><th>Email</th><th>Current Step</th><th>Status</th><th>Waiting</th><th>Ready Time</th><th>Next Action</th><th></th></tr></thead><tbody>' +
          (activeLeads
            .map(function (r) {
              return (
                '<tr data-lj="' +
                esc(r.id) +
                '"><td>' +
                esc(r.lead_email || '—') +
                '</td><td>' +
                esc(r.current_step) +
                '. ' +
                esc(r.current_step_name || '') +
                '</td><td>' +
                statusPill(r.status) +
                '</td><td>' +
                esc(r.remaining_label) +
                '</td><td>' +
                esc(when(r.next_ready_at)) +
                '</td><td>' +
                esc(
                  (r.current_action_type || '') +
                    (r.current_template_id ? ' · ' + r.current_template_id : '')
                ) +
                '</td><td><button type="button" class="admin-btn-secondary jl-cancel">Cancel</button></td></tr>'
              );
            })
            .join('') ||
            '<tr><td colspan="7" class="admin-cell-empty">No active leads in this journey.</td></tr>') +
          '</tbody></table></div></div>';

        function readForm() {
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
          readForm();
          state.steps.push({
            step_order: state.steps.length + 1,
            step_name: 'Step ' + (state.steps.length + 1),
            delay_value: 1,
            delay_unit: 'days',
            action_type: 'email',
            template_id: templates[0] ? templates[0].key : '',
            status: 'configured'
          });
          paint();
        });

        host.querySelectorAll('.jb-dup-step').forEach(function (btn) {
          btn.addEventListener('click', function () {
            readForm();
            var i = Number(btn.closest('.admin-journey-step-row').getAttribute('data-index'));
            var copy = Object.assign({}, state.steps[i], {
              step_name: state.steps[i].step_name + ' (Copy)'
            });
            state.steps.splice(i + 1, 0, copy);
            renumber();
            paint();
          });
        });

        host.querySelectorAll('.jb-up').forEach(function (btn) {
          btn.addEventListener('click', function () {
            readForm();
            var i = Number(btn.closest('.admin-journey-step-row').getAttribute('data-index'));
            if (i <= 0) return;
            var t = state.steps[i];
            state.steps[i] = state.steps[i - 1];
            state.steps[i - 1] = t;
            renumber();
            paint();
          });
        });
        host.querySelectorAll('.jb-down').forEach(function (btn) {
          btn.addEventListener('click', function () {
            readForm();
            var i = Number(btn.closest('.admin-journey-step-row').getAttribute('data-index'));
            if (i >= state.steps.length - 1) return;
            var t = state.steps[i];
            state.steps[i] = state.steps[i + 1];
            state.steps[i + 1] = t;
            renumber();
            paint();
          });
        });
        host.querySelectorAll('.jb-remove').forEach(function (btn) {
          btn.addEventListener('click', function () {
            readForm();
            if (state.steps.length <= 1) return;
            var i = Number(btn.closest('.admin-journey-step-row').getAttribute('data-index'));
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
            readForm();
            var moved = state.steps.splice(dragIndex, 1)[0];
            state.steps.splice(dropIndex, 0, moved);
            renumber();
            paint();
          });
        });

        host.querySelectorAll('.jl-cancel').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var id = btn.closest('[data-lj]').getAttribute('data-lj');
            if (!window.confirm('Cancel this lead journey?')) return;
            fetchJson('/api/admin/journey-leads/' + encodeURIComponent(id) + '/cancel', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: '{}'
            }).then(function () {
              renderJourneyEditor(state.id || journeyId);
            });
          });
        });

        document.getElementById('jbSave').addEventListener('click', function () {
          readForm();
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
              var saved = result.body.journey;
              if (saved && saved.id) {
                window.location.hash = '#marketing/journeys/edit/' + saved.id;
                if (state.id === saved.id) renderJourneyEditor(saved.id);
              }
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

  /* ========== Email Templates ========== */
  function renderTemplatesHome() {
    container.innerHTML =
      pageHeader(
        'Email Templates',
        'Reusable templates for journey steps and campaigns.',
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
    try {
      var q = hashRaw.indexOf('?') >= 0 ? hashRaw.split('?')[1] : '';
      leadStatus = String(new URLSearchParams(q).get('status') || '').toLowerCase();
    } catch (e) {}

    container.innerHTML =
      pageHeader(
        'Email Leads',
        'CRM view of leads with journey progress. Filter by funnel status.'
      ) +
      '<div id="adminEmailLeadsBar" class="admin-leads-status-bar"><div class="admin-loading">Loading…</div></div>' +
      '<div id="adminEmailLeadsHost"><div class="admin-loading">Loading leads…</div></div>';

    var url = '/api/admin/email-leads';
    if (leadStatus) url += '?status=' + encodeURIComponent(leadStatus);

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
              var href = t.key
                ? '#marketing/email-leads?status=' + encodeURIComponent(t.key)
                : '#marketing/email-leads';
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
          (leadStatus
            ? '<a class="admin-btn-primary" href="#marketing/campaigns/' +
              encodeURIComponent(leadStatus) +
              '">Send Campaign</a>'
            : '');
      }

      var leads = result.body.leads || [];
      if (host) {
        host.innerHTML =
          '<div class="admin-card"><div class="admin-table-wrap"><table class="admin-table">' +
          '<thead><tr><th>Email</th><th>Status</th><th>Journey</th><th>Current Step</th><th>Next Ready</th><th>Last Activity</th></tr></thead><tbody>' +
          (leads
            .map(function (l) {
              return (
                '<tr><td>' +
                esc(l.email) +
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
                '</td></tr>'
              );
            })
            .join('') ||
            '<tr><td colspan="6" class="admin-cell-empty">No leads.</td></tr>') +
          '</tbody></table></div></div>';
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
          '<thead><tr><th>Lead</th><th>Journey</th><th>Step</th><th>Action</th><th>Scheduled</th><th>Status</th></tr></thead><tbody>' +
          (rows
            .map(function (r) {
              return (
                '<tr><td>' +
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
                statusPill(r.status) +
                (r.error_message
                  ? '<div class="admin-muted">' + esc(r.error_message) + '</div>'
                  : '') +
                '</td></tr>'
              );
            })
            .join('') ||
            '<tr><td colspan="6" class="admin-cell-empty">Queue empty. Due steps are promoted when you Execute Ready Actions.</td></tr>') +
          '</tbody></table></div></div>';
      });
    }

    document.getElementById('jqExecute').addEventListener('click', function () {
      if (!window.confirm('Promote due steps and execute pending email actions via Resend?')) return;
      var btn = document.getElementById('jqExecute');
      btn.disabled = true;
      btn.textContent = 'Executing…';
      fetchJson('/api/admin/journey-queue/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 25 })
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
              ' · Failed ' +
              (r.body.failed || 0),
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
          send.disabled = true;
          fetchJson('/api/admin/campaigns/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audience: state.audience,
              template_key: state.template_key
            })
          }).then(function (r) {
            var el = document.getElementById('cStatus');
            if (!r.ok || !r.body.success) {
              el.textContent = (r.body && r.body.error) || 'Send failed';
              el.className = 'admin-email-status admin-email-status-err';
              send.disabled = false;
              return;
            }
            el.textContent =
              'Sent ' + r.body.sent + ' (skipped ' + r.body.skipped + ', failed ' + r.body.failed + ')';
            el.className = 'admin-email-status admin-email-status-ok';
          });
        });
      }
    }

    container.innerHTML =
      pageHeader(
        'Campaigns',
        'One-time manual broadcasts. Completely independent from Journeys.'
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
        '<thead><tr><th>When</th><th>Source</th><th>Lead</th><th>Journey</th><th>Message</th><th>Status</th></tr></thead><tbody>' +
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
              statusPill(row.status) +
              '</td></tr>'
            );
          })
          .join('') ||
          '<tr><td colspan="6" class="admin-cell-empty">No history yet.</td></tr>') +
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
  if (section === 'email-leads') return renderEmailLeads();
  if (section === 'queue') return renderQueue();
  if (section === 'campaigns') return renderCampaigns();
  if (section === 'history') return renderHistory();

  container.innerHTML =
    '<p class="admin-error">Unknown section.</p><p><a href="#marketing/journeys">← Customer Journey</a></p>';
};
