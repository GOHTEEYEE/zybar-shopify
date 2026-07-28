(function () {
  "use strict";

  function initHero() {
    var slides = document.querySelectorAll(".lv-hero__slide");
    var dots = document.querySelectorAll(".lv-hero__dots button");
    if (!slides.length) return;
    var index = 0;

    function show(next) {
      index = (next + slides.length) % slides.length;
      slides.forEach(function (slide, i) {
        slide.classList.toggle("is-active", i === index);
      });
      dots.forEach(function (dot, i) {
        dot.classList.toggle("is-active", i === index);
      });
    }

    dots.forEach(function (dot, i) {
      dot.addEventListener("click", function () {
        show(i);
      });
    });

    window.setInterval(function () {
      show(index + 1);
    }, 5500);
  }

  function initGallery() {
    var main = document.querySelector(".lv-gallery__main img");
    var thumbs = document.querySelectorAll(".lv-thumbs button");
    if (!main || !thumbs.length) return;
    thumbs.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var src = btn.getAttribute("data-src");
        if (!src) return;
        main.src = src;
        thumbs.forEach(function (b) {
          b.classList.toggle("is-active", b === btn);
        });
      });
    });
  }

  function initKits() {
    var kits = document.querySelectorAll(".lv-kit");
    var priceEl = document.querySelector("[data-luneva-price]");
    if (!kits.length) return;

    kits.forEach(function (kit) {
      kit.addEventListener("click", function () {
        kits.forEach(function (k) {
          k.classList.toggle("is-active", k === kit);
        });
        if (priceEl) priceEl.textContent = "$" + kit.getAttribute("data-price");
        var buy = document.querySelector("[data-luneva-buy-label]");
        if (buy) buy.textContent = "Buy now — $" + kit.getAttribute("data-price");
      });
    });
  }

  function getActiveKit() {
    return document.querySelector(".lv-kit.is-active") || document.querySelector(".lv-kit");
  }

  function getCart() {
    try {
      var raw = window.localStorage.getItem("zybar.cart.items");
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function saveCart(items) {
    window.localStorage.setItem("zybar.cart.items", JSON.stringify(items || []));
    window.dispatchEvent(new Event("zybar:cart-updated"));
  }

  function buildCartItem() {
    var root = document.querySelector("[data-luneva-product]");
    var kit = getActiveKit();
    if (!root || !kit) return null;
    var slug = root.getAttribute("data-slug");
    var name = root.getAttribute("data-name");
    var image = root.getAttribute("data-image");
    var kitId = kit.getAttribute("data-kit");
    var kitTitle = kit.getAttribute("data-title");
    var price = Number(kit.getAttribute("data-price"));
    var size = kitId === "full" ? "40x60" : "30x45";
    return {
      slug: slug,
      productSlug: slug,
      name: name + " · " + kitTitle,
      size: size,
      sizeLabel: kitTitle,
      powerType: "usb",
      powerTypeLabel: "USB",
      quantity: 1,
      unitAmountUSD: price,
      imageUrl: image,
      productType: "standard"
    };
  }

  function addItem(item) {
    var items = getCart();
    var key = item.slug + "::" + item.size + "::usb";
    var found = false;
    items = items.map(function (row) {
      var rowKey = String(row.slug || "") + "::" + String(row.size || "") + "::" + String(row.powerType || "usb");
      if (rowKey === key) {
        found = true;
        row.quantity = (Number(row.quantity) || 0) + 1;
        row.unitAmountUSD = item.unitAmountUSD;
        row.name = item.name;
        row.imageUrl = item.imageUrl;
      }
      return row;
    });
    if (!found) items.push(item);
    saveCart(items);
  }

  function initCartButtons() {
    var addBtn = document.querySelector("[data-luneva-add]");
    var buyBtn = document.querySelector("[data-luneva-buy]");
    var toast = document.querySelector("[data-luneva-toast]");

    if (addBtn) {
      addBtn.addEventListener("click", function () {
        var item = buildCartItem();
        if (!item) return;
        addItem(item);
        if (toast) toast.textContent = "Added to cart — " + item.name;
      });
    }

    if (buyBtn) {
      buyBtn.addEventListener("click", function () {
        var item = buildCartItem();
        if (!item) return;
        addItem(item);
        window.location.href = "/cart/";
      });
    }
  }

  function updateCartCount() {
    var el = document.querySelector("[data-luneva-cart-count]");
    if (!el) return;
    var count = getCart().reduce(function (sum, item) {
      return sum + (Number(item.quantity) || 0);
    }, 0);
    el.textContent = count > 0 ? "Cart (" + count + ")" : "Cart";
  }

  document.addEventListener("DOMContentLoaded", function () {
    initHero();
    initGallery();
    initKits();
    initCartButtons();
    updateCartCount();
  });

  window.addEventListener("zybar:cart-updated", updateCartCount);
  window.addEventListener("storage", updateCartCount);
})();
