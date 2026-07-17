(function (root) {
  'use strict';

  var STORAGE_KEY = 'zybar_garage_popup_v1';
  var SESSION_KEY = 'zybar_garage_popup_session_shown';
  var TEASER_SESSION_KEY = 'zybar_garage_popup_teaser_hidden';
  var DAY_MS = 24 * 60 * 60 * 1000;
  var SHOW_EVERY_MS = 30 * DAY_MS;
  var DISMISS_WAIT_MS = 7 * DAY_MS;

  function readState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (err) {
      return {};
    }
  }

  function writeState(patch) {
    var next = Object.assign({}, readState(), patch || {}, {
      updatedAt: Date.now()
    });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (err) {
      /* ignore quota / private mode */
    }
    return next;
  }

  function wasShownThisSession() {
    try {
      return sessionStorage.getItem(SESSION_KEY) === '1';
    } catch (err) {
      return false;
    }
  }

  function markShownThisSession() {
    try {
      sessionStorage.setItem(SESSION_KEY, '1');
    } catch (err) {
      /* ignore */
    }
  }

  function shouldShowPopup() {
    var state = readState();
    if (state.submitted) return false;
    if (wasShownThisSession()) return false;
    var now = Date.now();
    if (state.dismissedAt) {
      return now - Number(state.dismissedAt) >= DISMISS_WAIT_MS;
    }
    if (state.lastShownAt && now - Number(state.lastShownAt) < SHOW_EVERY_MS) {
      return false;
    }
    return true;
  }

  function markShown() {
    markShownThisSession();
    return writeState({ lastShownAt: Date.now() });
  }

  function markDismissed() {
    markShownThisSession();
    clearTeaserHiddenThisSession();
    return writeState({
      dismissedAt: Date.now(),
      lastShownAt: Date.now(),
      teaserActive: true
    });
  }

  function markSubmitted(email) {
    markShownThisSession();
    clearTeaserHiddenThisSession();
    return writeState({
      submitted: true,
      submittedAt: Date.now(),
      emailDomain: String(email || '').split('@')[1] || '',
      lastShownAt: Date.now(),
      teaserActive: false
    });
  }

  function wasTeaserHiddenThisSession() {
    try {
      return sessionStorage.getItem(TEASER_SESSION_KEY) === '1';
    } catch (err) {
      return false;
    }
  }

  function hideTeaserThisSession() {
    try {
      sessionStorage.setItem(TEASER_SESSION_KEY, '1');
    } catch (err) {
      /* ignore */
    }
  }

  function clearTeaserHiddenThisSession() {
    try {
      sessionStorage.removeItem(TEASER_SESSION_KEY);
    } catch (err) {
      /* ignore */
    }
  }

  function shouldShowTeaser() {
    var state = readState();
    if (state.submitted) return false;
    if (wasTeaserHiddenThisSession()) return false;
    if (state.teaserActive) return true;
    /* Legacy dismissals before teaserActive existed */
    if (state.dismissedAt && !shouldShowPopup()) return true;
    return false;
  }

  function clearTeaser() {
    return writeState({ teaserActive: false });
  }

  root.ZYBAR = root.ZYBAR || {};
  root.ZYBAR.PremiumPopupStorage = {
    STORAGE_KEY: STORAGE_KEY,
    SESSION_KEY: SESSION_KEY,
    shouldShowPopup: shouldShowPopup,
    shouldShowTeaser: shouldShowTeaser,
    markShown: markShown,
    markDismissed: markDismissed,
    markSubmitted: markSubmitted,
    hideTeaserThisSession: hideTeaserThisSession,
    clearTeaser: clearTeaser,
    readState: readState,
    wasShownThisSession: wasShownThisSession
  };
})(typeof window !== 'undefined' ? window : globalThis);
