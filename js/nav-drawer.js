(function () {
  'use strict';

  if (window.location.pathname.indexOf('/admin/') === 0) return;

  var CUSTOM_MADE_HREF = '/products/custom-led-car-wall-art/';
  var CATALOG_HREF = '/collections/all/';
  var ABOUT_HREF = '/about/about-us.html';

  var PRIMARY_NAV = [
    { href: '/', label: 'Home' },
    { href: CATALOG_HREF, label: 'Catalog' },
    { href: ABOUT_HREF, label: 'About' },
    { href: '/contact.html', label: 'Contact' }
  ];

  var NAV_SECTIONS = [
    {
      title: 'Shop',
      links: [
        { href: CATALOG_HREF, label: 'Ready Made Collection' },
        { href: CUSTOM_MADE_HREF, label: 'Custom Made Collection' },
        { href: CATALOG_HREF, label: 'All Products' }
      ]
    },
    {
      title: 'Support',
      links: [
        { href: '/policies/faq.html', label: 'Shipping & FAQ' },
        { href: '/policies/refund-policy.html', label: 'Refund Policy' },
        { href: '/policies/privacy-policy/', label: 'Privacy Policy' },
        { href: '/contact.html', label: 'Contact Us' }
      ]
    },
    {
      title: 'Company',
      links: [{ href: ABOUT_HREF, label: 'About ZYBAR' }]
    }
  ];

  var SOCIAL_LINKS = [
    {
      type: 'instagram',
      label: 'Instagram',
      href: 'https://www.instagram.com/zybar.shop?igsh=ZWtrbzJvMWtheG82'
    },
    {
      type: 'tiktok',
      label: 'TikTok',
      href: 'https://www.tiktok.com/@zybar.shop?_r=1&_t=ZS-986wLWv44xA'
    },
    {
      type: 'facebook',
      label: 'Facebook',
      href: 'https://www.facebook.com/people/ZY-Bar/61552413785446/'
    }
  ];

  function normalizePath(path) {
    var value = (path || '/').split('?')[0].split('#')[0];
    value = value.replace(/\/+$/, '') || '/';
    if (value === '/index.html') return '/';
    return value;
  }

  function isActiveLink(href) {
    var current = normalizePath(window.location.pathname);
    var target = normalizePath(href);
    if (target === '/') return current === '/';
    return current === target || current.indexOf(target + '/') === 0;
  }

  function hamburgerSvg() {
    return (
      '<svg class="nav-drawer-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
      '<line x1="4" y1="7" x2="20" y2="7"></line>' +
      '<line x1="4" y1="12" x2="20" y2="12"></line>' +
      '<line x1="4" y1="17" x2="20" y2="17"></line>' +
      '</svg>'
    );
  }

  function searchSvg() {
    return (
      '<svg class="header-icon-svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
      '<circle cx="11" cy="11" r="7"></circle>' +
      '<line x1="16.5" y1="16.5" x2="21" y2="21"></line>' +
      '</svg>'
    );
  }

  function cartSvg() {
    return (
      '<svg class="header-icon-svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="9" cy="20" r="1.5"></circle>' +
      '<circle cx="18" cy="20" r="1.5"></circle>' +
      '<path d="M2 3h2l2.2 11.2a2 2 0 0 0 2 1.6h9.2a2 2 0 0 0 2-1.6L22 7H6"></path>' +
      '</svg>'
    );
  }

  function socialSvg(type) {
    if (type === 'instagram') {
      return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"></rect><circle cx="12" cy="12" r="4"></circle><circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none"></circle></svg>';
    }
    if (type === 'tiktok') {
      return '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.5 3a5.2 5.2 0 0 0 1 3.4V9a7.8 7.8 0 0 1-4.5-1.4v6.8a5.4 5.4 0 1 1-5.4-5.4c.3 0 .6 0 .9.1v2.4a3 3 0 1 0 2.1 2.9V3h2.9z"></path></svg>';
    }
    if (type === 'facebook') {
      return '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14 8.5V6.8c0-.7.1-1 .9-1H17V3h-2.4C11.8 3 11 4.8 11 7.2V8.5H9v2.7h2V21h3v-9.8h2.6L17 11h-3z"></path></svg>';
    }
    return '';
  }

  function createNavLink(item) {
    var link = document.createElement('a');
    link.href = item.href;
    link.className = 'nav-drawer-link';
    link.textContent = item.label;
    if (isActiveLink(item.href)) {
      link.classList.add('is-active');
      link.setAttribute('aria-current', 'page');
    }
    return link;
  }

  function buildFeaturedCard() {
    var card = document.createElement('a');
    card.className = 'nav-drawer-featured';
    card.href = CUSTOM_MADE_HREF;
    card.setAttribute('aria-label', 'Custom Made — Turn Your Own Car Into Light');
    card.innerHTML =
      '<p class="nav-drawer-featured-kicker">Custom Made</p>' +
      '<p class="nav-drawer-featured-title">Turn Your Own Car Into Light</p>' +
      '<span class="nav-drawer-featured-cta">Create Yours <span aria-hidden="true">→</span></span>';
    return card;
  }

  function buildDrawer() {
    if (document.getElementById('zybar-nav-drawer')) return document.getElementById('zybar-nav-drawer');

    var root = document.createElement('div');
    root.id = 'zybar-nav-drawer';
    root.className = 'nav-drawer';
    root.setAttribute('aria-hidden', 'true');

    var overlay = document.createElement('button');
    overlay.type = 'button';
    overlay.className = 'nav-drawer-overlay';
    overlay.setAttribute('aria-label', 'Close menu');
    overlay.tabIndex = -1;

    var panel = document.createElement('aside');
    panel.className = 'nav-drawer-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Site menu');

    var header = document.createElement('div');
    header.className = 'nav-drawer-header';

    var logo = document.createElement('a');
    logo.className = 'nav-drawer-brand';
    logo.href = '/';
    logo.textContent = 'ZYBAR';

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'nav-drawer-close icon-btn';
    closeBtn.setAttribute('aria-label', 'Close menu');
    closeBtn.innerHTML = '&times;';

    header.appendChild(logo);
    header.appendChild(closeBtn);

    var scroll = document.createElement('div');
    scroll.className = 'nav-drawer-scroll';

    scroll.appendChild(buildFeaturedCard());

    var nav = document.createElement('nav');
    nav.className = 'nav-drawer-nav';
    nav.setAttribute('aria-label', 'Main');

    NAV_SECTIONS.forEach(function (section) {
      var group = document.createElement('div');
      group.className = 'nav-drawer-section';

      var heading = document.createElement('h2');
      heading.className = 'nav-drawer-section-title';
      heading.textContent = section.title;
      group.appendChild(heading);

      var list = document.createElement('div');
      list.className = 'nav-drawer-section-links';
      section.links.forEach(function (item) {
        list.appendChild(createNavLink(item));
      });
      group.appendChild(list);
      nav.appendChild(group);
    });

    scroll.appendChild(nav);

    var follow = document.createElement('div');
    follow.className = 'nav-drawer-follow';

    var followTitle = document.createElement('h2');
    followTitle.className = 'nav-drawer-section-title';
    followTitle.textContent = 'Follow Us';
    follow.appendChild(followTitle);

    var social = document.createElement('div');
    social.className = 'nav-drawer-social';
    social.setAttribute('aria-label', 'Social media');
    SOCIAL_LINKS.forEach(function (item) {
      var socialLink = document.createElement('a');
      socialLink.href = item.href;
      socialLink.className = 'nav-drawer-social-link';
      socialLink.setAttribute('aria-label', item.label);
      socialLink.target = '_blank';
      socialLink.rel = 'noopener noreferrer';
      socialLink.innerHTML = socialSvg(item.type);
      social.appendChild(socialLink);
    });
    follow.appendChild(social);
    scroll.appendChild(follow);

    panel.appendChild(header);
    panel.appendChild(scroll);

    root.appendChild(overlay);
    root.appendChild(panel);
    document.body.appendChild(root);

    return root;
  }

  function initHeader(headerWrap) {
    if (!headerWrap || headerWrap.getAttribute('data-nav-drawer-init') === 'true') return;
    headerWrap.setAttribute('data-nav-drawer-init', 'true');
    headerWrap.classList.add('header-toolbar');

    var inlineNav = headerWrap.querySelector('.main-nav');
    if (inlineNav) {
      inlineNav.classList.add('header-inline-nav');
      inlineNav.innerHTML = PRIMARY_NAV.map(function (link) {
        return (
          '<a href="' +
          link.href +
          '"' +
          (isActiveLink(link.href) ? ' aria-current="page" class="is-active"' : '') +
          '>' +
          link.label +
          '</a>'
        );
      }).join('');
      inlineNav.removeAttribute('aria-hidden');
      inlineNav.hidden = false;
    }

    var currency = headerWrap.querySelector('.currency');
    if (currency) currency.hidden = true;

    if (!headerWrap.querySelector('.nav-drawer-toggle')) {
      var toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'nav-drawer-toggle icon-btn';
      toggle.setAttribute('aria-label', 'Open menu');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-controls', 'zybar-nav-drawer');
      toggle.innerHTML = hamburgerSvg();
      headerWrap.insertBefore(toggle, headerWrap.firstChild);
    }

    var logo = headerWrap.querySelector('.zybar-logo');
    if (logo) logo.classList.add('header-logo-center');

    var actions = headerWrap.querySelector('.header-actions');
    if (actions) {
      actions.classList.add('header-toolbar-actions');

      if (!actions.querySelector('button[aria-label="Search"]')) {
        var newSearchBtn = document.createElement('button');
        newSearchBtn.type = 'button';
        newSearchBtn.className = 'icon-btn';
        newSearchBtn.setAttribute('aria-label', 'Search');
        newSearchBtn.innerHTML = searchSvg();
        var cartTarget = actions.querySelector('a[aria-label="Cart"]');
        if (cartTarget) {
          actions.insertBefore(newSearchBtn, cartTarget);
        } else {
          actions.appendChild(newSearchBtn);
        }
      }

      var searchBtn = actions.querySelector('button[aria-label="Search"]');
      if (searchBtn && !searchBtn.querySelector('.header-icon-svg')) {
        searchBtn.innerHTML = searchSvg();
      }

      var cartLink = actions.querySelector('a[aria-label="Cart"]');
      if (cartLink && !cartLink.querySelector('.header-icon-svg')) {
        var cartHtml = cartSvg();
        var badge = cartLink.querySelector('.zybar-cart-badge');
        cartLink.innerHTML = cartHtml;
        if (badge) cartLink.appendChild(badge);
      }
    }
  }

  function initDrawerBehavior(drawer) {
    var overlay = drawer.querySelector('.nav-drawer-overlay');
    var panel = drawer.querySelector('.nav-drawer-panel');
    var closeBtn = drawer.querySelector('.nav-drawer-close');
    var toggles = [];
    var lastFocus = null;

    function collectToggles() {
      toggles = Array.prototype.slice.call(document.querySelectorAll('.nav-drawer-toggle'));
    }

    collectToggles();

    function setExpanded(open) {
      collectToggles();
      toggles.forEach(function (toggle) {
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    }

    function openDrawer(trigger) {
      lastFocus = trigger || document.activeElement;
      drawer.classList.add('is-open');
      drawer.setAttribute('aria-hidden', 'false');
      document.body.classList.add('nav-drawer-open');
      setExpanded(true);
      var firstFocus =
        panel.querySelector('.nav-drawer-featured') ||
        panel.querySelector('.nav-drawer-link');
      if (firstFocus) firstFocus.focus();
    }

    function closeDrawer() {
      drawer.classList.remove('is-open');
      drawer.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('nav-drawer-open');
      setExpanded(false);
      if (lastFocus && typeof lastFocus.focus === 'function') {
        lastFocus.focus();
      }
    }

    document.addEventListener('click', function (event) {
      var toggle = event.target.closest('.nav-drawer-toggle');
      if (toggle) {
        event.preventDefault();
        if (drawer.classList.contains('is-open')) {
          closeDrawer();
        } else {
          openDrawer(toggle);
        }
        return;
      }

      var searchBtn = event.target.closest('.header-actions button[aria-label="Search"]');
      if (searchBtn) {
        event.preventDefault();
        ensureSearchReady(function () {
          if (window.ZYBAR && window.ZYBAR.SearchOverlay && window.ZYBAR.SearchOverlay.open) {
            window.ZYBAR.SearchOverlay.open();
          }
        });
      }
    });

    overlay.addEventListener('click', closeDrawer);
    closeBtn.addEventListener('click', closeDrawer);

    panel.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', closeDrawer);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && drawer.classList.contains('is-open')) {
        event.preventDefault();
        closeDrawer();
      }
    });
  }

  function ensureSearchReady(callback) {
    if (window.ZYBAR && window.ZYBAR.SearchOverlay) {
      callback();
      return;
    }
    function loadScript(src, next) {
      if (document.querySelector('script[src="' + src + '"]')) {
        next();
        return;
      }
      var s = document.createElement('script');
      s.src = src;
      s.defer = true;
      s.onload = next;
      s.onerror = next;
      document.head.appendChild(s);
    }
    loadScript('/js/search-engine.js?v=search3', function () {
      loadScript('/js/search-overlay.js?v=search3', function () {
        if (window.ZYBAR && window.ZYBAR.SearchOverlay && window.ZYBAR.SearchOverlay.init) {
          window.ZYBAR.SearchOverlay.init();
        }
        callback();
      });
    });
  }

  function wireCartLink() {
    document.querySelectorAll('.header-actions a[aria-label="Cart"]').forEach(function (cartLink) {
      cartLink.setAttribute('href', '/cart/');
    });
  }

  function initHeaderScroll() {
    if (document.body.classList.contains('checkout-page')) return;

    var header = document.querySelector('.site-header');
    if (!header || header.getAttribute('data-header-scroll-init') === 'true') return;
    header.setAttribute('data-header-scroll-init', 'true');

    var HERO_SELECTORS = [
      '[data-site-hero]',
      '.poster-hero--adaptive',
      '.poster-hero',
      '#hero-scroll',
      '.product-showcase-image',
      '.contact-hero'
    ];

    var ticking = false;
    var spacer = null;
    var heroElement = null;

    function getHeroElement() {
      if (heroElement && document.body.contains(heroElement)) return heroElement;
      heroElement = null;
      for (var i = 0; i < HERO_SELECTORS.length; i++) {
        var el = document.querySelector(HERO_SELECTORS[i]);
        if (el) {
          heroElement = el;
          return el;
        }
      }
      return null;
    }

    function measureHeader() {
      var height = header.offsetHeight;
      document.documentElement.style.setProperty('--site-header-height', height + 'px');
      if (spacer) spacer.style.height = height + 'px';
    }

    function ensureSpacer() {
      if (spacer || !header.parentNode) return;
      spacer = document.createElement('div');
      spacer.className = 'site-header-spacer';
      spacer.setAttribute('aria-hidden', 'true');
      header.parentNode.insertBefore(spacer, header.nextSibling);
      measureHeader();
    }

    function updateHeaderOffset() {
      var topPx = 0;
      if (document.body.classList.contains('has-zybar-my-banner')) {
        var banner = document.getElementById('zybar-my-banner');
        if (banner) topPx = Math.max(topPx, banner.offsetHeight);
      }
      var welcome = document.querySelector('.welcome-bar');
      if (welcome) {
        var welcomeBottom = welcome.getBoundingClientRect().bottom;
        if (welcomeBottom > 0) topPx = Math.max(topPx, welcomeBottom);
      }
      header.style.top = topPx > 0 ? topPx + 'px' : '';
    }

    function isPastHero() {
      var hero = getHeroElement();
      if (!hero) return true;
      var heroBottom = hero.getBoundingClientRect().bottom;
      var headerBottom = header.getBoundingClientRect().bottom;
      return heroBottom <= headerBottom + 1;
    }

    function updateHeader() {
      ticking = false;
      updateHeaderOffset();
      var pastHero = isPastHero();
      header.classList.toggle('is-in-hero', !pastHero);
      header.classList.toggle('is-floating', pastHero);
    }

    function onScroll() {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(updateHeader);
      }
    }

    ensureSpacer();
    updateHeader();

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener(
      'resize',
      function () {
        heroElement = null;
        measureHeader();
        updateHeader();
      },
      { passive: true }
    );
    window.addEventListener('load', function () {
      heroElement = null;
      measureHeader();
      updateHeader();
    });
  }

  function init() {
    var headers = Array.prototype.slice.call(document.querySelectorAll('.site-header .header-wrap'));
    if (!headers.length) return;

    wireCartLink();
    headers.forEach(initHeader);
    initHeaderScroll();

    var drawer = buildDrawer();
    initDrawerBehavior(drawer);
    ensureSearchReady(function () {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
