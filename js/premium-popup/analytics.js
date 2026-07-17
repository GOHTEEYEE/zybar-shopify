(function (root) {
  'use strict';

  function track(eventType, metadata) {
    if (root.ZYBAR && root.ZYBAR.Analytics && typeof root.ZYBAR.Analytics.track === 'function') {
      root.ZYBAR.Analytics.track(eventType, { metadata: metadata || {} });
      return;
    }
    if (root.ZYBAR && root.ZYBAR.Analytics) {
      if (eventType === 'newsletter_signup' && root.ZYBAR.Analytics.trackNewsletterSignup) {
        root.ZYBAR.Analytics.trackNewsletterSignup((metadata && metadata.email) || '');
      }
    }
  }

  function trackPopupViewed(trigger) {
    if (root.ZYBAR && root.ZYBAR.Analytics && root.ZYBAR.Analytics.trackPopupViewed) {
      root.ZYBAR.Analytics.trackPopupViewed({ source: 'premium_popup', trigger: trigger || 'timer' });
      return;
    }
    track('popup_viewed', { source: 'premium_popup', trigger: trigger || 'timer' });
  }

  function trackPopupClosed(reason) {
    if (root.ZYBAR && root.ZYBAR.Analytics && root.ZYBAR.Analytics.trackPopupClosed) {
      root.ZYBAR.Analytics.trackPopupClosed({ source: 'premium_popup', reason: reason || 'dismiss' });
      return;
    }
    track('popup_closed', { source: 'premium_popup', reason: reason || 'dismiss' });
  }

  function trackEmailSubmitted(email, language) {
    var meta = {
      source: 'premium_popup',
      email_domain: String(email || '').split('@')[1] || '',
      language: language || 'en'
    };
    if (root.ZYBAR && root.ZYBAR.Analytics && root.ZYBAR.Analytics.trackEmailSubmitted) {
      root.ZYBAR.Analytics.trackEmailSubmitted(meta);
    } else {
      track('email_submitted', meta);
    }
    if (root.ZYBAR && root.ZYBAR.Analytics && root.ZYBAR.Analytics.trackNewsletterSignup) {
      root.ZYBAR.Analytics.trackNewsletterSignup(email);
    }
  }

  function trackDiscountClaimed(code) {
    var meta = { source: 'premium_popup', discount_code: code || 'ZYBAR15' };
    if (root.ZYBAR && root.ZYBAR.Analytics && root.ZYBAR.Analytics.trackDiscountClaimed) {
      root.ZYBAR.Analytics.trackDiscountClaimed(meta);
      return;
    }
    track('discount_claimed', meta);
  }

  function trackCheckoutCompleted(orderMeta) {
    track('checkout_completed', Object.assign({ source: 'premium_popup' }, orderMeta || {}));
  }

  root.ZYBAR = root.ZYBAR || {};
  root.ZYBAR.PremiumPopupAnalytics = {
    trackPopupViewed: trackPopupViewed,
    trackPopupClosed: trackPopupClosed,
    trackEmailSubmitted: trackEmailSubmitted,
    trackDiscountClaimed: trackDiscountClaimed,
    trackCheckoutCompleted: trackCheckoutCompleted
  };
})(typeof window !== 'undefined' ? window : globalThis);
