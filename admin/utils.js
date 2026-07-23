/**
 * Shared admin helpers — date ranges, formatting, CSV, skeletons.
 */
(function () {
  'use strict';

  var RANGE_PRESETS = [
    { id: 'today', label: 'Today' },
    { id: 'yesterday', label: 'Yesterday' },
    { id: '7', label: 'Last 7 Days' },
    { id: '30', label: 'Last 30 Days' },
    { id: 'month', label: 'This Month' },
    { id: 'year', label: 'This Year' },
    { id: 'custom', label: 'Custom Range' }
  ];

  function startOfDay(d) {
    var x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function endOfDay(d) {
    var x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
  }

  // Local calendar date (YYYY-MM-DD) in the admin user's timezone.
  // toISOString() would shift to UTC and report the wrong day near midnight.
  function localDateString(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function resolveRange(preset, customStart, customEnd) {
    var now = new Date();
    var start;
    var end = endOfDay(now);

    if (preset === 'today') {
      start = startOfDay(now);
    } else if (preset === 'yesterday') {
      var y = new Date(now);
      y.setDate(y.getDate() - 1);
      start = startOfDay(y);
      end = endOfDay(y);
    } else if (preset === 'month') {
      start = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
    } else if (preset === 'year') {
      start = startOfDay(new Date(now.getFullYear(), 0, 1));
    } else if (preset === 'custom' && customStart && customEnd) {
      start = startOfDay(new Date(customStart));
      end = endOfDay(new Date(customEnd));
    } else {
      var days = parseInt(preset, 10) || 30;
      start = startOfDay(new Date(end.getTime() - (days - 1) * 86400000));
    }

    var endExcl = new Date(end.getTime() + 1);
    var daySpan = Math.max(1, Math.round((end - start) / 86400000) + 1);

    return {
      preset: preset,
      start: start.toISOString(),
      end: endExcl.toISOString(),
      startDate: localDateString(start),
      endDate: localDateString(end),
      days: daySpan
    };
  }

  function formatUsdCents(cents) {
    var n = Number(cents) || 0;
    return (
      'US$' +
      (n / 100).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })
    );
  }

  function formatUsd(amount) {
    var n = Number(amount) || 0;
    return (
      'US$' +
      n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    );
  }

  function formatNum(n) {
    var v = Number(n);
    if (!Number.isFinite(v)) return '0';
    return v.toLocaleString();
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (_) {
      return String(iso);
    }
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (_) {
      return String(iso);
    }
  }

  function pct(num, den) {
    var a = Number(num) || 0;
    var b = Number(den) || 0;
    if (b <= 0) return '0%';
    return ((a / b) * 100).toFixed(1) + '%';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function skeletonCards(count) {
    var n = count || 4;
    var html = '<div class="admin-kpi-cards admin-kpi-cards--dense">';
    for (var i = 0; i < n; i++) {
      html += '<div class="admin-kpi-card admin-skeleton-card"><div class="admin-skeleton-line"></div><div class="admin-skeleton-line admin-skeleton-line--lg"></div></div>';
    }
    return html + '</div>';
  }

  function skeletonTable(rows) {
    var n = rows || 5;
    var html = '<div class="admin-card"><div class="admin-skeleton-line admin-skeleton-line--title"></div><div class="admin-table-wrap"><table class="admin-table"><tbody>';
    for (var i = 0; i < n; i++) {
      html +=
        '<tr><td colspan="6"><div class="admin-skeleton-line"></div></td></tr>';
    }
    return html + '</tbody></table></div></div>';
  }

  function renderDateFilter(activePreset, opts) {
    opts = opts || {};
    var pills = RANGE_PRESETS.map(function (p) {
      return (
        '<button type="button" class="admin-analytics-filter-pill' +
        (p.id === activePreset ? ' is-active' : '') +
        '" data-range="' +
        p.id +
        '">' +
        p.label +
        '</button>'
      );
    }).join('');

    var custom =
      '<div class="admin-date-custom' +
      (activePreset === 'custom' ? ' is-visible' : '') +
      '" id="' +
      (opts.customId || 'adminDateCustom') +
      '">' +
      '<input type="date" id="' +
      (opts.startId || 'adminDateStart') +
      '" />' +
      '<span>to</span>' +
      '<input type="date" id="' +
      (opts.endId || 'adminDateEnd') +
      '" />' +
      '<button type="button" class="admin-btn-secondary" id="' +
      (opts.applyId || 'adminDateApply') +
      '">Apply</button>' +
      '</div>';

    return (
      '<div class="admin-analytics-toolbar">' +
      '<div class="admin-date-pills" role="group" aria-label="Date range">' +
      pills +
      '</div>' +
      custom +
      (opts.extra || '') +
      '</div>'
    );
  }

  function bindDateFilter(root, state, onChange) {
    if (!root) return;
    root.querySelectorAll('[data-range]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-range');
        state.preset = id;
        root.querySelectorAll('[data-range]').forEach(function (b) {
          b.classList.toggle('is-active', b === btn);
        });
        var custom = root.querySelector('.admin-date-custom');
        if (custom) custom.classList.toggle('is-visible', id === 'custom');
        if (id !== 'custom') onChange(resolveRange(id));
      });
    });
    var apply = root.querySelector('#adminDateApply');
    if (apply) {
      apply.addEventListener('click', function () {
        var s = root.querySelector('#adminDateStart');
        var e = root.querySelector('#adminDateEnd');
        if (!s || !e || !s.value || !e.value) return;
        state.preset = 'custom';
        state.customStart = s.value;
        state.customEnd = e.value;
        onChange(resolveRange('custom', s.value, e.value));
      });
    }
  }

  function downloadCsv(filename, rows) {
    if (!rows || !rows.length) return;
    var headers = Object.keys(rows[0]);
    var lines = [headers.join(',')];
    rows.forEach(function (row) {
      lines.push(
        headers
          .map(function (h) {
            var v = row[h] == null ? '' : String(row[h]);
            if (/[",\n]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
            return v;
          })
          .join(',')
      );
    });
    var blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function apiQuery(range) {
    // Send exact UTC instants (computed from the admin's local midnight) so the
    // server does not re-interpret date-only strings in its own timezone.
    return (
      'start=' +
      encodeURIComponent(range.start || range.startDate) +
      '&end=' +
      encodeURIComponent(range.end || range.endDate) +
      '&days=' +
      encodeURIComponent(String(range.days))
    );
  }

  /** Known hash paths → back-link labels (no leading #). */
  var BACK_LABELS = {
    activity: 'Customer Activity',
    'activity/leads': 'Email Leads',
    'activity/abandoned': 'Abandoned Carts',
    'activity/custom-leads': 'Custom Leads',
    'activity/countries': 'Countries',
    'activity/traffic': 'Traffic Sources',
    customers: 'Customers',
    orders: 'Orders',
    dashboard: 'Dashboard',
    analytics: 'Analytics',
    products: 'Products',
    'marketing/overview': 'Marketing Overview',
    'marketing/audience': 'Audience',
    'marketing/journeys': 'Journeys',
    'marketing/campaigns': 'Campaigns',
    'marketing/templates': 'Templates',
    'marketing/analytics': 'Marketing Analytics',
    'marketing/settings': 'Marketing Settings',
    settings: 'Settings'
  };

  var BACK_ROOTS = {
    activity: 1,
    customers: 1,
    orders: 1,
    dashboard: 1,
    analytics: 1,
    products: 1,
    marketing: 1,
    settings: 1
  };

  function parseHashQuery() {
    var raw = String(window.location.hash || '');
    var qi = raw.indexOf('?');
    if (qi === -1) return {};
    var out = {};
    String(raw.slice(qi + 1))
      .split('&')
      .forEach(function (pair) {
        if (!pair) return;
        var parts = pair.split('=');
        var key = decodeURIComponent(parts[0] || '');
        if (!key) return;
        out[key] = decodeURIComponent(parts.slice(1).join('=') || '');
      });
    return out;
  }

  function currentFromPath() {
    return String(window.location.hash || '')
      .replace(/^#/, '')
      .split('?')[0]
      .replace(/^\/+/, '');
  }

  function sanitizeFrom(from) {
    if (from == null || from === '') return null;
    var path = String(from)
      .replace(/^#/, '')
      .split('?')[0]
      .replace(/^\/+/, '')
      .trim();
    if (!path || path.indexOf('..') !== -1 || path.indexOf('//') !== -1) return null;
    var root = path.split('/')[0];
    if (!BACK_ROOTS[root]) return null;
    return path;
  }

  function backLabelFor(path) {
    var from = sanitizeFrom(path);
    if (!from) return 'Back';
    if (BACK_LABELS[from]) return BACK_LABELS[from];
    var parts = from.split('/');
    if (parts[0] === 'dashboard' && parts[1] === 'metric') return 'Dashboard';
    if (parts[0] === 'marketing') {
      var mkt = parts.slice(0, 2).join('/');
      if (BACK_LABELS[mkt]) return BACK_LABELS[mkt];
      return 'Marketing';
    }
    if (BACK_LABELS[parts[0]]) return BACK_LABELS[parts[0]];
    return 'Back';
  }

  /**
   * Append ?from=… so detail pages can return to the originating list.
   * @param {string} targetHash e.g. '#activity/abc' or 'activity/abc'
   * @param {string} [fromPath] defaults to current hash path
   */
  function withFrom(targetHash, fromPath) {
    var raw = String(targetHash == null ? '' : targetHash);
    var hasHash = raw.charAt(0) === '#';
    var withoutHash = raw.replace(/^#/, '');
    var base = withoutHash.split('?')[0];
    var existingQ = withoutHash.indexOf('?') !== -1 ? withoutHash.slice(withoutHash.indexOf('?') + 1) : '';
    var from = sanitizeFrom(fromPath != null ? fromPath : currentFromPath());
    if (!base) return hasHash ? '#' : '';
    if (!from || from === base) {
      return (hasHash || raw.charAt(0) === '#' ? '#' : '#') + withoutHash;
    }
    // Drop any existing from= to avoid stacking
    var kept = existingQ
      .split('&')
      .filter(function (p) {
        return p && p.split('=')[0] !== 'from';
      })
      .join('&');
    var q = (kept ? kept + '&' : '') + 'from=' + encodeURIComponent(from);
    return '#' + base + '?' + q;
  }

  function resolveBackNav(defaultHref, defaultLabel) {
    var fallbackPath = String(defaultHref || '')
      .replace(/^#/, '')
      .split('?')[0];
    var from = sanitizeFrom(parseHashQuery().from);
    if (!from) {
      return {
        href: '#' + fallbackPath,
        label: '← ' + (defaultLabel || backLabelFor(fallbackPath) || 'Back')
      };
    }
    return {
      href: '#' + from,
      label: '← ' + backLabelFor(from)
    };
  }

  function backLinkHtml(defaultHref, defaultLabel, className) {
    var nav = resolveBackNav(defaultHref, defaultLabel);
    return (
      '<a href="' +
      escapeHtml(nav.href) +
      '" class="' +
      escapeHtml(className || 'admin-back-link') +
      '">' +
      escapeHtml(nav.label) +
      '</a>'
    );
  }

  window.AdminUtils = {
    RANGE_PRESETS: RANGE_PRESETS,
    resolveRange: resolveRange,
    formatUsdCents: formatUsdCents,
    formatUsd: formatUsd,
    formatNum: formatNum,
    formatDateTime: formatDateTime,
    formatDate: formatDate,
    pct: pct,
    escapeHtml: escapeHtml,
    skeletonCards: skeletonCards,
    skeletonTable: skeletonTable,
    renderDateFilter: renderDateFilter,
    bindDateFilter: bindDateFilter,
    downloadCsv: downloadCsv,
    apiQuery: apiQuery,
    parseHashQuery: parseHashQuery,
    currentFromPath: currentFromPath,
    sanitizeFrom: sanitizeFrom,
    withFrom: withFrom,
    resolveBackNav: resolveBackNav,
    backLinkHtml: backLinkHtml,
    backLabelFor: backLabelFor
  };
})();
