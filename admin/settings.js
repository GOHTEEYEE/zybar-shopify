/**
 * Admin Settings — Pricing, Reviews, Inquiries, Chatbot (folded out of main nav).
 */
window.renderAdminsettings = function (container) {
  if (!container) return;

  var hash = (window.location.hash || '#settings').slice(1);
  var parts = hash.split('/');
  var section = parts[1] || 'home';

  var sections = [
    { id: 'pricing', label: 'Pricing & Shipping', desc: 'Product size prices and shipping methods', render: 'renderAdminpricing' },
    { id: 'reviews', label: 'Reviews', desc: 'Moderate product reviews', render: 'renderAdminreviews' },
    { id: 'inquiries', label: 'Inquiries', desc: 'Contact form submissions', render: 'renderAdmininquiries' },
    { id: 'chatbot', label: 'Chatbot', desc: 'Storefront chatbot settings', render: 'renderAdminchatbot' }
  ];

  if (section === 'home') {
    container.innerHTML =
      '<div class="admin-page-header"><h2 class="admin-page-title">Settings</h2></div>' +
      '<p class="admin-muted" style="margin-top:0">Store configuration and secondary tools.</p>' +
      '<div class="admin-settings-grid">' +
      sections
        .map(function (s) {
          return (
            '<a class="admin-settings-card" href="#settings/' +
            s.id +
            '">' +
            '<h3>' +
            s.label +
            '</h3>' +
            '<p>' +
            s.desc +
            '</p></a>'
          );
        })
        .join('') +
      '</div>';
    return;
  }

  var match = sections.filter(function (s) {
    return s.id === section;
  })[0];
  if (!match || !window[match.render]) {
    container.innerHTML =
      '<p class="admin-error">Unknown settings section.</p><p><a href="#settings">← Settings</a></p>';
    return;
  }

  container.innerHTML =
    '<div class="admin-page-header"><div><a href="#settings" class="admin-back-link">← Settings</a></div></div>' +
    '<div id="adminSettingsHost"></div>';
  window[match.render](document.getElementById('adminSettingsHost'));
};

// Always use light admin theme (clear any previous dark preference)
(function () {
  try {
    localStorage.removeItem('zybar_admin_theme');
  } catch (_) {}
  document.documentElement.removeAttribute('data-admin-theme');
})();
