(function () {
  "use strict";

  var RATING = "4.88";
  var REVIEW_COUNT = "197";
  var NAV_LINKS = [
    { href: "/luneva/shop/", label: "Shop" },
    { href: "/luneva/reviews/", label: "Reviews" },
    { href: "/luneva/faqs/", label: "FAQs" },
    { href: "/luneva/contact/", label: "Contact" },
    { href: "/luneva/cart/", label: "Cart" }
  ];

  function ratingHtml(compact) {
    if (compact) {
      return (
        '<a class="lv-rating lv-rating--compact" href="/luneva/reviews/">' +
        '<span class="lv-rating__stars" aria-hidden="true">★★★★★</span>' +
        "<strong>" +
        RATING +
        "</strong>" +
        "<span>(" +
        REVIEW_COUNT +
        " reviews)</span></a>"
      );
    }
    return (
      '<div class="lv-rating">' +
      '<span class="lv-rating__stars" aria-hidden="true">★★★★★</span>' +
      '<p class="lv-rating__score"><strong>' +
      RATING +
      "</strong> · " +
      REVIEW_COUNT +
      ' reviews</p>' +
      '<a href="/luneva/reviews/">Read customer reviews</a>' +
      "</div>"
    );
  }

  function ensureTrustBar() {
    if (document.querySelector(".lv-trust-bar")) return;
    var header = document.querySelector(".lv-header");
    if (!header) return;
    var bar = document.createElement("div");
    bar.className = "lv-trust-bar";
    bar.setAttribute("aria-label", "Store promises");
    bar.innerHTML =
      '<div class="lv-container lv-trust-bar__inner">' +
      "<span>Free worldwide shipping</span>" +
      "<span>Easy assembly</span>" +
      "<span>60-day free returns</span>" +
      "<span>Welcome 15% off</span>" +
      "</div>";
    header.parentNode.insertBefore(bar, header.nextSibling);
  }

  function ensureMobileNav() {
    var headerInner = document.querySelector(".lv-header__inner");
    if (!headerInner || document.getElementById("lvMobileNavBtn")) return;

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "lv-menu-btn";
    btn.id = "lvMobileNavBtn";
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-controls", "lvMobileNav");
    btn.setAttribute("aria-label", "Open menu");
    btn.innerHTML = "<span></span><span></span><span></span>";
    headerInner.insertBefore(btn, headerInner.firstChild);

    var panel = document.createElement("div");
    panel.className = "lv-mobile-nav";
    panel.id = "lvMobileNav";
    panel.hidden = true;
    panel.innerHTML =
      '<div class="lv-mobile-nav__panel">' +
      '<p class="lv-eyebrow">Menu</p>' +
      NAV_LINKS.map(function (link) {
        return '<a href="' + link.href + '">' + link.label + "</a>";
      }).join("") +
      '<a class="lv-btn lv-btn-primary" href="/luneva/shop/">Shop now</a>' +
      "</div>";
    document.body.appendChild(panel);

    function close() {
      panel.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      document.body.classList.remove("lv-nav-open");
    }

    function open() {
      panel.hidden = false;
      btn.setAttribute("aria-expanded", "true");
      document.body.classList.add("lv-nav-open");
    }

    btn.addEventListener("click", function () {
      if (panel.hidden) open();
      else close();
    });
    panel.addEventListener("click", function (event) {
      if (event.target === panel) close();
    });
    panel.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", close);
    });
  }

  function enhanceFooter() {
    var footer = document.querySelector(".lv-footer .lv-container");
    if (!footer) return;
    var links = footer.querySelector("p:last-of-type");
    var desired =
      '<a href="/luneva/shop/">Shop</a> · <a href="/luneva/reviews/">Reviews</a> · <a href="/luneva/faqs/">FAQs</a> · <a href="/luneva/contact/">Contact</a> · <a href="/luneva/cart/">Cart</a>';
    if (!links || links.querySelectorAll("a").length < 4) {
      if (links && links.querySelector("a")) {
        links.innerHTML = desired;
      } else {
        var p = document.createElement("p");
        p.innerHTML = desired;
        footer.appendChild(p);
      }
    }
    if (!footer.querySelector(".lv-footer__note")) {
      var note = document.createElement("p");
      note.className = "lv-footer__note";
      note.textContent =
        "Free worldwide shipping · Easy assembly · 60-day free returns · Welcome 15% with email";
      footer.appendChild(note);
    }
  }

  function injectPdpRating() {
    var product = document.querySelector("[data-luneva-product]");
    if (!product) return;
    var buyCol = product.children[1] || product;
    if (!buyCol.querySelector(".lv-rating")) {
      var title = buyCol.querySelector(".lv-section-title, h2");
      var wrap = document.createElement("div");
      wrap.innerHTML = ratingHtml(true);
      var node = wrap.firstChild;
      if (title && title.nextSibling) {
        title.parentNode.insertBefore(node, title.nextSibling);
      } else if (title) {
        title.parentNode.appendChild(node);
      } else {
        buyCol.insertBefore(node, buyCol.firstChild);
      }
    }
    if (!buyCol.querySelector(".lv-ship-eta")) {
      var eta = document.createElement("p");
      eta.className = "lv-ship-eta";
      eta.textContent = "Ships in 5–7 days · Free worldwide shipping";
      var actions = buyCol.querySelector(".lv-actions");
      var bullets = buyCol.querySelector(".lv-bullets");
      if (actions) {
        actions.parentNode.insertBefore(eta, actions);
      } else if (bullets && bullets.nextSibling) {
        bullets.parentNode.insertBefore(eta, bullets.nextSibling);
      } else {
        buyCol.appendChild(eta);
      }
    }
  }

  function injectHomeRating() {
    var host = document.querySelector("[data-luneva-home-rating]");
    if (!host || host.getAttribute("data-ready") === "1") return;
    host.innerHTML = ratingHtml(false);
    host.setAttribute("data-ready", "1");
  }

  function applyOccasionFilter(key) {
    var next = key || "all";
    document.querySelectorAll("[data-occasion-filter]").forEach(function (el) {
      el.classList.toggle("is-active", el.getAttribute("data-occasion-filter") === next);
    });
    document.querySelectorAll("[data-occasions]").forEach(function (card) {
      var tags = String(card.getAttribute("data-occasions") || "");
      var show = next === "all" || tags.indexOf(next) !== -1;
      card.hidden = !show;
    });
  }

  function initOccasions() {
    document.querySelectorAll("[data-occasion-filter]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        applyOccasionFilter(btn.getAttribute("data-occasion-filter") || "all");
      });
    });
    try {
      var params = new URLSearchParams(window.location.search || "");
      var fromQuery = String(params.get("occasion") || "").trim();
      if (fromQuery) applyOccasionFilter(fromQuery);
    } catch (_) {}
  }

  function init() {
    ensureTrustBar();
    ensureMobileNav();
    enhanceFooter();
    injectPdpRating();
    injectHomeRating();
    initOccasions();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.LunevaSiteChrome = {
    rating: RATING,
    reviewCount: REVIEW_COUNT,
    init: init
  };
})();
