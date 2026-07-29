(function () {
  "use strict";

  var PROFILES = {
    usd: {
      currency: "usd",
      kit: { "30x45": 39, "40x60": 49 },
      compare: { "30x45": 109, "40x60": 119 },
      shipping: 8.99,
      announcement:
        "Lighting effects $39 · Lighting + Mechanical Butterfly $49"
    },
    myr: {
      currency: "myr",
      kit: { "30x45": 129, "40x60": 149 },
      compare: null,
      shipping: 9,
      announcement:
        "Lighting effects RM129 · Lighting + Mechanical Butterfly RM149"
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
    return String(state.country || "").toUpperCase() === "MY";
  }

  function profile() {
    return isMalaysia() ? PROFILES.myr : PROFILES.usd;
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
    if (isMalaysia()) {
      return "RM" + Math.round(n);
    }
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
      if (text.indexOf("$39") !== -1 || text.indexOf("RM129") !== -1) {
        node.textContent = p.announcement;
      }
    });
  }

  function updateAnnouncementBars() {
    var text = profile().announcement;
    document.querySelectorAll(".lv-announcement__track span").forEach(function (node, index) {
      if (index % 3 === 0) node.textContent = text;
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
