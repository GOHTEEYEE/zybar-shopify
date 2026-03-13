/**
 * Admin Products - Product views, add to cart count, conversion (if available)
 */
window.renderAdminproducts = function (container) {
  if (!container) return;
  var sb = window.supabase;
  if (!sb) {
    container.innerHTML = '<p class="admin-error">Supabase not configured.</p>';
    return;
  }

  container.innerHTML =
    '<h2 class="admin-page-title">Products</h2>' +
    '<div class="admin-card"><h3>Product analytics</h3><div id="productsTable" class="admin-loading">Loading...</div></div>';

  var today = new Date().toISOString().slice(0, 10);
  var tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  Promise.all([
    sb.from('products').select('id, name, slug'),
    sb.from('events').select('product_id, event_type').in('event_type', ['product_view', 'add_to_cart']).gte('created_at', today).lt('created_at', tomorrow)
  ]).then(function (results) {
    var products = (results[0] && results[0].data) || results[0] || [];
    var events = (results[1] && results[1].data) || results[1] || [];
    var byProduct = {};
    products.forEach(function (p) {
      byProduct[p.id] = { id: p.id, name: p.name || p.id, views: 0, addToCart: 0 };
    });
    events.forEach(function (e) {
      var id = e.product_id || 'unknown';
      if (!byProduct[id]) byProduct[id] = { id: id, name: id, views: 0, addToCart: 0 };
      if (e.event_type === 'product_view') byProduct[id].views++;
      if (e.event_type === 'add_to_cart') byProduct[id].addToCart++;
    });
    var rows = Object.keys(byProduct).map(function (k) { return byProduct[k]; }).sort(function (a, b) { return b.views - a.views; });
    var html = '<table class="admin-table"><thead><tr><th>Product</th><th>Views (today)</th><th>Add to cart (today)</th><th>Conversion</th></tr></thead><tbody>';
    rows.forEach(function (r) {
      var conv = r.views > 0 ? ((r.addToCart / r.views) * 100).toFixed(1) + '%' : '-';
      html += '<tr><td>' + (r.name || r.id) + '</td><td>' + r.views + '</td><td>' + r.addToCart + '</td><td>' + conv + '</td></tr>';
    });
    html += '</tbody></table>';
    document.getElementById('productsTable').innerHTML = rows.length ? html : '<p>No product data yet.</p>';
  }).catch(function () {
    document.getElementById('productsTable').innerHTML = '<p class="admin-error">Failed to load data.</p>';
  });
};
