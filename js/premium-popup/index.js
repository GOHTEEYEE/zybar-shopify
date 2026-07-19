(function (root) {
  'use strict';

  var LANGUAGES = [
    { code: 'en', label: 'English' },
    { code: 'fr', label: 'Français' },
    { code: 'de', label: 'Deutsch' },
    { code: 'es', label: 'Español' },
    { code: 'it', label: 'Italiano' },
    { code: 'nl', label: 'Nederlands' }
  ];

  var HERO_SRC = '/Poster/popup-garage-hero.png';
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function detectLanguage() {
    var nav = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
    var short = nav.slice(0, 2);
    for (var i = 0; i < LANGUAGES.length; i += 1) {
      if (LANGUAGES[i].code === short) return short;
    }
    return 'en';
  }

  function readUtm() {
    try {
      var params = new URLSearchParams(window.location.search || '');
      return {
        utm_source: params.get('utm_source') || '',
        utm_medium: params.get('utm_medium') || '',
        utm_campaign: params.get('utm_campaign') || ''
      };
    } catch (err) {
      return { utm_source: '', utm_medium: '', utm_campaign: '' };
    }
  }

  function isMobile() {
    return window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
  }

  function isExcludedPath() {
    var path = (window.location.pathname || '').toLowerCase();
    if (path.indexOf('/admin') === 0) return true;
    if (path.indexOf('/checkout') === 0) return true;
    if (path.indexOf('/purchase-confirmation') === 0) return true;
    if (path.indexOf('/receipt') === 0) return true;
    return false;
  }

  function ensureStylesheet() {
    if (document.getElementById('zybar-premium-popup-css')) return;
    var link = document.createElement('link');
    link.id = 'zybar-premium-popup-css';
    link.rel = 'stylesheet';
    link.href = '/css/premium-popup.css?v=20260718-square';
    document.head.appendChild(link);
  }

  function createPopupDom() {
    var overlay = document.createElement('div');
    overlay.className = 'zybar-popup-overlay';
    overlay.id = 'zybar-premium-popup';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'zybar-popup-title');
    overlay.hidden = true;

    var langOptions = LANGUAGES.map(function (lang) {
      return '<option value="' + lang.code + '">' + lang.label + '</option>';
    }).join('');

    overlay.innerHTML =
      '<div class="zybar-popup" role="document">' +
      '<button type="button" class="zybar-popup-close" aria-label="Close">&times;</button>' +
      '<div class="zybar-popup-form-view">' +
      '<div class="zybar-popup-hero-wrap">' +
      '<img class="zybar-popup-hero" src="' +
      HERO_SRC +
      '" alt="ZYBAR LED car wall art in a luxury living room" width="520" height="520" loading="eager" />' +
      '</div>' +
      '<div class="zybar-popup-body">' +
      '<p class="zybar-popup-kicker">Welcome to</p>' +
      '<h2 class="zybar-popup-title" id="zybar-popup-title">THE ZYBAR GARAGE</h2>' +
      '<p class="zybar-popup-offer">Enjoy <strong>15% OFF</strong><br />your first order.</p>' +
      '<ul class="zybar-popup-benefits" aria-label="Member benefits">' +
      '<li><span aria-hidden="true">✓</span>15% OFF Today</li>' +
      '<li><span aria-hidden="true">✓</span>Early Access to New Collections</li>' +
      '<li><span aria-hidden="true">✓</span>Members-only Promotions</li>' +
      '</ul>' +
      '<form class="zybar-popup-form" novalidate>' +
      '<label class="visually-hidden" for="zybar-popup-email">Email</label>' +
      '<input id="zybar-popup-email" class="zybar-popup-input" type="email" name="email" autocomplete="email" inputmode="email" placeholder="Enter your email" required />' +
      '<label class="visually-hidden" for="zybar-popup-language">Language</label>' +
      '<select id="zybar-popup-language" class="zybar-popup-select" name="language" aria-label="Preferred language">' +
      langOptions +
      '</select>' +
      '<p class="zybar-popup-error" id="zybar-popup-error" role="alert" aria-live="polite"></p>' +
      '<button type="submit" class="zybar-popup-cta">Unlock My 15% Off</button>' +
      '<p class="zybar-popup-note">No spam. Unsubscribe anytime.</p>' +
      '</form>' +
      '</div></div>' +
      '<div class="zybar-popup-success" hidden>' +
      '<div class="zybar-popup-success-icon" aria-hidden="true">✓</div>' +
      '<h2>✓ Welcome to ZYBAR Garage</h2>' +
      '<p class="zybar-popup-success-copy">Your 15% discount has been sent.</p>' +
      '<div class="zybar-popup-code-wrap">' +
      '<div class="zybar-popup-code-label">Discount Code</div>' +
      '<div class="zybar-popup-code">ZYBAR15</div>' +
      '</div>' +
      '<button type="button" class="zybar-popup-cta zybar-popup-continue">Continue Shopping</button>' +
      '</div></div>';

    if (!document.getElementById('zybar-popup-visually-hidden-style')) {
      var style = document.createElement('style');
      style.id = 'zybar-popup-visually-hidden-style';
      style.textContent =
        '.visually-hidden{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;}';
      document.head.appendChild(style);
    }

    document.body.appendChild(overlay);
    return overlay;
  }

  function createTeaserDom() {
    var teaser = document.createElement('div');
    teaser.className = 'zybar-popup-teaser';
    teaser.id = 'zybar-premium-popup-teaser';
    teaser.hidden = true;
    teaser.innerHTML =
      '<button type="button" class="zybar-popup-teaser-open" aria-label="Open 15% bonus offer">' +
      '<span class="zybar-popup-teaser-label">BONUS 15%</span>' +
      '</button>' +
      '<button type="button" class="zybar-popup-teaser-close" aria-label="Hide bonus offer">&times;</button>';
    document.body.appendChild(teaser);
    return teaser;
  }

  function PremiumPopupController() {
    this.overlay = null;
    this.teaser = null;
    this.open = false;
    this.trigger = 'timer';
    this.lastFocused = null;
    this.exitIntentArmed = false;
  }

  PremiumPopupController.prototype.mount = function () {
    ensureStylesheet();
    if (!this.overlay) {
      this.overlay = createPopupDom();
      this.bindEvents();
      var langSelect = this.overlay.querySelector('#zybar-popup-language');
      if (langSelect) langSelect.value = detectLanguage();
    }
    if (!this.teaser) {
      this.teaser = createTeaserDom();
      this.bindTeaserEvents();
    }
  };

  PremiumPopupController.prototype.bindEvents = function () {
    var self = this;
    var overlay = this.overlay;
    var form = overlay.querySelector('.zybar-popup-form');
    var emailInput = overlay.querySelector('#zybar-popup-email');
    var closeBtn = overlay.querySelector('.zybar-popup-close');
    var continueBtn = overlay.querySelector('.zybar-popup-continue');

    closeBtn.addEventListener('click', function () {
      self.close('dismiss');
    });

    continueBtn.addEventListener('click', function () {
      self.close('continue');
    });

    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) self.close('overlay');
    });

    document.addEventListener('keydown', function (event) {
      if (!self.open) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        self.close('escape');
      }
    });

    emailInput.addEventListener('input', function () {
      var value = emailInput.value.trim();
      var valid = !value || EMAIL_RE.test(value);
      emailInput.classList.toggle('is-invalid', !valid);
      if (valid) self.setError('');
      else self.setError('Please enter a valid email.');
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      self.submitForm();
    });
  };

  PremiumPopupController.prototype.bindTeaserEvents = function () {
    var self = this;
    var openBtn = this.teaser.querySelector('.zybar-popup-teaser-open');
    var closeBtn = this.teaser.querySelector('.zybar-popup-teaser-close');

    openBtn.addEventListener('click', function () {
      self.hideTeaser();
      self.show('teaser', { force: true });
    });

    closeBtn.addEventListener('click', function (event) {
      event.stopPropagation();
      root.ZYBAR.PremiumPopupStorage.hideTeaserThisSession();
      self.hideTeaser();
    });
  };

  PremiumPopupController.prototype.showTeaser = function () {
    if (!this.teaser) return;
    if (!root.ZYBAR.PremiumPopupStorage.shouldShowTeaser()) return;
    this.teaser.hidden = false;
    requestAnimationFrame(function () {
      this.teaser.classList.add('is-visible');
    }.bind(this));
  };

  PremiumPopupController.prototype.hideTeaser = function () {
    if (!this.teaser) return;
    this.teaser.classList.remove('is-visible');
    this.teaser.hidden = true;
  };

  PremiumPopupController.prototype.setError = function (message) {
    var el = this.overlay.querySelector('#zybar-popup-error');
    if (el) el.textContent = message || '';
  };

  PremiumPopupController.prototype.show = function (trigger, options) {
    if (this.open || !this.overlay) return;
    var storage = root.ZYBAR.PremiumPopupStorage;
    var force = options && options.force;
    if (!force && !storage.shouldShowPopup()) return;
    if (storage.readState().submitted) return;

    this.hideTeaser();
    this.trigger = trigger || 'timer';
    this.lastFocused = document.activeElement;
    this.overlay.hidden = false;
    requestAnimationFrame(function () {
      this.overlay.classList.add('is-open');
    }.bind(this));
    this.open = true;
    document.body.style.overflow = 'hidden';
    storage.markShown();
    if (root.ZYBAR.PremiumPopupAnalytics) {
      root.ZYBAR.PremiumPopupAnalytics.trackPopupViewed(this.trigger);
    }
    var emailInput = this.overlay.querySelector('#zybar-popup-email');
    if (emailInput) setTimeout(function () { emailInput.focus(); }, 260);
  };

  PremiumPopupController.prototype.close = function (reason) {
    if (!this.open || !this.overlay) return;
    var wasSuccess = Boolean(this.overlay.querySelector('.zybar-popup-success:not([hidden])'));
    this.overlay.classList.remove('is-open');
    this.open = false;
    document.body.style.overflow = '';
    setTimeout(function () {
      if (this.overlay) this.overlay.hidden = true;
    }.bind(this), 250);

    if (wasSuccess || reason === 'continue') {
      root.ZYBAR.PremiumPopupStorage.clearTeaser();
      this.hideTeaser();
    } else {
      root.ZYBAR.PremiumPopupStorage.markDismissed();
      this.showTeaser();
    }
    if (root.ZYBAR.PremiumPopupAnalytics) {
      root.ZYBAR.PremiumPopupAnalytics.trackPopupClosed(reason || 'dismiss');
    }
    if (this.lastFocused && this.lastFocused.focus) {
      try { this.lastFocused.focus(); } catch (err) { /* ignore */ }
    }
  };

  PremiumPopupController.prototype.showSuccess = function (payload) {
    var formView = this.overlay.querySelector('.zybar-popup-form-view');
    var successView = this.overlay.querySelector('.zybar-popup-success');
    var codeEl = this.overlay.querySelector('.zybar-popup-code');
    var copy = this.overlay.querySelector('.zybar-popup-success-copy');
    var title = successView.querySelector('h2');

    if (payload && payload.alreadyMember) {
      title.textContent = "You're already a member.";
      copy.textContent = 'Your 15% discount code is ready to use at checkout.';
    } else {
      title.textContent = '✓ Welcome to ZYBAR Garage';
      copy.textContent = 'Your 15% discount has been sent.';
    }

    if (codeEl) codeEl.textContent = (payload && payload.discountCode) || 'ZYBAR15';
    if (formView) formView.hidden = true;
    if (successView) successView.hidden = false;
    this.overlay.querySelector('.zybar-popup-close').focus();
  };

  PremiumPopupController.prototype.submitForm = async function () {
    var emailInput = this.overlay.querySelector('#zybar-popup-email');
    var languageSelect = this.overlay.querySelector('#zybar-popup-language');
    var cta = this.overlay.querySelector('.zybar-popup-form .zybar-popup-cta');
    var email = (emailInput.value || '').trim().toLowerCase();
    var language = languageSelect.value || 'en';

    if (!EMAIL_RE.test(email)) {
      emailInput.classList.add('is-invalid');
      this.setError('Please enter a valid email.');
      emailInput.focus();
      return;
    }

    this.setError('');
    cta.disabled = true;
    cta.textContent = 'Unlocking…';

    var utm = readUtm();
    var analytics = window.ZYBAR && window.ZYBAR.Analytics ? window.ZYBAR.Analytics : null;
    var body = {
      email: email,
      language: language,
      source: 'premium_popup',
      userAgent: navigator.userAgent || '',
      visitor_id: analytics && analytics.getVisitorId ? analytics.getVisitorId() : null,
      session_id: analytics && analytics.getSessionId ? analytics.getSessionId() : null,
      utm_source: utm.utm_source,
      utm_medium: utm.utm_medium,
      utm_campaign: utm.utm_campaign
    };

    try {
      var response = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok) {
        throw new Error((data && data.error) || 'Unable to join right now.');
      }

      root.ZYBAR.PremiumPopupStorage.markSubmitted(email);
      this.hideTeaser();
      if (root.ZYBAR.PremiumPopupAnalytics) {
        root.ZYBAR.PremiumPopupAnalytics.trackEmailSubmitted(email, language);
        root.ZYBAR.PremiumPopupAnalytics.trackDiscountClaimed(data.discountCode || 'ZYBAR15');
      }
      this.showSuccess(data);
    } catch (err) {
      this.setError((err && err.message) || 'Unable to join right now.');
      cta.disabled = false;
      cta.textContent = 'Unlock My 15% Off';
    }
  };

  PremiumPopupController.prototype.armExitIntent = function () {
    if (isMobile() || this.exitIntentArmed) return;
    this.exitIntentArmed = true;
    var self = this;
    var fired = false;
    document.addEventListener('mouseout', function (event) {
      if (fired || self.open) return;
      if (!root.ZYBAR.PremiumPopupStorage.shouldShowPopup()) return;
      if (event.clientY > 12) return;
      if (event.relatedTarget || event.toElement) return;
      fired = true;
      self.show('exit_intent');
    });
  };

  PremiumPopupController.prototype.start = function () {
    if (isExcludedPath()) return;
    if (!root.ZYBAR || !root.ZYBAR.PremiumPopupStorage) return;

    var storage = root.ZYBAR.PremiumPopupStorage;
    var state = storage.readState();
    if (state.submitted) return;

    this.mount();

    if (storage.shouldShowTeaser() && !storage.shouldShowPopup()) {
      this.showTeaser();
    }

    if (storage.shouldShowPopup()) {
      var self = this;
      setTimeout(function () {
        if (root.ZYBAR.PremiumPopupStorage.shouldShowPopup()) {
          self.show('timer');
        }
      }, 6000);
    }

    this.armExitIntent();
  };

  function boot() {
    if (document.documentElement.getAttribute('data-zybar-popup') === 'off') return;
    var controller = new PremiumPopupController();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        controller.start();
      });
    } else {
      controller.start();
    }
    root.ZYBAR = root.ZYBAR || {};
    root.ZYBAR.PremiumPopup = controller;
  }

  boot();
})(typeof window !== 'undefined' ? window : globalThis);
