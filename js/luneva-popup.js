(function (root) {
  "use strict";

  var STORAGE_KEY = "luneva_popup_v2";
  var SESSION_KEY = "luneva_popup_session_shown";
  var TEASER_SESSION_KEY = "luneva_popup_teaser_hidden";
  var DELAY_MS = 6000;
  var DISMISS_WAIT_MS = 7 * 24 * 60 * 60 * 1000;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  var INTENT_OPTIONS = [
    { id: "gift", label: "A gift for someone special" },
    { id: "girlfriend", label: "A gift for my girlfriend" },
    { id: "diy", label: "A DIY project for myself" },
    { id: "other", label: "Something else" }
  ];

  function readState() {
    try {
      var raw = root.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) || {} : {};
    } catch (_) {
      return {};
    }
  }

  function writeState(patch) {
    var next = Object.assign({}, readState(), patch || {}, { updatedAt: Date.now() });
    try {
      root.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (_) {}
    return next;
  }

  function wasShownThisSession() {
    try {
      return root.sessionStorage.getItem(SESSION_KEY) === "1";
    } catch (_) {
      return false;
    }
  }

  function markShownThisSession() {
    try {
      root.sessionStorage.setItem(SESSION_KEY, "1");
    } catch (_) {}
  }

  function shouldShowPopup() {
    var state = readState();
    if (state.submitted) return false;
    if (wasShownThisSession()) return false;
    if (state.dismissedAt && Date.now() - Number(state.dismissedAt) < DISMISS_WAIT_MS) {
      return false;
    }
    return true;
  }

  function shouldShowTeaser() {
    var state = readState();
    if (state.submitted) return false;
    try {
      if (root.sessionStorage.getItem(TEASER_SESSION_KEY) === "1") return false;
    } catch (_) {}
    return !!state.teaserActive;
  }

  function isExcludedPath() {
    var path = String(root.location.pathname || "").toLowerCase();
    if (path.indexOf("/luneva/admin") === 0) return true;
    if (path.indexOf("/luneva/checkout") === 0) return true;
    if (path.indexOf("/luneva/cart") === 0) return true;
    if (path.indexOf("/luneva/purchase-confirmation") === 0) return true;
    return false;
  }

  function isLunevaSite() {
    var path = String(root.location.pathname || "").toLowerCase();
    return path.indexOf("/luneva") === 0 || path.indexOf("/products/luneva-") === 0;
  }

  function ensureStylesheet() {
    if (document.getElementById("luneva-popup-css")) return;
    var link = document.createElement("link");
    link.id = "luneva-popup-css";
    link.rel = "stylesheet";
    link.href = "/css/luneva-popup.css?v=4";
    document.head.appendChild(link);
  }

  function ensureMemberPricing() {
    return new Promise(function (resolve) {
      if (root.ZYBAR && root.ZYBAR.MemberPricing) {
        resolve();
        return;
      }
      var existing = document.getElementById("luneva-member-pricing-js");
      if (existing) {
        existing.addEventListener("load", resolve, { once: true });
        return;
      }
      var script = document.createElement("script");
      script.id = "luneva-member-pricing-js";
      script.src = "/js/member-pricing.js?v=conv1";
      script.onload = resolve;
      document.head.appendChild(script);
    });
  }

  function LunevaPopupController() {
    this.overlay = null;
    this.teaser = null;
    this.open = false;
    this.timerId = null;
    this.step = "intent";
    this.selectedIntent = null;
  }

  LunevaPopupController.prototype.mount = function () {
    ensureStylesheet();
    if (this.overlay) return;

    var overlay = document.createElement("div");
    overlay.className = "lv-popup-overlay lv-popup-overlay--fullscreen";
    overlay.id = "luneva-email-popup";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "luneva-popup-title");
    overlay.hidden = true;

    var intentButtons = INTENT_OPTIONS.map(function (opt) {
      return (
        '<button type="button" class="lv-popup__choice" data-intent="' +
        opt.id +
        '">' +
        opt.label +
        "</button>"
      );
    }).join("");

    overlay.innerHTML =
      '<div class="lv-popup lv-popup--fullscreen" role="document">' +
      '<button type="button" class="lv-popup__close" aria-label="Close and continue browsing">&times;</button>' +
      '<div class="lv-popup__stage">' +
      '<div class="lv-popup__panel lv-popup__panel--intent is-active">' +
      '<p class="lv-popup__brand">LUNEVA</p>' +
      '<h2 class="lv-popup__title" id="luneva-popup-title">Welcome — 15% off</h2>' +
      '<p class="lv-popup__question">What brings you to LUNEVA today?<span aria-hidden="true">*</span></p>' +
      '<div class="lv-popup__choices">' +
      intentButtons +
      "</div>" +
      "</div>" +
      '<div class="lv-popup__panel lv-popup__panel--email" hidden>' +
      '<p class="lv-popup__brand">LUNEVA</p>' +
      '<h2 class="lv-popup__title">Welcome — 15% off</h2>' +
      '<form class="lv-popup__form" novalidate>' +
      '<label class="visually-hidden" for="luneva-popup-email">Email</label>' +
      '<input id="luneva-popup-email" class="lv-popup__input" type="email" name="email" autocomplete="email" inputmode="email" placeholder="Your email address" required />' +
      '<p class="lv-popup__error" id="luneva-popup-error" role="alert" aria-live="polite"></p>' +
      '<button type="submit" class="lv-popup__cta">Continue</button>' +
      "</form>" +
      "</div>" +
      '<div class="lv-popup__panel lv-popup__panel--success" hidden>' +
      '<p class="lv-popup__brand">LUNEVA</p>' +
      '<div class="lv-popup__success-icon" aria-hidden="true">✓</div>' +
      '<h2 class="lv-popup__title">You\'re in!</h2>' +
      '<p class="lv-popup__offer">Your Welcome 15% savings will apply automatically at checkout.</p>' +
      '<button type="button" class="lv-popup__cta lv-popup__continue">Continue shopping</button>' +
      "</div>" +
      "</div>" +
      '<div class="lv-popup__accent" aria-hidden="true"></div>' +
      "</div>";

    if (!document.getElementById("luneva-popup-visually-hidden-style")) {
      var style = document.createElement("style");
      style.id = "luneva-popup-visually-hidden-style";
      style.textContent =
        ".visually-hidden{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;}";
      document.head.appendChild(style);
    }

    document.body.appendChild(overlay);
    this.overlay = overlay;
    this.bindEvents();

    var teaser = document.createElement("div");
    teaser.className = "lv-popup-teaser";
    teaser.id = "luneva-popup-teaser";
    teaser.hidden = true;
    teaser.innerHTML =
      '<button type="button" class="lv-popup-teaser__open" aria-label="Open Welcome 15% offer">Welcome 15%</button>' +
      '<button type="button" class="lv-popup-teaser__close" aria-label="Hide offer">&times;</button>';
    document.body.appendChild(teaser);
    this.teaser = teaser;
    this.bindTeaserEvents();
  };

  LunevaPopupController.prototype.panel = function (name) {
    if (!this.overlay) return null;
    return this.overlay.querySelector(".lv-popup__panel--" + name);
  };

  LunevaPopupController.prototype.showStep = function (step) {
    this.step = step;
    var panels = this.overlay.querySelectorAll(".lv-popup__panel");
    panels.forEach(function (panel) {
      var name = panel.className.match(/lv-popup__panel--(\w+)/);
      var active = name && name[1] === step;
      panel.hidden = !active;
      panel.classList.toggle("is-active", active);
    });
  };

  LunevaPopupController.prototype.bindEvents = function () {
    var self = this;
    var overlay = this.overlay;
    var form = overlay.querySelector(".lv-popup__form");
    var emailInput = overlay.querySelector("#luneva-popup-email");
    var closeBtn = overlay.querySelector(".lv-popup__close");
    var continueBtn = overlay.querySelector(".lv-popup__continue");

    closeBtn.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      self.dismiss("close_button");
    });
    continueBtn.addEventListener("click", function () {
      self.close("continue");
    });
    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) self.dismiss("overlay");
    });
    document.addEventListener("keydown", function (event) {
      if (!self.open) return;
      if (event.key === "Escape") {
        event.preventDefault();
        self.dismiss("escape");
      }
    });

    overlay.querySelectorAll("[data-intent]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        self.selectedIntent = btn.getAttribute("data-intent") || "other";
        writeState({ giftIntent: self.selectedIntent });
        self.trackIntent(self.selectedIntent);
        self.showStep("email");
        if (emailInput) setTimeout(function () { emailInput.focus(); }, 180);
      });
    });

    emailInput.addEventListener("input", function () {
      var value = emailInput.value.trim();
      var valid = !value || EMAIL_RE.test(value);
      emailInput.classList.toggle("is-invalid", !valid);
      if (valid) self.setError("");
    });
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      self.submitForm();
    });
  };

  LunevaPopupController.prototype.bindTeaserEvents = function () {
    var self = this;
    var openBtn = this.teaser.querySelector(".lv-popup-teaser__open");
    var closeBtn = this.teaser.querySelector(".lv-popup-teaser__close");
    openBtn.addEventListener("click", function () {
      self.hideTeaser();
      self.show(true);
    });
    closeBtn.addEventListener("click", function (event) {
      event.stopPropagation();
      try {
        root.sessionStorage.setItem(TEASER_SESSION_KEY, "1");
      } catch (_) {}
      self.hideTeaser();
    });
  };

  LunevaPopupController.prototype.trackIntent = function (intentId) {
    var analytics = root.ZYBAR && root.ZYBAR.Analytics ? root.ZYBAR.Analytics : null;
    if (!analytics || typeof analytics.track !== "function") return;
    analytics.track("popup_intent_selected", {
      collection_id: "luneva",
      metadata: {
        collection: "luneva",
        intent: intentId,
        source: "luneva_popup"
      }
    });
  };

  LunevaPopupController.prototype.setError = function (message) {
    var el = this.overlay.querySelector("#luneva-popup-error");
    if (el) el.textContent = message || "";
  };

  LunevaPopupController.prototype.show = function (force, startStep) {
    if (this.open || !this.overlay) return;
    if (!force && !shouldShowPopup()) return;
    if (readState().submitted) return;

    this.selectedIntent = readState().giftIntent || this.selectedIntent;
    this.showStep(startStep || (this.selectedIntent ? "email" : "intent"));
    this.hideTeaser();
    this.overlay.hidden = false;
    requestAnimationFrame(
      function () {
        this.overlay.classList.add("is-open");
      }.bind(this)
    );
    this.open = true;
    document.body.style.overflow = "hidden";
    markShownThisSession();
    writeState({ lastShownAt: Date.now() });
  };

  LunevaPopupController.prototype.dismiss = function (reason) {
    if (this.step === "success") {
      this.close("continue");
      return;
    }
    this.trackDismiss(reason);
    this.close(reason || "dismiss");
  };

  LunevaPopupController.prototype.trackDismiss = function (reason) {
    var analytics = root.ZYBAR && root.ZYBAR.Analytics ? root.ZYBAR.Analytics : null;
    if (!analytics || typeof analytics.track !== "function") return;
    analytics.track("popup_dismissed", {
      collection_id: "luneva",
      metadata: {
        collection: "luneva",
        source: "luneva_popup",
        step: this.step,
        reason: reason || "dismiss"
      }
    });
  };

  LunevaPopupController.prototype.close = function (reason) {
    if (!this.open || !this.overlay) return;
    var wasSuccess = this.step === "success";
    this.overlay.classList.remove("is-open");
    this.open = false;
    document.body.style.overflow = "";
    setTimeout(
      function () {
        if (this.overlay) {
          this.overlay.hidden = true;
          this.showStep("intent");
        }
      }.bind(this),
      220
    );

    if (wasSuccess || reason === "continue") {
      writeState({ teaserActive: false });
      this.hideTeaser();
    } else {
      writeState({ dismissedAt: Date.now(), teaserActive: true });
      this.showTeaser();
    }
  };

  LunevaPopupController.prototype.showSuccess = function () {
    this.showStep("success");
  };

  LunevaPopupController.prototype.showTeaser = function () {
    if (!this.teaser || !shouldShowTeaser()) return;
    this.teaser.hidden = false;
    requestAnimationFrame(
      function () {
        this.teaser.classList.add("is-visible");
      }.bind(this)
    );
  };

  LunevaPopupController.prototype.hideTeaser = function () {
    if (!this.teaser) return;
    this.teaser.classList.remove("is-visible");
    this.teaser.hidden = true;
  };

  LunevaPopupController.prototype.submitForm = async function () {
    var emailInput = this.overlay.querySelector("#luneva-popup-email");
    var cta = this.overlay.querySelector(".lv-popup__form .lv-popup__cta");
    var email = String(emailInput.value || "").trim().toLowerCase();
    var intent = this.selectedIntent || readState().giftIntent || "other";

    if (!EMAIL_RE.test(email)) {
      emailInput.classList.add("is-invalid");
      this.setError("Please enter a valid email.");
      emailInput.focus();
      return;
    }

    this.setError("");
    cta.disabled = true;
    cta.textContent = "Saving…";

    var analytics = root.ZYBAR && root.ZYBAR.Analytics ? root.ZYBAR.Analytics : null;
    var body = {
      email: email,
      source: "luneva_popup:" + intent,
      utm_campaign: "popup_" + intent,
      userAgent: navigator.userAgent || "",
      visitor_id: analytics && analytics.getVisitorId ? analytics.getVisitorId() : null,
      session_id: analytics && analytics.getSessionId ? analytics.getSessionId() : null
    };

    try {
      var response = await fetch("/api/luneva/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      var data = await response.json().catch(function () {
        return {};
      });
      if (!response.ok) {
        throw new Error((data && data.error) || "Unable to join right now.");
      }

      writeState({
        submitted: true,
        submittedAt: Date.now(),
        teaserActive: false,
        giftIntent: intent
      });
      await ensureMemberPricing();
      if (root.ZYBAR && root.ZYBAR.MemberPricing && data.member) {
        root.ZYBAR.MemberPricing.activate(data.member);
      }
      if (analytics && typeof analytics.track === "function") {
        analytics.track("email_submitted", {
          collection_id: "luneva",
          metadata: {
            collection: "luneva",
            email: email,
            source: "luneva_popup",
            intent: intent,
            discount: "LUNEVA5"
          }
        });
      }
      this.hideTeaser();
      this.showSuccess();
      cta.disabled = false;
      cta.textContent = "Continue";
    } catch (err) {
      this.setError((err && err.message) || "Unable to join right now.");
      cta.disabled = false;
      cta.textContent = "Continue";
    }
  };

  LunevaPopupController.prototype.start = function () {
    if (!isLunevaSite() || isExcludedPath()) return;
    if (readState().submitted) return;

    this.mount();

    if (shouldShowTeaser() && !shouldShowPopup()) {
      this.showTeaser();
    }

    if (shouldShowPopup()) {
      var self = this;
      this.timerId = root.setTimeout(function () {
        if (shouldShowPopup()) self.show(false, "intent");
      }, DELAY_MS);
    }
  };

  root.LunevaPopup = {
    start: function () {
      if (!controller) controller = new LunevaPopupController();
      controller.start();
    }
  };

  var controller = null;
})(typeof window !== "undefined" ? window : globalThis);
