/**
 * ZYBAR.MY test environment – detection, banner, and branding for main site.
 * When ?env=zybar.my, sets ZYBAR_MY_TEST and updates title/logo to ZYBAR.MY (BETA/TESTING).
 */
(function () {
  'use strict';
  var search = typeof window !== 'undefined' && window.location && window.location.search;
  var isTest = search && search.indexOf('env=zybar.my') !== -1;
  if (isTest && typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem('zybar.my', '1');
  }
  if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('zybar.my') === '1') {
    isTest = true;
  }
  window.ZYBAR_MY_TEST = !!isTest;

  if (!isTest) return;

  function injectBanner() {
    if (document.getElementById('zybar-my-banner')) return;
    document.body.classList.add('has-zybar-my-banner');
    var bar = document.createElement('div');
    bar.id = 'zybar-my-banner';
    bar.setAttribute('role', 'status');
    bar.className = 'zybar-my-banner';
    bar.innerHTML = 'ZYBAR.MY - TESTING ENVIRONMENT (VIRTUAL DATA ONLY) <a href="#" class="zybar-my-exit">Exit test mode</a>';
    bar.querySelector('.zybar-my-exit').addEventListener('click', function (e) {
      e.preventDefault();
      if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('zybar.my');
      window.location.href = window.location.pathname + (window.location.search ? window.location.search.replace(/\benv=zybar\.my&?|&?env=zybar\.my\b/g, '').replace(/^\?&?$/, '') : '') || window.location.pathname;
    });
    document.body.insertBefore(bar, document.body.firstChild);
  }

  function applyBranding() {
    document.title = 'ZYBAR.MY (BETA/TESTING) | LED Car Art – Automotive Light Artwork';
    var logo = document.querySelector('.zybar-logo img, .brand img');
    if (logo) logo.setAttribute('alt', 'ZYBAR.MY (BETA/TESTING)');
    var heroText = document.querySelector('.poster-hero-overlay p');
    if (heroText && heroText.textContent.indexOf('ZYBAR') !== -1) heroText.textContent = 'LED automotive wall art from ZYBAR.MY (BETA/TESTING)';
    var foot = document.querySelector('footer a[href="/"]');
    if (foot && foot.textContent === 'ZYBAR') foot.textContent = 'ZYBAR.MY';
    var brandLink = document.querySelector('.site-header .brand.zybar-logo, .site-header .brand');
    if (brandLink && !document.getElementById('zybar-my-badge')) {
      var badge = document.createElement('span');
      badge.id = 'zybar-my-badge';
      badge.className = 'zybar-my-env-badge';
      badge.setAttribute('aria-label', 'Testing environment');
      badge.textContent = 'zybar.my';
      brandLink.appendChild(badge);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      injectBanner();
      applyBranding();
    });
  } else {
    injectBanner();
    applyBranding();
  }
})();
