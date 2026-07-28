(function () {
  "use strict";

  var CART_KEY = "luneva.cart.items";
  var ZYBAR_CART_KEY = "zybar.cart.items";

  function isLunevaSlug(slug) {
    return String(slug || "").indexOf("luneva-") === 0;
  }

  function readRaw(key) {
    try {
      var raw = window.localStorage.getItem(key);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function writeRaw(key, items) {
    window.localStorage.setItem(key, JSON.stringify(items || []));
  }

  /** Keep the two carts strictly separated (also cleans older mixed carts). */
  function sanitizeCarts() {
    var zybarItems = readRaw(ZYBAR_CART_KEY);
    var lunevaItems = readRaw(CART_KEY);
    var zybarClean = zybarItems.filter(function (item) {
      return item && !isLunevaSlug(item.slug || item.productSlug);
    });
    var lunevaClean = lunevaItems.filter(function (item) {
      return item && isLunevaSlug(item.slug || item.productSlug);
    });
    // Move any LUNEVA rows that were wrongly saved into the Automotive cart.
    zybarItems.forEach(function (item) {
      if (!item || !isLunevaSlug(item.slug || item.productSlug)) return;
      lunevaClean.push(item);
    });
    writeRaw(ZYBAR_CART_KEY, zybarClean);
    writeRaw(CART_KEY, lunevaClean);
  }

  function readCart() {
    return readRaw(CART_KEY).filter(function (item) {
      return item && isLunevaSlug(item.slug || item.productSlug);
    });
  }

  function writeCart(items) {
    writeRaw(
      CART_KEY,
      (items || []).filter(function (item) {
        return item && isLunevaSlug(item.slug || item.productSlug);
      })
    );
    window.dispatchEvent(new Event("luneva:cart-updated"));
  }

  function cartCount(items) {
    return (items || readCart()).reduce(function (sum, item) {
      return sum + (Number(item.quantity) || 0);
    }, 0);
  }

  function cartTotal(items) {
    return (items || readCart()).reduce(function (sum, item) {
      return sum + catalogUnitPrice(item) * (Number(item.quantity) || 0);
    }, 0);
  }

  function variantKey(item) {
    return [
      String(item.slug || ""),
      String(item.size || ""),
      String(item.powerType || "usb")
    ].join("::");
  }

  function addItem(item) {
    var items = readCart();
    var key = variantKey(item);
    var found = false;
    items = items.map(function (row) {
      if (variantKey(row) === key) {
        found = true;
        row.quantity = (Number(row.quantity) || 0) + (Number(item.quantity) || 1);
        row.unitAmountUSD = item.unitAmountUSD;
        row.name = item.name;
        row.imageUrl = item.imageUrl;
        row.sizeLabel = item.sizeLabel;
      }
      return row;
    });
    if (!found) {
      item.key = key;
      items.push(item);
    }
    writeCart(items);
    return items;
  }

  function updateQuantity(key, quantity) {
    var qty = Number(quantity);
    var items = readCart()
      .map(function (row) {
        if (variantKey(row) !== key) return row;
        row.quantity = qty;
        return row;
      })
      .filter(function (row) {
        return Number(row.quantity) > 0;
      });
    writeCart(items);
    return items;
  }

  function removeItem(key) {
    writeCart(
      readCart().filter(function (row) {
        return variantKey(row) !== key;
      })
    );
  }

  function clearCart() {
    writeCart([]);
  }

  function updateHeaderCount() {
    var el = document.querySelector("[data-luneva-cart-count]");
    if (!el) return;
    var count = cartCount();
    el.textContent = count > 0 ? "Cart (" + count + ")" : "Cart";
  }

  function initHero() {
    var slides = document.querySelectorAll(".lv-hero__slide");
    var dots = document.querySelectorAll(".lv-hero__dots button");
    if (!slides.length) return;

    slides.forEach(function (slide) {
      var focus = slide.getAttribute("data-focus");
      if (focus) slide.style.setProperty("--lv-focus", focus);
    });

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
      productType: "standard",
      collection: "luneva"
    };
  }

  function initCartButtons() {
    var addBtn = document.querySelector("[data-luneva-add]");
    var buyBtn = document.querySelector("[data-luneva-buy]");
    var toast = document.querySelector("[data-luneva-toast]");

    if (addBtn) {
      addBtn.addEventListener("click", function () {
        var item = buildCartItem();
        if (!item || !isLunevaSlug(item.slug)) return;
        addItem(item);
        window.location.href = "/luneva/cart/";
      });
    }

    if (buyBtn) {
      buyBtn.addEventListener("click", function () {
        var item = buildCartItem();
        if (!item || !isLunevaSlug(item.slug)) return;
        addItem(item);
        goToLunevaCheckout();
      });
    }
  }

  function money(n) {
    return "$" + (Math.round(Number(n || 0) * 100) / 100).toFixed(2);
  }

  function renderCartPage() {
    var root = document.querySelector("[data-luneva-cart-root]");
    if (!root) return;
    var items = readCart();
    if (!items.length) {
      root.innerHTML =
        '<div class="lv-empty"><h2 class="lv-section-title">Your LUNEVA cart is empty</h2><p class="lv-section-text">Browse the collection and add a kit when you’re ready.</p><p style="margin-top:2rem"><a class="lv-btn lv-btn-primary" href="/luneva/shop/">Shop LUNEVA</a></p></div>';
      return;
    }

    var rows = items
      .map(function (item) {
        var key = variantKey(item);
        return (
          '<article class="lv-cart-item" data-key="' +
          key +
          '">' +
          '<a class="lv-cart-item__media" href="/products/' +
          item.slug +
          '/"><img src="' +
          (item.imageUrl || "") +
          '" alt="' +
          (item.name || "") +
          '" /></a>' +
          '<div class="lv-cart-item__info">' +
          "<h3>" +
          (item.name || "LUNEVA kit") +
          "</h3>" +
          "<p>" +
          (item.sizeLabel || "") +
          "</p>" +
          '<p class="lv-cart-item__price">' +
          money(catalogUnitPrice(item)) +
          "</p>" +
          '<div class="lv-cart-item__qty">' +
          '<button type="button" data-qty-delta="-1" aria-label="Decrease">−</button>' +
          "<span>" +
          item.quantity +
          "</span>" +
          '<button type="button" data-qty-delta="1" aria-label="Increase">+</button>' +
          "</div>" +
          '<button type="button" class="lv-cart-item__remove" data-remove>Remove</button>' +
          "</div></article>"
        );
      })
      .join("");

    root.innerHTML =
      '<div class="lv-cart-layout"><div class="lv-cart-list">' +
      rows +
      '</div><aside class="lv-cart-summary"><h2>Order summary</h2>' +
      '<div class="lv-cart-summary__row"><span>Subtotal</span><strong>' +
      money(cartTotal(items)) +
      "</strong></div>" +
      '<p class="lv-cart-summary__note">LUNEVA only — Automotive LED wall art stays in the separate ZYBAR cart at /cart/.</p>' +
      '<button class="lv-btn lv-btn-primary lv-btn-block" type="button" data-luneva-go-checkout>Checkout</button>' +
      '<a class="lv-btn lv-btn-outline lv-btn-block" href="/luneva/shop/" style="margin-top:1rem">Continue shopping</a>' +
      "</aside></div>";

    var goCheckout = root.querySelector("[data-luneva-go-checkout]");
    if (goCheckout) {
      goCheckout.addEventListener("click", function () {
        goToLunevaCheckout();
      });
    }
    root.querySelectorAll(".lv-cart-item").forEach(function (row) {
      var key = row.getAttribute("data-key");
      var item = items.find(function (i) {
        return variantKey(i) === key;
      });
      row.querySelectorAll("[data-qty-delta]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var delta = Number(btn.getAttribute("data-qty-delta"));
          updateQuantity(key, (Number(item.quantity) || 0) + delta);
          renderCartPage();
          updateHeaderCount();
        });
      });
      var remove = row.querySelector("[data-remove]");
      if (remove) {
        remove.addEventListener("click", function () {
          removeItem(key);
          renderCartPage();
          updateHeaderCount();
        });
      }
    });
  }

  function catalogUnitPrice(item) {
    var slug = String((item && (item.slug || item.productSlug)) || "");
    var size = String((item && item.size) || "30x45");
    var pricing = window.ZYBAR && window.ZYBAR.Pricing;
    if (pricing && typeof pricing.calculateProductUnitPrice === "function") {
      var priced = pricing.calculateProductUnitPrice({
        slug: slug,
        productSlug: slug,
        size: size,
        powerType: (item && item.powerType) || "usb"
      });
      if (Number.isFinite(priced) && priced > 0) return priced;
    }
    var cfg = window.ZYBAR_STRIPE_CONFIG || {};
    var bySlug = cfg.perProductSizePricesUSD || {};
    var row = bySlug[slug] || {};
    if (Number.isFinite(row[size]) && row[size] > 0) return Number(row[size]);
    var stored = Number(item && item.unitAmountUSD);
    if (Number.isFinite(stored) && stored > 0 && stored < 200) return stored;
    return 0;
  }

  function buildCheckoutPayload() {
    var items = readCart();
    if (!items.length) return null;
    var origin = window.location.origin;
    var lineItems = items.map(function (item) {
      var unit = catalogUnitPrice(item);
      return {
        quantity: Number(item.quantity) || 1,
        productSlug: String(item.slug || ""),
        slug: String(item.slug || ""),
        size: String(item.size || "30x45"),
        powerType: "usb",
        name: String(item.name || "LUNEVA kit"),
        unitAmountUSD: unit,
        productType: "standard"
      };
    });
    var displayItems = items.map(function (item) {
      var unit = catalogUnitPrice(item);
      return {
        name: String(item.name || "LUNEVA kit"),
        imageUrl: item.imageUrl || "",
        sizeLabel: item.sizeLabel || "",
        size: String(item.size || "30x45"),
        powerType: "usb",
        powerTypeLabel: "USB",
        slug: String(item.slug || ""),
        quantity: Number(item.quantity) || 1,
        unitPriceUSD: unit
      };
    });
    return {
      lineItems: lineItems,
      displayItems: displayItems,
      shippingMethod: "standard",
      _shippingChosen: true,
      collection: "luneva",
      successUrl:
        origin +
        "/purchase-confirmation.html?session_id={CHECKOUT_SESSION_ID}&collection=luneva",
      cancelUrl: origin + "/luneva/checkout/"
    };
  }

  function writeCheckoutPending(payload) {
    window.sessionStorage.setItem("luneva.checkout.pending", JSON.stringify(payload));
  }

  function goToLunevaCheckout() {
    var payload = buildCheckoutPayload();
    if (!payload) {
      window.location.href = "/luneva/shop/";
      return;
    }
    try {
      writeCheckoutPending(payload);
    } catch (err) {
      console.error(err);
      alert("Could not start checkout. Please try again.");
      return;
    }
    window.location.href = "/luneva/checkout/";
  }

  function renderCheckoutPage() {
    // Custom Stripe checkout is owned by checkout-page.js on /luneva/checkout/.
    // Ensure a pending payload exists before that script initializes.
    if (!document.getElementById("checkout-form")) return;
    try {
      var raw = window.sessionStorage.getItem("luneva.checkout.pending");
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.lineItems) && parsed.lineItems.length) return;
      }
    } catch (_) {}
    var payload = buildCheckoutPayload();
    if (payload) {
      try {
        writeCheckoutPending(payload);
      } catch (_) {}
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    sanitizeCarts();
    initHero();
    initGallery();
    initKits();
    initCartButtons();
    updateHeaderCount();
    renderCartPage();
    renderCheckoutPage();
  });

  window.addEventListener("luneva:cart-updated", updateHeaderCount);
  window.addEventListener("storage", updateHeaderCount);

  window.LUNEVA = {
    readCart: readCart,
    addItem: addItem,
    clearCart: clearCart,
    cartCount: cartCount
  };
})();
