/**
 * Sitewide footer: social links + payment badges.
 * Enhances existing .site-footer or injects one before </body>.
 */
(function () {
  "use strict";

  var SOCIAL = [
    {
      name: "Facebook",
      href: "https://www.facebook.com/people/ZY-Bar/61552413785446/",
      svg:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M14 8.5h2.5V5.6c-.4-.1-1.6-.2-3-.2-3 0-5 1.8-5 5.2V13H5.8v3.3H8.5V22h3.4v-5.7h2.8l.4-3.3h-3.2v-2.2c0-1 .3-1.6 1.6-1.6z"/></svg>'
    },
    {
      name: "Instagram",
      href: "https://www.instagram.com/zybar.shop?igsh=ZWtrbzJvMWtheG82",
      svg:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 7.2A4.8 4.8 0 1 0 12 16.8 4.8 4.8 0 0 0 12 7.2zm0 7.9a3.1 3.1 0 1 1 0-6.2 3.1 3.1 0 0 1 0 6.2zm6.1-8.2a1.12 1.12 0 1 1-2.24 0 1.12 1.12 0 0 1 2.24 0zM12 3.5c-2.3 0-2.6 0-3.5.05-2.3.1-3.4 1.2-3.5 3.5C5 8 5 8.3 5 10.6s0 2.6.05 3.5c.1 2.3 1.2 3.4 3.5 3.5.9.05 1.2.05 3.5.05s2.6 0 3.5-.05c2.3-.1 3.4-1.2 3.5-3.5.05-.9.05-1.2.05-3.5s0-2.6-.05-3.5c-.1-2.3-1.2-3.4-3.5-3.5C14.6 3.5 14.3 3.5 12 3.5zm0 1.5c2.3 0 2.5 0 3.4.05 1.7.08 2.5.9 2.6 2.6.05.9.05 1.1.05 3.4s0 2.5-.05 3.4c-.08 1.7-.9 2.5-2.6 2.6-.9.05-1.1.05-3.4.05s-2.5 0-3.4-.05c-1.7-.08-2.5-.9-2.6-2.6C5.95 13 5.95 12.8 5.95 10.5s0-2.5.05-3.4c.08-1.7.9-2.5 2.6-2.6.9-.05 1.1-.05 3.4-.05z"/></svg>'
    },
    {
      name: "TikTok",
      href: "https://www.tiktok.com/@zybar.shop?_r=1&_t=ZS-986wLWv44xA",
      svg:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19.6 7.3a5.7 5.7 0 0 1-3.4-1.1v7.3a5.5 5.5 0 1 1-4.7-5.4v2.8a2.7 2.7 0 1 0 1.9 2.6V2.5h2.8a5.7 5.7 0 0 0 3.4 3.3v1.5z"/></svg>'
    }
  ];

  var PAYMENTS = [
    { name: "Visa", className: "is-visa", label: "VISA" },
    { name: "Mastercard", className: "is-mastercard", label: "Mastercard" },
    { name: "Amex", className: "is-amex", label: "AMEX" },
    { name: "Apple Pay", className: "is-applepay", label: "Pay" },
    { name: "Google Pay", className: "is-gpay", label: "GPay" },
    { name: "PayPal", className: "is-paypal", label: "PayPal" },
    { name: "Klarna", className: "is-klarna", label: "Klarna" },
    { name: "Link", className: "is-link", label: "Link" }
  ];

  function buildSocial() {
    var nav = document.createElement("nav");
    nav.className = "footer-social";
    nav.setAttribute("aria-label", "Social media");
    SOCIAL.forEach(function (item) {
      var a = document.createElement("a");
      a.className = "footer-social-link";
      a.href = item.href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.setAttribute("aria-label", item.name);
      a.innerHTML = item.svg;
      nav.appendChild(a);
    });
    return nav;
  }

  function buildPayments() {
    var wrap = document.createElement("div");
    wrap.className = "footer-payments";
    wrap.setAttribute("aria-label", "Accepted payment methods");
    PAYMENTS.forEach(function (item) {
      var badge = document.createElement("span");
      badge.className = "footer-pay-badge " + item.className;
      badge.title = item.name;
      badge.setAttribute("aria-label", item.name);
      if (item.className === "is-mastercard") {
        badge.innerHTML = '<span class="mc-dot mc-red"></span><span class="mc-dot mc-orange"></span>';
      } else if (item.className === "is-applepay") {
        badge.innerHTML =
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.4 12.3c0-1.8 1.5-2.7 1.5-2.7-.8-1.2-2.1-1.4-2.6-1.4-1.1-.1-2.1.6-2.7.6-.6 0-1.4-.6-2.4-.6-1.2 0-2.3.7-3 1.9-1.3 2.2-.3 5.5 0.9 7.3.6.9 1.3 1.9 2.2 1.8.9 0 1.2-.6 2.3-.6s1.4.6 2.3.6c1 0 1.6-.9 2.2-1.8.7-1 1-2 1-2.1-.1 0-1.8-.7-1.8-2.6zM14.5 6.8c.5-.6.8-1.4.7-2.2-.7 0-1.6.5-2.1 1.1-.5.5-.9 1.4-.8 2.2.8.1 1.6-.4 2.2-1.1z"/></svg><span>Pay</span>';
      } else {
        badge.textContent = item.label;
      }
      wrap.appendChild(badge);
    });
    return wrap;
  }

  function buildPolicies() {
    var nav = document.createElement("nav");
    nav.className = "footer-policies footer-policies--inline";
    nav.setAttribute("aria-label", "Site policies and information");
    nav.innerHTML =
      '<ul class="footer-policies-list footer-policies-list--inline">' +
      '<li><a href="/policies/refund-policy.html">Refund policy</a></li>' +
      '<li><a href="/policies/privacy-policy/">Privacy policy</a></li>' +
      '<li><a href="/policies/tos.html">Terms of service</a></li>' +
      '<li><a href="/policies/faq.html">Shipping &amp; FAQ</a></li>' +
      '<li><a href="/contact.html">Contact</a></li>' +
      '<li><a href="/about/about-us.html">About Us</a></li>' +
      "</ul>";
    return nav;
  }

  function buildCopyright() {
    var div = document.createElement("div");
    div.className = "footer-copyright footer-copyright--center";
    div.innerHTML = '<p>© 2026 <a href="/">ZYBAR</a></p>';
    return div;
  }

  function ensureFooter() {
    if (document.documentElement.getAttribute("data-zybar-footer") === "off") return;
    var path = (window.location.pathname || "").toLowerCase();
    if (path.indexOf("/admin") === 0) return;

    var footer = document.querySelector(".site-footer");
    if (!footer) {
      footer = document.createElement("footer");
      footer.className = "site-footer";
      var anchor =
        document.querySelector("script[src*='premium-popup']") ||
        document.querySelector("script[src*='chatbot']") ||
        document.body.lastElementChild;
      if (anchor && anchor.parentNode) {
        anchor.parentNode.insertBefore(footer, anchor);
      } else {
        document.body.appendChild(footer);
      }
    }

    if (footer.getAttribute("data-footer-ready") === "1") return;
    footer.setAttribute("data-footer-ready", "1");

    var wrap = footer.querySelector(".footer-wrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "container footer-wrap";
      footer.appendChild(wrap);
    }
    wrap.classList.add("footer-wrap--premium");
    wrap.innerHTML = "";
    wrap.appendChild(buildSocial());
    wrap.appendChild(buildPayments());
    wrap.appendChild(buildCopyright());
    wrap.appendChild(buildPolicies());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureFooter);
  } else {
    ensureFooter();
  }
})();
