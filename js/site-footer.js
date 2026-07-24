/**
 * Sitewide footer: grouped navigation + social links + payment badges.
 * Enhances existing .site-footer or injects one before </body>.
 */
(function () {
  "use strict";

  var CUSTOM_MADE_HREF = "/products/custom-led-car-wall-art/";
  var CATALOG_HREF = "/collections/all/";

  var FOOTER_SECTIONS = [
    {
      title: "Shop",
      links: [
        { href: CATALOG_HREF, label: "Ready Made Collection" },
        { href: CUSTOM_MADE_HREF, label: "Custom Made Collection" },
        { href: CATALOG_HREF, label: "All Products" }
      ]
    },
    {
      title: "Support",
      links: [
        { href: "/policies/faq.html", label: "Shipping & FAQ" },
        { href: "/policies/refund-policy.html", label: "Refund Policy" },
        { href: "/policies/privacy-policy/", label: "Privacy Policy" },
        { href: "/contact.html", label: "Contact Us" }
      ]
    },
    {
      title: "Company",
      links: [{ href: "/about/about-us.html", label: "About ZYBAR" }]
    }
  ];

  var SOCIAL = [
    {
      name: "Instagram",
      href: "https://www.instagram.com/zybar.shop?igsh=ZWtrbzJvMWtheG82",
      svg:
        '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 7.2A4.8 4.8 0 1 0 12 16.8 4.8 4.8 0 0 0 12 7.2zm0 7.9a3.1 3.1 0 1 1 0-6.2 3.1 3.1 0 0 1 0 6.2zm6.1-8.2a1.12 1.12 0 1 1-2.24 0 1.12 1.12 0 0 1 2.24 0zM12 3.5c-2.3 0-2.6 0-3.5.05-2.3.1-3.4 1.2-3.5 3.5C5 8 5 8.3 5 10.6s0 2.6.05 3.5c.1 2.3 1.2 3.4 3.5 3.5.9.05 1.2.05 3.5.05s2.6 0 3.5-.05c2.3-.1 3.4-1.2 3.5-3.5.05-.9.05-1.2.05-3.5s0-2.6-.05-3.5c-.1-2.3-1.2-3.4-3.5-3.5C14.6 3.5 14.3 3.5 12 3.5zm0 1.5c2.3 0 2.5 0 3.4.05 1.7.08 2.5.9 2.6 2.6.05.9.05 1.1.05 3.4s0 2.5-.05 3.4c-.08 1.7-.9 2.5-2.6 2.6-.9.05-1.1.05-3.4.05s-2.5 0-3.4-.05c-1.7-.08-2.5-.9-2.6-2.6C5.95 13 5.95 12.8 5.95 10.5s0-2.5.05-3.4c.08-1.7.9-2.5 2.6-2.6.9-.05 1.1-.05 3.4-.05z"/></svg>'
    },
    {
      name: "TikTok",
      href: "https://www.tiktok.com/@zybar.shop?_r=1&_t=ZS-986wLWv44xA",
      svg:
        '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19.6 7.3a5.7 5.7 0 0 1-3.4-1.1v7.3a5.5 5.5 0 1 1-4.7-5.4v2.8a2.7 2.7 0 1 0 1.9 2.6V2.5h2.8a5.7 5.7 0 0 0 3.4 3.3v1.5z"/></svg>'
    },
    {
      name: "Facebook",
      href: "https://www.facebook.com/people/ZY-Bar/61552413785446/",
      svg:
        '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M14 8.5h2.5V5.6c-.4-.1-1.6-.2-3-.2-3 0-5 1.8-5 5.2V13H5.8v3.3H8.5V22h3.4v-5.7h2.8l.4-3.3h-3.2v-2.2c0-1 .3-1.6 1.6-1.6z"/></svg>'
    }
  ];

  var CONTACT = {
    addressLines: [
      "ZYBAR Studio",
      "2-14-5 Jingumae",
      "Shibuya-ku, Tokyo",
      "Japan",
      "150-0001"
    ],
    email: "zybar.info@gmail.com",
    phoneLabel: "Contact Support",
    phoneHref: "/contact.html"
  };

  function iconSvg(type) {
    if (type === "pin") {
      return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>';
    }
    if (type === "mail") {
      return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 7 9-7"/></svg>';
    }
    if (type === "phone") {
      return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/></svg>';
    }
    return "";
  }

  function buildHelpItem(opts) {
    var item = document.createElement("div");
    item.className = "footer-help-item";

    var icon = document.createElement("span");
    icon.className = "footer-help-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = iconSvg(opts.icon);
    item.appendChild(icon);

    var body = document.createElement("div");
    body.className = "footer-help-body";

    var label = document.createElement("p");
    label.className = "footer-help-label";
    label.textContent = opts.label;
    body.appendChild(label);

    if (opts.lines) {
      var detail = document.createElement("p");
      detail.className = "footer-help-detail";
      detail.innerHTML = opts.lines
        .map(function (line) {
          return "<span>" + line + "</span>";
        })
        .join("<br />");
      body.appendChild(detail);
    }

    if (opts.href && opts.hrefText) {
      var link = document.createElement("a");
      link.className = "footer-help-link";
      link.href = opts.href;
      if (opts.href.indexOf("mailto:") === 0) {
        link.setAttribute("rel", "noopener noreferrer");
      }
      link.textContent = opts.hrefText;
      body.appendChild(link);
    }

    item.appendChild(body);
    return item;
  }

  function buildNeedHelp() {
    var section = document.createElement("section");
    section.className = "footer-need-help";
    section.setAttribute("aria-labelledby", "footer-need-help-title");

    var title = document.createElement("h2");
    title.id = "footer-need-help-title";
    title.className = "footer-need-help-title";
    title.textContent = "Need Help?";
    section.appendChild(title);

    var grid = document.createElement("div");
    grid.className = "footer-need-help-grid";

    grid.appendChild(
      buildHelpItem({
        icon: "pin",
        label: "Address",
        lines: CONTACT.addressLines
      })
    );

    var right = document.createElement("div");
    right.className = "footer-need-help-right";
    right.appendChild(
      buildHelpItem({
        icon: "mail",
        label: "Email",
        href: "mailto:" + CONTACT.email,
        hrefText: CONTACT.email
      })
    );
    right.appendChild(
      buildHelpItem({
        icon: "phone",
        label: "Phone",
        href: CONTACT.phoneHref,
        hrefText: CONTACT.phoneLabel
      })
    );
    grid.appendChild(right);
    section.appendChild(grid);
    return section;
  }

  function buildNavColumns() {
    var grid = document.createElement("div");
    grid.className = "footer-nav-grid";

    FOOTER_SECTIONS.forEach(function (section) {
      var col = document.createElement("div");
      col.className = "footer-nav-col";

      var title = document.createElement("h3");
      title.className = "footer-nav-title";
      title.textContent = section.title;
      col.appendChild(title);

      var list = document.createElement("ul");
      list.className = "footer-nav-list";
      section.links.forEach(function (item) {
        var li = document.createElement("li");
        var a = document.createElement("a");
        a.href = item.href;
        a.textContent = item.label;
        li.appendChild(a);
        list.appendChild(li);
      });
      col.appendChild(list);
      grid.appendChild(col);
    });

    var follow = document.createElement("div");
    follow.className = "footer-nav-col footer-nav-col--follow";

    var followTitle = document.createElement("h3");
    followTitle.className = "footer-nav-title";
    followTitle.textContent = "Follow Us";
    follow.appendChild(followTitle);
    follow.appendChild(buildSocial());
    grid.appendChild(follow);

    return grid;
  }

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
    if (path === "/checkout" || path.indexOf("/checkout/") === 0) return;
    if (path.indexOf("receipt") !== -1 || path.indexOf("purchase-confirmation") !== -1) {
      return;
    }

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
    wrap.appendChild(buildNeedHelp());
    wrap.appendChild(buildNavColumns());
    wrap.appendChild(buildPayments());
    wrap.appendChild(buildCopyright());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureFooter);
  } else {
    ensureFooter();
  }
})();
