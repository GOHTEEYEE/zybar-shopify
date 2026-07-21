/**
 * ZYBAR Member Pricing
 * Central browser identity for popup, campaigns, cart, checkout and PDP UI.
 */
(function (root) {
  "use strict";

  var STORAGE_KEY = "zybar.member_pricing.v1";
  var EVENT_NAME = "zybar:member-pricing-change";
  var state = readStored();
  var readyResolve;
  var ready = new Promise(function (resolve) {
    readyResolve = resolve;
  });

  function safeParse(value) {
    try {
      return JSON.parse(value);
    } catch (_) {
      return null;
    }
  }

  function readStored() {
    try {
      var parsed = safeParse(root.localStorage.getItem(STORAGE_KEY));
      return parsed && parsed.active && parsed.credential ? parsed : { active: false };
    } catch (_) {
      return { active: false };
    }
  }

  function persist(next) {
    state = next && next.active ? next : { active: false };
    try {
      if (state.active) root.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      else root.localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
    try {
      root.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: getState() }));
    } catch (_) {}
    return getState();
  }

  function getState() {
    return Object.assign({}, state);
  }

  function isActive() {
    return !!state.active;
  }

  function getCredential() {
    return state.active ? String(state.credential || "") : "";
  }

  function getDiscountCode() {
    return state.active ? String(state.discountCode || "") : "";
  }

  function activate(member) {
    if (!member || !member.active || !member.credential) return getState();
    return persist({
      active: true,
      tier: String(member.tier || "welcome"),
      tierLabel: String(member.tierLabel || "Welcome Member"),
      eyebrow: String(member.eyebrow || "Member Exclusive"),
      benefit: String(member.benefit || "Extra Savings Applied"),
      percent: Number(member.percent) || 0,
      discountCode: String(member.discountCode || ""),
      credential: String(member.credential),
      verifiedAt: Date.now()
    });
  }

  function readCampaignCredential() {
    try {
      var url = new URL(root.location.href);
      var credential = url.searchParams.get("member_token") || "";
      if (credential) {
        url.searchParams.delete("member_token");
        root.history.replaceState({}, "", url.pathname + url.search + url.hash);
      }
      return credential;
    } catch (_) {
      return "";
    }
  }

  function analyticsId(method) {
    var analytics = root.ZYBAR && root.ZYBAR.Analytics;
    return analytics && typeof analytics[method] === "function" ? analytics[method]() : "";
  }

  function verify() {
    var campaignCredential = readCampaignCredential();
    var credential = campaignCredential || getCredential();
    return root
      .fetch("/api/member-pricing/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credential: credential || null,
          visitorId: analyticsId("getVisitorId") || null,
          sessionId: analyticsId("getSessionId") || null
        })
      })
      .then(function (response) {
        if (!response.ok) throw new Error("Member status unavailable");
        return response.json();
      })
      .then(function (member) {
        if (member && member.active) return activate(member);
        if (campaignCredential || credential) persist({ active: false });
        return getState();
      })
      .catch(function () {
        // Keep a previously signed credential during transient network failures.
        return getState();
      })
      .then(function (result) {
        readyResolve(result);
        return result;
      });
  }

  root.ZYBAR = root.ZYBAR || {};
  root.ZYBAR.MemberPricing = {
    STORAGE_KEY: STORAGE_KEY,
    EVENT_NAME: EVENT_NAME,
    ready: ready,
    verify: verify,
    activate: activate,
    getState: getState,
    isActive: isActive,
    getCredential: getCredential,
    getDiscountCode: getDiscountCode
  };

  function boot() {
    verify().then(function () {
      // Analytics is loaded asynchronously on PDPs. A second pass reconnects
      // legacy subscribers by their existing visitor/session identity.
      if (!isActive() && !analyticsId("getVisitorId")) {
        root.setTimeout(verify, 1200);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(typeof window !== "undefined" ? window : globalThis);
