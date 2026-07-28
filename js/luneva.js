(function () {
  "use strict";

  var CART_KEY = "luneva.cart.items";
  var ZYBAR_CART_KEY = "zybar.cart.items";

  var LUNEVA_REVIEWS = {
    "luneva-cyan-blue": {
      folder: "cyan-blue",
      name: "Cyan Blue",
      items: [
        {
          image: "01.png",
          quote:
            "The cyan butterfly against the glittery night base is stunning. Colors pop even more with the LEDs on.",
          author: "Mia T.",
          location: "Amsterdam, NL"
        },
        {
          image: "02.png",
          quote: "Blue roses, purple blooms, and that glowing box — feels premium on the shelf.",
          author: "James W.",
          location: "London, UK"
        },
        {
          image: "03.png",
          quote: "The moving wings and cool blue glow make it the centerpiece of my desk setup.",
          author: "Sophie R.",
          location: "Toronto, CA"
        }
      ]
    },
    "luneva-dreamy-garden": {
      folder: "dreamy-garden",
      name: "Dreamy Garden",
      items: [
        {
          image: "01.png",
          quote:
            "The soft pink glow is unreal. Cotton clouds, tiny trees, and butterflies — it looks like a fairy tale on my shelf.",
          author: "Maya L.",
          location: "Los Angeles, US"
        },
        {
          image: "02.png",
          quote: "Obsessed with the glitter and pastel vibes. Lights on and the whole room feels calmer instantly.",
          author: "Grace H.",
          location: "Edinburgh, UK"
        },
        {
          image: "03.png",
          quote: "Built it in one evening — the mechanical butterfly is mesmerizing to watch.",
          author: "Chloe P.",
          location: "Sydney, AU"
        }
      ]
    },
    "luneva-glowing-garden": {
      folder: "glowing-garden",
      name: "Glowing Garden",
      items: [
        {
          image: "01.png",
          quote:
            "Absolutely magical on my nightstand. The glow is so soothing — it looks even better in person.",
          author: "Ava M.",
          location: "Portland, US"
        },
        {
          image: "02.png",
          quote: "The blue butterfly looks so lifelike, and the moss feels like a tiny fairy forest.",
          author: "Lena K.",
          location: "Vienna, AT"
        },
        {
          image: "03.png",
          quote: "Gifted this to my sister — she keeps sending me photos of it lit up every night.",
          author: "Noah S.",
          location: "Dublin, IE"
        }
      ]
    },
    "luneva-starlit-garden": {
      folder: "starlit-garden",
      name: "Starlit Garden",
      items: [
        {
          image: "01.png",
          quote:
            "Finished the miniature landscape and I'm obsessed. Soft flowers look so charming on my desk.",
          author: "Ellie R.",
          location: "Austin, US"
        },
        {
          image: "03.png",
          quote: "Surprised my partner with this — the gift moment was perfect.",
          author: "Isabella C.",
          location: "Milan, IT"
        },
        {
          image: "04.png",
          quote: "The infinity mirror effect is mesmerizing at night. Endless stars, warm glow.",
          author: "Daniel M.",
          location: "Chicago, US"
        }
      ]
    }
  };

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
    return readRaw(CART_KEY)
      .filter(function (item) {
        return item && isLunevaSlug(item.slug || item.productSlug);
      })
      .map(normalizeCartItem);
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

  function lunevaImageUrl(item) {
    var url = String((item && item.imageUrl) || "").trim();
    if (url.indexOf("/luneva/assets/") === 0) return url;
    var slug = String((item && (item.slug || item.productSlug)) || "");
    if (slug.indexOf("luneva-") === 0) {
      return "/luneva/assets/" + slug.replace(/^luneva-/, "") + "/hero.png";
    }
    return url;
  }

  function normalizeCartItem(item) {
    if (!item || !isLunevaSlug(item.slug || item.productSlug)) return item;
    item.imageUrl = lunevaImageUrl(item);
    return item;
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
        row.imageUrl = lunevaImageUrl(item);
        row.sizeLabel = item.sizeLabel;
      }
      return row;
    });
    if (!found) {
      item.key = key;
      normalizeCartItem(item);
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

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderReviewCard(folder, productName, review) {
    var base = "/luneva/assets/" + folder + "/reviews/";
    var alt = productName + " from " + review.author;
    return (
      '<article class="lv-review-card">' +
      '<div class="lv-review-card__media"><img src="' +
      base +
      review.image +
      '" alt="' +
      escapeHtml(alt) +
      '" loading="lazy" /></div>' +
      '<div class="lv-review-card__body"><div aria-hidden="true">★★★★★</div>' +
      "<p>\u201C" +
      escapeHtml(review.quote) +
      "\u201D</p>" +
      "<footer>" +
      escapeHtml(review.author) +
      " · " +
      escapeHtml(review.location) +
      "</footer></div></article>"
    );
  }

  function initProductReviews() {
    var section = document.querySelector("[data-luneva-reviews]");
    if (!section) return;
    var root = document.querySelector("[data-luneva-product]");
    var slug = root ? root.getAttribute("data-slug") : "";
    var data = LUNEVA_REVIEWS[slug];
    var grid = section.querySelector("[data-luneva-reviews-grid]");
    if (!data || !grid || !data.items.length) {
      section.hidden = true;
      return;
    }
    grid.innerHTML = data.items
      .map(function (review) {
        return renderReviewCard(data.folder, data.name, review);
      })
      .join("");
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
        trackLunevaAdd(item, readCart());
        window.location.href = "/luneva/cart/";
      });
    }

    if (buyBtn) {
      buyBtn.addEventListener("click", function () {
        var item = buildCartItem();
        if (!item || !isLunevaSlug(item.slug)) return;
        addItem(item);
        trackLunevaAdd(item, readCart());
        goToLunevaCheckout();
      });
    }
  }

  function money(n) {
    return "$" + (Math.round(Number(n || 0) * 100) / 100).toFixed(2);
  }

  function analyticsApi() {
    return window.ZYBAR && window.ZYBAR.Analytics ? window.ZYBAR.Analytics : null;
  }

  function trackLunevaAdd(item, items) {
    var a = analyticsApi();
    if (!a || !item) return;
    a.trackAddToCart(
      {
        slug: item.slug,
        name: item.name,
        size: item.size,
        powerType: item.powerType || "usb",
        quantity: item.quantity || 1,
        unitPriceUSD: item.unitAmountUSD,
        collection: "luneva"
      },
      items || readCart()
    );
  }

  function trackLunevaCheckout(items) {
    var a = analyticsApi();
    if (!a) return;
    a.trackBeginCheckout(items || readCart(), cartTotal(items || readCart()));
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
          lunevaImageUrl(item) +
          '" alt="' +
          (item.name || "") +
          '" loading="lazy" /></a>' +
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
        imageUrl: lunevaImageUrl(item),
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
        "/luneva/purchase-confirmation/?session_id={CHECKOUT_SESSION_ID}",
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
    trackLunevaCheckout(payload.lineItems);
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
    initProductReviews();
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
