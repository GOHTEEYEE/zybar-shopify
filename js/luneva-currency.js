(function () {
  "use strict";

  var PROFILES = {
    usd: {
      currency: "usd",
      kit: { "30x45": 59, "40x60": 69 },
      compare: { "30x45": 109, "40x60": 119 },
      shipping: 0,
      announcement:
        "Lighting effects $59 · Lighting + Mechanical Butterfly $69 · Free shipping · Welcome 15%"
    }
  };

  var state = {
    country: null,
    ready: false
  };

  function normalizeSize(size) {
    var raw = String(size || "30x45").trim().toLowerCase();
    return raw === "40x60" ? "40x60" : "30x45";
  }

  function isMalaysia() {
    return false;
  }

  function profile() {
    return PROFILES.usd;
  }

  function kitPrice(size) {
    var p = profile();
    return p.kit[normalizeSize(size)] || p.kit["30x45"];
  }

  function comparePrice(size) {
    var p = profile();
    if (!p.compare) return 0;
    return p.compare[normalizeSize(size)] || 0;
  }

  function shippingPrice() {
    return profile().shipping;
  }

  function formatMoney(amount) {
    var n = Number(amount);
    if (!Number.isFinite(n)) n = 0;
    if (Math.round(n) === n) return "$" + n;
    return "$" + n.toFixed(2);
  }

  function formatLuxury(amount) {
    return formatMoney(amount);
  }

  function formatSaleHtml(sale, compare) {
    var saleNum = Number(sale);
    var compareNum = Number(compare);
    if (!Number.isFinite(saleNum)) saleNum = 0;
    if (!Number.isFinite(compareNum) || compareNum <= saleNum) {
      return '<span class="lv-price__sale">' + formatMoney(saleNum) + "</span>";
    }
    return (
      '<span class="lv-price__compare">' +
      formatMoney(compareNum) +
      '</span><span class="lv-price__sale">' +
      formatMoney(saleNum) +
      "</span>"
    );
  }

  function applyShopPrices() {
    var p = profile();
    document.querySelectorAll(".lv-card__body p").forEach(function (node) {
      if (String(node.textContent || "").trim().indexOf("From $") === 0) {
        node.textContent = "From " + formatMoney(p.kit["30x45"]);
      }
    });
    document.querySelectorAll(".lv-page-hero .lv-container > p").forEach(function (node) {
      var text = String(node.textContent || "");
      if (
          text.indexOf("$39") !== -1 ||
          text.indexOf("$59") !== -1 ||
          text.indexOf("RM129") !== -1
        ) {
        node.textContent = p.announcement;
      }
    });
  }

  function updateAnnouncementBars() {
    var p = profile();
    var priceText = p.announcement;
    var shippingText = "Free worldwide shipping · Easy assembly";
    var brandText = "Welcome 15% with email · 60-day free returns";
    document.querySelectorAll(".lv-announcement__track span").forEach(function (node, index) {
      var mod = index % 3;
      if (mod === 0) node.textContent = priceText;
      else if (mod === 1) node.textContent = shippingText;
      else node.textContent = brandText;
    });
  }

  function applyKitPrices() {
    document.querySelectorAll(".lv-kit").forEach(function (kit) {
      var size = kit.getAttribute("data-kit") === "full" ? "40x60" : "30x45";
      kit.setAttribute("data-price", String(kitPrice(size)));
      var compare = comparePrice(size);
      if (compare > 0) kit.setAttribute("data-compare-price", String(compare));
      else kit.removeAttribute("data-compare-price");
    });
  }

  function fetchGeo() {
    return fetch("/api/geo", { headers: { Accept: "application/json" }, cache: "no-store" })
      .then(function (res) {
        return res.ok ? res.json() : {};
      })
      .then(function (data) {
        state.country = data && data.country ? String(data.country).toUpperCase() : null;
        if (
          state.country &&
          window.ZYBAR &&
          window.ZYBAR.Analytics &&
          typeof window.ZYBAR.Analytics.setCountry === "function"
        ) {
          window.ZYBAR.Analytics.setCountry(state.country);
        }
        state.ready = true;
        applyKitPrices();
        updateAnnouncementBars();
        applyShopPrices();
        document.dispatchEvent(new CustomEvent("luneva:currency-ready"));
        return state.country;
      })
      .catch(function () {
        state.ready = true;
        applyKitPrices();
        updateAnnouncementBars();
        applyShopPrices();
        document.dispatchEvent(new CustomEvent("luneva:currency-ready"));
        return null;
      });
  }

  window.LunevaCurrency = {
    ready: fetchGeo(),
    isMalaysia: isMalaysia,
    profile: profile,
    getCountry: function () {
      return state.country;
    },
    kitPrice: kitPrice,
    comparePrice: comparePrice,
    shippingPrice: shippingPrice,
    formatMoney: formatMoney,
    formatLuxury: formatLuxury,
    formatSaleHtml: formatSaleHtml,
    normalizeSize: normalizeSize,
    applyKitPrices: applyKitPrices,
    updateAnnouncementBars: updateAnnouncementBars,
    applyShopPrices: applyShopPrices
  };
})();
