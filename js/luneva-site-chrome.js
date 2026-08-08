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
    var footerRoot = document.querySelector(".lv-footer");
    var footer = footerRoot && footerRoot.querySelector(".lv-container");
    if (!footer) return;

    footer.innerHTML =
      '<div class="lv-footer__grid">' +
      '<div class="lv-footer__brand-col">' +
      '<div class="lv-footer__brand">LUNEVA</div>' +
      '<p class="lv-footer__tagline">Beauty in motion. Made to inspire.</p>' +
      "</div>" +
      '<div class="lv-footer__col">' +
      '<h3 class="lv-footer__heading">Customer area</h3>' +
      "<ul>" +
      '<li><a href="/luneva/contact/">Contact</a></li>' +
      '<li><a href="/luneva/cart/">Cart</a></li>' +
      '<li><a href="/luneva/faqs/">FAQs</a></li>' +
      '<li><a href="/luneva/policies/refund/">Refunds</a></li>' +
      "</ul>" +
      "</div>" +
      '<div class="lv-footer__col">' +
      '<h3 class="lv-footer__heading">Navigation</h3>' +
      "<ul>" +
      '<li><a href="/luneva/shop/">Shop</a></li>' +
      '<li><a href="/luneva/reviews/">Reviews</a></li>' +
      '<li><a href="/luneva/about/">About</a></li>' +
      '<li><a href="/luneva/policies/privacy/">Privacy</a></li>' +
      '<li><a href="/luneva/policies/terms/">Terms</a></li>' +
      "</ul>" +
      "</div>" +
      "</div>" +
      '<div class="lv-footer__social" aria-label="Social">' +
      '<a href="https://www.facebook.com/people/ZY-Bar/61552413785446/" target="_blank" rel="noopener noreferrer" aria-label="Facebook">' +
      '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M14 8h3V5h-3c-2.2 0-4 1.8-4 4v2H7v3h3v7h3v-7h3l1-3h-4V9c0-.6.4-1 1-1z"/></svg></a>' +
      '<a href="https://www.instagram.com/zybar.shop" target="_blank" rel="noopener noreferrer" aria-label="Instagram">' +
      '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zm0 2a2 2 0 0 0-2 2v10c0 1.1.9 2 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H7zm5 2.5A4.5 4.5 0 1 1 7.5 12 4.5 4.5 0 0 1 12 7.5zm0 2A2.5 2.5 0 1 0 14.5 12 2.5 2.5 0 0 0 12 9.5zm5.25-3.25a1 1 0 1 1-1 1 1 1 0 0 1 1-1z"/></svg></a>' +
      '<a href="https://www.tiktok.com/@zybar.shop" target="_blank" rel="noopener noreferrer" aria-label="TikTok">' +
      '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M14.5 3c.4 2.3 1.8 3.8 4 4.2v2.5c-1.4-.1-2.7-.5-3.8-1.3v5.8a5.2 5.2 0 1 1-5.2-5.2c.3 0 .6 0 .9.1v2.6a2.6 2.6 0 1 0 1.8 2.5V3h2.3z"/></svg></a>' +
      "</div>" +
      '<p class="lv-footer__identity">LUNEVA Mechanical Butterfly Series · Operated at zybar.shop/luneva · Support <a href="mailto:support@zybar.shop">support@zybar.shop</a></p>' +
      '<p class="lv-footer__note">Free worldwide shipping · Easy assembly · 60-day free returns · Secure Stripe checkout · Welcome 15% with email</p>';
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
      eta.textContent = "Ships in 5–10 business days · Free worldwide shipping";
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
