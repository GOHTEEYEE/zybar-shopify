/**
 * ZYBAR.MY test environment – detection and banner.
 * Run first. When ?env=zybar.my, sets ZYBAR_MY_TEST and injects banner.
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
      window.location.href = window.location.pathname + window.location.search.replace(/\?env=zybar\.my&?|&?env=zybar\.my/g, '').replace(/^\?$/, '') || window.location.pathname;
    });
    document.body.insertBefore(bar, document.body.firstChild);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectBanner);
  } else {
    injectBanner();
  }
})();
