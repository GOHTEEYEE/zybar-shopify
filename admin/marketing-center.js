/**
 * ZYBAR Marketing Center — Overview, Audience, Analytics, Settings shells.
 * Journey/Template editors and Campaigns/Queue execution stay in marketing.js.
 */
window.AdminMarketingCenter = (function () {
  var SECTIONS = [
    { id: 'overview', label: 'Overview', href: '#marketing/overview' },
    { id: 'journeys', label: 'Journeys', href: '#marketing/journeys' },
    { id: 'audience', label: 'Audience', href: '#marketing/audience' },
    { id: 'campaigns', label: 'Campaigns', href: '#marketing/campaigns' },
    { id: 'templates', label: 'Templates', href: '#marketing/templates' },
    { id: 'analytics', label: 'Analytics', href: '#marketing/analytics' },
    { id: 'settings', label: 'Settings', href: '#marketing/settings' }
  ];

  /**
   * Resend open/click tracking went live at this moment. Sends before it can never
   * report opens or clicks, so they are hidden from the Completed queue view.
   */
  var EMAIL_TRACKING_START_MS = Date.parse('2026-07-25T03:32:00.000Z');

  function isTrackableSend(row) {
    if (!row || !row.executed_at) return false;
    var at = Date.parse(String(row.executed_at).replace(' ', 'T'));
    return !isNaN(at) && at >= EMAIL_TRACKING_START_MS;
  }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function money(cents) {
    return 'US$' + ((Number(cents) || 0) / 100).toFixed(2);
  }

  function num(n) {
    return (Number(n) || 0).toLocaleString();
  }

  function when(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleString();
  }

  /** Queue UX labels: pending → due (ready now) or waiting (scheduled later). */
  function queueDisplayStatus(row) {
    var s = String((row && row.status) || '').toLowerCase();
    if (s === 'pending') {
      var at = row && row.scheduled_at ? new Date(row.scheduled_at).getTime() : 0;
      if (at && at <= Date.now()) return 'due';
      return 'waiting';
    }
    return s || '—';
  }

  function queueStatusPill(row) {
    var label = queueDisplayStatus(row);
    var cls = 'admin-workflow-pill admin-workflow-pill-status';
    if (label === 'waiting') cls += ' admin-journey-pill-wait';
    else if (label === 'due') cls += ' admin-journey-pill-due';
    else if (label === 'completed' || label === 'cancelled') cls += ' admin-journey-pill-cyan';
    else if (label === 'failed') cls += ' admin-journey-pill-off';
    else cls += ' admin-journey-pill-off';
    return '<span class="' + cls + '">' + esc(label) + '</span>';
  }

  function engagePill(label, cls) {
    return '<span class="admin-engage-pill ' + cls + '">' + esc(label) + '</span>';
  }

  function openedCell(row) {
    if (row.opened_at) {
      return (
        engagePill(
          'Opened' + (Number(row.open_count) > 1 ? ' ×' + Number(row.open_count) : ''),
          'admin-engage-open'
        ) +
        '<div class="admin-muted mkt-engage-time">' +
        esc(when(row.opened_at)) +
        '</div>'
      );
    }
    return engagePill('Not opened', 'admin-engage-none');
  }

  function clickedCell(row) {
    if (row.clicked_at) {
      return (
        engagePill(
          'Clicked link' +
            (Number(row.click_count) > 1 ? ' ×' + Number(row.click_count) : ''),
          'admin-engage-click'
        ) +
        '<div class="admin-muted mkt-engage-time">' +
        esc(when(row.clicked_at)) +
        ' · visited site</div>'
      );
    }
    return engagePill('No click', 'admin-engage-none');
  }

  function filterCompletedRows(rows, engageFilter) {
    var list = rows || [];
    if (engageFilter === 'opened') {
      return list.filter(function (row) {
        return !!row.opened_at;
      });
    }
    if (engageFilter === 'not_opened') {
      return list.filter(function (row) {
        return !row.opened_at;
      });
    }
    if (engageFilter === 'clicked') {
      return list.filter(function (row) {
        return !!row.clicked_at;
      });
    }
    if (engageFilter === 'not_clicked') {
      return list.filter(function (row) {
        return !row.clicked_at;
      });
    }
    return list;
  }

  function engagementSummary(rows) {
    var total = (rows || []).length;
    var opened = 0;
    var clicked = 0;
    (rows || []).forEach(function (row) {
      if (row.opened_at) opened += 1;
      if (row.clicked_at) clicked += 1;
    });
    return (
      '<div class="mkt-engage-summary">' +
      '<span><strong>' +
      num(total) +
      '</strong> sent</span>' +
      '<span><strong>' +
      num(opened) +
      '</strong> opened (' +
      (total ? Math.round((opened / total) * 100) : 0) +
      '%)</span>' +
      '<span><strong>' +
      num(clicked) +
      '</strong> clicked site (' +
      (total ? Math.round((clicked / total) * 100) : 0) +
      '%)</span>' +
      '</div>'
    );
  }

  function engagementFilters(activeFilter) {
    return (
      '<div class="mkt-engage-filters" role="group" aria-label="Engagement filter">' +
      [
        ['all', 'All'],
        ['opened', 'Opened'],
        ['not_opened', 'Not opened'],
        ['clicked', 'Clicked site'],
        ['not_clicked', 'No click']
      ]
        .map(function (item) {
          return (
            '<button type="button" class="mkt-engage-filter' +
            (activeFilter === item[0] ? ' is-active' : '') +
            '" data-engage-filter="' +
            item[0] +
            '">' +
            esc(item[1]) +
            '</button>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function queueDetailsTable(rows, category, engageFilter) {
    engageFilter = engageFilter || 'all';
    var sourceRows = rows || [];
    var sorted = (category === 'completed'
      ? filterCompletedRows(sourceRows, engageFilter)
      : sourceRows
    )
      .slice()
      .sort(function (a, b) {
        var aDate = category === 'completed' ? a.executed_at : a.scheduled_at;
        var bDate = category === 'completed' ? b.executed_at : b.scheduled_at;
        return category === 'completed'
          ? String(bDate || '').localeCompare(String(aDate || ''))
          : String(aDate || '').localeCompare(String(bDate || ''));
      });
    var emptyLabel =
      category === 'due'
        ? 'No emails are due.'
        : category === 'waiting'
          ? 'No emails are waiting.'
          : engageFilter !== 'all'
            ? 'No emails match this engagement filter.'
            : 'No completed emails yet.';
    var isCompleted = category === 'completed';
    var colCount = isCompleted ? 8 : 7;

    return (
      (isCompleted
        ? engagementSummary(sourceRows) + engagementFilters(engageFilter)
        : '') +
      '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>' +
      '<th>' +
      (isCompleted ? 'Sent' : 'Scheduled') +
      '</th><th>Lead</th><th>Journey</th><th>Step</th><th>Template</th>' +
      (isCompleted
        ? '<th>Opened</th><th>Clicked / Visited site</th>'
        : '<th>Status</th><th>Details</th>') +
      '</tr></thead><tbody>' +
      (sorted
        .map(function (row) {
          if (isCompleted) {
            return (
              '<tr><td>' +
              esc(when(row.executed_at)) +
              '</td><td>' +
              esc(row.lead_email || row.recipient || '—') +
              '</td><td>' +
              esc(row.journey_name || '—') +
              '</td><td>' +
              esc((row.step_order ? row.step_order + '. ' : '') + (row.step_name || '—')) +
              '</td><td>' +
              esc(row.template_id || row.action_type || '—') +
              '</td><td>' +
              openedCell(row) +
              '</td><td>' +
              clickedCell(row) +
              '</td></tr>'
            );
          }
          var details = '—';
          if (row.error_message) {
            details = '<span class="admin-error">' + esc(row.error_message) + '</span>';
          }
          return (
            '<tr><td>' +
            esc(when(row.scheduled_at)) +
            '</td><td>' +
            esc(row.lead_email || row.recipient || '—') +
            '</td><td>' +
            esc(row.journey_name || '—') +
            '</td><td>' +
            esc((row.step_order ? row.step_order + '. ' : '') + (row.step_name || '—')) +
            '</td><td>' +
            esc(row.template_id || row.action_type || '—') +
            '</td><td>' +
            queueStatusPill(row) +
            '</td><td>' +
            details +
            '</td></tr>'
          );
        })
        .join('') ||
        '<tr><td colspan="' +
          colCount +
          '" class="admin-cell-empty">' +
          emptyLabel +
          '</td></tr>') +
      '</tbody></table></div>'
    );
  }

  function withFrom(target) {
    var U = window.AdminUtils || {};
    return U.withFrom ? U.withFrom(target) : String(target || '');
  }

  function backLink(defaultHref, defaultLabel) {
    var U = window.AdminUtils || {};
    return U.backLinkHtml
      ? U.backLinkHtml(defaultHref, defaultLabel)
      : '<a href="#' +
          esc(String(defaultHref || '').replace(/^#/, '')) +
          '" class="admin-back-link">← ' +
          esc(defaultLabel || 'Back') +
          '</a>';
  }

  function fetchJson(url, opts) {
    // Use relative /api/... paths so admin/auth.js can attach the Bearer token.
    var path = String(url || '');
    if (path.indexOf('http') === 0) {
      try {
        path = new URL(path).pathname + new URL(path).search;
      } catch (e) {}
    }
    return fetch(path, opts || {})
      .then(function (r) {
        return r
          .json()
          .then(function (body) {
            return { ok: r.ok, status: r.status, body: body };
          })
          .catch(function () {
            return { ok: false, status: r.status, body: { error: 'Invalid response' } };
          });
      })
      .catch(function () {
        return { ok: false, status: 0, body: { error: 'Network error' } };
      });
  }

  function subnav(active) {
    return (
      '<nav class="mkt-subnav" aria-label="Marketing">' +
      SECTIONS.map(function (s) {
        return (
          '<a href="' +
          s.href +
          '" class="mkt-subnav-link' +
          (s.id === active ? ' is-active' : '') +
          '">' +
          esc(s.label) +
          '</a>'
        );
      }).join('') +
      '</nav>'
    );
  }

  function kpiCard(label, value, hint, href) {
    var inner =
      '<div class="mkt-kpi-label">' +
      esc(label) +
      '</div><div class="mkt-kpi-value">' +
      value +
      '</div>' +
      (hint ? '<div class="mkt-kpi-hint">' + esc(hint) + '</div>' : '');
    if (href) {
      return '<a class="mkt-kpi" href="' + esc(href) + '">' + inner + '</a>';
    }
    return '<div class="mkt-kpi">' + inner + '</div>';
  }

  function shell(active, title, subtitle, bodyHtml, actionsHtml) {
    return (
      '<div class="mkt-center">' +
      subnav(active) +
      '<div class="mkt-page-head">' +
      '<div><h2 class="admin-page-title">' +
      esc(title) +
      '</h2>' +
      (subtitle ? '<p class="admin-muted">' + subtitle + '</p>' : '') +
      '</div>' +
      (actionsHtml || '') +
      '</div>' +
      bodyHtml +
      '</div>'
    );
  }

  /* ---------- Overview ---------- */
  function renderOverview(container) {
    container.innerHTML = shell(
      'overview',
      'Marketing Overview',
      'Subscribers are people. Scheduled sends are emails waiting to go out — they are not the same number.',
      '<div class="admin-loading">Loading overview…</div>',
      '<button type="button" class="admin-btn-primary" id="mktExecReady">Execute Due Sends</button>'
    );

    fetchJson('/api/admin/marketing/overview').then(function (r) {
      if (!r.ok) {
        var errMsg =
          (r.body && r.body.error) ||
          (r.status === 401 ? 'Admin session expired — please sign in again.' : 'Failed to load overview.');
        var loading = container.querySelector('.admin-loading');
        if (loading) loading.remove();
        container.querySelector('.mkt-center').insertAdjacentHTML(
          'beforeend',
          '<p class="admin-error">' + esc(errMsg) + '</p>'
        );
        return;
      }
      var d = r.body;
      var k = d.kpis || {};
      var life = d.lifecycle || [];
      var cats = d.journey_categories || [];
      var kpis =
        '<div class="mkt-kpi-grid">' +
        kpiCard('Total Leads', num(k.total_leads), 'All subscribers', '#marketing/audience') +
        kpiCard('Welcome journey', num(k.welcome_leads), 'Email leads in Welcome', '#marketing/audience?journey=welcome_journey') +
        kpiCard('Cart journey', num(k.cart_leads), 'Email leads in Cart Recovery', '#marketing/audience?journey=cart_journey') +
        kpiCard('Purchase journey', num(k.purchase_leads), 'Email leads in Purchase', '#marketing/audience?journey=customer_journey') +
        kpiCard('Subscribers Today', num(k.subscribers_today), 'New signups') +
        kpiCard('Not in Journey', num(k.never_enrolled), 'Need enrollment', '#marketing/audience?segment=never') +
        kpiCard('Journey Revenue', money(k.journey_revenue_cents), 'Store orders (attributed view)') +
        kpiCard('Open Rate', k.open_rate + '%', 'Completed emails') +
        kpiCard('Click Rate', k.click_rate + '%', 'Completed emails') +
        kpiCard('Conversion', k.conversion_rate + '%', 'Purchasers / leads') +
        kpiCard('Sent Today', num(k.emails_sent_today), 'Completed sends') +
        kpiCard('Due Today', num(k.due_today), 'Scheduled sends', '#marketing/journeys') +
        '</div>';

      var categories =
        '<section class="mkt-lifecycle mkt-categories">' +
        '<div class="mkt-lifecycle-head"><h3>Email journey categories</h3>' +
        '<p class="admin-muted">These are <strong>email subscribers currently in a journey</strong> — not website Add-to-Cart events. Dashboard “Add To Cart 107” counts site events; only leads with email who moved into Cart Recovery appear here.</p></div>' +
        '<div class="mkt-category-grid">' +
        cats
          .map(function (c) {
            return (
              '<a class="mkt-category-card" href="' +
              esc(c.href) +
              '">' +
              '<div class="mkt-category-title">' +
              esc(c.label) +
              ' journey</div>' +
              '<div class="mkt-category-value">' +
              num(c.current) +
              '</div>' +
              '<div class="mkt-category-meta">Active in this email flow · ' +
              num(c.active) +
              '</div>' +
              '<div class="mkt-category-meta">Ever enrolled · ' +
              num(c.ever_enrolled) +
              ' · Waiting ' +
              num(c.waiting_history) +
              ' · Done ' +
              num(c.completed_history) +
              '</div></a>'
            );
          })
          .join('') +
        '</div></section>';

      var strip =
        '<section class="mkt-lifecycle">' +
        '<div class="mkt-lifecycle-head"><h3>Lifecycle</h3>' +
        '<p class="admin-muted">Click a stage to open Audience filtered to that group.</p></div>' +
        '<div class="mkt-lifecycle-strip">' +
        life
          .map(function (s, i) {
            return (
              (i ? '<span class="mkt-life-arrow" aria-hidden="true">→</span>' : '') +
              '<a class="mkt-life-stage" href="' +
              esc(s.href) +
              '"><span class="mkt-life-val">' +
              num(s.value) +
              '</span><span class="mkt-life-label">' +
              esc(s.label) +
              '</span></a>'
            );
          })
          .join('') +
        '</div></section>';

      var queueSummary = d.queue_summary || {};
      var buckets =
        '<div class="mkt-upcoming-buckets mkt-queue-categories" role="tablist" aria-label="Email queue status">' +
        [
          ['due', 'Due', queueSummary.due],
          ['waiting', 'Waiting', queueSummary.waiting],
          [
            'completed',
            'Completed',
            queueSummary.completed_trackable != null
              ? queueSummary.completed_trackable
              : queueSummary.completed
          ]
        ]
          .map(function (b, index) {
            return (
              '<button type="button" class="mkt-bucket mkt-queue-category' +
              (index === 0 ? ' is-active' : '') +
              '" data-queue-category="' +
              b[0] +
              '" role="tab" aria-selected="' +
              (index === 0 ? 'true' : 'false') +
              '"><div class="mkt-bucket-val">' +
              num(b[2]) +
              '</div><div class="mkt-bucket-label">' +
              esc(b[1]) +
              '</div></button>'
            );
          })
          .join('') +
        '</div>';

      var table =
        '<section class="admin-card mkt-card">' +
        '<div class="mkt-card-head"><div><h3>Email Queue</h3>' +
        '<p class="admin-muted mkt-queue-caption" id="mktQueueCaption">Emails ready to send now.</p></div>' +
        '<a href="#marketing/journeys">View in Journeys →</a></div>' +
        buckets +
        '<div id="mktQueueDetails"><div class="admin-loading">Loading due emails…</div></div></section>';

      var host = container.querySelector('.mkt-center');
      var loading = host.querySelector('.admin-loading');
      if (loading) loading.remove();
      host.insertAdjacentHTML('beforeend', kpis + categories + strip + table);

      function loadQueueCategory(category, engageFilter) {
        var detailsHost = document.getElementById('mktQueueDetails');
        var caption = document.getElementById('mktQueueCaption');
        if (!detailsHost) return;
        engageFilter = engageFilter || 'all';
        detailsHost.innerHTML = '<div class="admin-loading">Loading ' + esc(category) + ' emails…</div>';
        if (caption) {
          caption.textContent =
            category === 'due'
              ? 'Emails ready to send now.'
              : category === 'waiting'
                ? 'Emails scheduled for a future date and time.'
                : 'See who opened the email and who clicked through to your website.';
        }
        var status = category === 'completed' ? 'completed' : 'pending';
        fetchJson('/api/admin/journey-queue?status=' + status + '&limit=1000').then(function (queueResult) {
          if (!detailsHost) return;
          if (!queueResult.ok) {
            detailsHost.innerHTML = '<p class="admin-error">Failed to load email queue.</p>';
            return;
          }
          var rows = (queueResult.body && queueResult.body.queue) || [];
          if (category === 'due' || category === 'waiting') {
            rows = rows.filter(function (row) {
              var scheduled = row.scheduled_at ? new Date(row.scheduled_at).getTime() : 0;
              var isDue = !!scheduled && scheduled <= Date.now();
              return category === 'due' ? isDue : !isDue;
            });
          } else if (category === 'completed') {
            rows = rows.filter(isTrackableSend);
          }
          detailsHost.innerHTML = queueDetailsTable(rows, category, engageFilter);
          if (category === 'completed') {
            detailsHost.querySelectorAll('[data-engage-filter]').forEach(function (filterBtn) {
              filterBtn.addEventListener('click', function () {
                loadQueueCategory('completed', filterBtn.getAttribute('data-engage-filter'));
              });
            });
          }
        });
      }

      host.querySelectorAll('[data-queue-category]').forEach(function (categoryButton) {
        categoryButton.addEventListener('click', function () {
          host.querySelectorAll('[data-queue-category]').forEach(function (button) {
            var active = button === categoryButton;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-selected', active ? 'true' : 'false');
          });
          loadQueueCategory(categoryButton.getAttribute('data-queue-category'), 'all');
        });
      });
      loadQueueCategory('due', 'all');

      var btn = document.getElementById('mktExecReady');
      if (btn) {
        btn.addEventListener('click', function () {
          if (
            !window.confirm(
              'Promote due steps and send ALL pending due emails via Resend? This may take a minute.'
            )
          )
            return;
          btn.disabled = true;
          btn.textContent = 'Sending all due…';
          fetchJson('/api/admin/journey-queue/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ limit: 25, promote_limit: 100, max_rounds: 20 })
          })
            .then(function (res) {
              btn.disabled = false;
              btn.textContent = 'Execute Due Sends';
              if (!res.ok) {
                // Long sends can time out in the browser even after emails already went out.
                // Always refresh so Due/Waiting/Completed match the database.
                alert(
                  ((res.body && res.body.error) || 'Execute timed out or returned an invalid response') +
                    '\n\nRefreshing the queue now — check Completed to confirm what was sent.'
                );
                renderOverview(container);
                return;
              }
              var b = res.body || {};
              alert(
                'Done.\nCompleted: ' +
                  (b.completed || 0) +
                  '\nFailed: ' +
                  (b.failed || 0) +
                  '\nCancelled: ' +
                  (b.cancelled || 0) +
                  '\nRounds: ' +
                  (b.rounds || 1)
              );
              renderOverview(container);
            })
            .catch(function () {
              btn.disabled = false;
              btn.textContent = 'Execute Due Sends';
              alert(
                'Execute request failed or timed out.\n\nRefreshing the queue now — check Completed to confirm what was sent.'
              );
              renderOverview(container);
            });
        });
      }
    });
  }

  /* ---------- Audience ---------- */
  function renderAudience(container, opts) {
    opts = opts || {};
    var segment = opts.segment || '';
    var journey = opts.journey || '';
    var q = opts.q || '';
    var offset = opts.offset || 0;
    var limit = 40;
    var profileId = opts.profileId || null;

    if (profileId) {
      renderAudienceProfile(container, profileId);
      return;
    }

    container.innerHTML = shell(
      'audience',
      'Audience',
      'Every subscriber — where they are in the lifecycle, and what they are worth.',
      '<div class="mkt-audience-toolbar">' +
        '<input type="search" id="mktAudQ" class="admin-input" placeholder="Search email…" value="' +
        esc(q) +
        '" />' +
        '<select id="mktAudSeg" class="admin-input">' +
        [
          ['', 'All stages'],
          ['never', 'Not in journey'],
          ['enrolled', 'In a journey'],
          ['waiting', 'Active / waiting'],
          ['completed', 'Completed journey'],
          ['purchased', 'Purchasers']
        ]
          .map(function (o) {
            return (
              '<option value="' +
              o[0] +
              '"' +
              (segment === o[0] ? ' selected' : '') +
              '>' +
              o[1] +
              '</option>'
            );
          })
          .join('') +
        '</select>' +
        '<select id="mktAudJourney" class="admin-input">' +
        [
          ['', 'All journeys'],
          ['welcome_journey', 'Welcome'],
          ['cart_journey', 'Add to Cart'],
          ['customer_journey', 'Purchase'],
          ['win_back_journey', 'Win Back']
        ]
          .map(function (o) {
            return (
              '<option value="' +
              o[0] +
              '"' +
              (journey === o[0] ? ' selected' : '') +
              '>' +
              o[1] +
              '</option>'
            );
          })
          .join('') +
        '</select>' +
        '<button type="button" class="admin-btn-secondary" id="mktAudGo">Apply</button>' +
        '</div><div id="mktAudHost"><div class="admin-loading">Loading audience…</div></div>'
    );

    function load() {
      var url =
        '/api/admin/marketing/audience?limit=' +
        limit +
        '&offset=' +
        offset +
        (q ? '&q=' + encodeURIComponent(q) : '') +
        (segment ? '&segment=' + encodeURIComponent(segment) : '') +
        (journey ? '&journey=' + encodeURIComponent(journey) : '');
      fetchJson(url).then(function (r) {
        var host = document.getElementById('mktAudHost');
        if (!host) return;
        if (!r.ok) {
          host.innerHTML = '<p class="admin-error">Failed to load audience.</p>';
          return;
        }
        var rows = r.body.rows || [];
        var total = r.body.total || 0;
        host.innerHTML =
          '<div class="admin-card"><div class="admin-table-wrap"><table class="admin-table">' +
          '<thead><tr><th>Email</th><th>Country</th><th>Signed up</th><th>Source</th><th>Journey</th><th>Step</th><th>Status</th><th>Orders</th><th>LTV</th><th></th></tr></thead><tbody>' +
          (rows
            .map(function (row) {
              return (
                '<tr><td><a href="' +
                esc(withFrom(row.profile_href || '#marketing/audience/' + row.id)) +
                '">' +
                esc(row.email) +
                '</a></td><td>' +
                esc(row.country) +
                '</td><td>' +
                esc(when(row.created_at)) +
                '</td><td>' +
                esc(row.source) +
                '</td><td>' +
                esc(row.journey_name) +
                '</td><td>' +
                esc(row.current_step != null ? row.current_step : '—') +
                '</td><td>' +
                esc(row.journey_status) +
                '</td><td>' +
                num(row.orders) +
                '</td><td>' +
                money(row.ltv_cents) +
                '</td><td>' +
                (row.activity_href
                  ? '<a href="' + esc(withFrom(row.activity_href)) + '">Activity</a>'
                  : '') +
                '</td></tr>'
              );
            })
            .join('') ||
            '<tr><td colspan="10" class="admin-cell-empty">No subscribers in this view.</td></tr>') +
          '</tbody></table></div>' +
          '<div class="mkt-pager"><span class="admin-muted">' +
          (total ? offset + 1 : 0) +
          '–' +
          Math.min(offset + limit, total) +
          ' of ' +
          total +
          '</span><div>' +
          '<button type="button" class="admin-btn-secondary" id="mktAudPrev"' +
          (offset <= 0 ? ' disabled' : '') +
          '>Previous</button> ' +
          '<button type="button" class="admin-btn-secondary" id="mktAudNext"' +
          (offset + limit >= total ? ' disabled' : '') +
          '>Next</button></div></div></div>';

        var prev = document.getElementById('mktAudPrev');
        var next = document.getElementById('mktAudNext');
        if (prev) {
          prev.onclick = function () {
            offset = Math.max(0, offset - limit);
            load();
          };
        }
        if (next) {
          next.onclick = function () {
            offset = offset + limit;
            load();
          };
        }
      });
    }

    document.getElementById('mktAudGo').onclick = function () {
      q = document.getElementById('mktAudQ').value || '';
      segment = document.getElementById('mktAudSeg').value || '';
      journey = document.getElementById('mktAudJourney').value || '';
      offset = 0;
      var hash = '#marketing/audience';
      var params = [];
      if (segment) params.push('segment=' + encodeURIComponent(segment));
      if (journey) params.push('journey=' + encodeURIComponent(journey));
      if (q) params.push('q=' + encodeURIComponent(q));
      if (params.length) hash += '?' + params.join('&');
      window.location.hash = hash;
    };
    load();
  }

  function renderAudienceProfile(container, id) {
    container.innerHTML = shell(
      'audience',
      'Subscriber',
      '',
      '<div class="admin-loading">Loading profile…</div>',
      backLink('marketing/audience', 'Audience')
    );
    fetchJson('/api/admin/marketing/audience/' + encodeURIComponent(id)).then(function (r) {
      var host = container.querySelector('.mkt-center');
      var loading = host.querySelector('.admin-loading');
      if (loading) loading.remove();
      if (!r.ok) {
        host.insertAdjacentHTML('beforeend', '<p class="admin-error">Profile not found.</p>');
        return;
      }
      var lead = r.body.lead || {};
      var timeline = r.body.timeline || [];
      var orders = r.body.orders || [];
      host.insertAdjacentHTML(
        'beforeend',
        '<div class="mkt-profile-grid">' +
          '<section class="admin-card"><h3>' +
          esc(lead.email) +
          '</h3><dl class="admin-dl">' +
          '<div><dt>Country</dt><dd>' +
          esc(lead.country || '—') +
          '</dd></div>' +
          '<div><dt>Source</dt><dd>' +
          esc(lead.source || '—') +
          '</dd></div>' +
          '<div><dt>Status</dt><dd>' +
          esc(lead.status || '—') +
          '</dd></div>' +
          '<div><dt>Signed up</dt><dd>' +
          esc(when(lead.created_at)) +
          '</dd></div>' +
          '<div><dt>Journey status</dt><dd>' +
          esc(lead.journey_status || '—') +
          '</dd></div>' +
          '<div><dt>Current step</dt><dd>' +
          esc(lead.current_step != null ? lead.current_step : '—') +
          '</dd></div></dl>' +
          (r.body.activity_href
            ? '<p><a href="' + esc(withFrom(r.body.activity_href)) + '">Open activity timeline →</a></p>'
            : '') +
          '</section>' +
          '<section class="admin-card"><h3>Orders</h3><ul class="mkt-order-list">' +
          (orders
            .map(function (o) {
              return (
                '<li><a href="' +
                esc(withFrom('#orders/' + o.id)) +
                '">' +
                money(o.amount_total_cents) +
                '</a> · ' +
                esc(when(o.created_at)) +
                '</li>'
              );
            })
            .join('') ||
            '<li class="admin-muted">No orders</li>') +
          '</ul></section></div>' +
          '<section class="admin-card mkt-card"><h3>Timeline</h3><ul class="mkt-timeline">' +
          (timeline
            .map(function (t) {
              return (
                '<li><div class="mkt-tl-time">' +
                esc(when(t.at)) +
                '</div><div class="mkt-tl-label">' +
                esc(t.label) +
                (t.href
                  ? ' <a href="' + esc(withFrom(t.href)) + '">View</a>'
                  : '') +
                '</div></li>'
              );
            })
            .join('') ||
            '<li class="admin-muted">No timeline events yet.</li>') +
          '</ul></section>'
      );
    });
  }

  /* ---------- Analytics ---------- */
  function renderAnalytics(container) {
    var U = window.AdminUtils || {};
    var rangeState = { preset: '30', customStart: '', customEnd: '' };
    var range = U.resolveRange ? U.resolveRange('30') : { start: '', end: '', days: 30 };

    container.innerHTML = shell(
      'analytics',
      'Marketing Analytics',
      'Revenue and engagement by journey, country, and signup source.',
      '<div class="admin-analytics-toolbar" id="mktAnToolbar"></div><div id="mktAnHost"><div class="admin-loading">Loading…</div></div>'
    );

    var toolbar = document.getElementById('mktAnToolbar');
    if (toolbar && U.renderDateFilter) {
      toolbar.innerHTML = U.renderDateFilter(rangeState.preset, { extra: '' });
      if (U.bindDateFilter) {
        U.bindDateFilter(toolbar, rangeState, function (next) {
          range = next;
          load();
        });
      }
    }

    function load() {
      var q =
        '/api/admin/marketing/analytics?start=' +
        encodeURIComponent(range.start || '') +
        '&end=' +
        encodeURIComponent(range.end || '');
      fetchJson(q).then(function (r) {
        var host = document.getElementById('mktAnHost');
        if (!host) return;
        if (!r.ok) {
          host.innerHTML = '<p class="admin-error">Failed to load analytics.</p>';
          return;
        }
        var t = r.body.totals || {};
        var journeys = r.body.revenue_by_journey || [];
        var countries = r.body.revenue_by_country || [];
        var sources = r.body.subscribers_by_source || [];
        host.innerHTML =
          '<div class="mkt-kpi-grid">' +
          kpiCard('Emails Sent', num(t.emails_sent)) +
          kpiCard('Open Rate', (t.open_rate || 0) + '%') +
          kpiCard('Click Rate', (t.click_rate || 0) + '%') +
          kpiCard('CTOR', (t.ctor || 0) + '%') +
          kpiCard('Revenue', money(t.revenue_cents)) +
          kpiCard('New Subscribers', num(t.new_subscribers)) +
          kpiCard('Avg Rev / Email', money(t.avg_revenue_per_email)) +
          '</div>' +
          '<div class="admin-grid-2">' +
          '<section class="admin-card"><h3>By Journey</h3><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Journey</th><th>Enrolled</th><th>Waiting</th><th>Sent</th><th>Open</th><th>Click</th></tr></thead><tbody>' +
          (journeys
            .map(function (j) {
              return (
                '<tr><td><a href="#marketing/journeys/edit/' +
                esc(j.journey_id) +
                '">' +
                esc(j.name) +
                '</a></td><td>' +
                num(j.enrolled) +
                '</td><td>' +
                num(j.waiting) +
                '</td><td>' +
                num(j.emails_sent) +
                '</td><td>' +
                j.open_rate +
                '%</td><td>' +
                j.click_rate +
                '%</td></tr>'
              );
            })
            .join('') ||
            '<tr><td colspan="6" class="admin-cell-empty">No journey data</td></tr>') +
          '</tbody></table></div></section>' +
          '<section class="admin-card"><h3>Revenue by Country</h3><ul class="mkt-break-list">' +
          (countries
            .map(function (c) {
              return (
                '<li><span>' +
                esc(c.label) +
                '</span><strong>' +
                money(c.revenue_cents) +
                '</strong></li>'
              );
            })
            .join('') ||
            '<li class="admin-muted">No orders in range</li>') +
          '</ul><h3 style="margin-top:1.25rem">Signups by Source</h3><ul class="mkt-break-list">' +
          (sources
            .map(function (s) {
              return (
                '<li><span>' + esc(s.label) + '</span><strong>' + num(s.value) + '</strong></li>'
              );
            })
            .join('') ||
            '<li class="admin-muted">No signups</li>') +
          '</ul></section></div>';
      });
    }
    load();
  }

  /* ---------- Settings ---------- */
  function renderSettings(container) {
    container.innerHTML = shell(
      'settings',
      'Marketing Settings',
      'Sender identity and execution mode.',
      '<div class="admin-loading">Loading…</div>'
    );
    fetchJson('/api/admin/journey-settings').then(function (r) {
      var host = container.querySelector('.mkt-center');
      var loading = host.querySelector('.admin-loading');
      if (loading) loading.remove();
      var s = r.body || {};
      host.insertAdjacentHTML(
        'beforeend',
        '<section class="admin-card mkt-card"><dl class="admin-dl">' +
          '<div><dt>From</dt><dd>' +
          esc(s.from || '—') +
          '</dd></div>' +
          '<div><dt>Reply-to</dt><dd>' +
          esc(s.reply_to || '—') +
          '</dd></div>' +
          '<div><dt>Email configured</dt><dd>' +
          (s.email_configured ? 'Yes' : 'No') +
          '</dd></div>' +
          '<div><dt>Execution mode</dt><dd>' +
          esc(s.execution_mode || 'manual') +
          '</dd></div>' +
          '<div><dt>Note</dt><dd>' +
          esc(s.note || '') +
          '</dd></div></dl>' +
          '<p class="admin-muted">Core journeys (Welcome, Cart, Purchase, Win Back) cannot be permanently deleted.</p></section>'
      );
    });
  }

  /* ---------- Enhanced Journeys home wrapper helpers ---------- */
  function journeyHealthHtml(stats) {
    stats = stats || {};
    return (
      '<div class="mkt-j-stats">' +
      '<span><b>' +
      num(stats.total) +
      '</b> enrolled</span>' +
      '<span><b>' +
      num(stats.waiting) +
      '</b> waiting</span>' +
      '<span><b>' +
      num(stats.completed) +
      '</b> completed</span>' +
      '<span><b>' +
      num(stats.cancelled) +
      '</b> cancelled</span></div>'
    );
  }

  return {
    SECTIONS: SECTIONS,
    subnav: subnav,
    shell: shell,
    renderOverview: renderOverview,
    renderAudience: renderAudience,
    renderAnalytics: renderAnalytics,
    renderSettings: renderSettings,
    journeyHealthHtml: journeyHealthHtml,
    esc: esc,
    money: money,
    num: num,
    when: when,
    fetchJson: fetchJson
  };
})();
