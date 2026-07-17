(function (root) {
  'use strict';

  var STORAGE_KEY = 'zybar_garage_popup_v1';
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

  function shouldShowPopup() {
    var state = readState();
    if (state.submitted) return false;
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
    return writeState({ lastShownAt: Date.now() });
  }

  function markDismissed() {
    return writeState({ dismissedAt: Date.now(), lastShownAt: Date.now() });
  }

  function markSubmitted(email) {
    return writeState({
      submitted: true,
      submittedAt: Date.now(),
      emailDomain: String(email || '').split('@')[1] || '',
      lastShownAt: Date.now()
    });
  }

  root.ZYBAR = root.ZYBAR || {};
  root.ZYBAR.PremiumPopupStorage = {
    STORAGE_KEY: STORAGE_KEY,
    shouldShowPopup: shouldShowPopup,
    markShown: markShown,
    markDismissed: markDismissed,
    markSubmitted: markSubmitted,
    readState: readState
  };
})(typeof window !== 'undefined' ? window : globalThis);
