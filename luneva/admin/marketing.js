/**
 * LUNEVA Admin — Marketing Center UI (Overview / Audience / Journeys).
 * Expects window.LunevaAdminAuth to attach Authorization on fetch.
 */
(function () {
  'use strict';

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function num(n) {
    return String(Number(n) || 0);
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString();
    } catch (_) {
      return String(iso);
    }
  }

  function authFetch(path, options) {
    return fetch(path, options || {}).then(function (res) {
      return res.json().then(function (body) {
        return { ok: res.ok, status: res.status, body: body };
      });
    });
  }

  function header(title, subtitle, actionsHtml) {
    return (
      '<div class="lv-admin__header"><div><h1>' +
      esc(title) +
      '</h1><p class="lv-admin__subtitle">' +
      esc(subtitle || '') +
      '</p></div><div class="lv-admin__header-right">' +
      (actionsHtml || '') +
      '</div></div>'
    );
  }

  function kpi(label, value, meta) {
    return (
      '<div class="lv-admin__kpi"><div class="lv-admin__kpi-label">' +
      esc(label) +
      '</div><div class="lv-admin__kpi-value">' +
      esc(value) +
      '</div>' +
      (meta ? '<div class="lv-admin__kpi-meta">' + esc(meta) + '</div>' : '') +
      '</div>'
    );
  }

  function parseHashQuery() {
    var hash = (location.hash || '').replace(/^#/, '');
    var qIndex = hash.indexOf('?');
    if (qIndex === -1) return {};
    var out = {};
    hash
      .slice(qIndex + 1)
      .split('&')
      .forEach(function (part) {
        var bits = part.split('=');
        if (bits[0]) out[decodeURIComponent(bits[0])] = decodeURIComponent(bits[1] || '');
      });
    return out;
  }

  function renderOverview(content) {
    content.innerHTML =
      header(
        'Marketing',
        'LUNEVA automated journeys — same system as ZYBAR car art, brand-scoped.',
        '<button type="button" class="lv-admin__btn" id="lvMktExec">Execute due sends</button>'
      ) +
      '<div class="admin-loading lv-admin__muted">Loading overview…</div>';

    authFetch('/api/admin/luneva/marketing/overview').then(function (r) {
      if (!r.ok) {
        content.innerHTML =
          header('Marketing', '') +
          '<p class="lv-admin__error">' +
          esc((r.body && r.body.error) || 'Failed to load') +
          '</p>';
        return;
      }
      var d = r.body || {};
      var k = d.kpis || {};
      var cats = d.journey_categories || [];
      var q = d.queue_summary || {};

      content.innerHTML =
        header(
          'Marketing',
          'Due to send, waiting, Welcome, and ATC at a glance.',
          '<button type="button" class="lv-admin__btn lv-admin__btn--ghost" id="lvMktEnroll">Enroll into Welcome</button>' +
            '<button type="button" class="lv-admin__btn" id="lvMktExec">Execute due sends</button>'
        ) +
        '<section class="lv-admin__card lv-mkt-summary">' +
        '<h3 style="margin:0 0 0.85rem">Key numbers</h3>' +
        '<div class="lv-admin__grid">' +
        kpi('Due now', num(q.due), 'Ready — click Execute due sends') +
        kpi('Waiting', num(q.waiting), 'Scheduled, not due yet') +
        kpi('In Welcome', num(k.welcome_leads), 'People in the welcome journey') +
        kpi('In ATC / Cart', num(k.cart_leads), 'People in cart recovery') +
        kpi('Opened', num(k.emails_opened) + ' / ' + num(q.completed), 'People who opened a sent email') +
        kpi('Open rate', (k.open_rate || 0) + '%', 'Opened ÷ sent') +
        '</div>' +
        '<p class="lv-admin__muted" style="margin:1rem 0 0">' +
        'Total leads ' +
        num(k.total_leads) +
        ' · Purchase journey ' +
        num(k.purchase_leads) +
        ' · Not in a journey ' +
        num(k.never_enrolled) +
        ' · Sent today ' +
        num(k.emails_sent_today) +
        '</p></section>' +
        '<section class="lv-admin__card" style="margin-top:1.25rem">' +
        '<h3>Journey categories</h3>' +
        '<div class="lv-mkt-cats">' +
        cats
          .map(function (c) {
            return (
              '<a class="lv-mkt-cat" href="' +
              esc(c.href) +
              '"><strong>' +
              esc(c.label) +
              '</strong><span class="lv-mkt-cat-val">' +
              num(c.current) +
              '</span><span class="lv-admin__muted">Active now · ever enrolled ' +
              num(c.ever_enrolled) +
              '</span></a>'
            );
          })
          .join('') +
        '</div></section>' +
        '<section class="lv-admin__card" style="margin-top:1.25rem">' +
        '<div class="lv-admin__header" style="margin:0 0 1rem;padding:0">' +
        '<div><h3 style="margin:0">Email queue</h3>' +
        '<p class="lv-admin__muted" id="lvMktQueueCaption">Due = ready to send now. Waiting = scheduled for later.</p></div>' +
        '<div class="lv-mkt-queue-tabs">' +
        '<button type="button" class="lv-admin__chip is-active" data-q="due">Due (' +
        num(q.due) +
        ')</button>' +
        '<button type="button" class="lv-admin__chip" data-q="waiting">Waiting (' +
        num(q.waiting) +
        ')</button>' +
        '<button type="button" class="lv-admin__chip" data-q="completed">Sent (' +
        num(q.completed) +
        ')</button>' +
        '</div></div>' +
        '<div id="lvMktQueueHost"><div class="lv-admin__muted">Loading…</div></div></section>' +
        '<p class="lv-admin__hint" style="margin-top:1rem">' +
        '<a href="#mkt-audience">Audience →</a> · <a href="#mkt-journeys">Journeys →</a> · <a href="#send">One-off send →</a>' +
        '</p>' +
        '<p class="lv-admin__send-status" id="lvMktExecStatus" hidden></p>';

      function loadQueue(category) {
        var host = document.getElementById('lvMktQueueHost');
        var caption = document.getElementById('lvMktQueueCaption');
        if (!host) return;
        host.innerHTML = '<div class="lv-admin__muted">Loading…</div>';
        if (caption) {
          caption.textContent =
            category === 'due'
              ? 'Emails ready to send now.'
              : category === 'waiting'
                ? 'Scheduled for later.'
                : 'Sent emails — Opened means the recipient viewed it.';
        }
        var status = category === 'completed' ? 'completed' : 'pending';
        authFetch('/api/admin/luneva/marketing/queue?status=' + status + '&limit=200').then(
          function (qr) {
            if (!qr.ok) {
              host.innerHTML = '<p class="lv-admin__error">Failed to load queue.</p>';
              return;
            }
            var rows = (qr.body && qr.body.queue) || [];
            if (category === 'due' || category === 'waiting') {
              rows = rows.filter(function (row) {
                var scheduled = row.scheduled_at ? new Date(row.scheduled_at).getTime() : 0;
                var isDue = !!scheduled && scheduled <= Date.now();
                return category === 'due' ? isDue : !isDue;
              });
            }
            if (!rows.length) {
              host.innerHTML = '<p class="lv-admin__muted">No emails in this bucket.</p>';
              return;
            }
            var showEngage = category === 'completed';
            host.innerHTML =
              '<table class="lv-admin__table"><thead><tr><th>When</th><th>Email</th><th>Journey</th><th>Step / template</th>' +
              (showEngage ? '<th>Opened</th><th>Clicked</th>' : '<th>Status</th>') +
              '</tr></thead><tbody>' +
              rows
                .slice(0, 80)
                .map(function (row) {
                  var engageCols = showEngage
                    ? '<td>' +
                      (row.opened_at
                        ? '<span class="lv-admin__chip">Opened</span> ' + esc(fmtDate(row.opened_at))
                        : '<span class="lv-admin__muted">Not opened</span>') +
                      '</td><td>' +
                      (row.clicked_at
                        ? '<span class="lv-admin__chip">Clicked</span> ' + esc(fmtDate(row.clicked_at))
                        : '<span class="lv-admin__muted">No click</span>') +
                      '</td>'
                    : '<td>' + esc(row.status) + '</td>';
                  return (
                    '<tr><td>' +
                    esc(fmtDate(row.executed_at || row.scheduled_at)) +
                    '</td><td>' +
                    esc(row.lead_email || row.recipient) +
                    '</td><td>' +
                    esc(row.journey_name || '—') +
                    '</td><td>' +
                    esc(row.step_name || row.template_id || '—') +
                    '</td>' +
                    engageCols +
                    '</tr>'
                  );
                })
                .join('') +
              '</tbody></table>';
          }
        );
      }

      content.querySelectorAll('[data-q]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          content.querySelectorAll('[data-q]').forEach(function (b) {
            b.classList.toggle('is-active', b === btn);
          });
          loadQueue(btn.getAttribute('data-q'));
        });
      });
      loadQueue('due');

      var enrollBtn = document.getElementById('lvMktEnroll');
      if (enrollBtn) {
        enrollBtn.addEventListener('click', function () {
          if (
            !window.confirm(
              'Put all LUNEVA leads who are not in a journey into the Welcome sequence? Day 0 sends in about 5 minutes (or use Execute due).'
            )
          ) {
            return;
          }
          var statusEl = document.getElementById('lvMktExecStatus');
          enrollBtn.disabled = true;
          enrollBtn.textContent = 'Enrolling…';
          if (statusEl) {
            statusEl.hidden = false;
            statusEl.textContent = 'Enrolling leads into LUNEVA Welcome…';
          }
          authFetch('/api/admin/luneva/marketing/enroll-welcome', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ limit: 200 })
          }).then(function (res) {
            enrollBtn.disabled = false;
            enrollBtn.textContent = 'Enroll into Welcome';
            if (!res.ok) {
              if (statusEl) statusEl.textContent = (res.body && res.body.error) || 'Enroll failed';
              return;
            }
            if (statusEl) {
              statusEl.textContent =
                'Enrolled ' +
                num(res.body.enrolled) +
                ' · failed ' +
                num(res.body.failed) +
                '. Refreshing…';
            }
            setTimeout(function () {
              renderOverview(content);
            }, 600);
          });
        });
      }

      var exec = document.getElementById('lvMktExec');
      if (exec) {
        exec.addEventListener('click', function () {
          if (
            !window.confirm(
              'Send all due LUNEVA journey emails now? ZYBAR car emails are not included.'
            )
          ) {
            return;
          }
          var statusEl = document.getElementById('lvMktExecStatus');
          exec.disabled = true;
          exec.textContent = 'Sending…';
          if (statusEl) {
            statusEl.hidden = false;
            statusEl.textContent = 'Promoting due steps and sending via Resend…';
          }
          authFetch('/api/admin/luneva/marketing/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ limit: 25, promote_limit: 100, max_rounds: 20 })
          }).then(function (res) {
            exec.disabled = false;
            exec.textContent = 'Execute due sends';
            if (!res.ok) {
              if (statusEl) statusEl.textContent = (res.body && res.body.error) || 'Execute failed';
              return;
            }
            if (statusEl) {
              statusEl.textContent =
                'Done — promoted ' +
                num(res.body.promoted) +
                ', sent ' +
                num(res.body.completed) +
                ', failed ' +
                num(res.body.failed) +
                ', cancelled ' +
                num(res.body.cancelled);
            }
            loadQueue('due');
          });
        });
      }
    });
  }

  function renderAudience(content) {
    var query = parseHashQuery();
    var state = {
      segment: query.segment || 'all',
      journey: query.journey || '',
      q: query.q || '',
      offset: 0,
      limit: 50
    };

    function load() {
      content.innerHTML =
        header('Audience', 'LUNEVA email subscribers and journey membership.') +
        '<div class="lv-admin__muted">Loading…</div>';
      var url =
        '/api/admin/luneva/marketing/audience?limit=' +
        state.limit +
        '&offset=' +
        state.offset +
        '&segment=' +
        encodeURIComponent(state.segment) +
        (state.journey ? '&journey=' + encodeURIComponent(state.journey) : '') +
        (state.q ? '&q=' + encodeURIComponent(state.q) : '');
      authFetch(url).then(function (r) {
        if (!r.ok) {
          content.innerHTML =
            header('Audience', '') +
            '<p class="lv-admin__error">' +
            esc((r.body && r.body.error) || 'Failed') +
            '</p>';
          return;
        }
        var rows = (r.body && r.body.rows) || [];
        var total = (r.body && r.body.total) || 0;
        content.innerHTML =
          header('Audience', total + ' LUNEVA leads in this filter.') +
          '<div class="lv-admin__toolbar">' +
          [
            ['all', 'All'],
            ['popup', 'Welcome popup'],
            ['checkout', 'Checkout'],
            ['enrolled', 'In a journey'],
            ['never', 'Not in journey']
          ]
            .map(function (pair) {
              return (
                '<button type="button" class="lv-admin__chip' +
                (state.segment === pair[0] ? ' is-active' : '') +
                '" data-seg="' +
                pair[0] +
                '">' +
                pair[1] +
                '</button>'
              );
            })
            .join('') +
          '<select id="lvMktAudJourney">' +
          '<option value="">All journeys</option>' +
          [
            ['luneva_welcome_journey', 'Welcome'],
            ['luneva_cart_journey', 'Cart recovery'],
            ['luneva_customer_journey', 'Purchase']
          ]
            .map(function (pair) {
              return (
                '<option value="' +
                pair[0] +
                '"' +
                (state.journey === pair[0] ? ' selected' : '') +
                '>' +
                pair[1] +
                '</option>'
              );
            })
            .join('') +
          '</select>' +
          '<input id="lvMktAudSearch" type="search" placeholder="Search email" value="' +
          esc(state.q) +
          '" />' +
          '</div>' +
          '<section class="lv-admin__card"><table class="lv-admin__table"><thead><tr><th>Email</th><th>Source</th><th>Journey</th><th>Step</th><th>Status</th><th>Joined</th></tr></thead><tbody>' +
          (rows.length
            ? rows
                .map(function (row) {
                  return (
                    '<tr><td>' +
                    esc(row.email) +
                    '</td><td>' +
                    esc(row.source) +
                    '</td><td>' +
                    esc(row.journey_name) +
                    '</td><td>' +
                    esc(row.current_step || '—') +
                    '</td><td>' +
                    esc(row.journey_status) +
                    '</td><td>' +
                    esc(fmtDate(row.created_at)) +
                    '</td></tr>'
                  );
                })
                .join('')
            : '<tr><td colspan="6">No leads in this filter.</td></tr>') +
          '</tbody></table></section>';

        content.querySelectorAll('[data-seg]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            state.segment = btn.getAttribute('data-seg') || 'all';
            state.offset = 0;
            load();
          });
        });
        var journeyEl = document.getElementById('lvMktAudJourney');
        if (journeyEl) {
          journeyEl.addEventListener('change', function () {
            state.journey = journeyEl.value;
            state.offset = 0;
            load();
          });
        }
        var searchEl = document.getElementById('lvMktAudSearch');
        if (searchEl) {
          var timer;
          searchEl.addEventListener('input', function () {
            clearTimeout(timer);
            timer = setTimeout(function () {
              state.q = searchEl.value.trim();
              state.offset = 0;
              load();
            }, 280);
          });
        }
      });
    }

    load();
  }

  function openTemplatePreview(templateKey, stepName) {
    var existing = document.getElementById('lvMktPreviewModal');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.id = 'lvMktPreviewModal';
    modal.className = 'lv-mkt-preview-modal';
    modal.innerHTML =
      '<div class="lv-mkt-preview-dialog" role="dialog" aria-modal="true">' +
      '<div class="lv-mkt-preview-head">' +
      '<div><p class="lv-admin__muted" style="margin:0">Customer preview</p>' +
      '<h2 id="lvMktPreviewTitle">' +
      esc(stepName || templateKey) +
      '</h2></div>' +
      '<button type="button" class="lv-admin__btn lv-admin__btn--ghost" id="lvMktPreviewClose">Close</button>' +
      '</div>' +
      '<p class="lv-admin__muted" id="lvMktPreviewMeta">Loading template…</p>' +
      '<div class="lv-admin__preview-subject" id="lvMktPreviewSubject"></div>' +
      '<iframe class="lv-admin__preview-frame" id="lvMktPreviewFrame" title="Email preview"></iframe>' +
      '</div>';
    document.body.appendChild(modal);

    function close() {
      modal.remove();
    }
    modal.addEventListener('click', function (e) {
      if (e.target === modal) close();
    });
    document.getElementById('lvMktPreviewClose').addEventListener('click', close);

    authFetch(
      '/api/admin/luneva/marketing/templates/' + encodeURIComponent(templateKey) + '/preview'
    ).then(function (res) {
      var meta = document.getElementById('lvMktPreviewMeta');
      var subjectEl = document.getElementById('lvMktPreviewSubject');
      var frame = document.getElementById('lvMktPreviewFrame');
      if (!res.ok || !res.body.success) {
        if (meta) meta.textContent = (res.body && res.body.error) || 'Preview failed';
        return;
      }
      var preview = res.body.preview || {};
      var def = res.body.template || {};
      if (meta) {
        meta.textContent =
          'Template: ' +
          (def.key || templateKey) +
          (def.description ? ' — ' + def.description : '');
      }
      if (subjectEl) subjectEl.textContent = 'Subject: ' + (preview.subject || '—');
      if (frame) frame.srcdoc = preview.html || '';
    });
  }

  function renderJourneys(content) {
    content.innerHTML =
      header(
        'Journeys',
        'Click any step to preview the exact email customers receive.',
        '<button type="button" class="lv-admin__btn" id="lvMktJExec">Execute due sends</button>'
      ) +
      '<div class="lv-admin__muted">Loading journeys…</div>';

    authFetch('/api/admin/luneva/marketing/journeys').then(function (r) {
      if (!r.ok) {
        content.innerHTML =
          header('Journeys', '') +
          '<p class="lv-admin__error">' +
          esc((r.body && r.body.error) || 'Failed') +
          '</p>';
        return;
      }
      var journeys = (r.body && r.body.journeys) || [];
      content.innerHTML =
        header(
          'Journeys',
          'Click any step to see the full customer email. Execute due only affects LUNEVA.',
          '<button type="button" class="lv-admin__btn" id="lvMktJExec">Execute due sends</button>'
        ) +
        (journeys.length
          ? '<div class="lv-mkt-journey-grid">' +
            journeys
              .map(function (j) {
                var es = j.enroll_stats || {};
                var qs = j.queue_stats || {};
                return (
                  '<article class="lv-admin__card lv-mkt-journey">' +
                  '<div class="lv-mkt-journey-top"><h3>' +
                  esc(j.name) +
                  '</h3><span class="lv-admin__chip is-active">' +
                  esc(j.status || (j.is_active ? 'published' : 'draft')) +
                  '</span></div>' +
                  '<p class="lv-admin__muted">' +
                  esc(j.description || j.trigger_type || '') +
                  '</p>' +
                  '<dl class="lv-mkt-dl">' +
                  '<div><dt>Steps</dt><dd>' +
                  num((j.steps || []).length) +
                  '</dd></div>' +
                  '<div><dt>Enrolled</dt><dd>' +
                  num(es.total) +
                  ' (wait ' +
                  num(es.waiting) +
                  ')</dd></div>' +
                  '<div><dt>Queue</dt><dd>pending ' +
                  num(qs.pending) +
                  ' · sent ' +
                  num(qs.completed) +
                  '</dd></div></dl>' +
                  '<ol class="lv-mkt-steps">' +
                  (j.steps || [])
                    .map(function (s) {
                      return (
                        '<li><button type="button" class="lv-mkt-step-btn" data-template="' +
                        esc(s.template_id) +
                        '" data-step="' +
                        esc(s.step_name) +
                        '">' +
                        '<span class="lv-mkt-step-name">' +
                        esc(s.step_name) +
                        '</span>' +
                        '<span class="lv-admin__muted">' +
                        esc(s.delay_value + ' ' + s.delay_unit) +
                        ' · Preview →</span></button></li>'
                      );
                    })
                    .join('') +
                  '</ol></article>'
                );
              })
              .join('') +
            '</div>'
          : '<p class="lv-admin__muted">No LUNEVA journeys found. Run the email journeys migration.</p>') +
        '<p class="lv-admin__send-status" id="lvMktJStatus" hidden></p>';

      content.querySelectorAll('[data-template]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          openTemplatePreview(
            btn.getAttribute('data-template'),
            btn.getAttribute('data-step')
          );
        });
      });

      var exec = document.getElementById('lvMktJExec');
      if (exec) {
        exec.addEventListener('click', function () {
          if (!window.confirm('Send all due LUNEVA journey emails now?')) return;
          var statusEl = document.getElementById('lvMktJStatus');
          exec.disabled = true;
          exec.textContent = 'Sending…';
          authFetch('/api/admin/luneva/marketing/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ limit: 25, promote_limit: 100, max_rounds: 20 })
          }).then(function (res) {
            exec.disabled = false;
            exec.textContent = 'Execute due sends';
            if (statusEl) {
              statusEl.hidden = false;
              statusEl.textContent = res.ok
                ? 'Sent ' + num(res.body.completed) + ' · failed ' + num(res.body.failed)
                : (res.body && res.body.error) || 'Failed';
            }
          });
        });
      }
    });
  }

  window.LunevaMarketingUI = {
    renderOverview: renderOverview,
    renderAudience: renderAudience,
    renderJourneys: renderJourneys
  };
})();
