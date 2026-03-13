/**
 * Admin Analytics - Charts: page views per day, unique visitors, traffic sources, top pages
 */
window.renderAdminanalytics = function (container) {
  if (!container) return;
  var sb = window.supabase;
  if (!sb) {
    container.innerHTML = '<p class="admin-error">Supabase not configured.</p>';
    return;
  }

  container.innerHTML =
    '<h2 class="admin-page-title">Analytics</h2>' +
    '<div class="admin-card"><h3>Page views per day</h3><div class="chart-container"><canvas id="chartPageViews"></canvas></div></div>' +
    '<div class="admin-card"><h3>Unique visitors per day</h3><div class="chart-container"><canvas id="chartVisitors"></canvas></div></div>' +
    '<div class="admin-card"><h3>Traffic sources</h3><div class="chart-container"><canvas id="chartSources"></canvas></div></div>' +
    '<div class="admin-card"><h3>Top pages</h3><div class="chart-container"><canvas id="chartTopPages"></canvas></div></div>';

  var end = new Date();
  var start = new Date(end);
  start.setDate(start.getDate() - 14);
  var startStr = start.toISOString().slice(0, 10);
  var endStr = new Date(end.getTime() + 86400000).toISOString().slice(0, 10);

  sb.from('page_views').select('created_at, visitor_id, referrer, page_url').gte('created_at', startStr).lt('created_at', endStr)
    .then(function (res) {
      var data = (res && res.data) || [];
      var byDay = {};
      var dayKeys = [];
      for (var d = new Date(startStr); d < new Date(endStr); d.setDate(d.getDate() + 1)) {
        var k = d.toISOString().slice(0, 10);
        dayKeys.push(k);
        byDay[k] = { views: 0, visitors: new Set() };
      }
      data.forEach(function (r) {
        var k = (r.created_at || '').slice(0, 10);
        if (byDay[k]) {
          byDay[k].views++;
          byDay[k].visitors.add(r.visitor_id);
        }
      });

      var labels = dayKeys.map(function (k) { return k.slice(5); });
      var viewsData = dayKeys.map(function (k) { return (byDay[k] && byDay[k].views) || 0; });
      var visitorsData = dayKeys.map(function (k) { return (byDay[k] && byDay[k].visitors.size) || 0; });

      new Chart(document.getElementById('chartPageViews'), {
        type: 'line',
        data: { labels: labels, datasets: [{ label: 'Page views', data: viewsData, borderColor: '#4f7cff', fill: true, tension: 0.3 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
      });
      new Chart(document.getElementById('chartVisitors'), {
        type: 'line',
        data: { labels: labels, datasets: [{ label: 'Unique visitors', data: visitorsData, borderColor: '#10b981', fill: true, tension: 0.3 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
      });

      var refMap = {};
      data.forEach(function (r) {
        var ref = (r.referrer && r.referrer.length > 0) ? (r.referrer.length > 40 ? r.referrer.slice(0, 40) + '…' : r.referrer) : 'Direct';
        refMap[ref] = (refMap[ref] || 0) + 1;
      });
      var refLabels = Object.keys(refMap);
      var refValues = refLabels.map(function (k) { return refMap[k]; });
      new Chart(document.getElementById('chartSources'), {
        type: 'doughnut',
        data: { labels: refLabels, datasets: [{ data: refValues, backgroundColor: ['#4f7cff', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'] }] },
        options: { responsive: true, maintainAspectRatio: false }
      });

      var urlMap = {};
      data.forEach(function (r) {
        var u = r.page_url || '/';
        urlMap[u] = (urlMap[u] || 0) + 1;
      });
      var urlKeys = Object.keys(urlMap).sort(function (a, b) { return urlMap[b] - urlMap[a]; }).slice(0, 8);
      new Chart(document.getElementById('chartTopPages'), {
        type: 'bar',
        data: { labels: urlKeys.map(function (u) { return u.length > 30 ? u.slice(0, 30) + '…' : u; }), datasets: [{ label: 'Views', data: urlKeys.map(function (k) { return urlMap[k]; }), backgroundColor: '#4f7cff' }] },
        options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', scales: { x: { beginAtZero: true } } }
      });
    })
    .catch(function () {
      document.getElementById('chartPageViews').parentElement.innerHTML = '<p class="admin-error">Failed to load data.</p>';
    });
};
