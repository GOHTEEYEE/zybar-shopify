(function (root) {
  "use strict";

  var CHEVRON =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">' +
    '<path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
    "</svg>";

  var PANELS = [
    {
      id: "description",
      title: "Description",
      html:
        "<p>Every LUNEVA piece is thoughtfully handcrafted and inspired by the timeless beauty of butterflies.</p>" +
        "<p>Designed with intricate details, elegant colors, and premium craftsmanship, each artwork transforms the graceful charm of nature into a decorative piece that complements any home, office, or personal space.</p>" +
        "<p>Whether displayed as a statement piece or given as a meaningful gift, every LUNEVA creation is designed to bring elegance, warmth, and lasting beauty to everyday life.</p>"
    },
    {
      id: "shipping",
      title: "Shipping &amp; Returns",
      html:
        "<p>We want every order to arrive safely and exceed your expectations. Below is everything you need to know about production, shipping, setup, and order support.</p>" +
        "<h4>Production Time</h4>" +
        "<p>Every artwork is handcrafted and made to order with great attention to detail. Please allow 1–2 business days for production before your order is shipped.</p>" +
        "<h4>Worldwide Shipping</h4>" +
        "<p><strong>Free worldwide shipping</strong> on every order. Estimated delivery time is 5–7 business days, depending on your location. Once your order has been dispatched, you'll receive a confirmation email with a tracking number so you can follow your shipment every step of the way.</p>" +
        "<h4>Safe Packaging &amp; Easy Setup</h4>" +
        "<p>To ensure your artwork arrives safely during international shipping, certain components are securely packed separately. Setup is quick and straightforward — <strong>easy assembly</strong> with all required parts and an easy-to-follow guide included. No special tools or technical experience required.</p>" +
        "<h4>Returns &amp; Replacements</h4>" +
        "<p><strong>60-day free returns.</strong> If your order isn’t right, contact us within 60 days of delivery for a free return. If your order arrives damaged, defective, or incorrect, we’ll gladly arrange a replacement or provide a suitable solution.</p>" +
        "<h4>Quality Guarantee</h4>" +
        "<p>Every artwork is carefully inspected before shipping to ensure it meets our quality standards. If you experience any manufacturing defects or quality issues, simply contact our support team and we'll be happy to help.</p>" +
        "<h4>Order Tracking</h4>" +
        "<p>Once your order has been shipped, you'll automatically receive an email containing your tracking information. If you have any questions about your shipment, our support team is always here to assist you.</p>" +
        "<h4>Need Assistance?</h4>" +
        "<p>If you have any questions before or after placing your order, feel free to reach out to us anytime.<br />Email: <a href=\"mailto:zybar.info@gmail.com\">zybar.info@gmail.com</a><br />We typically respond within 1 business day.</p>"
    },
    {
      id: "display",
      title: "Display Guide",
      html:
        "<p>Your LUNEVA artwork is carefully packaged to ensure it arrives safely during international shipping.</p>" +
        "<p>To protect each component in transit, a simple final assembly is required upon arrival. The process takes only a few minutes, and all necessary parts and easy-to-follow instructions are included in the package.</p>" +
        "<p>Once assembled, your artwork is ready to display and enjoy.</p>"
    },
    {
      id: "guarantee",
      title: "Our Guarantee",
      html:
        "<p>We take great pride in every piece we create. From craftsmanship to delivery, we're committed to providing artwork that meets the highest standards of quality.</p>" +
        "<p>Here's our promise to you:</p>" +
        "<ul>" +
        "<li>Every artwork is carefully handcrafted with attention to detail.</li>" +
        "<li>Each order is thoroughly inspected before shipping to ensure excellent quality.</li>" +
        "<li>Every piece is securely packaged to help protect it during international transit.</li>" +
        "<li>If your order arrives damaged, defective, or incorrect, we'll make it right with a replacement or appropriate solution.</li>" +
        "<li><strong>60-day free returns</strong> if your order isn’t right.</li>" +
        "<li>Our support team is always here to assist you before and after your purchase.</li>" +
        "</ul>" +
        "<p>Your satisfaction is our priority, and we're committed to making your LUNEVA experience as smooth and enjoyable as possible.</p>"
    },
    {
      id: "faq",
      title: "FAQ",
      html:
        "<div class=\"lv-accordion__qa\">" +
        "<p><strong>Is this suitable as a gift?</strong><br />Absolutely. LUNEVA artworks make thoughtful gifts for birthdays, anniversaries, housewarmings, weddings, Mother's Day, and many other special occasions.</p>" +
        "<p><strong>How should I display my artwork?</strong><br />Each artwork is designed for indoor display and looks beautiful on shelves, tabletops, or mounted on a wall. For the best appearance, avoid prolonged exposure to direct sunlight and excessive humidity.</p>" +
        "<p><strong>Do you ship worldwide?</strong><br />Yes. We offer free worldwide shipping, and every order includes tracking information once dispatched.</p>" +
        "<p><strong>What is your return policy?</strong><br />We offer 60-day free returns. Contact us within 60 days of delivery and we’ll help you return it.</p>" +
        "<p><strong>What if my order arrives damaged?</strong><br />If your artwork arrives damaged or incorrect, contact us and we'll gladly arrange a replacement or provide a suitable solution.</p>" +
        "</div>"
    }
  ];

  function panelHtml(panel, index) {
    var panelId = "lv-acc-panel-" + panel.id;
    var btnId = "lv-acc-btn-" + panel.id;
    return (
      '<div class="lv-accordion__item">' +
      '<h3 class="lv-accordion__heading">' +
      '<button type="button" class="lv-accordion__trigger" id="' +
      btnId +
      '" aria-expanded="false" aria-controls="' +
      panelId +
      '">' +
      '<span class="lv-accordion__title">' +
      panel.title +
      "</span>" +
      '<span class="lv-accordion__icon" aria-hidden="true">' +
      CHEVRON +
      "</span>" +
      "</button>" +
      "</h3>" +
      '<div class="lv-accordion__panel" id="' +
      panelId +
      '" role="region" aria-labelledby="' +
      btnId +
      '" hidden>' +
      '<div class="lv-accordion__body">' +
      panel.html +
      "</div>" +
      "</div>" +
      "</div>"
    );
  }

  function setOpen(item, open) {
    var btn = item.querySelector(".lv-accordion__trigger");
    var panel = item.querySelector(".lv-accordion__panel");
    if (!btn || !panel) return;
    item.classList.toggle("is-open", open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    panel.hidden = !open;
  }

  function mount(host) {
    if (!host || host.getAttribute("data-ready") === "1") return;
    host.setAttribute("data-ready", "1");
    host.className = (host.className + " lv-accordion").trim();
    host.innerHTML =
      '<div class="lv-accordion__list">' + PANELS.map(panelHtml).join("") + "</div>";

    host.querySelectorAll(".lv-accordion__item").forEach(function (item) {
      var btn = item.querySelector(".lv-accordion__trigger");
      if (!btn) return;
      btn.addEventListener("click", function () {
        var willOpen = !item.classList.contains("is-open");
        host.querySelectorAll(".lv-accordion__item").forEach(function (other) {
          setOpen(other, other === item ? willOpen : false);
        });
      });
    });
  }

  function init() {
    document.querySelectorAll("[data-luneva-pdp-accordion]").forEach(mount);
  }

  root.LunevaPdpAccordion = { init: init, mount: mount };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : globalThis);
