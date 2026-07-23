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
      var up = d.upcoming || {};

      var kpis =
        '<div class="mkt-kpi-grid">' +
        kpiCard('Total Leads', num(k.total_leads), 'All subscribers', '#marketing/audience') +
        kpiCard('Subscribers Today', num(k.subscribers_today), 'New signups') +
        kpiCard('Not in Journey', num(k.never_enrolled), 'Need enrollment', '#marketing/audience?segment=never') +
        kpiCard('Journey Revenue', money(k.journey_revenue_cents), 'Store orders (attributed view)') +
        kpiCard('Open Rate', k.open_rate + '%', 'Completed emails') +
        kpiCard('Click Rate', k.click_rate + '%', 'Completed emails') +
        kpiCard('Conversion', k.conversion_rate + '%', 'Purchasers / leads') +
        kpiCard('Rev / Recipient', money(k.revenue_per_recipient_cents), 'Average LTV proxy') +
        kpiCard('Sent Today', num(k.emails_sent_today), 'Completed sends') +
        kpiCard('Due Today', num(k.due_today), 'Scheduled sends', '#marketing/journeys') +
        kpiCard('Pending Actions', num(k.pending_actions), 'All future + due') +
        kpiCard('Unsubscribed', num(k.unsubscribed), 'Coming soon') +
        '</div>';

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

      var buckets =
        '<div class="mkt-upcoming-buckets">' +
        [
          ['Today', up.today],
          ['Tomorrow', up.tomorrow],
          ['Next 7 Days', up.next_7],
          ['Future', up.future]
        ]
          .map(function (b) {
            return (
              '<div class="mkt-bucket"><div class="mkt-bucket-val">' +
              num(b[1]) +
              '</div><div class="mkt-bucket-label">' +
              esc(b[0]) +
              '</div></div>'
            );
          })
          .join('') +
        '</div>';

      var rows = up.rows || [];
      var table =
        '<section class="admin-card mkt-card">' +
        '<div class="mkt-card-head"><h3>Upcoming Emails</h3>' +
        '<a href="#marketing/journeys">View in Journeys →</a></div>' +
        buckets +
        '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>' +
        '<th>When</th><th>Lead</th><th>Journey</th><th>Template</th><th>Status</th></tr></thead><tbody>' +
        (rows
          .map(function (row) {
            return (
              '<tr><td>' +
              esc(when(row.scheduled_at)) +
              '</td><td>' +
              esc(row.email || '—') +
              '</td><td>' +
              esc(row.journey) +
              '</td><td>' +
              esc(row.template_id || row.action_type || '—') +
              '</td><td>' +
              esc(row.status) +
              '</td></tr>'
            );
          })
          .join('') ||
          '<tr><td colspan="5" class="admin-cell-empty">No upcoming sends in the near window.</td></tr>') +
        '</tbody></table></div></section>';

      var host = container.querySelector('.mkt-center');
      var loading = host.querySelector('.admin-loading');
      if (loading) loading.remove();
      host.insertAdjacentHTML('beforeend', kpis + strip + table);

      var btn = document.getElementById('mktExecReady');
      if (btn) {
        btn.addEventListener('click', function () {
          if (!window.confirm('Promote due steps and execute pending email actions via Resend?')) return;
          btn.disabled = true;
          btn.textContent = 'Running…';
          fetchJson('/api/admin/journey-queue/execute', { method: 'POST' }).then(function (res) {
            btn.disabled = false;
            btn.textContent = 'Execute Due Sends';
            if (!res.ok) {
              alert((res.body && res.body.error) || 'Execute failed');
              return;
            }
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
          ['', 'All subscribers'],
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
        (segment ? '&segment=' + encodeURIComponent(segment) : '');
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
                esc(row.profile_href) +
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
                  ? '<a href="' + esc(row.activity_href) + '">Activity</a>'
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
      offset = 0;
      var hash = '#marketing/audience';
      var params = [];
      if (segment) params.push('segment=' + encodeURIComponent(segment));
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
      '<a class="admin-btn-secondary" href="#marketing/audience">← Audience</a>'
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
            ? '<p><a href="' + esc(r.body.activity_href) + '">Open activity timeline →</a></p>'
            : '') +
          '</section>' +
          '<section class="admin-card"><h3>Orders</h3><ul class="mkt-order-list">' +
          (orders
            .map(function (o) {
              return (
                '<li><a href="#orders/' +
                esc(o.id) +
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
                (t.href ? ' <a href="' + esc(t.href) + '">View</a>' : '') +
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
